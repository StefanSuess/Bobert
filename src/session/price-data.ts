// A dated price file (data/prices.json in the Bobert repository) that a newer Bobert release may not have shipped yet.
// This module only parses and validates text; it reads no files and opens no connection. A file is used only when it passes the same
// catalog validation as the built-in one, is strictly newer than the built-in catalog, and is not dated in the future; otherwise the built-in
// prices stay in use. Nothing here is built from user data, and nothing user-specific is ever sent to fetch it (see src/extension/price-updates.ts).
import { reviewedCatalog, validateCatalog, validInstant } from '../cost/catalog.ts';
import { MODELS, TABLE_DATE, type ModelRow } from './models.ts';
import { MODEL_ID } from './parse.ts';
import type { PricingCatalog } from '../cost/types.ts';

export const PRICE_FILE_URL = 'https://raw.githubusercontent.com/StefanSuess/Bobert/main/data/prices.json';
export const MAX_PRICE_FILE_BYTES = 100_000;
export interface PriceFile { schemaVersion: 1; catalog: PricingCatalog; models: { date: string; rows: readonly ModelRow[] } }
export interface PriceUpdate { catalog: PricingCatalog; models: { date: string; rows: readonly ModelRow[] }; verifiedOn: string }

const day = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && validInstant(`${s}T00:00:00Z`);

/**
 * A downloaded catalog is only ever as trustworthy as the repository file, so beyond the structural validation it must also look like a
 * real price list: reviewed evidence (never "hypothetical"), fees and credit grants in sane ranges, an add-on price within a tenfold band of the
 * built-in one. Anything else is ignored rather than shown as a Kiro price.
 */
function plausible(c: PricingCatalog): boolean {
 const within = (v: string, lo: number, hi: number): boolean => Number(v) >= lo && Number(v) <= hi;
 const base = Number(reviewedCatalog.consumer.pricePerCredit);
 return c.evidence === 'reviewed'
  && c.plans.every(p => within(p.fee, 0, 10_000) && within(p.credits, 0, 1_000_000))
  && within(c.consumer.pricePerCredit, base / 10, base * 10) && within(c.enterprise.pricePerCredit, base / 10, base * 10)
  && within(c.consumer.minimumCredits, 1, 1_000_000) && within(c.consumer.maximumCredits, 1, 10_000_000);
}

/** The projected rows, or undefined when anything is off. Unknown fields are dropped. */
function modelRows(input: unknown): ModelRow[] | undefined {
 if (!Array.isArray(input) || input.length < 1 || input.length > 80) return undefined;
 const rows: ModelRow[] = [];
 for (const r of input as Record<string, unknown>[]) {
  if (!r || typeof r !== 'object') return undefined;
  const { id, name, multiplier, basis, flag } = r;
  if (typeof id !== 'string' || !MODEL_ID.test(id) || typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 ._+-]{0,39}$/.test(name)) return undefined;
  if (typeof multiplier !== 'string' || !/^\d{1,3}(\.\d{1,3})?$/.test(multiplier) || !(Number(multiplier) > 0) || Number(multiplier) > 50) return undefined;
  if (basis !== 'observed' && basis !== 'documented' && basis !== 'pattern') return undefined;
  if (flag !== undefined && flag !== 'tiered' && flag !== 'silent') return undefined;
  rows.push(flag === undefined ? { id, name, multiplier, basis } : { id, name, multiplier, basis, flag });
 }
 return new Set(rows.map(r => r.id)).size === rows.length ? rows : undefined;
}

/** Parses and validates the text of a price file. `now` is an ISO instant. Returns undefined unless the file is valid, not from the future and newer than the built-in prices. */
export function parsePriceFile(text: string, now: string, builtIn: PricingCatalog = reviewedCatalog, builtInModelsDate: string = TABLE_DATE): PriceUpdate | undefined {
 try {
  if (typeof text !== 'string' || text.length > MAX_PRICE_FILE_BYTES) return undefined;
  const raw = JSON.parse(text) as Record<string, unknown>;
  if (!raw || typeof raw !== 'object' || raw.schemaVersion !== 1) return undefined;
  const checked = validateCatalog(raw.catalog, now);
  if (!checked.catalog || checked.status === 'unavailable' || !plausible(checked.catalog)) return undefined;
  const models = raw.models as { date?: unknown; rows?: unknown } | undefined;
  if (!models || !day(models.date) || Date.parse(`${models.date}T00:00:00Z`) > Date.parse(now)) return undefined;
  const rows = modelRows(models.rows);
  if (!rows) return undefined;
  const newerCatalog = Date.parse(checked.catalog.verifiedOn) > Date.parse(builtIn.verifiedOn);
  const newerModels = models.date > builtInModelsDate;
  if (!newerCatalog && !newerModels) return undefined; // nothing newer than what this version already has
  // Take each part only when it is newer; the other part stays the built-in one.
  const catalog = newerCatalog ? checked.catalog : builtIn;
  return { catalog, models: newerModels ? { date: models.date, rows } : { date: builtInModelsDate, rows: MODELS }, verifiedOn: catalog.verifiedOn };
 } catch { return undefined; }
}

/** The file the repository publishes for the built-in data (kept in sync by a unit test). */
export function builtInPriceFile(): PriceFile {
 return { schemaVersion: 1, catalog: reviewedCatalog, models: { date: TABLE_DATE, rows: MODELS } };
}
