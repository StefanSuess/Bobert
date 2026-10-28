import { compare, subtract } from '../decimal.ts';
import type { AccountHistory, EvidenceCycle } from '../history.ts';

export type Observation = { at: string; usage: string };
export type CycleComparison = {
 status: 'observed' | 'bracketed' | 'not_observed' | 'not_comparable'; offsetMs: number | null;
 current: Observation | null; previous: Observation | null; before: Observation | null; after: Observation | null;
};
const noComparison = (status: CycleComparison['status']): CycleComparison => ({ status, offsetMs: null, current: null, previous: null, before: null, after: null });
const add = (a: string, b: string) => subtract(a, subtract('0', b));

// A cycle counter is known only at the ends of an unbroken chain beginning with
// history()'s own zero-to-first-observation interval. No baseline is invented here.
export function observedCycle(h: AccountHistory, cycle: EvidenceCycle): Observation[] | null {
 if (!cycle.startAt || Date.parse(cycle.startAt) >= Date.parse(cycle.firstObservedAt)) return null;
 const startAt = cycle.startAt;
 const intervals = h.evidence.intervals.filter(iv => iv.resetAt === cycle.resetAt && Date.parse(iv.from) >= Date.parse(startAt) && Date.parse(iv.to) <= Date.parse(cycle.lastObservedAt));
 let at = startAt, usage = '0';
 const observations: Observation[] = [];
 for (const iv of intervals) {
  if (iv.from !== at || compare(iv.netChange, '0') < 0) return null;
  usage = add(usage, iv.netChange); at = iv.to;
  observations.push({ at, usage });
 }
 return at === cycle.lastObservedAt && observations[0]?.at === cycle.firstObservedAt ? observations : null;
}

export function cycleComparison(h: AccountHistory): CycleComparison {
 if (h.status !== 'available') return noComparison('not_observed');
 const cycles = h.evidence.cycles;
 if (cycles.length < 2) return noComparison('not_observed');
 const previousCycle = cycles.at(-2)!, currentCycle = cycles.at(-1)!;
 if (!previousCycle.startAt || !currentCycle.startAt) return noComparison('not_observed');
 if (h.evidence.exclusions.length || (h.evidence.stoppedBy && h.evidence.stoppedBy !== 'evidence_range') ||
     !previousCycle.baseLimit || !currentCycle.baseLimit || previousCycle.baseLimit !== currentCycle.baseLimit) return noComparison('not_comparable');
 const previous = observedCycle(h, previousCycle), current = observedCycle(h, currentCycle);
 if (!previous || !current || !current.length || h.points.at(-1)?.usage !== current.at(-1)?.usage) return noComparison('not_comparable');
 const latest = current.at(-1)!;
 const offsetMs = Date.parse(latest.at) - Date.parse(currentCycle.startAt);
 const target = Date.parse(previousCycle.startAt) + offsetMs;
 const before = previous.filter(p => Date.parse(p.at) <= target).at(-1) ?? null;
 const after = previous.find(p => Date.parse(p.at) > target) ?? null;
 if (before && target - Date.parse(before.at) <= 2 * 3600000)
  return { status: 'observed', offsetMs, current: latest, previous: before, before: null, after: null };
 return { status: before && after ? 'bracketed' : 'not_observed', offsetMs, current: latest, previous: null, before, after };
}
