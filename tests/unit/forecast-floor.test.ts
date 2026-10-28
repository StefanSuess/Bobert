import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forecast } from '../../src/forecast.ts';
import { history, DAY_MS } from '../../src/history.ts';
import { view } from '../../src/view.ts';
import { present as presentAt } from '../../src/extension/presentation.ts';
import { syntheticSnapshot as snapshot } from './synthetic.ts';
import type { StoredSnapshot } from '../../src/store.ts';

// Synthetic only. Base limit 1000, reset 2030-07-01T00:00:00Z, one account, all times UTC.
const run = (s: StoredSnapshot[], now: string) => forecast(history(s), now);
// Evaluated at the moment of the last update (budgets are then exact in days).
const runNow = (s: StoredSnapshot[]) => run(s, s.at(-1)!.observedAt);

// Part C: the at-least average since the cycle start (lower bound, never an estimate).
const one = (usage: string, changes: Partial<StoredSnapshot> = {}) => [snapshot('2030-06-25T00:00:00Z', usage, changes)];
test('C1 one update: the floor assumes a cycle of at most 31 days and is never an estimate', () => {
 const r = runNow(one('620'));
 assert.deepEqual(r.cycleAverageFloor, { ratePerDay: '24.8', from: '2030-05-31T00:00:00.000Z', to: '2030-06-25T00:00:00.000Z', basis: 'maximum_cycle_length', projectedUsageAtResetFloor: '768.8', budgetComparison: 'within_budget' });
 assert.equal(r.dynamicDailyBudget, '63.333333'); assert.equal(r.selectedMethod, null); assert.equal(r.status, 'unavailable'); assert.equal(r.tier, 'unavailable');
 assert.ok(r.assumptions.includes('maximum_cycle_length_assumed'));
 assert.ok(r.estimates.every(e => e.status === 'unavailable'));
});
test('C2 an evidence-backed cycle start replaces the 31-day assumption', () => {
 const s = [snapshot('2030-05-31T22:00:00Z', '900', { resetAt: '2030-06-01T00:00:00.000Z' }), snapshot('2030-06-11T00:00:00Z', '300')];
 const r = runNow(s);
 assert.equal(r.cycleAverageFloor!.basis, 'evidence_cycle_start'); assert.equal(r.cycleAverageFloor!.from, '2030-06-01T00:00:00.000Z'); assert.equal(r.cycleAverageFloor!.ratePerDay, '30');
 assert.ok(!r.assumptions.includes('maximum_cycle_length_assumed'));
});
test('C3 a first update older than reset minus 31 days contradicts the assumption: no floor', () => {
 const s = [snapshot('2030-05-30T23:59:59Z', '10'), snapshot('2030-06-25T00:00:00Z', '620')];
 assert.equal(runNow(s).cycleAverageFloor, null); assert.ok(!runNow(s).assumptions.includes('maximum_cycle_length_assumed'));
 assert.notEqual(runNow([snapshot('2030-05-31T00:00:00Z', '10'), snapshot('2030-06-25T00:00:00Z', '620')]).cycleAverageFloor, null);
});
test('C4 stale, reset passed, missing billing and unsupported extra credits suppress the floor', () => {
 assert.equal(run(one('620'), '2030-06-26T00:00:01Z').cycleAverageFloor, null); // stale
 assert.equal(run(one('620'), '2030-07-01T00:00:00Z').cycleAverageFloor, null); // reset elapsed
 assert.equal(runNow(one(null as unknown as string)).cycleAverageFloor, null); // missing billing
 assert.equal(runNow(one('620', { flags: ['unsupported_extra_credits'] })).cycleAverageFloor, null);
 assert.equal(run(one('620'), '2030-06-24T00:00:00Z').cycleAverageFloor, null); // future observation
});
test('C5 a floor above the daily budget is reported as such, still not a forecast', () => {
 const r = runNow(one('900'));
 assert.equal(r.cycleAverageFloor!.ratePerDay, '36'); assert.equal(r.dynamicDailyBudget, '16.666666'); assert.equal(r.cycleAverageFloor!.budgetComparison, 'above_budget');
 assert.equal(r.status, 'unavailable'); assert.equal(r.selectedMethod, null);
});
test('C6 a floor next to a regular forecast changes neither selection, tier nor estimates', () => {
 const s = Array.from({ length: 8 }, (_, i) => snapshot(new Date(Date.parse('2030-06-01T00:00:00Z') + i * DAY_MS).toISOString(), String(i * 10)));
 const r = runNow(s);
 assert.deepEqual(r.cycleAverageFloor, { ratePerDay: '8.75', from: '2030-05-31T00:00:00.000Z', to: '2030-06-08T00:00:00.000Z', basis: 'maximum_cycle_length', projectedUsageAtResetFloor: '271.25', budgetComparison: 'within_budget' });
 // The same values as the forecast without a floor (see forecast.test.ts): the floor is not an estimate.
 assert.equal(r.selectedMethod, 'rolling_7_day'); assert.equal(r.tier, 'regular'); assert.equal(r.status, 'qualified');
 assert.equal(r.estimates.length, 7); assert.ok(r.estimates.every(e => e.method !== ('cycle_average_floor' as string)));
 const f = r.estimates[1]; assert.equal(f.ratePerDay, '10'); assert.equal(f.projectedUsageAtReset, '300'); assert.equal(f.budgetComparison, 'within_budget');
 assert.deepEqual(r.policy.maximumGapHours, 36); assert.equal(r.schemaVersion, 4); assert.equal(r.policy.version, 3);
});

// Part B: the allowance instead of a bare "Collecting data".
// Rendered at the view's own evaluation time, so the day budget never depends on the real clock.
const present = (o: ReturnType<typeof view>) => presentAt(o, [], '', '', undefined, o.forecast.evaluatedAt!);
const hero = (html: string) => /<section class="hero[^"]*"[\s\S]*?<\/section>/.exec(html)![0];
test('B1 collecting shows credits left, the allowance and the floor sentence with its assumption', () => {
 const r = present(view(one('620'), '2030-06-25T00:00:00Z')), h = hero(r.html);
 assert.equal(r.text, '$(gauge) Kiro credits: 380 left • 0/63.3 today'); assert.ok(!r.text.includes('$(warning)')); assert.equal(r.warning, false);
 assert.match(h, /Up to 63\.3 credits\/day until the reset/); assert.ok(!h.includes('Collecting data'));
 assert.match(h, /At your first update today you had 380 credits left and 6 days until the reset on 1 Jul, so up to 63\.3 per day; 0 used so far\. So far this cycle you have used at least 24\.8 credits per day on average \(assuming the cycle started no earlier than 31 May; if it started later, your average was higher\)\. Keep using Kiro\./);
 assert.ok(!/On track|Likely to exceed|runs? out/.test(h)); assert.match(h, /class="hero neutral"/);
 assert.match(r.html, /Forecast not ready yet — more history needed/);
 assert.ok(!r.html.includes('Even this minimum'));
});
test('B2 a floor above the allowance gets the warning tone and one extra sentence, but no forecast wording', () => {
 const r = present(view(one('900'), '2030-06-25T00:00:00Z')), h = hero(r.html);
 assert.match(h, /class="hero warn"/); assert.match(h, /at least 36 credits per day on average/); assert.match(h, /Even this minimum is above your daily allowance\./);
 assert.ok(!/On track|Likely to exceed|runs? out|exhaust/i.test(h)); assert.ok(!/Likely to exceed/.test(r.text + r.tooltip));
 // The status bar warns like other budget risk (warning icon and background), but never says On track or Likely to exceed.
 assert.equal(r.text, '$(warning) Kiro credits: 100 left • 0/16.6 today'); assert.equal(r.warning, true); assert.equal(r.severity, 'warning'); assert.equal(r.forecast, false);
 const evidence = present(view([snapshot('2030-05-31T22:00:00Z', '900', { resetAt: '2030-06-01T00:00:00.000Z' }), snapshot('2030-06-11T00:00:00Z', '300')], '2030-06-11T00:00:00Z'));
 assert.match(hero(evidence.html), /at least 30 credits per day on average\./); assert.ok(!hero(evidence.html).includes('assuming the cycle'));
});
test('B3 stale and eligible states are unchanged', () => {
 const stale = present(view(one('620'), '2030-06-26T00:00:01Z'));
 assert.equal(stale.text, '$(warning) Kiro credits: Stale data'); assert.ok(!stale.html.includes('Up to ')); assert.ok(!stale.html.includes('used at least'));
 const s = Array.from({ length: 8 }, (_, i) => snapshot(new Date(Date.parse('2030-06-01T00:00:00Z') + i * DAY_MS).toISOString(), String(i * 10)));
 const ok = present(view(s, '2030-06-08T00:00:00Z'));
 assert.equal(ok.text, '$(gauge) Kiro credits: On track • 0/40.4 today'); assert.ok(!ok.html.includes('used at least')); assert.ok(!hero(ok.html).includes('Up to 40'));
});

// Review follow-ups: edges where the floor or the allowance would mislead.
test('a zero floor stays in the JSON but is not worded; reduced precision withholds the floor', () => {
 assert.equal(runNow(one('0')).cycleAverageFloor!.ratePerDay, '0');
 assert.ok(!present(view(one('0'), '2030-06-25T00:00:00Z')).html.includes('used at least'));
 assert.equal(runNow(one('620', { flags: ['reduced_precision'] })).cycleAverageFloor, null);
});
test('no base credits left keeps the collecting text instead of "0 left • 0/day"', () => {
 for (const usage of ['1000', '1100']) {
  const r = present(view(one(usage), '2030-06-25T00:00:00Z'));
  assert.equal(r.text, '$(gauge) Kiro credits: Collecting data'); assert.ok(!r.html.includes('Up to 0 credits')); assert.ok(!r.html.includes('Even this minimum'));
 }
});
test('the floor warns only when the shown figures disagree and the floor spans a day', () => {
 const atBudget = one('500', { limit: '620' });
 assert.equal(runNow(atBudget).cycleAverageFloor!.budgetComparison, 'at_budget');
 assert.equal(present(view(atBudget, '2030-06-25T00:00:00Z')).warning, false);
 const nearlyEqual = one('417.25', { limit: '517.21' }), f = runNow(nearlyEqual);
 assert.equal(f.cycleAverageFloor!.ratePerDay, '16.69'); assert.equal(f.dynamicDailyBudget, '16.66'); assert.equal(f.cycleAverageFloor!.budgetComparison, 'above_budget');
 const shown = present(view(nearlyEqual, '2030-06-25T00:00:00Z'));
 assert.equal(shown.warning, false); assert.equal(shown.severity, 'none'); assert.ok(!shown.html.includes('Even this minimum'));
 const burst = [snapshot('2030-05-31T22:00:00Z', '900', { resetAt: '2030-06-01T00:00:00.000Z' }), snapshot('2030-06-01T12:00:00Z', '300')];
 assert.equal(runNow(burst).cycleAverageFloor!.budgetComparison, 'above_budget');
 const early = present(view(burst, '2030-06-01T12:00:00Z'));
 assert.match(hero(early.html), /at least 600 credits per day on average/); assert.equal(early.warning, false); assert.ok(!early.html.includes('Even this minimum'));
 assert.equal(present(view(one('620'), '2030-06-25T00:00:00Z')).severity, 'none');
});
test('an eligible forecast suppresses the floor sentence and its warning even when the floor is above budget', () => {
 const s = Array.from({ length: 8 }, (_, i) => snapshot(new Date(Date.parse('2030-06-01T00:00:00Z') + i * DAY_MS).toISOString(), String(i * 100)));
 assert.equal(runNow(s).cycleAverageFloor!.budgetComparison, 'above_budget');
 const r = present(view(s, '2030-06-08T00:00:00Z'));
 assert.ok(!r.html.includes('used at least')); assert.ok(!r.html.includes('Even this minimum')); assert.match(r.text, /Likely to exceed/);
});
