import { compare, scaleRatio, subtract } from '../decimal.ts';
import { DAY_MS, type AccountHistory } from '../history.ts';
import { observedCycle } from './dashboard-insights.ts';
import { cycleKey, describeExclusions, plain, type StoredResults } from './results-summary.ts';
import { date, updated } from './labels.ts';
import { RECAP_LINK_TEXT } from './recap-card.ts';

// "Your Kiro cycle": the recap of the cycle that has just ended, from account history evidence only. Pure and free of editor APIs.
// Every figure carries what it is based on, and a figure the evidence does not support reads "not observed", "not comparable" or "unknown";
// nothing is interpolated or invented. The only persisted value is `bobert.recap.v1`: the newly observed cycle's reset time and whether
// the card was shown or dismissed. A value of any other shape is "unknown": the card stays hidden and the value is never overwritten.
export const RECAP_KEY = 'bobert.recap.v1';
export const RECAP_TITLE = 'Your Kiro cycle';
export { RECAP_LINK_TEXT };
export const LASTED_HOURS = 6;

export interface RecapState { cycle: string; state: 'shown' | 'dismissed' }
export type StoredRecap = { status: 'ok'; value: RecapState | null } | { status: 'unknown' };
const FIELDS = ['cycle', 'state'];
/** Strict validator of the stored value: nothing is an empty state; anything but an exact `{ cycle, state }` is unknown and must not be overwritten. */
export function readRecap(value: unknown): StoredRecap {
 if (value === undefined) return { status: 'ok', value: null };
 const o = plain(value, FIELDS);
 if (!o || typeof o.cycle !== 'string' || cycleKey(o.cycle) !== o.cycle || (o.state !== 'shown' && o.state !== 'dismissed')) return { status: 'unknown' };
 return { status: 'ok', value: { cycle: o.cycle, state: o.state } };
}

export interface Recap {
 /** The newly observed cycle (its reset time): the key the card's state is stored under. */
 cycle: string;
 /** Sentences for the card, in order; the card image and the copied text use exactly these. */
 period: string;
 lines: string[];
}

const duration = (ms: number) => `${Math.floor(ms / 3600000)} h ${Math.floor(ms % 3600000 / 60000)} min`;
const add = (a: string, b: string) => subtract(a, subtract('0', b));

/** The recap of the previous cycle, or null when the evidence does not support one (see the conditions inline). */
export function computeRecap(h: AccountHistory, results: StoredResults, link: boolean): Recap | null {
 if (h.status !== 'available') return null;
 const cycles = h.evidence.cycles;
 if (cycles.length < 2) return null;
 const previous = cycles.at(-2)!, current = cycles.at(-1)!, key = cycleKey(current.resetAt), previousKey = cycleKey(previous.resetAt);
 // Evidence-backed start of the previous cycle and evidence-backed end: the current cycle starts at the previous cycle's own reset time.
 if (key === null || previousKey === null || !previous.startAt || !current.startAt || Date.parse(current.startAt) !== Date.parse(previous.resetAt) || !previous.baseLimit) return null;
 const chain = observedCycle(h, previous);
 if (!chain || !chain.length) return null; // without an unbroken counter chain from the cycle start, credits used are not observed
 const limit = previous.baseLimit, last = chain.at(-1)!, resetMs = Date.parse(previous.resetAt);

 const used = `Credits used: ${last.usage} of ${limit} reported credits, as of ${updated(last.at)}.`;

 const reached = chain.find(o => compare(o.usage, limit) >= 0);
 const late = chain.some(o => compare(o.usage, limit) < 0 && Date.parse(o.at) >= resetMs - LASTED_HOURS * 3600000 && Date.parse(o.at) <= resetMs);
 const lasted = reached ? `Lasted until the reset: no. Usage at or above the reported limit was observed on ${date(reached.at, true)} (UTC).`
  : late ? `Lasted until the reset: yes. Usage below the reported limit was observed within ${LASTED_HOURS} hours before the reset.`
  : `Lasted until the reset: unknown. No update below the reported limit was observed within ${LASTED_HOURS} hours before the reset.`;

 const lines = [used, lasted, trendLine(h, chain.at(-1)!.usage, previous.startAt, last.at), exclusionLine(results, previousKey), busiestLine(h, previous.resetAt, previous.startAt, last.at), quietestLine(h, previous.resetAt, previous.startAt, last.at), paceLine(h, limit, previous.startAt, previous.resetAt, last.at)];
 if (link) lines.push(RECAP_LINK_TEXT);
 return { cycle: key, period: `Cycle that ended ${date(previous.resetAt, true)} (UTC). Figures come from the account updates Bobert observed; it is not a bill.`, lines };
}

// Average credits per day over the observed part of each cycle (its evidence-backed start to its last observation), compared exactly.
function trendLine(h: AccountHistory, usage: string, startAt: string, lastAt: string): string {
 const e = h.evidence, cycles = e.cycles, before = cycles.length >= 3 ? cycles.at(-3)! : undefined, previous = cycles.at(-2)!;
 const heading = 'Use compared with the cycle before';
 if (!before?.startAt) return `${heading}: not observed. The cycle before was not seen from its start.`;
 if (e.exclusions.length || (e.stoppedBy && e.stoppedBy !== 'evidence_range') || !before.baseLimit || before.baseLimit !== previous.baseLimit)
  return `${heading}: not comparable because the retained account updates contain a quality barrier such as an adjustment, a conflict or a limit change.`;
 const chain = observedCycle(h, before);
 const spanNow = Date.parse(lastAt) - Date.parse(startAt), spanBefore = chain?.length ? Date.parse(before.lastObservedAt) - Date.parse(before.startAt) : 0;
 if (!chain?.length || spanNow <= 0 || spanBefore <= 0) return `${heading}: not comparable because the cycle before has no unbroken run of observed updates.`;
 const now = scaleRatio(usage, BigInt(DAY_MS), BigInt(spanNow)), earlier = scaleRatio(chain.at(-1)!.usage, BigInt(DAY_MS), BigInt(spanBefore));
 const d = compare(now, earlier), delta = subtract(now, earlier).replace(/^-/, '');
 return `${heading}: average ${now} credits per day over the observed part of the cycle, against ${earlier} in the cycle before, ${d === 0 ? 'unchanged' : `${d > 0 ? 'higher' : 'lower'} by ${delta}`}. This is an observation only; the cause is open.`;
}

function exclusionLine(results: StoredResults, key: string): string {
 const heading = 'Exclusions you saved in that cycle';
 if (results.status === 'unknown') return `${heading}: not available because the saved summary could not be read.`;
 const entry = results.entries.find(x => x.cycle === key);
 return entry ? `${heading}: ${describeExclusions(entry)}.` : `${heading}: none counted.`;
}

// Same-day evidence intervals only, so the day is partially observed by construction: updates across days are never spread over the days.
function sameDayTotals(h: AccountHistory, resetAt: string, startAt: string, lastAt: string): Map<string, { net: string; ms: number }> {
 const days = new Map<string, { net: string; ms: number }>();
 for (const iv of h.evidence.intervals) {
  if (iv.kind !== 'day' || iv.resetAt !== resetAt || Date.parse(iv.from) < Date.parse(startAt) || Date.parse(iv.to) > Date.parse(lastAt)) continue;
  const day = iv.from.slice(0, 10), x = days.get(day) ?? { net: '0', ms: 0 };
  days.set(day, { net: add(x.net, iv.netChange), ms: x.ms + Date.parse(iv.to) - Date.parse(iv.from) });
 }
 return days;
}
function busiestLine(h: AccountHistory, resetAt: string, startAt: string, lastAt: string): string {
 const label = 'Busiest observed day (partial observation)';
 const days = sameDayTotals(h, resetAt, startAt, lastAt);
 let best: [string, { net: string; ms: number }] | undefined;
 for (const entry of [...days].sort(([a], [b]) => a < b ? -1 : 1)) if (compare(entry[1].net, '0') > 0 && (!best || compare(entry[1].net, best[1].net) > 0)) best = entry;
 return best ? `${label}: ${date(`${best[0]}T00:00:00.000Z`, true)} (UTC), ${best[1].net} credits in ${duration(best[1].ms)} of observed updates.`
  : `${label}: not observed. No day with observed use was recorded in same-day updates.`;
}

/** The smallest observed use among days with at least this much observed time, so a day seen for a few minutes is never "quiet". */
export const QUIET_MIN_HOURS = 12;
function quietestLine(h: AccountHistory, resetAt: string, startAt: string, lastAt: string): string {
 const label = 'Quietest observed day';
 let best: [string, { net: string; ms: number }] | undefined;
 for (const entry of [...sameDayTotals(h, resetAt, startAt, lastAt)].sort(([a], [b]) => a < b ? -1 : 1))
  if (entry[1].ms >= QUIET_MIN_HOURS * 3600000 && compare(entry[1].net, '0') >= 0 && (!best || compare(entry[1].net, best[1].net) < 0)) best = entry;
 return best ? `${label}: ${date(`${best[0]}T00:00:00.000Z`, true)} (UTC), ${best[1].net} credits in ${duration(best[1].ms)} of observed updates.`
  : `${label}: not observed. No day was observed for at least ${QUIET_MIN_HOURS} hours in same-day updates.`;
}

/** Complete UTC days of the cycle at or under an even daily pace (reported limit divided by the cycle length), and the longest run of such days in a row. */
function paceLine(h: AccountHistory, limit: string, startAt: string, resetAt: string, lastAt: string): string {
 const label = 'Days at or under the even daily pace';
 const span = Date.parse(resetAt) - Date.parse(startAt);
 if (!(span > 0)) return `${label}: not observed.`;
 const pace = scaleRatio(limit, BigInt(DAY_MS), BigInt(span));
 const days = [...sameDayTotals(h, resetAt, startAt, lastAt)].filter(([, d]) => d.ms === DAY_MS).sort(([x], [y]) => x < y ? -1 : 1).map(([day, d]) => ({ day, netChange: d.net }));
 if (!days.length) return `${label}: not observed. No complete UTC day of the cycle was observed.`;
 let under = 0, run = 0, longest = 0, previous = '';
 for (const d of days) {
  const ok = compare(d.netChange, pace) <= 0;
  if (ok) { under++; run = previous && Date.parse(`${d.day}T00:00:00Z`) - Date.parse(`${previous}T00:00:00Z`) === DAY_MS && run > 0 ? run + 1 : 1; longest = Math.max(longest, run); } else run = 0;
  previous = d.day;
 }
 return `${label} (${pace} credits, limit divided by the cycle length): ${under} of ${days.length} complete UTC days, longest run in a row ${longest}.`;
}

export type RecapVisibility = 'hidden' | 'new' | 'shown';
/** Shown the first time its cycle is observed ('new') and until dismissed; hidden when dismissed, when the stored value is unknown or newer. */
export function recapVisibility(recap: Recap | null, stored: StoredRecap): RecapVisibility {
 if (!recap || stored.status !== 'ok') return 'hidden';
 const v = stored.value;
 if (!v || v.cycle < recap.cycle) return 'new';
 return v.cycle === recap.cycle && v.state === 'shown' ? 'shown' : 'hidden';
}
/** The value to store for `state`, or null when nothing may be written (unknown stored value, dismissed already, or a newer cycle is stored). */
export function nextRecapState(stored: StoredRecap, cycle: string, state: RecapState['state']): RecapState | null {
 if (stored.status !== 'ok' || cycleKey(cycle) !== cycle) return null;
 const v = stored.value;
 if (v && (v.cycle > cycle || (v.cycle === cycle && (v.state === 'dismissed' || v.state === state)))) return null;
 return { cycle, state };
}
/** The plain text that Copy text puts on the clipboard: the card's own text, built here and never by the page. */
export function recapText(recap: Recap): string {
 return [RECAP_TITLE, recap.period, ...recap.lines].join('\n');
}
