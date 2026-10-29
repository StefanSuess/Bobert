import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptanceLines, prepareRelease, platformsOf, prepareChangelog, prepareManifestText, prepareVersionHistory, previousTag } from '../../scripts/release/prepare-release.ts';

const changelog = ['# Changelog', '', '## Unreleased', '', '### Added', '', '- Synthetic entry.', '', '## 1.2.0 (stable, macOS, Windows, Ubuntu)', '', 'Text.', '', '## 1.1.0 (beta, macOS)', ''].join('\n');
const history = ['# Version history', '', '## Release summary', '', '- **1.2.0** Stable (macOS, Windows, Ubuntu): synthetic.', '- **1.1.0** Beta (pre-release, macOS).', '', '## Other', ''].join('\n');
const manifest = ['{', '  "name": "synthetic",', '  "version": "1.2.0",', '  "private": true,', '  "contributes": {', '    "version": "9.9.9"', '  }', '}', ''].join('\n');

test('previousTag picks the highest release tag numerically and ignores other tags', () => {
  assert.equal(previousTag(['v1.2.0', 'v1.10.0', 'v1.9.9', 'v0.99.99']), 'v1.10.0');
  assert.equal(previousTag(['v2.0.0', 'v10.0.0', 'v9.9.9']), 'v10.0.0');
  assert.equal(previousTag(['latest', '1.2.0', 'v1.2', 'v1.2.0-beta.1', 'v01.2.0', 'v1.2.0\n', 'release/v9.0.0']), null);
  assert.equal(previousTag(['latest', 'v1.0.0', 'v1.2.3-rc']), 'v1.0.0');
  assert.equal(previousTag([]), null);
});

test('platformsOf reads the platforms from the version heading', () => {
  assert.deepEqual(platformsOf(changelog, '1.2.0'), ['macOS', 'Windows', 'Ubuntu']);
  assert.deepEqual(platformsOf(changelog, '1.1.0'), ['macOS']);
  assert.equal(platformsOf(changelog, '1.3.0'), null);
  assert.equal(platformsOf('## 1.2.0\n', '1.2.0'), null);
  assert.equal(platformsOf('## 1.2.0 (stable)\n', '1.2.0'), null);
  assert.equal(platformsOf('## 11.2.0 (stable, macOS)\n', '1.2.0'), null);
});

test('prepareChangelog replaces the single Unreleased heading', () => {
  const next = prepareChangelog(changelog, '1.3.0', 'beta', ['macOS']);
  assert.ok(next.startsWith('# Changelog\n\n## 1.3.0 (beta, macOS)\n\n### Added'));
  assert.equal(next.includes('## Unreleased'), false);
  assert.equal(next.split('\n').length, changelog.split('\n').length);
  assert.ok(prepareChangelog(changelog, '1.4.0', 'stable', ['macOS', 'Windows']).includes('## 1.4.0 (stable, macOS, Windows)\n'));
});

test('prepareChangelog fails with fixed codes', () => {
  assert.throws(() => prepareChangelog('# Changelog\n\n## 1.2.0 (stable, macOS)\n', '1.3.0', 'beta', ['macOS']), /^Error: CHANGELOG_UNRELEASED_MISSING$/);
  assert.throws(() => prepareChangelog(changelog, '1.2.0', 'stable', ['macOS']), /^Error: CHANGELOG_VERSION_EXISTS$/);
  assert.throws(() => prepareChangelog(`${changelog}\n## Unreleased\n`, '1.3.0', 'beta', ['macOS']), /^Error: CHANGELOG_UNRELEASED_AMBIGUOUS$/);
});

test('prepareVersionHistory inserts the first bullet under Release summary', () => {
  const next = prepareVersionHistory(history, '1.3.0', 'Beta (pre-release, macOS): TODO summary');
  assert.ok(next.includes('## Release summary\n\n- **1.3.0** Beta (pre-release, macOS): TODO summary\n- **1.2.0** Stable'));
  assert.ok(next.endsWith('\n## Other\n'));
  assert.throws(() => prepareVersionHistory('# Version history\n', '1.3.0', 'x'), /^Error: VERSION_HISTORY_SECTION_MISSING$/);
  assert.throws(() => prepareVersionHistory(history, '1.2.0', 'x'), /^Error: VERSION_HISTORY_VERSION_EXISTS$/);
});

test('prepareManifestText edits only the version and preview lines', () => {
  const beta = prepareManifestText(manifest, '1.3.0', true);
  assert.equal(beta, manifest.replace('"version": "1.2.0",', '"version": "1.3.0",\n  "preview": true,'));
  assert.equal(prepareManifestText(beta, '1.4.0', false), manifest.replace('"version": "1.2.0"', '"version": "1.4.0"'));
  assert.equal(prepareManifestText(beta, '1.5.0', true), beta.replace('1.3.0', '1.5.0'));
  assert.throws(() => prepareManifestText('{}\n', '1.3.0', false), /^Error: MANIFEST_VERSION_MISSING$/);
});

test('acceptance lines follow the release type and the cost flag', () => {
  assert.equal(acceptanceLines('app', false, ['macOS', 'Windows']).some(line => line.includes('not required, no cost-related')), true);
  assert.equal(acceptanceLines('app', true, ['macOS']).some(line => line.startsWith('Section E (Cost Advisor): required')), true);
  const system = acceptanceLines('system', false, ['macOS']).join('\n');
  assert.ok(system.includes('sections A, B, D and E') && system.includes('Windows and Ubuntu: native smoke test required'));
  assert.deepEqual(acceptanceLines('review', false, ['macOS']), acceptanceLines('system', false, ['macOS']));
});

function syntheticRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'synthetic-release-'));
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=synthetic', '-c', 'user.email=synthetic@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], { cwd: dir, stdio: 'ignore' });
  git('init', '-q');
  mkdirSync(join(dir, 'docs')); mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'package.json'), manifest);
  writeFileSync(join(dir, 'CHANGELOG.md'), changelog);
  writeFileSync(join(dir, 'docs', 'version-history.md'), history);
  writeFileSync(join(dir, 'src', 'view.ts'), 'export {};\n');
  git('add', '.'); git('commit', '-q', '-m', 'synthetic'); git('tag', 'v1.2.0');
  writeFileSync(join(dir, 'src', 'view.ts'), 'export const a = 1;\n');
  git('commit', '-q', '-am', 'synthetic app change');
  return dir;
}

test('prepareRelease on a synthetic repository: app release inherits platforms and edits three files', () => {
  const dir = syntheticRepo();
  try {
    const out = prepareRelease(dir, '1.4.0');
    assert.deepEqual(out.slice(0, 3), ['RELEASE_TYPE app', 'SYSTEM_FILES 0', 'COST_CHANGED no']);
    assert.ok(out.slice(3).every(line => line.startsWith('ACCEPTANCE ')));
    assert.ok(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8').includes('## 1.4.0 (stable, macOS, Windows, Ubuntu)'));
    assert.ok(readFileSync(join(dir, 'docs', 'version-history.md'), 'utf8').includes('- **1.4.0** Stable (macOS, Windows, Ubuntu): TODO summary'));
    assert.ok(readFileSync(join(dir, 'package.json'), 'utf8').includes('"version": "1.4.0"'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('prepareRelease on a synthetic repository: system change names macOS only; version and changelog errors leave files untouched', () => {
  const dir = syntheticRepo();
  try {
    writeFileSync(join(dir, 'src', 'store.ts'), 'export {};\n');
    execFileSync('git', ['add', '.'], { cwd: dir });
    execFileSync('git', ['-c', 'user.name=synthetic', '-c', 'user.email=synthetic@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'synthetic system change'], { cwd: dir });
    assert.throws(() => prepareRelease(dir, '1.2.0'), /^Error: RELEASE_VERSION_NOT_HIGHER$/);
    assert.throws(() => prepareRelease(dir, '1.1.9'), /^Error: RELEASE_VERSION_NOT_HIGHER$/);
    assert.throws(() => prepareRelease(dir, 'v1.3.0'), /^Error: RELEASE_VERSION_INVALID$/);
    assert.throws(() => prepareRelease(dir, '1.3'), /^Error: RELEASE_VERSION_INVALID$/);
    assert.equal(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8'), changelog);
    const out = prepareRelease(dir, '1.3.0');
    assert.deepEqual(out.slice(0, 4), ['SYSTEM_RELEASE: add Windows/Ubuntu only with native evidence for this candidate', 'RELEASE_TYPE system', 'SYSTEM_FILES 1', 'src/store.ts']);
    assert.ok(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8').includes('## 1.3.0 (beta, macOS)'));
    assert.ok(readFileSync(join(dir, 'package.json'), 'utf8').includes('"version": "1.3.0",\n  "preview": true,'));
    assert.throws(() => prepareRelease(dir, '1.4.0'), /^Error: RELEASE_WORKTREE_DIRTY$/); // the 1.3.0 edits are not committed yet
    execFileSync('git', ['-c', 'user.name=synthetic', '-c', 'user.email=synthetic@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '-am', 'synthetic release prep'], { cwd: dir });
    assert.throws(() => prepareRelease(dir, '1.4.0'), /^Error: CHANGELOG_UNRELEASED_MISSING$/);
    assert.ok(readFileSync(join(dir, 'package.json'), 'utf8').includes('"version": "1.3.0"'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('prepareRelease on a synthetic repository: a review file gives a review release with the system acceptance and the ruling note', () => {
  const dir = syntheticRepo();
  try {
    writeFileSync(join(dir, 'src', 'diagnostics.ts'), 'export {};\n');
    execFileSync('git', ['add', '.'], { cwd: dir });
    execFileSync('git', ['-c', 'user.name=synthetic', '-c', 'user.email=synthetic@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'synthetic review change'], { cwd: dir });
    const out = prepareRelease(dir, '1.3.0');
    assert.deepEqual(out.slice(0, 5), ['SYSTEM_RELEASE: add Windows/Ubuntu only with native evidence for this candidate', 'RELEASE_TYPE review', 'SYSTEM_FILES 0', 'REVIEW_FILES 1', 'src/diagnostics.ts']);
    assert.ok(out.some(line => line.includes('sections A, B, D and E')));
    assert.ok(out.at(-1)?.startsWith('REVIEW: the release PR review may rule app only if the changed hunks'));
    assert.ok(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8').includes('## 1.3.0 (beta, macOS)'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('prepareRelease refuses an uncommitted change, because only committed changes are classified', () => {
  const dir = syntheticRepo();
  try {
    writeFileSync(join(dir, 'src', 'store.ts'), 'export const uncommitted = 1;\n');
    assert.throws(() => prepareRelease(dir, '1.4.0'), /^Error: RELEASE_WORKTREE_DIRTY$/);
    assert.ok(!readFileSync(join(dir, 'CHANGELOG.md'), 'utf8').includes('## 1.4.0'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
