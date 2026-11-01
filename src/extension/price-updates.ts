// Optional, user-allowed refresh of the dated prices and model multipliers (setting bobert.priceUpdates: off | ask | auto).
// This is Bobert's only network access, and it is off by default. When allowed, at most once a week it downloads ONE public file,
// PRICE_FILE_URL (data/prices.json in the Bobert repository), with a plain GET: no cookies, no account or usage data, no identifiers,
// no query string. The text is validated by src/session/price-data.ts and used only if it is newer than the built-in prices; otherwise,
// and on every failure, the built-in prices stay in use and nothing is shown. The file is kept in Bobert's own extension storage folder.
// This module imports no editor API: everything it touches comes in through `PriceDeps`, so it is tested without a network or a disk.
import { PRICE_FILE_URL, parsePriceFile } from '../session/price-data.ts';
import { useCatalog } from '../cost/catalog.ts';
import { useModels } from '../session/models.ts';

export type PriceUpdateMode = 'off' | 'ask' | 'auto';
export const PRICE_STATE_KEY = 'bobert.priceUpdates.state';
export const CHECK_EVERY_DAYS = 7;
const DAY = 86_400_000;

/** User-scope value only: a workspace or folder settings.json cannot switch a download on. Anything unexpected is off. */
export function readPriceUpdates(inspect: { globalValue?: unknown } | undefined): PriceUpdateMode {
 const v = inspect?.globalValue;
 return v === 'ask' || v === 'auto' ? v : 'off';
}
export interface PriceState { checkedAt?: string; askedAt?: string }
export function readPriceState(raw: unknown): PriceState {
 const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
 const ok = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v));
 return { ...(ok(r.checkedAt) ? { checkedAt: r.checkedAt } : {}), ...(ok(r.askedAt) ? { askedAt: r.askedAt } : {}) };
}
export type PriceChoice = 'check' | 'later' | 'off' | 'busy'; // 'busy': another prompt holds the window's slot, so nothing was asked
export interface PriceDeps {
 now(): number;
 /** The stored, already validated copy, if any. */
 readStored(): Promise<string | undefined>;
 writeStored(text: string): Promise<boolean>;
 /** A plain GET of the given https URL; undefined on any failure. */
 fetchText(url: string): Promise<string | undefined>;
 state(): PriceState;
 saveState(next: PriceState): Promise<boolean>;
 /** Shows the weekly question. undefined when dismissed; 'busy' when another prompt is open and the question was not shown. */
 ask(): Promise<PriceChoice | undefined>;
 turnOff(): Promise<void>;
}
const due = (stamp: string | undefined, now: number): boolean => stamp === undefined || !(Date.parse(stamp) <= now) || now - Date.parse(stamp) >= CHECK_EVERY_DAYS * DAY;

/** Uses the stored file when the mode allows it and it is valid and newer than the built-in prices; otherwise the built-in prices. */
export async function applyStoredPrices(mode: PriceUpdateMode, deps: Pick<PriceDeps, 'now' | 'readStored'>): Promise<boolean> {
 useCatalog(null); useModels(null);
 if (mode === 'off') return false;
 try {
  const text = await deps.readStored();
  const update = text === undefined ? undefined : parsePriceFile(text, new Date(deps.now()).toISOString());
  if (!update) return false;
  useCatalog(update.catalog); useModels(update.models);
  return true;
 } catch { return false; }
}

/** One pass at start-up: apply what is stored, then, at most once a week, ask (mode ask) or check (mode auto). Never throws. */
export async function runPriceUpdates(mode: PriceUpdateMode, deps: PriceDeps): Promise<void> {
 try {
  await applyStoredPrices(mode, deps);
  if (mode === 'off') return;
  const now = deps.now(), state = deps.state();
  if (!due(state.checkedAt, now)) return;
  if (mode === 'ask') {
   if (!due(state.askedAt, now)) return;
   if (!await deps.saveState({ ...state, askedAt: new Date(now).toISOString() })) return; // an unsaved "asked" mark would repeat the question
   const choice = await deps.ask();
   if (choice === 'busy') { await deps.saveState(state); return; } // not shown: do not use up this week's question
   if (choice === 'off') { await deps.turnOff(); await applyStoredPrices('off', deps); return; }
   if (choice !== 'check') return;
  }
  const checkedAt = new Date(now).toISOString();
  if (!await deps.saveState({ ...deps.state(), checkedAt })) return; // the weekly limit holds even when the download fails
  const text = await deps.fetchText(PRICE_FILE_URL);
  const update = text === undefined ? undefined : parsePriceFile(text, checkedAt);
  if (!update) return;
  // Store a rebuilt copy of what was validated, never the downloaded text itself.
  if (await deps.writeStored(JSON.stringify({ schemaVersion: 1, catalog: update.catalog, models: update.models }))) await applyStoredPrices(mode, deps);
 } catch { /* the built-in prices stay in use */ }
}
