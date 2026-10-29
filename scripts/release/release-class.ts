// Classifies the files changed since the last release tag as an app, review or system release.
// Design: docs/release-streamlining-proposal.md section 1. A system release touches data access, local
// file reading or writing, packaging or the manifest and needs native acceptance on every named platform.
// Entries are exact repo-relative files or directory prefixes ending in "/". Every file under src/ must be
// on exactly one of the app and system lists or the review list (tests/release/release-class.test.ts), and an unlisted src/ file is system (fail safe).
export const SYSTEM_PATHS: readonly string[] = [
 'src/collector.ts', 'src/source.ts', 'src/store.ts', 'src/paths.ts', 'src/windows-storage.ts',
 'src/session/', 'src/audit/',
 'src/extension/audit-root.ts', 'src/extension/file-target.ts', 'src/extension/config-apply.ts',
 'src/extension/csv-export.ts', 'src/extension/recap-io.ts',
 'scripts/release/build-vsix.ts', 'scripts/release/zip.ts', 'scripts/build-extension.ts',
  'scripts/release/release-class.ts', // a change to the classifier itself is never ruled by the classifier
 // The tools that compute the type, check the candidate or decide what is packaged and promoted: a release cannot weaken them unnoticed.
 'scripts/release/prepare-release.ts', 'scripts/release/candidate-acceptance.ts', 'scripts/release/verify-vsix.ts',
 'scripts/release/promotion-policy.ts', 'scripts/release/select-candidate.ts', '.vscodeignore', '.github/workflows/',
];
// pnpm-lock.yaml is app: Bobert has no runtime dependencies, so a lockfile-only change cannot change the bundle's own code;
// a changed dependency range shows up as a system manifest field, and CI rebuilds and host-tests the exact candidate either way.

export const APP_PATHS: readonly string[] = [
 'src/decimal.ts', 'src/forecast.ts', 'src/history.ts',
 'src/projection.ts', 'src/time.ts', 'src/view.ts',
 'src/cost/',
 'src/extension/advisor-draft.ts', 'src/extension/advisor-inputs.ts', 'src/extension/advisor-presentation.ts',
 'src/extension/audit-schedule.ts', 'src/extension/budget-warning.ts',
 'src/extension/chart-model.ts', 'src/extension/chart.ts',
 'src/extension/config-schedule.ts',
 'src/extension/cost-inputs.ts', 'src/extension/cost-presentation.ts', 'src/extension/daily-budget.ts',
 'src/extension/dashboard-insights.ts', 'src/extension/dashboard-panel.ts', 'src/extension/dashboard-shell.ts',
 'src/extension/dashboard-webview.ts', 'src/extension/identity.ts',
 'src/extension/labels.ts', 'src/extension/presentation.ts', 'src/extension/recap-actions.ts',
 'src/extension/recap-card.ts', 'src/extension/recap-png.ts', 'src/extension/recap-presentation.ts',
 'src/extension/recap.ts', 'src/extension/results-summary.ts',
 'src/extension/setup.ts', 'src/extension/support-schedule.ts',
];

/** Files that mix app logic with storage, paths or platform behaviour: the release PR review rules app or system from the changed hunks. */
export const REVIEW_PATHS: readonly string[] = [
 'src/extension/extension.ts', 'src/extension/controller.ts', 'src/extension/session-hints.ts', 'src/extension/config-review.ts',
 'src/extension/audit-model.ts', 'src/extension/config-model.ts', 'src/cli.ts', 'src/diagnostics.ts',
];

/** Cost-related changes need the Cost Advisor acceptance section even in an app release; prefix match. */
export const COST_PATHS: readonly string[] = [
 'src/cost/', 'src/extension/cost-', 'src/extension/advisor-',
 'src/extension/dashboard-webview.ts', 'src/extension/dashboard-panel.ts', 'src/extension/presentation.ts',
 'src/extension/controller.ts', 'src/extension/extension.ts', 'src/extension/budget-warning.ts',
 'src/extension/dashboard-shell.ts', 'src/extension/support-schedule.ts',
];

/** package.json fields that may change in an app release; any other changed field makes a system release. */
export const MANIFEST_APP_FIELDS: readonly string[] = ['version', 'preview', 'description', 'contributes'];

const onList = (file: string, list: readonly string[]): boolean => list.some(entry => entry.endsWith('/') ? file.startsWith(entry) : file === entry);
export const isSystemPath = (file: string): boolean => onList(file, SYSTEM_PATHS);
export const isAppPath = (file: string): boolean => onList(file, APP_PATHS);
export const isReviewPath = (file: string): boolean => onList(file, REVIEW_PATHS);
export const isCostPath = (file: string): boolean => COST_PATHS.some(entry => file.startsWith(entry));

export interface ReleaseClass { kind: 'app' | 'review' | 'system'; systemFiles: string[]; reviewFiles: string[]; unlisted: string[]; cost: boolean }

export function classify(input: { files: string[]; manifestChangedFields: string[] }): ReleaseClass {
 const system = new Set<string>();
 const review = new Set<string>();
 const unlisted = new Set<string>();
 for (const file of input.files) {
  if (isSystemPath(file)) system.add(file);
  else if (isReviewPath(file)) review.add(file);
  else if (file === 'package.json') { if (input.manifestChangedFields.some(field => !MANIFEST_APP_FIELDS.includes(field))) system.add(file); }
  else if (file.startsWith('src/') && !isAppPath(file)) { unlisted.add(file); system.add(file); }
 }
 const systemFiles = [...system].sort(), reviewFiles = [...review].sort();
 const kind = systemFiles.length > 0 ? 'system' : reviewFiles.length > 0 ? 'review' : 'app';
 return { kind, systemFiles, reviewFiles, unlisted: [...unlisted].sort(), cost: input.files.some(isCostPath) };
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Top-level keys whose JSON differs between two manifests (added, removed or changed), sorted. */
export function manifestChangedFields(before: unknown, after: unknown): string[] {
 const a = (before && typeof before === 'object' ? before : {}) as Record<string, unknown>;
 const b = (after && typeof after === 'object' ? after : {}) as Record<string, unknown>;
 return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(key => !same(a[key], b[key])).sort();
}
