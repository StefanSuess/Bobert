import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error -- plain .mjs helpers without declaration files
import { seedRichWorkspace } from '../../scripts/demo/rich-workspace.mjs';
// @ts-expect-error -- plain .mjs helper without a declaration file
import { kiroCliCandidates } from '../../scripts/demo/base.mjs';
import { runAudit } from '../../src/audit/audit.ts';
import { createConfigReviewer } from '../../src/audit/config-review.ts';
import { readSession } from '../../src/session/reader.ts';
import { evaluate, newHintState } from '../../src/session/notices.ts';

const temp = (t: { after(fn: () => void): void }) => { const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'synthetic-acceptance-env-'))); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; };

test('the rich demo workspace yields every audit group and Steering/Hooks finding of the native acceptance', async t => {
 const dir = temp(t); const workspace = join(dir, 'workspace'); mkdirSync(workspace);
 assert.equal(seedRichWorkspace(workspace).length, 11);
 const audit = await runAudit(workspace, []);
 assert.equal(audit.status, 'complete');
 assert.deepEqual([...new Set(audit.findings.map(f => f.category))].sort(), ['archive', 'data', 'database', 'log', 'secret']);
 assert.equal(audit.findings.length, 6); // .env and server.pem (secret), dump.sql, backup.zip, big.csv, debug.log
 const review = await createConfigReviewer().review([workspace]);
 const ids = review.findings.map(f => f.id);
 for (const id of ['S1', 'S2', 'S3', 'S4', 'H1', 'H2'] as const) assert.ok(ids.includes(id), id); // large always-on Steering, large AGENTS.md, sum, match-everything, two broad agent hooks
 assert.equal(statSync(join(workspace, 'dump.sql')).size, 14 * 1024 * 1024);
});

test('the invented session script writes a session that the hints reader accepts and turns into the documented notices', async t => {
 const demo = temp(t); const workspace = join(demo, 'workspace'); mkdirSync(workspace);
 const run = (...argv: string[]) => spawnSync(process.execPath, ['scripts/demo/session.mjs', demo, ...argv], { encoding: 'utf8' });
 assert.equal(run('--percent', '88', '--model', 'claude-opus-4.5').status, 0);
 const now = Date.now();
 const read = await readSession({ home: join(demo, 'home'), folders: [workspace], platform: process.platform, now });
 assert.equal(read.code, 'ok'); if (read.code !== 'ok') return;
 assert.equal(read.observation.modelId, 'claude-opus-4.5'); assert.equal(read.observation.context?.percent, 88);
 const state = newHintState(), started = now - 60_000;
 const first = evaluate(state, read.observation, now, started);
 assert.equal(first?.kind, 'context'); assert.match(first?.text ?? '', /88% full.*close to its limit/);
 assert.equal(run('--percent', '40', '--model', 'claude-opus-4.5', '--name', '2').status, 0);
 const second = await readSession({ home: join(demo, 'home'), folders: [workspace], platform: process.platform, now: Date.now() });
 assert.equal(second.code, 'ok'); if (second.code !== 'ok') return;
 const model = evaluate(state, second.observation, Date.now(), started, undefined, true);
 assert.equal(model?.kind, 'model'); assert.match(model?.text ?? '', /budget is tight.*Claude Opus 4\.5/);
 assert.equal(run('--model', 'Bad Model').status, 2);
});

test('Kiro command-line wrappers are looked up next to the IDE executable per platform', () => {
 assert.deepEqual(kiroCliCandidates('/Applications/Kiro.app/Contents/MacOS/Kiro', 'darwin'), [join('/Applications/Kiro.app/Contents/MacOS', '..', 'Resources', 'app', 'bin', 'code')]);
 assert.equal(kiroCliCandidates('/usr/share/kiro/kiro', 'linux')[0], join('/usr/share/kiro', 'bin', 'kiro'));
});
