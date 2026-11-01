// Weekly price check (repository tooling, never shipped in the VSIX and never run by the extension).
// It reads exactly two public Kiro pages (https://kiro.dev/pricing/ and https://kiro.dev/docs/models/ ) and compares them
// with the reviewed catalog (src/cost/catalog.ts) and the model table (src/session/models.ts).
// Outcomes: "ok" (every checked figure found), "differs" (the page is readable and at least one figure is missing or
// different) and "unverified" (a page could not be fetched or no longer looks like the page we know, so nothing is claimed).
// It only reports; a maintainer reviews the evidence and updates the catalog by hand.
import { writeFileSync } from 'node:fs';
import { isMain } from './is-main.ts';
import { reviewedCatalog } from '../src/cost/catalog.ts';
import { MODELS, type ModelRow } from '../src/session/models.ts';
import type { PricingCatalog } from '../src/cost/types.ts';

export const PRICING_URL = 'https://kiro.dev/pricing/';
export const MODELS_URL = 'https://kiro.dev/docs/models/';
export type PriceStatus = 'ok' | 'differs' | 'unverified';
export interface PriceCheck { status: PriceStatus; findings: string[] }

/** Plain text of a page: tags, scripts and styles removed, entities for the few characters prices use decoded, whitespace collapsed. */
export function pageText(html: string): string {
 return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#36;/g, '$').replace(/\s+/g, ' ').trim();
}
const grouped = (n: string): string => n.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const hasAmount = (text: string, amount: string): boolean => {
 const [whole, frac] = amount.split('.');
 const re = frac === undefined ? `\\$\\s?${grouped(whole)}(?![\\d,]|\\.\\d)` : `\\$\\s?${grouped(whole)}\\.${frac}(?!\\d)`;
 return new RegExp(re).test(text);
};
const hasCredits = (text: string, credits: string): boolean =>
 new RegExp(`(?<![\\d,.])(?:${grouped(credits)}|${credits})(?![\\d,]|\\.\\d)\\s*(?:\\w+\\s+)?credits`, 'i').test(text);

/** Pure comparison of the pricing page text with the catalog. */
export function checkPricing(text: string, catalog: PricingCatalog = reviewedCatalog): PriceCheck {
 if (!/\bcredits?\b/i.test(text) || !/\bpro\b/i.test(text)) return { status: 'unverified', findings: ['The pricing page no longer looks like a plan table (no plan or credit wording).'] };
 const findings: string[] = [];
 for (const plan of catalog.plans) {
  if (plan.fee !== '0' && !hasAmount(text, plan.fee)) findings.push(`Plan ${plan.id}: the fee $${plan.fee} is not on the pricing page.`);
  if (!hasCredits(text, plan.credits)) findings.push(`Plan ${plan.id}: ${plan.credits} credits are not on the pricing page.`);
 }
 if (!hasAmount(text, catalog.consumer.pricePerCredit)) findings.push(`The add-on price of $${catalog.consumer.pricePerCredit} per credit is not on the pricing page.`);
 return { status: findings.length ? 'differs' : 'ok', findings };
}

/** Pure comparison of the models page text with the model table (multiplier "1.3" is expected as "1.3x" right after the model name). */
export function checkModels(text: string, models: readonly ModelRow[] = MODELS): PriceCheck {
 const rows = models.filter(m => m.flag !== 'silent');
 const lower = text.toLowerCase();
 // A name counts only when no version digit, dot or hyphen follows it, so "Claude Opus 5" never matches inside "Claude Opus 5.5".
 const locate = (name: string): number => { const lowerName = name.toLowerCase(); for (let at = lower.indexOf(lowerName); at >= 0; at = lower.indexOf(lowerName, at + 1)) if (!/[\w.-]/.test(lower[at + lowerName.length] ?? ' ')) return at; return -1; };
 const found = rows.filter(m => locate(m.name) >= 0);
 if (!/\bcredits?\b|\bx\b|\d\s?x\b/i.test(text) || found.length < Math.ceil(rows.length / 4)) return { status: 'unverified', findings: ['The models page no longer lists most known models, so it was not compared.'] };
 const findings: string[] = [];
 for (const m of rows) {
  const at = locate(m.name);
  if (at < 0) { findings.push(`${m.name} is not on the models page any more.`); continue; }
  const shown = /(\d+(?:\.\d+)?)\s?x\b/i.exec(text.slice(at + m.name.length, at + m.name.length + 90))?.[1];
  if (shown === undefined) findings.push(`${m.name}: no multiplier found next to the name.`);
  else if (Number(shown) !== Number(m.multiplier)) findings.push(`${m.name}: the page shows ${shown}x, the table has ${m.multiplier}x.`);
 }
 return { status: findings.length ? 'differs' : 'ok', findings };
}

export function combine(parts: readonly PriceCheck[]): PriceCheck {
 const findings = parts.flatMap(p => p.findings);
 // A readable difference outranks an unverifiable page: the maintainer should hear about it.
 const status: PriceStatus = parts.some(p => p.status === 'differs') ? 'differs' : parts.some(p => p.status === 'unverified') ? 'unverified' : 'ok';
 return { status, findings };
}

export function report(result: PriceCheck, today: string): string {
 const head = result.status === 'ok' ? 'All checked prices and multipliers match.' : result.status === 'differs'
  ? 'Kiro\'s public pages differ from the reviewed price catalog or model table.' : 'The check could not verify the pages (fetch failed or the page layout changed).';
 return [`# Kiro price check ${today}`, '', head, '', ...result.findings.map(f => `- ${f}`), '', `Sources: ${PRICING_URL} and ${MODELS_URL}. Update \`src/cost/catalog.ts\` / \`src/session/models.ts\` by hand after reading the pages; this check only reports.`, ''].join('\n');
}

async function fetchText(url: string): Promise<string | undefined> {
 try {
  const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'bobert-price-check' } });
  if (!res.ok) return undefined;
  const body = await res.text();
  return body.length > 5_000_000 ? undefined : pageText(body);
 } catch { return undefined; }
}

/** Exit codes: 0 ok, 10 differs, 20 unverified. The report goes to the file named by argv[2], if any. */
async function main(): Promise<number> {
 const [pricing, models] = await Promise.all([fetchText(PRICING_URL), fetchText(MODELS_URL)]);
 const unreadable: PriceCheck = { status: 'unverified', findings: ['A page could not be fetched.'] };
 const result = combine([pricing === undefined ? unreadable : checkPricing(pricing), models === undefined ? unreadable : checkModels(models)]);
 const text = report(result, new Date().toISOString().slice(0, 10));
 if (process.argv[2]) writeFileSync(process.argv[2], text);
 console.log(text);
 return result.status === 'ok' ? 0 : result.status === 'differs' ? 10 : 20;
}
if (isMain(import.meta.url)) process.exitCode = await main();
