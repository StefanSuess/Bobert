import { test } from 'node:test';
import assert from 'node:assert/strict';
import { view } from '../../src/view.ts';
import { present } from '../../src/extension/presentation.ts';
import { decideBudgetNotice } from '../../src/extension/budget-warning.ts';
import { utcDaysUntil } from '../../src/extension/labels.ts';
import { syntheticSnapshot as snapshot } from './synthetic.ts';

const NOW = '2030-06-08T00:00:00Z';
const series = (usage: string, changes: Parameters<typeof snapshot>[2] = {}) =>
 view(Array.from({ length: 8 }, (_, i) => snapshot(`2030-06-0${i + 1}T00:00:00Z`, usage, { limit: '100', ...changes })), NOW);
const notice = (o: ReturnType<typeof view>, percent: number) => decideBudgetNotice({ view: o, eligible: true, now: NOW, state: undefined, enabled: true, percent })?.text;

test('the percent notice rounds the used credits down like the percent beside it', () => {
 assert.equal(notice(series('99.9'), 80), 'You have used 99% of your reported Kiro credits (99 of 100); the reset is in 23 days.');
 assert.equal(notice(series('79.6'), 79), 'You have used 79% of your reported Kiro credits (79 of 100); the reset is in 23 days.');
});

test('the usage bar never says 100% before the reported limit is reached', () => {
 assert.match(present(series('99.6'), [], '', '', undefined, NOW).html, /99% of the reported credit limit used/);
 assert.match(present(series('100'), [], '', '', undefined, NOW).html, /100% of the reported credit limit used/);
 assert.match(present(series('130'), [], '', '', undefined, NOW).html, /100% of the reported credit limit used/);
});

test('a reset later today reads "today", and the countdown follows UTC calendar days', () => {
 assert.equal(utcDaysUntil('2030-06-08T02:00:00Z', '2030-06-08T00:00:00Z'), 0);
 assert.equal(utcDaysUntil('2030-06-09T01:00:00Z', '2030-06-08T00:00:00Z'), 1); // 25 hours away is tomorrow, not "in 2 days"
 assert.equal(utcDaysUntil('2030-06-09T00:00:00Z', '2030-06-08T23:00:00Z'), 1);
 const today = series('85', { resetAt: '2030-06-08T02:00:00.000Z', resetText: '2030-06-08T02:00:00Z' });
 assert.match(present(today, [], '', '', undefined, NOW).tooltip, /^Next reset today \(8 Jun\)$/m);
 assert.equal(notice(today, 80), 'You have used 85% of your reported Kiro credits (85 of 100); the reset is today.');
});
