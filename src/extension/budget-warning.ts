// Vscode-free decision logic for the budget warning. Notices come only from a fresh account update, each kind at most once per billing
// cycle (the cycle is the observed reset instant), and only the most severe due notice is shown. Anything invalid counts as absent.
import type { view } from '../view.ts';
import { compare, subtract } from '../decimal.ts';
import { overageOver, type Overage } from '../cost/overage.ts';
import { formatUsd } from '../cost/estimate.ts';
import type { PlanComparison, PlanInsights, RightSizing } from '../cost/plan-hints.ts';
import { planNames } from './cost-inputs.ts';
import { decimalToRational, formatRational } from '../cost/money.ts';
import { daysBetween, isDate } from './audit-schedule.ts';
import { date } from './labels.ts';

/** Most severe first. */
export const NOTICE_KINDS = ['limit', 'forecast', 'percent', 'rightsize', 'unused'] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];
/** The only persisted value: the billing cycle (observed reset instant) and the kinds already handled in it. */
export interface BudgetState { cycle: string; done: NoticeKind[] }
export interface BudgetNotice { kind: NoticeKind; text: string; state: BudgetState }
export interface BudgetInput {
 view: ReturnType<typeof view>;
 /** The presentation's own verdict that the forecast is fresh and qualified. */
 eligible: boolean;
 now: string;
 state: unknown;
 /** Plan hints from the Cost Advisor's estimate; absent or empty means none. */
 insights?: PlanInsights;
 enabled: boolean;
 /** 0 turns the percent notice off. */
 percent: number;
 /** Share of the reported credits (0..100) likely left at the reset that triggers the reminder; 0 or absent turns it off. */
 unusedPercent?: number;
 /** Today is a budget day and at least one budget day is left before the reset (the daily budget's own verdict). */
 budgetDay?: boolean;
}

const whole = (s: string): string => { const v = Number(s); return Number.isFinite(v) ? String(Math.round(v)) : s; };
const plural = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'}`;
function creditsText(credits: string): string {
 try { return formatRational(decimalToRational(credits), compare(credits, '10') >= 0 ? 0 : 1, 'half_up').replace(/^0$/, 'under 0.1'); } catch { return credits; }
}
const moneyText = (o: Overage): string => o.money === '0.00' ? 'under $0.01' : `$${o.money}`;
/** "about $4.80", or "under $0.01" for less than a cent (never "about under"). */
export const overPhrase = (o: Pick<Overage, 'money'>): string => o.money === '0.00' ? 'under $0.01' : `about $${o.money}`;
const dayText = (iso: string): string => date(iso, true);

/** Detail-view sentence for the projected overage at the observed pace. */
export function projectedOverageText(o: Overage): string {
 const tail = 'This is a modelled scenario, not an invoice; whether overage applies depends on your plan and settings.';
 const head = `If you continue at this pace: about ${creditsText(o.credits)} credits over the reported limit`;
 return o.money === null ? `${head}. ${tail}` : `${head} ≈ ${moneyText(o)} at $${o.pricePerCredit} per credit (price list ${o.catalogVersion}, reviewed ${dayText(o.reviewedOn!)}). ${tail}`;
}
/** Detail-view sentence for usage already above the reported limit at the last update. */
export function observedOverageText(o: Overage): string {
 const head = `${creditsText(o.credits)} credits above the reported limit at the last update`;
 return o.money === null ? `${head}.` : `${head} ≈ ${moneyText(o)} at $${o.pricePerCredit} per credit (modelled; whether overage applies depends on your plan and settings).`;
}

const planPrefix = (hint: boolean, current: PlanComparison['current']): string => hint ? `If you are on ${planNames[current]}: ` : '';
/** Two list-price facts about the next larger plan, with no recommendation; the short form is for notices (the plan prefix only when the plan is a hint). */
export function largerPlanText(c: PlanComparison, short = false): string {
 const facts = `${planNames[c.next]} costs $${formatUsd(c.feeDiff, 'up')} a month more${short ? '' : ` than ${planNames[c.current]}`} and includes ${c.creditDiff} more credits`;
 const lead = c.hint ? `For comparison, if you are on ${planNames[c.current]}: ` : 'For comparison: ';
 return short ? `${lead}${facts}.` : `${lead}${facts} (list prices, price list reviewed ${dayText(c.reviewedOn)}).`;
}
/** Right-sizing hint: forecast and the last completed cycle both fit a smaller plan. */
export function rightSizeText(r: RightSizing): string {
 const unused = formatRational(decimalToRational(r.unusedCredits), 0, 'floor'); // never claims more unused credits than forecast
 return `${planPrefix(r.hint, r.current)}You will likely leave about ${unused} credits unused this cycle, and the last cycle also fit within ${planNames[r.plan]}. ${planNames[r.plan]} would cost about $${formatUsd(r.saving, 'down')} a month less (modelled).`;
}
/** The right-sizing notice is only due in the last week before the reset. */
export const RIGHTSIZE_DAYS = 7;
/** The unused-credits reminder is only due in the last days before the reset. */
export const UNUSED_DAYS = 3;

/**
 * Projected plan credits left at the reset, rounded down to whole credits (never more than forecast), when every data condition for the unused-credits
 * reminder holds: a fresh, qualified, regular forecast, no extra credits, a future reset within UNUSED_DAYS, and at least `percent` of the reported
 * limit both projected and left now. Otherwise null: stale, conflicting or unknown data is unknown, not "nothing will be used".
 */
export function unusedAtReset(o: ReturnType<typeof view>, eligible: boolean, now: string, percent: number): string | null {
 try {
  if (!eligible || o.status !== 'observed' || o.flags.includes('unsupported_extra_credits') || o.usage === null || o.baseLimit === null || o.resetAt === null) return null;
  const resetMs = Date.parse(o.resetAt), nowMs = Date.parse(now);
  if (!Number.isFinite(resetMs) || !Number.isFinite(nowMs) || resetMs <= nowMs || compare(o.baseLimit, '0') <= 0) return null;
  if (!Number.isInteger(percent) || percent < 1 || percent > 100 || Math.ceil((resetMs - nowMs) / 86_400_000) > UNUSED_DAYS) return null;
  const f = o.forecast, selected = f.estimates.find(e => e.method === f.selectedMethod && e.status === 'qualified');
  const left = selected?.projectedRemainingBaseAtReset;
  if (!selected || f.tier !== 'regular' || !left || compare(left, '0') <= 0) return null;
  if (!compareShare(left, o.baseLimit, percent) || !compareShare(subtract(o.baseLimit, o.usage), o.baseLimit, percent)) return null;
  return formatRational(decimalToRational(left), 0, 'floor');
 } catch { return null; }
}
export function unusedText(left: string, limit: string, resetAt: string, now: string): string {
 const when = resetIn(resetAt, now);
 return `You'll likely have about ${left} of your ${whole(limit)} Kiro credits left when they reset${when ? ` ${when}` : ''}. Unused plan credits lapse at the reset, so it's a good moment for the tests, docs or refactor you've been putting off.`;
}

/** Days until the reset in plain words; empty when it cannot be established. */
function resetIn(resetAt: string, now: string): string {
 const days = Math.ceil((Date.parse(resetAt) - Date.parse(now)) / 86_400_000);
 return !Number.isFinite(days) ? '' : days <= 0 ? 'today' : days === 1 ? 'in 1 day' : `in ${days} days`;
}

/** Reads the stored value; a wrong shape, an unknown kind or another cycle is an empty state for the observed cycle. */
export function readBudgetState(raw: unknown, cycle: string): BudgetState {
 const r = raw as { cycle?: unknown; done?: unknown } | null | undefined;
 const done = r && typeof r === 'object' && r.cycle === cycle && Array.isArray(r.done) ? NOTICE_KINDS.filter(k => (r.done as unknown[]).includes(k)) : [];
 return { cycle, done };
}

/**
 * The notice that is due now, with the state to store before showing it, or null. 'limit': usage has reached the reported limit; 'forecast':
 * a qualified fresh forecast reaches it before the reset; 'percent': usage has reached the configured share of it. If several are due, the most
 * severe is shown and the others are marked done; a less severe kind is never shown after a more severe one in the same cycle.
 */
export function decideBudgetNotice(i: BudgetInput): BudgetNotice | null {
 try {
  const o = i.view;
  // Accounts with extra credits are not supported: no notice rests on their limit.
  if (!i.enabled || o.status !== 'observed' || o.flags.includes('unsupported_extra_credits') || o.usage === null || o.baseLimit === null || o.resetAt === null) return null;
  const resetMs = Date.parse(o.resetAt), nowMs = Date.parse(i.now);
  if (!Number.isFinite(resetMs) || !Number.isFinite(nowMs) || resetMs <= nowMs || compare(o.baseLimit, '0') <= 0) return null;
  const percent = Number.isInteger(i.percent) ? Math.min(100, Math.max(0, i.percent)) : 0;
  const due = new Set<NoticeKind>();
  if (compare(o.usage, o.baseLimit) >= 0) due.add('limit');
  const f = o.forecast, selected = i.eligible ? f.estimates.find(e => e.method === f.selectedMethod && e.status === 'qualified') : undefined;
  // Only a regular forecast announces an exhaustion date; a provisional estimate is too early to interrupt anyone.
  const day = selected && f.tier === 'regular' ? selected.estimatedExhaustionDayUTC : null;
  const resetDay = new Date(resetMs).toISOString().slice(0, 10);
  const daysBefore = isDate(day) ? daysBetween(day, resetDay) : undefined;
  if (!due.has('limit') && daysBefore !== undefined && daysBefore >= 0) due.add('forecast');
  // usage / limit >= percent / 100, compared exactly.
  if (percent > 0 && compareShare(o.usage, o.baseLimit, percent)) due.add('percent');
  // Gated like the other forecast-based kinds: only while the presentation itself shows a fresh, qualified forecast.
  if (i.insights?.rightsize && i.eligible && Math.ceil((resetMs - nowMs) / 86_400_000) <= RIGHTSIZE_DAYS) due.add('rightsize');
  // A run-out warning and a "many credits left" reminder contradict each other; the reminder also needs a budget day with budget left.
  const unusedLeft = i.budgetDay === true && !due.has('limit') && !due.has('forecast') ? unusedAtReset(o, i.eligible, i.now, i.unusedPercent ?? 0) : null;
  if (unusedLeft !== null) due.add('unused');
  if (due.size === 0) return null;
  const state = readBudgetState(i.state, o.resetAt);
  // The unused reminder is blocked by the run-out and plan-size kinds, not by the percent notice (which can come early in the cycle).
  const blocked = (k: NoticeKind): boolean => k === 'unused' ? state.done.some(d => d === 'limit' || d === 'forecast' || d === 'rightsize') : state.done.some(d => NOTICE_KINDS.indexOf(d) < NOTICE_KINDS.indexOf(k));
  const shown = NOTICE_KINDS.find(k => due.has(k) && !state.done.includes(k) && !blocked(k));
  if (!shown) return null;
  // Showing the reminder also settles the plan hint, so one cycle never says both "use your spare credits" and "consider a smaller plan".
  // When the percent notice goes first, the reminder stays open for a later update.
  const settled = (k: NoticeKind): boolean => state.done.includes(k) || (due.has(k) && !(k === 'unused' && shown === 'percent')) || (k === 'rightsize' && shown === 'unused');
  const next: BudgetState = { cycle: o.resetAt, done: NOTICE_KINDS.filter(settled) };
  const used = whole(o.usage), limit = whole(o.baseLimit), when = resetIn(o.resetAt, i.now);
  const resetPart = when ? `; the reset is ${when}` : '';
  // Projected overage, only with a validated price: appended to the notices that say the limit is reached.
  const over = selected && f.tier === 'regular' && selected.projectedUsageAtReset ? overageOver(selected.projectedUsageAtReset, o.baseLimit, i.now) : null;
  const larger = i.insights?.larger ? ` ${largerPlanText(i.insights.larger, true)}` : '';
  // Short on purpose: the price, price-list date and caveats stay on the dashboard, reached by the notice's Show details button.
  const cost = over?.money ? ` (${overPhrase(over)} over the limit, modelled)` : '', comparison = over?.money ? larger : '';
  const limitCost = over?.money ? ` (at this pace ${overPhrase(over)} over the limit by the reset, modelled)` : '';
  let text: string;
  if (shown === 'unused') {
   text = unusedText(unusedLeft!, o.baseLimit, o.resetAt, i.now);
  } else if (shown === 'rightsize') {
   text = rightSizeText(i.insights!.rightsize!);
  } else if (shown === 'forecast') {
    text = `At this pace your Kiro credits run out on ${date(day!)}, ${daysBefore === 0 ? 'on the day of the reset' : `${plural(daysBefore!, 'day')} before the reset`}${cost}.${comparison}`;
  } else if (shown === 'percent') {
    text = `You have used ${sharePercent(o.usage, o.baseLimit)}% of your reported Kiro credits (${used} of ${limit})${resetPart}.`;
  } else {
    text = `You have reached the reported Kiro credit limit (${used} of ${limit})${resetPart}${limitCost}.${comparison}`;
  }
  return { kind: shown, text, state: next };
 } catch { return null; }
}

/** Whole percent of the limit used, rounded down, from the same exact rationals as the threshold test. */
function sharePercent(usage: string, limit: string): string {
 const u = decimalToRational(usage), l = decimalToRational(limit);
 return String(u.numerator * l.denominator * 100n / (l.numerator * u.denominator));
}
/** usage / limit >= percent / 100 without floating point (limit > 0, percent 1..100). */
function compareShare(usage: string, limit: string, percent: number): boolean {
 const u = decimalToRational(usage), l = decimalToRational(limit);
 return u.numerator * l.denominator * 100n >= BigInt(percent) * l.numerator * u.denominator;
}
