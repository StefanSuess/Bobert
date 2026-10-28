import { test } from 'node:test';
import assert from 'node:assert/strict';
import { history } from '../../src/history.ts';
import { cycleComparison } from '../../src/extension/dashboard-insights.ts';
import { syntheticSnapshot as snapshot } from './synthetic.ts';

const prev = '2030-06-11T00:00:00.000Z', current = '2030-07-11T00:00:00.000Z';
const s = (at: string, usage: string | null, resetAt: string, changes = {}) => snapshot(at, usage as string, { resetAt, ...changes });
const cycles = () => [
 s('2030-05-31T23:00:00Z', '90', '2030-06-01T00:00:00.000Z'),
 s('2030-06-01T01:00:00Z', '5', prev),
 s('2030-06-04T00:00:00Z', '25', prev),
 s('2030-06-10T22:00:00Z', '50', prev),
 s('2030-06-11T01:00:00Z', '4', current),
 s('2030-06-14T01:00:00Z', '24', current),
];

test('cycle comparison reconstructs both counters through complete evidence-backed reset chains', () => {
 const result = cycleComparison(history(cycles()));
 assert.deepEqual(result, { status: 'observed', offsetMs: 3 * 86400000 + 3600000,
  current: { at: '2030-06-14T01:00:00.000Z', usage: '24' },
  previous: { at: '2030-06-04T00:00:00.000Z', usage: '25' }, before: null, after: null });
});

test('cycle comparison shows observed brackets when no previous update is within two hours', () => {
 const data = cycles(); data[2] = s('2030-06-03T00:00:00Z', '20', prev);
 const result = cycleComparison(history(data));
 assert.equal(result.status, 'bracketed');
 assert.deepEqual(result.before, { at: '2030-06-03T00:00:00.000Z', usage: '20' });
 assert.deepEqual(result.after, { at: '2030-06-10T22:00:00.000Z', usage: '50' });
 assert.equal(result.previous, null);
});

test('cycle comparison refuses a missing baseline and an adjustment even when endpoints exist', () => {
 const missing = cycles(); missing[1] = s('2030-06-01T00:00:00Z', '5', prev);
 assert.equal(cycleComparison(history(missing)).status, 'not_comparable');
 const adjusted = cycles(); adjusted.splice(3, 0, s('2030-06-05T00:00:00Z', '2', prev));
 assert.equal(cycleComparison(history(adjusted)).status, 'not_comparable');
});
