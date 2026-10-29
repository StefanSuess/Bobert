import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_PATHS, COST_PATHS, MANIFEST_APP_FIELDS, REVIEW_PATHS, SYSTEM_PATHS, classify, isAppPath, isReviewPath, isSystemPath, manifestChangedFields } from '../../scripts/release/release-class.ts';

const none = { manifestChangedFields: [] as string[] };

test('every system entry classifies as a system release', () => {
  for (const entry of SYSTEM_PATHS) {
    const file = entry.endsWith('/') ? `${entry}synthetic-file.ts` : entry;
    const result = classify({ files: [file], ...none });
    assert.equal(result.kind, 'system', entry);
    assert.deepEqual(result.systemFiles, [file]);
    assert.deepEqual(result.unlisted, []);
  }
});

test('app files, docs, tests and other scripts are an app release', () => {
  const files = ['src/extension/presentation.ts', 'src/cost/advisor.ts', 'docs/development.md', 'README.md', 'tests/unit/forecast.test.ts', 'scripts/release/channel.ts', 'scripts/demo/setup.mjs', 'CHANGELOG.md'];
  const result = classify({ files, ...none });
  assert.deepEqual(result, { kind: 'app', systemFiles: [], reviewFiles: [], unlisted: [], cost: true });
  assert.equal(classify({ files: ['docs/a.md', 'README.md'], ...none }).kind, 'app');
  assert.equal(classify({ files: [], ...none }).kind, 'app');
});

test('an unlisted src file is a system release and is reported', () => {
  const result = classify({ files: ['src/synthetic-new.ts', 'src/extension/synthetic-new.ts', 'docs/a.md'], ...none });
  assert.equal(result.kind, 'system');
  assert.deepEqual(result.unlisted, ['src/extension/synthetic-new.ts', 'src/synthetic-new.ts']);
  assert.deepEqual(result.systemFiles, ['src/extension/synthetic-new.ts', 'src/synthetic-new.ts']);
});

test('package.json is system only when a field outside version, preview, description and contributes changed', () => {
  assert.deepEqual(MANIFEST_APP_FIELDS, ['version', 'preview', 'description', 'contributes']);
  assert.equal(classify({ files: ['package.json'], manifestChangedFields: ['version', 'preview', 'description', 'contributes'] }).kind, 'app');
  assert.equal(classify({ files: ['package.json'], manifestChangedFields: [] }).kind, 'app');
  for (const field of ['engines', 'main', 'activationEvents', 'scripts', 'devDependencies', 'name']) {
    const result = classify({ files: ['package.json'], manifestChangedFields: ['version', field] });
    assert.equal(result.kind, 'system', field);
    assert.deepEqual(result.systemFiles, ['package.json']);
  }
  // Without package.json in the diff the changed fields are irrelevant.
  assert.equal(classify({ files: ['README.md'], manifestChangedFields: ['engines'] }).kind, 'app');
});

test('system files are sorted and unique, and the cost flag follows the cost paths', () => {
  const result = classify({ files: ['src/store.ts', 'scripts/release/zip.ts', 'src/store.ts', 'src/audit/walk.ts'], ...none });
  assert.deepEqual(result.systemFiles, ['scripts/release/zip.ts', 'src/audit/walk.ts', 'src/store.ts']);
  // A lockfile-only change (for example a transitive Dependabot bump) is an app change.
  assert.equal(classify({ files: ['pnpm-lock.yaml', 'scripts/release/publisher-tools/pnpm-lock.yaml'], ...none }).kind, 'app');
  assert.equal(result.cost, false);
  for (const file of ['src/cost/money.ts', 'src/extension/cost-inputs.ts', 'src/extension/advisor-draft.ts', ...COST_PATHS.filter(entry => entry.endsWith('.ts'))]) assert.equal(classify({ files: [file], ...none }).cost, true, file);
  assert.equal(classify({ files: ['src/extension/labels.ts'], ...none }).cost, false);
});

test('manifestChangedFields lists added, removed and changed top-level keys, sorted', () => {
  const before = { name: 'synthetic', version: '1.0.0', engines: { vscode: '^1.90.0' }, keywords: ['a'], gone: 1 };
  const after = { name: 'synthetic', version: '1.1.0', engines: { vscode: '^1.90.0' }, keywords: ['a', 'b'], preview: true };
  assert.deepEqual(manifestChangedFields(before, after), ['gone', 'keywords', 'preview', 'version']);
  assert.deepEqual(manifestChangedFields(before, before), []);
});

test('every file under src is on exactly one list', () => {
  const files = execFileSync('git', ['ls-files', 'src'], { cwd: new URL('../..', import.meta.url), encoding: 'utf8' }).split('\n').filter(Boolean);
  assert.ok(files.length > 50);
  for (const file of files) assert.equal(Number(isSystemPath(file)) + Number(isAppPath(file)) + Number(isReviewPath(file)), 1, file);
});

test('review files give a review release unless a system file also changed; the classifier and the extension build are system', () => {
  assert.deepEqual(REVIEW_PATHS, ['src/extension/extension.ts', 'src/extension/controller.ts', 'src/extension/session-hints.ts', 'src/extension/config-review.ts', 'src/extension/audit-model.ts', 'src/extension/config-model.ts', 'src/cli.ts', 'src/diagnostics.ts']);
  for (const file of REVIEW_PATHS) {
    const result = classify({ files: [file, 'docs/a.md'], ...none });
    assert.equal(result.kind, 'review', file);
    assert.deepEqual(result.reviewFiles, [file]);
    assert.deepEqual(result.systemFiles, []);
  }
  const mixed = classify({ files: ['src/diagnostics.ts', 'src/cli.ts', 'src/store.ts'], ...none });
  assert.deepEqual([mixed.kind, mixed.reviewFiles, mixed.systemFiles], ['system', ['src/cli.ts', 'src/diagnostics.ts'], ['src/store.ts']]);
  for (const file of ['scripts/release/release-class.ts', 'scripts/build-extension.ts']) assert.equal(classify({ files: [file], ...none }).kind, 'system', file);
});

test('no app file touches the file system, the OS, the platform, storage paths or a system module', () => {
  const root = new URL('../..', import.meta.url);
  const tracked = execFileSync('git', ['ls-files', 'src'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  const appFiles = tracked.filter(isAppPath);
  assert.ok(appFiles.length > 30);
  const forbidden = [/node:fs/, /node:os/, /node:path/, /node:child_process/, /node:sqlite/, /process\.platform/, /globalStorageUri/, /homedir/];
  // Importing a system module (by any relative spelling) also makes the importer non-app.
  for (const entry of SYSTEM_PATHS.filter(path => path.startsWith('src/'))) {
    const name = entry.slice(entry.lastIndexOf('/', entry.length - 2) + 1).replace(/\.ts$|\/$/, '');
    forbidden.push(new RegExp(`from '[^']*/${name}(?:\\.ts|/)[^']*'`));
  }
  for (const file of appFiles) {
    // Type-only imports carry no runtime behaviour.
    const text = readFileSync(new URL(file, root), 'utf8').split('\n').filter(line => !line.startsWith('import type ')).join('\n');
    for (const pattern of forbidden) assert.equal(pattern.test(text), false, `${file} matches ${pattern}`);
  }
});

test('the release tools, packaging allowlists and workflows are system, so a release cannot weaken its own checks', () => {
  for (const file of ['scripts/release/prepare-release.ts', 'scripts/release/candidate-acceptance.ts', 'scripts/release/verify-vsix.ts', 'scripts/release/promotion-policy.ts', 'scripts/release/select-candidate.ts', '.vscodeignore', '.github/workflows/ci.yml', '.github/workflows/release.yml'])
    assert.equal(classify({ files: [file], ...none }).kind, 'system', file);
});

test('every src file that refers to the Cost Advisor or the cost module is on the cost list', () => {
  const files = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8' }).split('\n').filter(file => file.endsWith('.ts'));
  for (const file of files) if (/cost\/|[Aa]dvisor/.test(readFileSync(file, 'utf8'))) assert.equal(classify({ files: [file], ...none }).cost, true, file);
});
