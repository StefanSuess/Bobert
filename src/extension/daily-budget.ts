import { compare, scaleRatio, subtract } from '../decimal.ts';
import { timestamp } from '../time.ts';
import type { view } from '../view.ts';

export type BudgetDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export const ALL_DAYS: readonly BudgetDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export type DayBudget =
 | { status: 'available'; day: string; allowance: string; remainingAtAnchor: string; anchorAt: string;
     weightSum: string; budgetDaysLeft: number; used: string | null; since: string | null; asOf: string }
 | { status: 'day_off'; day: string; used: string | null; since: string | null; asOf: string }
 | { status: 'unavailable'; reason: 'not_observed' | 'missing_billing' | 'reset_unknown' | 'unsupported_timezone' };
const unavailable = (reason: Extract<DayBudget, { status: 'unavailable' }>['reason']): DayBudget => ({ status: 'unavailable', reason });
const NAMES: Record<BudgetDay, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const WEEKDAY: BudgetDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']; // Date.getUTCDay() order
const MAX_DAYS = 400;
const gcd = (a: bigint, b: bigint): bigint => b ? gcd(b, a % b) : a;

function localParts(instant: string, zone: string, options: Intl.DateTimeFormatOptions) {
 const f = new Intl.DateTimeFormat('en-CA', { timeZone: zone, ...options });
 return Object.fromEntries(f.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
}
const localDay = (instant: string, zone: string) => {
 const p = localParts(instant, zone, { year: 'numeric', month: '2-digit', day: '2-digit' });
 return `${p.year}-${p.month}-${p.day}`;
};
export function localTime(instant: string, zone: string): string {
 const p = localParts(instant, zone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
 return `${p.hour}:${p.minute}`;
}
const nextDay = (ymd: string) => new Date(Date.parse(`${ymd}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const weekday = (ymd: string) => WEEKDAY[new Date(`${ymd}T00:00:00Z`).getUTCDay()]!;
// Local midnight as epoch ms; a nonexistent or ambiguous midnight is treated as an unsupported zone.
function midnight(ymd: string, zone: string): number | null {
 const t = timestamp(`${ymd}T00:00:00`, zone);
 return t.status === 'valid' ? Date.parse(t.instant!) : null;
}

export const restricted = (days: readonly BudgetDay[]) => !ALL_DAYS.every(d => days.includes(d));
export function daysLabel(days: readonly BudgetDay[]): string {
 if (!restricted(days)) return 'Every day';
 const picked = ALL_DAYS.filter(d => days.includes(d));
 if (!picked.length) return 'No days';
 const first = ALL_DAYS.indexOf(picked[0]!), last = ALL_DAYS.indexOf(picked.at(-1)!);
 return picked.length >= 3 && last - first + 1 === picked.length ? `${NAMES[picked[0]!]}–${NAMES[picked.at(-1)!]}` : picked.map(d => NAMES[d]).join(', ');
}

// Same comparability rules as todayPace: one cycle and limit, no conflicts, unbroken comparable chain.
function usedToday(o: ReturnType<typeof view>, points: ReturnType<typeof view>['history']['points'], todayStart: number): { used: string; since: string } | null {
 const first = points[0], last = points.at(-1);
 // history() keeps only the current cycle, so a cycle that began after midnight leaves a partial day.
 if (o.history.cycleStartAt && Date.parse(o.history.cycleStartAt) > todayStart) return null;
 // An earlier cycle exists but its reset time is unknown, so it may have ended today.
 const cycleFirst = o.history.points[0]; // not today's first: the reason lasts the whole cycle
 if (o.history.reasons.includes('ambiguous_cycle_start') && cycleFirst && Date.parse(cycleFirst.observedAt) >= todayStart) return null;
 if (!first || !last || Date.parse(last.observedAt) !== Date.parse(o.observedAt!)) return null;
 if (points.some(p => p.conflicting || p.usage === null || p.baseLimit === null || p.resetAt !== last.resetAt || p.baseLimit !== last.baseLimit || p.flags.includes('unsupported_extra_credits'))) return null;
 const intervals = o.history.intervals.filter(iv => iv.from >= first.observedAt && iv.to <= last.observedAt);
 if (intervals.length !== points.length - 1 || intervals.some((iv, i) => iv.from !== points[i]!.observedAt || iv.to !== points[i + 1]!.observedAt || iv.status !== 'comparable')) return null;
 return { used: subtract(last.usage!, first.usage!), since: first.observedAt };
}

export function dayBudget(o: ReturnType<typeof view>, now: string, zone: string, days: readonly BudgetDay[]): DayBudget {
 if (o.status !== 'observed' || !o.observedAt) return unavailable('not_observed');
 if (o.baseLimit === null || o.usage === null) return unavailable('missing_billing');
 const nowMs = Date.parse(now), resetMs = o.resetAt ? Date.parse(o.resetAt) : NaN;
 if (!Number.isFinite(nowMs) || !Number.isFinite(resetMs) || resetMs <= nowMs) return unavailable('reset_unknown');
 let today: string;
 try { today = localDay(now, zone); } catch { return unavailable('unsupported_timezone'); }
 const todayStart = midnight(today, zone);
 if (todayStart === null) return unavailable('unsupported_timezone');
 // Today's updates are exactly those inside [local midnight, now]; no per-point formatting needed.
 const points = o.history.points.filter(p => { const at = Date.parse(p.observedAt); return at >= todayStart && at <= nowMs; });
 const pace = usedToday(o, points, todayStart);
 // Stored text may carry another ISO spelling; report the canonical instant.
 const used = pace?.used ?? null, since = pace?.since ?? null, asOf = new Date(o.observedAt).toISOString();
 if (!days.includes(weekday(today))) return { status: 'day_off', day: today, used, since, asOf };

 // Sum the weights as an exact fraction so nothing is rounded before the final division.
 // Today counts fully when it is a budget day, even if the reset falls later today; a future reset day counts its part before the reset.
 let num = 0n, den = 1n, ymd = today, count = 0, start = todayStart;
 for (;;) {
  if (start >= resetMs) break;
  if (++count > MAX_DAYS) return unavailable('reset_unknown');
  const following = nextDay(ymd), end = midnight(following, zone);
  if (end === null) return unavailable('unsupported_timezone');
  if (days.includes(weekday(ymd))) {
   const n = BigInt(ymd === today ? end - start : Math.min(end, resetMs) - start), d = BigInt(end - start);
   const sn = num * d + n * den, sd = den * d, g = gcd(sn, sd);
   num = sn / g; den = sd / g;
  }
  ymd = following; start = end;
 }
 if (num <= 0n) return unavailable('reset_unknown');
 const first = pace ? points[0]! : null;
 const anchorAt = first?.observedAt ?? asOf, anchorUsage = first?.usage ?? o.usage, limit = first?.baseLimit ?? o.baseLimit;
 const left = subtract(limit, anchorUsage), remaining = compare(left, '0') < 0 ? '0' : left;
 return { status: 'available', day: today, allowance: scaleRatio(remaining, den, num), remainingAtAnchor: remaining, anchorAt,
  weightSum: scaleRatio('1', num, den), budgetDaysLeft: Number((num + den - 1n) / den), used, since, asOf };
}
