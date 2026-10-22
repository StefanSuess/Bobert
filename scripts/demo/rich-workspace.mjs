// Invented workspace for the native acceptance: every Bobert audit and Steering/Hooks finding appears. Nothing here is real data.
import { closeSync, mkdirSync, openSync, ftruncateSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LINE = 'synthetic-steering-line: invented guidance sentence for acceptance testing only.\n';
const SPARSE = { 'dump.sql': 14, 'backup.zip': 9, 'data/big.csv': 40, 'logs/debug.log': 3 }; // MiB, sparse where the file system allows

/** Seeds `dir` (an isolated synthetic workspace). Returns the relative paths written, for tests and the printed summary. */
export function seedRichWorkspace(dir) {
 const written = [];
 const put = (rel, text) => { mkdirSync(join(dir, rel, '..'), { recursive: true }); writeFileSync(join(dir, rel), text, { mode: 0o600 }); written.push(rel); };
 put('.kiro/steering/always-big.md', LINE.repeat(600)); // always included and large: Load only when needed
 put('.kiro/steering/everything.md', '---\ninclusion: fileMatch\nfileMatchPattern: "**/*"\n---\n' + LINE.repeat(20)); // matches every file: Worth a look
 put('.kiro/steering/small-manual.md', '---\ninclusion: manual\n---\n' + LINE.repeat(3));
 put('AGENTS.md', LINE.repeat(500)); // large AGENTS.md: Worth a look
 put('.kiro/hooks/on-save.json', JSON.stringify({ version: 'v1', hooks: [
  { name: 'synthetic-save-hook', enabled: true, trigger: 'PostFileSave', matcher: '**/*', action: { type: 'agent', prompt: 'synthetic-prompt-sentinel '.repeat(20) } },
  { name: 'synthetic-tool-hook', enabled: true, trigger: 'PostToolUse', action: { type: 'agent', prompt: 'synthetic' } },
 ] }, null, 1)); // two broad agent hooks: Run only manually
 put('.env', 'SYNTHETIC_API_KEY=synthetic-inert-sentinel-not-a-secret\n'); // secrets by name, inert content
 put('server.pem', '-----BEGIN SYNTHETIC SENTINEL-----\nnot a key\n-----END SYNTHETIC SENTINEL-----\n');
 for (const [rel, mib] of Object.entries(SPARSE)) { // databases, archives, large data, logs
  mkdirSync(join(dir, rel, '..'), { recursive: true });
  const fd = openSync(join(dir, rel), 'w', 0o600);
  try { ftruncateSync(fd, mib * 1024 * 1024); } finally { closeSync(fd); }
  written.push(rel);
 }
 return written;
}
