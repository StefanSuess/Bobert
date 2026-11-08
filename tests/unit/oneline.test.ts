import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { view, oneline } from '../../src/view.ts';
import { syntheticSnapshot } from './synthetic.ts';

// Ten days of updates every 12 hours at a fixed daily rate, ending at `now`.
const series = (perDay: number, now = '2030-06-21T00:00:00.000Z') => Array.from({ length: 21 }, (_, i) => {
 const at = new Date(Date.parse(now) - (20 - i) * 43200000).toISOString();
 return syntheticSnapshot(at, String(100 + i * perDay / 2));
});

test('oneline names unavailable data by its fixed status and never shows zero', () => {
 assert.equal(oneline(view([], '2030-06-21T00:00:00Z')), 'Kiro credits: unavailable (unavailable)');
 assert.equal(oneline(view([syntheticSnapshot('2030-06-20T00:00:00.000Z', '5', { partition: 'synthetic-a' }), syntheticSnapshot('2030-06-20T01:00:00.000Z', '6', { partition: 'synthetic-b' })], '2030-06-21T00:00:00Z')),
  'Kiro credits: unavailable (multiple_accounts)');
});

test('oneline shows used, left, reset and the forecast outlook', () => {
 assert.equal(oneline(view(series(20), '2030-06-21T00:00:00Z')), 'Kiro credits: 300/1000 used | 700 left | resets 2030-07-01 (in 10 days) | on track');
 assert.equal(oneline(view(series(90), '2030-06-21T00:00:00Z')), 'Kiro credits: 1000/1000 used | 0 left | resets 2030-07-01 (in 10 days) | limit reached');
 const over = oneline(view(series(60), '2030-06-21T00:00:00Z'));
 assert.match(over, /^Kiro credits: 700\/1000 used \| 300 left \| resets 2030-07-01 \(in 10 days\) \| likely to exceed, runs out 2030-06-26$/);
});

test('oneline says collecting, stale and elapsed reset plainly', () => {
 const one = [syntheticSnapshot('2030-06-20T12:00:00.000Z', '12.34')];
 assert.equal(oneline(view(one, '2030-06-21T00:00:00Z')), 'Kiro credits: 12.3/1000 used | 987.6 left | resets 2030-07-01 (in 10 days) | collecting data');
 assert.equal(oneline(view(one, '2030-06-23T00:00:00Z')), 'Kiro credits: 12.3/1000 used | 987.6 left | resets 2030-07-01 (in 8 days) | stale (as of 2030-06-20)');
 assert.equal(oneline(view(one, '2030-07-02T00:00:00Z')), 'Kiro credits: 12.3/1000 used | reset elapsed (as of 2030-06-20)');
});

test('CLI rejects --oneline together with --json or --diagnostics', () => {
 for (const extra of ['--json', '--diagnostics']) {
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', resolve('src/cli.ts'), '--oneline', extra], { encoding: 'utf8' });
  assert.equal(r.status, 1); assert.equal(r.stdout.trim(), 'CONFIGURATION_INVALID'); assert.equal(r.stderr, '');
 }
});

test('CLI --oneline prints one line without identifiers or paths', async () => {
 const { mkdtemp, mkdir, writeFile, realpath, rm } = await import('node:fs/promises');
 const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
 const base = await mkdtemp(join(await realpath(tmpdir()), 'synthetic-oneline-')); const root = join(base, 'source');
 const dir = join(root, 'logs', 'synthetic-run', 'synthetic-window', 'exthost', 'kiro.kiroAgent'); await mkdir(dir, { recursive: true });
 await writeFile(join(dir, 'q-client.log'), '2030-06-29T18:00:00.000Z [info] synthetic {"commandName":"GetUsageLimitsCommand","output":{"userInfo":{"userId":"synthetic-user-private"},"nextDateReset":"2030-07-01T00:00:00Z","usageBreakdownList":[{"resourceType":"CREDIT","currentUsageWithPrecision":11.35,"usageLimitWithPrecision":100}]},"metadata":{"httpStatusCode":200}}\n');
 const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', resolve('src/cli.ts'), '--source-root', root, '--store-dir', join(base, 'gauge'), '--oneline'], { encoding: 'utf8' });
 assert.equal(r.status, 0); assert.equal(r.stderr, '');
 const lines = r.stdout.trimEnd().split('\n'); assert.equal(lines.length, 1);
 assert.match(lines[0]!, /^Kiro credits: 11\.3\/100 used \| /);
 for (const marker of [base, 'synthetic-user', 'partition']) assert.ok(!r.stdout.includes(marker));
 await rm(base, { recursive: true });
});
