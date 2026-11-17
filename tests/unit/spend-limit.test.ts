import assert from 'node:assert/strict';
import test from 'node:test';
import { view } from '../../src/view.ts';
import { decideBudgetNotice, spendLimitLine, spendLimitText, usdText, type BudgetInput } from '../../src/extension/budget-warning.ts';
import { readSpendLimitUsd } from '../../src/extension/identity.ts';
import { present } from '../../src/extension/presentation.ts';
import { syntheticSnapshot as snapshot } from './synthetic.ts';

const RESET = '2030-07-01T00:00:00.000Z';
const NOW = '2030-06-08T00:00:00Z';
// Usage 70 of 100 at 10 a day: empty on 11 Jun, about $8.00 over the limit by the reset at the reviewed price.
const fast = () => view(Array.from({ length: 8 }, (_, i) => snapshot(`2030-06-0${i + 1}T00:00:00Z`, String(i * 10), { limit: '100' })), NOW);
const decide = (v: ReturnType<typeof view>, extra: Partial<BudgetInput> = {}) => decideBudgetNotice({ view: v, eligible: true, now: NOW, state: undefined, enabled: true, percent: 0, ...extra });

test('spend: due once the modelled cost above the limit exceeds the spending limit, and it settles the run-out notice', () => {
 const n = decide(fast(), { spendLimitUsd: 5 })!;
 assert.equal(n.kind, 'spend');
 assert.equal(n.text, 'At this pace your Kiro credits run out on 11 Jun, and the credits above the limit would cost about $8.00 by the reset (modelled), more than your $5 spending limit.');
 assert.deepEqual(n.state, { cycle: RESET, done: ['spend', 'forecast'] });
 assert.equal(decide(fast(), { spendLimitUsd: 5, state: n.state }), null); // once per cycle
});

test('spend: not due at or below the limit, when off, or without a regular priced forecast', () => {
 assert.equal(decide(fast(), { spendLimitUsd: 8 })!.kind, 'forecast'); // exactly at the limit is not more
 assert.equal(decide(fast(), { spendLimitUsd: 0 })!.kind, 'forecast');
 assert.equal(decide(fast())!.kind, 'forecast');
 assert.equal(decide(fast(), { spendLimitUsd: 5, eligible: false }), null);
 // A provisional estimate (3 days of history) never announces a cost.
 const early = view(Array.from({ length: 3 }, (_, i) => snapshot(`2030-06-0${i + 5}T00:00:00Z`, String(i * 30), { limit: '100' })), NOW);
 assert.equal(early.forecast.tier, 'provisional');
 assert.equal(decide(early, { spendLimitUsd: 1 }), null);
});

test('spend: still shown after an earlier run-out notice, never after the limit notice', () => {
 assert.equal(decide(fast(), { spendLimitUsd: 5, state: { cycle: RESET, done: ['forecast'] } })!.kind, 'spend');
 assert.equal(decide(fast(), { spendLimitUsd: 5, state: { cycle: RESET, done: ['limit'] } }), null);
 const reached = view(Array.from({ length: 8 }, (_, i) => snapshot(`2030-06-0${i + 1}T00:00:00Z`, String(30 + i * 10), { limit: '100' })), NOW);
 assert.equal(decide(reached, { spendLimitUsd: 1 })!.kind, 'limit');
});

test('the spending limit setting is read as whole cents, capped, and anything invalid is off', () => {
 const get = (value: unknown) => (_prefix: string, key: string) => key === 'spendLimitUsd' ? value : undefined;
 for (const [value, expected] of [[0, 0], [50, 50], [12.345, 12.34], [0.29, 0.29], [0.57, 0.57], [0.58, 0.58], [4.35, 4.35], [8.2, 8.2], [19.99, 19.99], [1.005, 1], [0.004, 0], [-3, 0], [1e9, 100000]] as const) assert.equal(readSpendLimitUsd(get(value)), expected, String(value));
 for (const bad of ['50', null, Number.NaN, Number.POSITIVE_INFINITY, {}, true, undefined]) assert.equal(readSpendLimitUsd(get(bad)), 0, String(bad));
 assert.equal(spendLimitText(0), null); assert.equal(spendLimitText(12.5), '12.50');
 for (const v of [0.29, 0.58, 4.35, 8.2, 19.99, 100000]) assert.equal(spendLimitText(readSpendLimitUsd(get(v))), v.toFixed(2), String(v));
 // Equal is not more, also for values that drift in binary.
 assert.equal(spendLimitLine({ money: '8.20' }, readSpendLimitUsd(get(8.2))), 'That is within your $8.20 spending limit.');
 assert.equal(usdText('50.00'), '$50'); assert.equal(usdText('12.50'), '$12.50');
});

test('the credit view compares a priced projected overage with the spending limit, only when one is set', () => {
 assert.equal(spendLimitLine({ money: '8.00' }, 5), 'That is more than your $5 spending limit.');
 assert.equal(spendLimitLine({ money: '8.00' }, 8), 'That is within your $8 spending limit.');
 assert.equal(spendLimitLine({ money: null }, 5), '');
 assert.equal(spendLimitLine({ money: '8.00' }, 0), '');
 const html = (limit?: number) => present(fast(), [], '', '', undefined, NOW, false, undefined, '', undefined, undefined, false, { days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], zone: 'UTC', spendLimitUsd: limit }).html;
 assert.ok(html(5).includes('That is more than your $5 spending limit.'));
 assert.ok(html(20).includes('That is within your $20 spending limit.'));
 assert.ok(!html().includes('spending limit'));
});

test('spend blocks the unused reminder, and the credit-view line needs a fresh regular forecast', () => {
 assert.equal(decide(fast(), { spendLimitUsd: 5, state: { cycle: RESET, done: ['spend'] }, unusedPercent: 30, budgetDay: true }), null);
 const line = (v: ReturnType<typeof view>, now: string) => present(v, [], '', '', undefined, now, false, undefined, '', undefined, undefined, false, { days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], zone: 'UTC', spendLimitUsd: 5 }).html.includes('spending limit');
 assert.equal(line(fast(), NOW), true);
 const stale = view(Array.from({ length: 8 }, (_, i) => snapshot(`2030-06-0${i + 1}T00:00:00Z`, String(i * 10), { limit: '100' })), '2030-06-10T00:00:00Z');
 assert.equal(line(stale, '2030-06-10T00:00:00Z'), false);
 const early = view(Array.from({ length: 3 }, (_, i) => snapshot(`2030-06-0${i + 5}T00:00:00Z`, String(i * 30), { limit: '100' })), NOW);
 assert.equal(line(early, NOW), false);
});
