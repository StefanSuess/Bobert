#!/usr/bin/env node
// Synthetic-only demo. Never reads or changes an existing Kiro profile.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoParentDir, kiroCliCandidates, kiroExecutableCandidates } from './base.mjs';
import { seedRichWorkspace } from './rich-workspace.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
if (args.includes('--help')) {
 console.log('Usage: pnpm demo:setup [--open] [--kiro <IDE executable>] [--vsix <candidate.vsix>] [--pace high] [--rich] [--install]\nChecks fresh synthetic usage; --open launches an isolated Kiro window; --pace high invents about 200 credits/day instead of 20 so budget warnings and the overage projection appear. Default: build the current checkout.');
 process.exit(0);
}
let open = false, candidate, kiro, pace, rich = false, install = false;
for (let i = 0; i < args.length; i++) {
 if (args[i] === '--open' && !open) open = true;
 else if (args[i] === '--vsix' && candidate === undefined && args[i + 1] && !args[i + 1].startsWith('--')) candidate = resolve(args[++i]);
 else if (args[i] === '--rich' && !rich) rich = true;
 else if (args[i] === '--install' && !install) install = true;
 else if (args[i] === '--pace' && pace === undefined && args[i + 1] === 'high') { pace = 'high'; i++; }
 else if (args[i] === '--kiro' && kiro === undefined && args[i + 1] && !args[i + 1].startsWith('--')) kiro = resolve(args[++i]);
 else { console.log('USAGE: pnpm demo:setup [--open] [--kiro <IDE executable>] [--vsix <candidate.vsix>] [--pace high] [--rich] [--install]'); process.exit(2); }
}
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 24 || (major === 24 && minor < 13)) {
 console.log('NODE_REQUIRED: install Node.js 24.13 or newer.'); process.exit(1);
}
// Native realpath: the collector rejects a source spelled through a Windows 8.3 short-name alias.
// macOS: a long $TMPDIR pushes Kiro's IPC socket past the 103-character limit, so demoParentDir falls back to /tmp.
const base = realpathSync.native(mkdtempSync(join(demoParentDir(), 'synthetic-bobert-demo-')));
const source = join(base, 'source'), storage = join(base, 'storage');
const home = join(base, 'home'), userData = join(base, 'user-data'), extensions = join(base, 'extensions');
const workspace = join(base, 'workspace');
for (const dir of [home, extensions, workspace, join(userData, 'User')]) mkdirSync(dir, { recursive: true, mode: 0o700 });
function run(command, argv, code, options = {}) {
 const result = spawnSync(command, argv, { cwd: root, encoding: 'utf8', timeout: 240_000, ...options });
 if (result.status !== 0) throw new Error(code);
 return result.stdout;
}
function installExtension() { // best effort: without it the printed install-this.vsix is installed by hand
 const exe = kiro ?? kiroExecutableCandidates().find(existsSync);
 const cli = exe && kiroCliCandidates(exe).find(existsSync);
 if (!cli) { console.log('INSTALL_SKIPPED: Kiro command-line wrapper not found; install install-this.vsix from the Command Palette.'); return; }
 const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: join(home, 'AppData', 'Roaming'), LOCALAPPDATA: join(home, 'AppData', 'Local'), XDG_CONFIG_HOME: home, XDG_DATA_HOME: home, XDG_STATE_HOME: home, XDG_CACHE_HOME: home };
 delete env.VSCODE_IPC_HOOK_CLI; delete env.ELECTRON_RUN_AS_NODE;
 const argv = ['--install-extension', join(base, 'install-this.vsix'), '--user-data-dir', userData, '--extensions-dir', extensions];
 const windows = process.platform === 'win32'; // .cmd wrappers need a shell
 const result = spawnSync(windows ? `"${cli}"` : cli, windows ? argv.map(a => `"${a}"`) : argv, { encoding: 'utf8', timeout: 180_000, env, shell: windows });
 console.log(result.status === 0 ? 'Extension pre-installed in the isolated profile.' : 'INSTALL_SKIPPED: command-line install failed; install install-this.vsix from the Command Palette.');
}
try {
 const logs = join(source, 'logs', 'synthetic-run', 'synthetic-window', 'exthost', 'kiro.kiroAgent');
 mkdirSync(logs, { recursive: true, mode: 0o700 });
 const anchor = new Date(Math.floor(Date.now() / 1000) * 1000);
 const lines = [];
 const perDay = pace === 'high' ? 200 : 20; // invented pace; high reaches the 5000 limit before the reset
 for (let offset = 35; offset >= 0; offset--) {
  const at = new Date(anchor.getTime() - offset * 86_400_000);
  const reset = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1)).toISOString();
  const envelope = { commandName: 'GetUsageLimitsCommand', input: {}, output: {
   userInfo: { userId: 'synthetic-acceptance-account' }, nextDateReset: reset,
   usageBreakdownList: [{ resourceType: 'CREDIT', unit: 'INVOCATIONS',
    currentUsageWithPrecision: perDay * (at.getUTCDate() - 1) + 10, usageLimitWithPrecision: 5000,
    nextDateReset: reset, bonuses: [], overageCredits: [] }],
  }, metadata: { httpStatusCode: 200 } };
  lines.push(`${at.toISOString()} [info] synthetic-envelope ${JSON.stringify(envelope)}\n`);
 }
 writeFileSync(join(logs, 'q-client.log'), lines.join(''), { mode: 0o600 });
 writeFileSync(join(base, 'synthetic-anchor.txt'), anchor.toISOString() + '\n', { mode: 0o600 });
 const cliArgs = ['--disable-warning=ExperimentalWarning', 'src/cli.ts', '--source-root', source, '--store-dir', join(base, 'preflight-store'), '--source-timezone', 'UTC', '--json'];
 const first = JSON.parse(run(process.execPath, cliArgs, 'COLLECTOR_FAILED'));
 if (first.import.imported !== 36 || first.observation.status !== 'observed' || first.observation.baseLimit !== '5000' || first.observation.forecast.status !== 'qualified' || first.observation.forecast.tier !== 'regular') throw new Error('INGESTION_CHECK_FAILED');
 const second = JSON.parse(run(process.execPath, cliArgs, 'REIMPORT_FAILED'));
 if (second.import.imported !== 0 || second.import.duplicates !== 36) throw new Error('DEDUPLICATION_CHECK_FAILED');
 console.log('Synthetic ingestion PASS (36 records); repeat import PASS.');
 console.log(`Expected usage: ${first.observation.usage}; reported limit: 5000; remaining: ${first.observation.remainingBaseCredits} credits.`);
 console.log(`Forecast: ${first.observation.forecast.tier} (${first.observation.forecast.status}).`);
 const { buildVsix } = await import('../release/build-vsix.ts');
 const { verifyVsix } = await import('../release/verify-vsix.ts');
 const vsix = candidate ?? join(base, 'synthetic-demo.vsix');
 if (!candidate) await buildVsix(vsix); // channel derived from the version (channel.ts)
 const verified = verifyVsix(readFileSync(vsix));
 if (!verified.ok) throw new Error('PACKAGE_CHECK_FAILED');
 console.log(`VSIX content verification PASS; version ${verified.version} (${candidate ? 'supplied candidate' : 'current checkout'}).`);
 copyFileSync(vsix, join(base, 'install-this.vsix'));
 writeFileSync(join(userData, 'User', 'settings.json'), JSON.stringify({
  'bobert.sourceRoot': source, 'bobert.storageRoot': storage, 'bobert.sourceTimezone': 'UTC',
  'window.title': 'SYNTHETIC DEMO - not real usage', 'workbench.startupEditor': 'none',
  ...(rich ? { 'security.workspace.trust.enabled': false } : {}), 'extensions.autoUpdate': false, 'extensions.autoCheckUpdates': false, 'update.mode': 'none', 'telemetry.telemetryLevel': 'off',
 }, null, 2), { mode: 0o600 });
 writeFileSync(join(workspace, 'README.txt'), 'SYNTHETIC DEMO — invented usage, not your account.\nOpen Bobert: Show Credit Budget from the Command Palette.\nSee docs/synthetic-demo.md in the project for the checklist.\n', { mode: 0o600 });
 if (rich) console.log(`Rich workspace: ${seedRichWorkspace(workspace).length} invented files (steering, hooks, secrets by name, large files).`);
 const launch = join(base, 'open-demo.mjs');
 copyFileSync(join(root, 'scripts/demo/open.mjs'), launch);
 copyFileSync(join(root, 'scripts/demo/session.mjs'), join(base, 'seed-session.mjs'));
 if (install) installExtension();
 console.log(`Demo folder: ${base}\nReopen: node "${launch}"\nInstall in the DEMO window (unless pre-installed): ${join(base, 'install-this.vsix')}\nInvented chat session for the hints: node "${join(base, 'seed-session.mjs')}" "${base}" --percent 88\nChecklist: docs/synthetic-demo.md\nClose the demo window before deleting its folder. Run setup again for fresh data.`);
 if (open) {
  run(process.execPath, [launch, ...(kiro ? [kiro] : [])], 'ISOLATED_LAUNCH_FAILED', { stdio: 'inherit' });
 }
} catch (error) {
 console.log(`DEMO_SETUP_FAILED: ${error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'CHECK_FAILED'}`);
 console.log(`Incomplete synthetic demo folder: ${base}`);
 process.exitCode = 1;
}
