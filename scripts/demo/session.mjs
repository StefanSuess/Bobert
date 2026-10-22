#!/usr/bin/env node
// Writes ONE invented Kiro session into a synthetic demo's home, so the session hints can be checked without Kiro's agent.
// Usage: node session.mjs <demo folder> [--percent 88] [--model claude-opus-4.5] [--name 1]
// Run it while the demo window is open (the hint needs a session that is newer than the window) and again with another --name for the next hint.
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2), value = (flag, fallback) => { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const base = args[0] && !args[0].startsWith('--') ? resolve(args[0]) : undefined;
const percent = Number(value('--percent', '88')), model = value('--model', 'claude-opus-4.5'), name = value('--name', '1');
if (!base || !Number.isFinite(percent) || !/^[a-z0-9][a-z0-9._-]{0,39}$/.test(model) || !/^[a-z0-9-]{1,20}$/.test(name)) {
 console.log('USAGE: node session.mjs <demo folder> [--percent 88] [--model claude-opus-4.5] [--name 1]'); process.exit(2);
}
const workspace = realpathSync.native(join(base, 'workspace'));
const dir = join(base, 'home', '.kiro', 'sessions', 'synthetic-ws-1', `synthetic-session-${name}`);
mkdirSync(dir, { recursive: true, mode: 0o700 });
const now = new Date(), iso = now.toISOString();
writeFileSync(join(dir, 'session.json'), JSON.stringify({ schemaVersion: '1.0.0', dataModelVersion: 1, modelId: model, lastModifiedAt: iso, workspacePaths: [workspace], title: 'synthetic-title' }), { mode: 0o600 });
writeFileSync(join(dir, 'messages.jsonl'), JSON.stringify({ timestamp: iso, payload: { type: 'session_metadata', key: 'contextUsage', value: { usagePercentage: percent } } }) + '\n', { mode: 0o600 });
console.log(`Invented session written (${percent}% context, model ${model}). The hint appears within about a minute.`);
