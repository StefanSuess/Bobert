import { subtract, allocation, compare, compareRatios } from './decimal.ts';
import { history } from './history.ts';
import { forecast } from './forecast.ts';
import type { StoredSnapshot } from './store.ts';
export function view(snapshots: StoredSnapshot[], now = new Date().toISOString(), maxAgeHours = 24) {
 const accountHistory = history(snapshots);
 const prediction = forecast(accountHistory, now, maxAgeHours);
 const result = { history: accountHistory, forecast: prediction, status: 'unavailable', source: 'GetUsageLimitsCommand', observedAt: null as string | null, observedText: null as string | null, sourceTimezone: null as string | null,
  usage: null as string | null, baseLimit: null as string | null, remainingBaseCredits: null as string | null,
  resetAt: null as string | null, resetText: null as string | null, availablePerDay: null as string | null,
  allocationBasis: 'remaining_base_credits / remaining_UTC_24_hour_days; truncated_to_6_decimals', totalAvailableCredits: null,
  dailyConsumption: null, flags: [] as string[], interval: { status: 'unknown', netChange: null as string | null, dailyConsumption: null } };
 if (!snapshots.length) return result;
 if (new Set(snapshots.map(s => s.partition)).size !== 1) { result.status = 'multiple_accounts'; return result; }
 if (snapshots.some(s => !s.associated)) { result.status = 'unknown_account'; return result; }
 const sorted = [...snapshots].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
 const latest = sorted.at(-1)!; const ties = sorted.filter(s => s.observedAt === latest.observedAt);
 const fields = (s: StoredSnapshot) => JSON.stringify([s.usage, s.limit, s.resetAt, s.overages, s.overageCap, s.flags.filter(f => f !== 'assumed_source_timezone')]);
 if (new Set(ties.map(fields)).size !== 1) { result.status = 'conflicting_snapshots'; return result; }
 Object.assign(result, { observedAt: latest.observedAt, observedText: latest.observedText, sourceTimezone: latest.sourceTimezone, usage: latest.usage, baseLimit: latest.limit,
  resetAt: latest.resetAt, resetText: latest.resetText, flags: [...latest.flags] });
 const age = Date.parse(now) - Date.parse(latest.observedAt);
 result.status = age < 0 ? 'future_observation' : age > maxAgeHours * 3600000 ? 'stale' : 'observed';
 const reset = latest.resetAt ? Date.parse(latest.resetAt) : NaN;
 if (reset <= Date.parse(now)) { result.status = 'reset_elapsed'; result.flags.push('no_new_cycle_observation'); }
 if (result.status !== 'future_observation' && result.status !== 'reset_elapsed' && latest.usage !== null && latest.limit !== null) {
  const remaining = subtract(latest.limit, latest.usage);
  result.remainingBaseCredits = remaining.startsWith('-') ? '0' : remaining;
  if (result.status === 'observed' && Number.isFinite(reset)) result.availablePerDay = allocation(result.remainingBaseCredits, reset - Date.parse(now));
 }
 const prior = sorted.filter(s => s.observedAt < latest.observedAt).at(-1);
 if (prior) {
  const priorTies = sorted.filter(s => s.observedAt === prior.observedAt);
  if (new Set(priorTies.map(fields)).size !== 1) result.interval.status = 'conflicting_prior_snapshots';
  else if (!prior.resetAt || !latest.resetAt) result.interval.status = 'reset_unknown';
  else if (latest.resetAt > prior.resetAt) result.interval.status = 'cycle_change_observed';
  else if (latest.resetAt < prior.resetAt) result.interval.status = 'reset_regressed';
  else if (latest.limit !== prior.limit) result.interval.status = 'plan_change';
  else if (latest.flags.includes('unsupported_extra_credits') || prior.flags.includes('unsupported_extra_credits')) result.interval.status = 'unsupported_extra_credits';
  else if (prior.usage !== null && latest.usage !== null) {
   result.interval.netChange = subtract(latest.usage, prior.usage);
   result.interval.status = result.interval.netChange.startsWith('-') ? 'counter_decrease_not_reset' : 'same_cycle_net_change';
  }
 }
 return result;
}

// One fixed-format line for shell prompts, tmux and scripts. Built only from the observation the CLI already prints;
// no identity, path or source detail. Unknown values are left out or named, never shown as zero.
const short = (s: string) => {
 const [whole, fraction = ''] = s.split('.');
 if (compare(s, '0') > 0 && compare(s, '0.1') < 0) return '<0.1';
 return fraction[0] && fraction[0] !== '0' ? `${whole}.${fraction[0]}` : whole!;
};
const day = (s: string) => new Date(s).toISOString().slice(0, 10);

export function oneline(o: ReturnType<typeof view>): string {
 const f = o.forecast;
 if (o.observedAt === null || o.usage === null || o.baseLimit === null) return `Kiro credits: unavailable (${o.status})`;
 const parts = [`Kiro credits: ${short(o.usage)}/${short(o.baseLimit)} used`];
 const stale = o.status === 'stale' || f.reasons.includes('stale');
 if (o.status !== 'observed' && !stale) { parts.push(`${o.status.replaceAll('_', ' ')} (as of ${day(o.observedAt)})`); return parts.join(' | '); }
 if (o.remainingBaseCredits !== null) parts.push(`${short(o.remainingBaseCredits)} left`);
 if (o.resetAt !== null) {
  // UTC calendar days, like the UTC date beside it: a reset later today is "today".
  const days = Math.floor(Date.parse(o.resetAt) / 86400000) - Math.floor(Date.parse(f.evaluatedAt) / 86400000);
  parts.push(`resets ${day(o.resetAt)}${Number.isFinite(days) && days >= 0 ? days === 0 ? ' (today)' : days === 1 ? ' (in 1 day)' : ` (in ${days} days)` : ''}`);
 }
 if (stale) { parts.push(`stale (as of ${day(o.observedAt)})`); return parts.join(' | '); }
 const selected = f.estimates.find(e => e.method === f.selectedMethod && e.status === 'qualified');
 if (f.status !== 'qualified' || !selected) { parts.push(f.reasons.includes('insufficient_comparable_coverage') ? 'collecting data' : 'forecast unavailable'); return parts.join(' | '); }
 const exhausted = selected.exhaustionStatus === 'already_exhausted_as_of';
 const over = exhausted || selected.budgetComparison === 'above_budget';
 const budget = o.availablePerDay;
 const tight = !over && budget !== null && compare(budget, '0') > 0 && compareRatios(selected.ratePerDay!, 9, budget, 10) >= 0;
 const outlook = exhausted ? 'limit reached' : over ? `likely to exceed${selected.estimatedExhaustionDayUTC ? `, runs out ${selected.estimatedExhaustionDayUTC.slice(0, 10)}` : ''}` : tight ? 'at risk' : 'on track';
 parts.push(f.tier === 'provisional' ? `${outlook} (provisional)` : outlook);
 return parts.join(' | ');
}
