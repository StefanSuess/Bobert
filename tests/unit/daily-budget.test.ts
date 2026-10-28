import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare } from '../../src/decimal.ts';
import { view } from '../../src/view.ts';
import { ALL_DAYS, dayBudget, daysLabel, restricted, type BudgetDay } from '../../src/extension/daily-budget.ts';
import { syntheticSnapshot } from './synthetic.ts';

const reset = '2030-06-15T00:00:00.000Z', weekdays: BudgetDay[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
const s = (at: string, usage: string, changes = {}) => syntheticSnapshot(at, usage, { resetAt: reset, ...changes });
const budget = (snapshots: ReturnType<typeof s>[], now: string, zone = 'UTC', days: readonly BudgetDay[] = ALL_DAYS) => dayBudget(view(snapshots, now), now, zone, days);

test('day budget anchors at the first update of the local day', () => {
 const r = budget([s('2030-06-08T08:00:00Z', '300'), s('2030-06-08T12:00:00Z', '355')], '2030-06-08T13:00:00Z');
 assert.equal(r.status, 'available');
 assert.ok(r.status === 'available');
 assert.equal(r.used, '55');
 assert.equal(r.since, '2030-06-08T08:00:00.000Z');
 assert.equal(r.remainingAtAnchor, '700');
 assert.equal(r.allowance, '100');
 assert.equal(r.asOf, '2030-06-08T12:00:00.000Z');
});

test('day budget uses the local day, not the UTC day', () => {
 const r = budget([s('2030-06-07T21:30:00Z', '200'), s('2030-06-07T22:30:00Z', '210')], '2030-06-07T23:00:00Z', 'Europe/Berlin');
 assert.ok(r.status === 'available');
 assert.equal(r.day, '2030-06-08');
 assert.equal(r.used, '0');
 assert.equal(r.since, '2030-06-07T22:30:00.000Z');
});

test('day budget skips days that are not budget days', () => {
 const r = budget([s('2030-06-12T10:00:00Z', '300', { resetAt: '2030-06-18T00:00:00.000Z' })], '2030-06-12T12:00:00Z', 'UTC', weekdays);
 assert.ok(r.status === 'available');
 assert.equal(r.allowance, '175');
 assert.equal(r.budgetDaysLeft, 4);
});

test('day budget counts only the part of the reset day before the reset', () => {
 const r = budget([s('2030-06-08T09:00:00Z', '0', { limit: '225', resetAt: '2030-06-10T06:00:00.000Z' })], '2030-06-08T10:00:00Z');
 assert.ok(r.status === 'available');
 assert.equal(r.allowance, '100');
 assert.equal(r.weightSum, '2.25');
 assert.equal(r.budgetDaysLeft, 3);
});

test('day budget counts today fully when the reset falls later today', () => {
 const r = budget([s('2030-06-30T13:00:00Z', '900', { resetAt: '2030-07-01T00:00:00.000Z' })], '2030-06-30T14:00:00Z', 'America/New_York');
 assert.ok(r.status === 'available');
 assert.equal(r.day, '2030-06-30');
 assert.equal(r.weightSum, '1');
 assert.equal(r.remainingAtAnchor, '100');
 assert.equal(r.allowance, '100');
 assert.ok(compare(r.allowance, r.remainingAtAnchor) <= 0);
});

test('day budget counts today fully when the reset is shortly after local midnight', () => {
 const r = budget([s('2030-06-30T22:10:00Z', '900', { resetAt: '2030-07-01T00:00:00.000Z' })], '2030-06-30T22:30:00Z', 'Europe/Berlin');
 assert.ok(r.status === 'available');
 assert.equal(r.day, '2030-07-01');
 assert.equal(r.weightSum, '1');
 assert.equal(r.allowance, r.remainingAtAnchor);
 assert.ok(compare(r.allowance, r.remainingAtAnchor) <= 0);
});

test('day budget drops used today when usage decreases on the same cycle', () => {
 const r = budget([s('2030-06-08T08:00:00Z', '300'), s('2030-06-08T12:00:00Z', '250')], '2030-06-08T13:00:00Z');
 assert.ok(r.status === 'available');
 assert.equal(r.used, null);
 assert.equal(r.since, null);
 assert.equal(r.anchorAt, '2030-06-08T12:00:00.000Z');
});

test('day budget drops used today when the limit changes during the day', () => {
 const r = budget([s('2030-06-08T08:00:00Z', '300'), s('2030-06-08T12:00:00Z', '310', { limit: '1500' })], '2030-06-08T13:00:00Z');
 assert.ok(r.status === 'available');
 assert.equal(r.used, null);
 assert.equal(r.since, null);
 assert.equal(r.anchorAt, '2030-06-08T12:00:00.000Z');
});

test('day budget drops used today for conflicting updates at the same instant', () => {
 const r = budget([s('2030-06-08T08:00:00Z', '300'), s('2030-06-08T08:00:00Z', '305'), s('2030-06-08T12:00:00Z', '320')], '2030-06-08T13:00:00Z');
 assert.ok(r.status === 'available');
 assert.equal(r.used, null);
 assert.equal(r.since, null);
 assert.equal(r.anchorAt, '2030-06-08T12:00:00.000Z');
});

test('day budget on a 23-hour daylight-saving day', () => {
 const r = budget([s('2030-03-31T10:00:00Z', '0', { resetAt: '2030-04-02T22:00:00.000Z' })], '2030-03-31T11:00:00Z', 'Europe/Berlin');
 assert.ok(r.status === 'available');
 assert.equal(r.weightSum, '3');
});

test('day budget returns day_off on a weekend', () => {
 const r = budget([s('2030-06-08T08:00:00Z', '300'), s('2030-06-08T12:00:00Z', '340')], '2030-06-08T13:00:00Z', 'UTC', weekdays);
 assert.ok(r.status === 'day_off');
 assert.equal(r.used, '40');
 assert.equal(r.since, '2030-06-08T08:00:00.000Z');
});

test('day budget without an update today anchors at the latest update', () => {
 const r = budget([s('2030-06-07T20:00:00Z', '300')], '2030-06-08T08:00:00Z');
 assert.ok(r.status === 'available');
 assert.equal(r.used, null);
 assert.equal(r.since, null);
 assert.equal(r.anchorAt, '2030-06-07T20:00:00.000Z');
});

test('day budget drops used today when the cycle resets during the day', () => {
 const r = budget([s('2030-06-08T08:00:00Z', '900', { resetAt: '2030-06-08T09:00:00.000Z' }), s('2030-06-08T10:00:00Z', '5')], '2030-06-08T11:00:00Z');
 assert.ok(r.status === 'available');
 assert.equal(r.used, null);
 assert.equal(r.since, null);
 assert.equal(r.anchorAt, '2030-06-08T10:00:00.000Z');
 // Never the old cycle's remaining credits (1000 - 900).
 assert.equal(r.remainingAtAnchor, '995');
 assert.equal(r.allowance, '142.142857');
});

test('day budget drops used today when an earlier cycle ended at an unknown time', () => {
 const r = budget([s('2030-06-08T08:00:00Z', '900', { resetAt: null }), s('2030-06-08T10:00:00Z', '5'), s('2030-06-08T12:00:00Z', '9')], '2030-06-08T13:00:00Z');
 assert.ok(r.status === 'available');
 assert.equal(r.used, null);
 assert.equal(r.since, null);
 assert.equal(r.anchorAt, '2030-06-08T12:00:00.000Z');
 assert.equal(r.remainingAtAnchor, '991');
});

test('day budget keeps used today on later days of a cycle that began after an unknown-reset cycle', () => {
 const r = budget([s('2030-06-06T08:00:00Z', '900', { resetAt: null }), s('2030-06-07T08:00:00Z', '5'), s('2030-06-08T10:00:00Z', '9'), s('2030-06-08T12:00:00Z', '12')], '2030-06-08T13:00:00Z');
 assert.ok(r.status === 'available');
 assert.equal(r.used, '3');
 assert.equal(r.since, '2030-06-08T10:00:00.000Z');
});

test('day budget clamps remaining at zero above the limit', () => {
 const r = budget([s('2030-06-08T08:00:00Z', '1200')], '2030-06-08T09:00:00Z');
 assert.ok(r.status === 'available');
 assert.equal(r.remainingAtAnchor, '0');
 assert.equal(r.allowance, '0');
});

test('day budget is unavailable for stale data', () => {
 assert.deepEqual(budget([s('2030-06-07T08:00:00Z', '300')], '2030-06-08T14:00:00Z'), { status: 'unavailable', reason: 'not_observed' });
});

test('day budget needs a known reset in the future and known billing', () => {
 assert.deepEqual(budget([s('2030-06-08T08:00:00Z', '300', { resetAt: null })], '2030-06-08T09:00:00Z'), { status: 'unavailable', reason: 'reset_unknown' });
 assert.deepEqual(budget([], '2030-06-08T09:00:00Z'), { status: 'unavailable', reason: 'not_observed' });
 assert.deepEqual(budget([s('2030-06-08T08:00:00Z', null as unknown as string)], '2030-06-08T09:00:00Z'), { status: 'unavailable', reason: 'missing_billing' });
});

test('day budget treats an unknown zone as unavailable', () => {
 assert.deepEqual(budget([s('2030-06-08T08:00:00Z', '300')], '2030-06-08T09:00:00Z', 'Not/AZone'), { status: 'unavailable', reason: 'unsupported_timezone' });
});

test('day budget gives up on a reset more than 400 days away', () => {
 assert.deepEqual(budget([s('2030-06-08T08:00:00Z', '300', { resetAt: '2032-01-01T00:00:00.000Z' })], '2030-06-08T09:00:00Z'), { status: 'unavailable', reason: 'reset_unknown' });
});

test('days label', () => {
 assert.equal(daysLabel(ALL_DAYS), 'Every day');
 assert.equal(daysLabel(weekdays), 'Mon–Fri');
 assert.equal(daysLabel(['mon', 'tue', 'wed', 'thu']), 'Mon–Thu');
 assert.equal(daysLabel(['mon', 'wed', 'fri']), 'Mon, Wed, Fri');
 assert.equal(restricted(ALL_DAYS), false);
 assert.equal(restricted(weekdays), true);
});
