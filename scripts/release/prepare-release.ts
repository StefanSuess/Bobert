// pnpm release:prepare <version>: prepares package.json, CHANGELOG.md and docs/version-history.md for a
// release and prints the release type and the acceptance it needs. Design: docs/release-streamlining-proposal.md
// section 5. Never commits, pushes or tags. Failures print a fixed code only.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMain } from '../is-main.ts';
import { isPlainVersion, releaseChannel } from './channel.ts';
import { type ReleaseClass, classify, manifestChangedFields } from './release-class.ts';

const TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const numbers = (version: string): number[] => version.split('.').map(Number);
const compare = (a: string, b: string): number => { const x = numbers(a), y = numbers(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; };
const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Highest `vX.Y.Z` tag by numeric comparison; anything else is ignored. */
export function previousTag(tags: string[]): string | null {
 let best: string | null = null;
 for (const tag of tags) if (TAG.test(tag) && (best === null || compare(tag.slice(1), best.slice(1)) > 0)) best = tag;
 return best;
}

/** Platform names from the heading `## X.Y.Z (<channel>, <platform>, ...)`, or null without such a heading. */
export function platformsOf(changelog: string, version: string): string[] | null {
 const match = new RegExp(`^## ${escape(version)} \\(([^)]*)\\)[ \\t]*$`, 'm').exec(changelog);
 if (!match) return null;
 const platforms = match[1].split(',').map(part => part.trim()).slice(1).filter(Boolean);
 return platforms.length > 0 ? platforms : null;
}

export function prepareChangelog(changelog: string, version: string, channelLabel: 'stable' | 'beta', platforms: string[]): string {
 if (new RegExp(`^## ${escape(version)}(?: |$)`, 'm').test(changelog)) throw new Error('CHANGELOG_VERSION_EXISTS');
 const unreleased = changelog.match(/^## Unreleased[ \t]*$/gm) ?? [];
 if (unreleased.length === 0) throw new Error('CHANGELOG_UNRELEASED_MISSING');
 if (unreleased.length > 1) throw new Error('CHANGELOG_UNRELEASED_AMBIGUOUS');
 return changelog.replace(/^## Unreleased[ \t]*$/m, () => `## ${version} (${[channelLabel, ...platforms].join(', ')})`);
}

export function prepareVersionHistory(text: string, version: string, line: string): string {
 if (text.includes(`**${version}**`)) throw new Error('VERSION_HISTORY_VERSION_EXISTS');
 const match = /^## Release summary[ \t]*\n(?:[ \t]*\n)*/m.exec(text);
 if (!match) throw new Error('VERSION_HISTORY_SECTION_MISSING');
 const end = match.index + match[0].length;
 return `${text.slice(0, end)}- **${version}** ${line}\n${text.slice(end)}`;
}

/** Targeted line edits so package.json stays byte-identical otherwise: sets `version`, adds or removes `preview`. */
export function prepareManifestText(text: string, version: string, preview: boolean): string {
 if (!/^ {2}"version": "[^"\n]*",$/m.test(text)) throw new Error('MANIFEST_VERSION_MISSING');
 const withoutPreview = text.replace(/^ {2}"preview": [^\n]*\n/m, '');
 return withoutPreview.replace(/^( {2}"version": ")[^"\n]*(",)\n/m, (_, head: string, tail: string) => `${head}${version}${tail}\n${preview ? '  "preview": true,\n' : ''}`);
}

export const REVIEW_NOTE = 'REVIEW: the release PR review may rule app only if the changed hunks in these files do not touch storage, paths, file access or platform behaviour; record the ruling in the release PR';

export function acceptanceLines(kind: 'app' | 'review' | 'system', cost: boolean, platforms: string[]): string[] {
 if (kind !== 'app') {
  const others = platforms.filter(platform => platform !== 'macOS');
  return [
   'macOS: native acceptance of the exact candidate, docs/macos-acceptance.md sections A, B, D and E',
   `Windows and Ubuntu: native smoke test required for each platform the release names${others.length ? ` (named now: ${others.join(', ')})` : ' (none named now)'}`,
   'Pre-release first: recommended for a new minor',
  ];
 }
 return [
  'macOS: native acceptance of the exact candidate, docs/macos-acceptance.md steps 0-1, section A and step F, plus each user-visible change',
  cost ? 'Section E (Cost Advisor): required, cost-related files changed' : 'Section E (Cost Advisor): not required, no cost-related file changed',
  'Windows and Ubuntu: native smoke test not required; the CI extension hosts of the exact candidate cover them',
 ];
}

export const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
export const lines = (text: string): string[] => text.split('\n').map(line => line.trim()).filter(Boolean);

/** Highest `v*` release tag reachable from `ref` (null without one). */
export function baseTagOf(cwd: string, ref: string): string | null {
 return previousTag(lines(git(cwd, 'tag', '--list', 'v*', '--merged', ref)));
}

/** Release type of `base..ref`; the manifest after the range is `package.json` at `ref`, or the given text. */
export function classifyRange(cwd: string, base: string, ref: string, manifestAfter?: string): ReleaseClass {
 const files = lines(git(cwd, 'diff', '--name-only', '--no-renames', `${base}..${ref}`));
 const after = JSON.parse(manifestAfter ?? git(cwd, 'show', `${ref}:package.json`));
 return classify({ files, manifestChangedFields: manifestChangedFields(JSON.parse(git(cwd, 'show', `${base}:package.json`)), after) });
}

export function prepareRelease(cwd: string, version: string): string[] {
 if (!/^\d+\.\d+\.\d+$/.test(version) || !isPlainVersion(version)) throw new Error('RELEASE_VERSION_INVALID');
 const highest = previousTag(lines(git(cwd, 'tag', '--list', 'v*')));
 if (highest && compare(version, highest.slice(1)) <= 0) throw new Error('RELEASE_VERSION_NOT_HIGHER');
 // Only committed changes are classified, so uncommitted ones would make the printed type too light.
 if (git(cwd, 'status', '--porcelain').trim()) throw new Error('RELEASE_WORKTREE_DIRTY');
 const base = baseTagOf(cwd, 'HEAD');
 if (!base) throw new Error('RELEASE_BASE_TAG_MISSING');
 const preview = releaseChannel(version) === 'pre-release';
 const manifestPath = join(cwd, 'package.json');
 const manifestText = readFileSync(manifestPath, 'utf8');
 const result = classifyRange(cwd, base, 'HEAD', manifestText);
 const changelogPath = join(cwd, 'CHANGELOG.md'), historyPath = join(cwd, 'docs', 'version-history.md');
 const changelog = readFileSync(changelogPath, 'utf8');
 const platforms = result.kind !== 'app' ? ['macOS'] : platformsOf(changelog, base.slice(1));
 if (!platforms) throw new Error('RELEASE_PLATFORMS_MISSING');
 // Everything is computed before the first write, so a failure leaves the three files untouched.
 const nextManifest = prepareManifestText(manifestText, version, preview);
 const nextChangelog = prepareChangelog(changelog, version, preview ? 'beta' : 'stable', platforms);
 const nextHistory = prepareVersionHistory(readFileSync(historyPath, 'utf8'), version, `${preview ? `Beta (pre-release, ${platforms.join(', ')})` : `Stable (${platforms.join(', ')})`}: TODO summary`);
 writeFileSync(manifestPath, nextManifest);
 writeFileSync(changelogPath, nextChangelog);
 writeFileSync(historyPath, nextHistory);
 return [
  ...(result.kind !== 'app' ? ['SYSTEM_RELEASE: add Windows/Ubuntu only with native evidence for this candidate'] : []),
  `RELEASE_TYPE ${result.kind}`,
  `SYSTEM_FILES ${result.systemFiles.length}`,
  ...result.systemFiles,
  ...(result.kind === 'review' ? [`REVIEW_FILES ${result.reviewFiles.length}`, ...result.reviewFiles] : []),
  `COST_CHANGED ${result.cost ? 'yes' : 'no'}`,
  ...acceptanceLines(result.kind, result.cost, platforms).map(line => `ACCEPTANCE ${line}`),
  ...(result.kind === 'review' ? [REVIEW_NOTE] : []),
 ];
}

if (isMain(import.meta.url)) {
 try {
  const version = process.argv[2];
  if (process.argv.length !== 3 || !version) throw new Error('RELEASE_VERSION_INVALID');
  for (const line of prepareRelease(process.cwd(), version)) console.log(line);
 } catch (error) {
  const code = error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : 'RELEASE_PREPARE_FAILED';
  console.error(code);
  process.exitCode = 1;
 }
}
