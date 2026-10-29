# Release gates by change type — proposal

Status: **approved by the maintainer on 2026-10-29.** It changes how much native acceptance a release needs, the versioning rule for even minors and two maintainer tools. The release workflow, its approvals and its checks are unchanged.

## Problem

Every release runs the same heavy path, whatever changed:

- A new feature needs two releases: an odd-minor pre-release, then an even-minor stable that "adds no features of its own".
- A stable release needs native acceptance on every platform it names. This is true even when the change is only presentation, which behaves the same on every platform and runs in the CI extension hosts on macOS, Ubuntu and Windows.
- Preparing a release and setting up acceptance of the exact CI candidate are hand work.
- A separate dry run repeats the preflight that the live run shows before approval anyway.

The maintainer decided on 2026-10-28 that multi-platform native tests are needed only when something system-relevant changes, such as data access.

## Design

### 1. Release type

`scripts/release/release-class.ts` classifies the files changed since the last release tag (`v*`, highest version reachable from `main`):

- **System release** if any changed file is on the system list:
  - source reading, storage and paths: `src/collector.ts`, `src/source.ts`, `src/store.ts`, `src/paths.ts`, `src/windows-storage.ts`;
  - other local file reading or writing: `src/session/`, `src/audit/`, `src/extension/audit-root.ts`, `src/extension/file-target.ts`, `src/extension/config-apply.ts`, `src/extension/csv-export.ts`, `src/extension/recap-io.ts`;
  - the build and packaging: `scripts/build-extension.ts`, `scripts/release/build-vsix.ts`, `scripts/release/zip.ts`;
  - the release checks themselves: `release-class.ts`, `prepare-release.ts`, `candidate-acceptance.ts`, `verify-vsix.ts`, `promotion-policy.ts`, `select-candidate.ts`, `.vscodeignore` and `.github/workflows/`, so a release cannot weaken its own checks;
  - `package.json` fields other than `version`, `preview`, `description` and `contributes`, which includes a changed dependency range.

  A lockfile-only change, such as a transitive Dependabot update, is an app change. Bobert has no runtime dependencies, and CI rebuilds and host-tests the exact candidate on all three platforms either way.
- **Review** if no system file changed but a file that mixes app logic with storage, paths or platform behaviour did (`src/extension/extension.ts`, `controller.ts`, `session-hints.ts`, `config-review.ts`, `audit-model.ts`, `config-model.ts`, `src/cli.ts`, `src/diagnostics.ts`). It counts as a system release unless the release PR's independent review finds that the changed parts touch none of these and records that ruling.
- **App release** otherwise: presentation, calculation, settings, commands, texts and docs.

A change to `release-class.ts` itself is always a system release, so the lists cannot be weakened in the release they judge.

Every file under `src/` is on exactly one list. Tests fail when a new file is on none, and when a file on the app list imports file-system, OS or path modules or reads the platform, storage or home folder. **Cost-related** changes (`src/cost/`, `cost-*`, `advisor-*`, and the dashboard, presentation, controller and extension files that carry Cost Advisor parts) are flagged separately.

### 2. Native acceptance by type

| | App release | System release |
| --- | --- | --- |
| CI: verify on 3 platforms, candidate built once, host tests of the exact candidate on 3 platforms, attestation | required | required |
| Native macOS acceptance of the exact candidate | [macos-acceptance.md](macos-acceptance.md) steps 0–1, section A and step F, plus each user-visible change | sections A, B, D and E |
| Section E (Cost Advisor) | only when cost-related files changed | required |
| Native Windows and Ubuntu smoke test | not required | required for each platform the release names |
| Pre-release first | not required | recommended for a new minor |

An even-minor `X.Y.0` that stabilizes a published odd line still needs no open bug issue against that line that the candidate does not fix.

### 3. Platforms named

- **App release:** names the platforms of the last system release. The release notes say so in one line, for example: "Windows and Ubuntu: smoke-tested in native Kiro (arm64 VMs) with 1.2.0; no data-access change since; this candidate passed the CI extension hosts on all three platforms." It names the evidence exactly as recorded.
- **System release:** names only platforms with native evidence for this candidate.

A platform without either kind of evidence is not named.

### 4. Versioning

- Odd minors stay pre-release and even minors stay stable; the channel rule in `scripts/release/channel.ts` is unchanged.
- An even minor may add features when it is an app release.
- A system release with new features should start as an odd-minor pre-release.

### 5. Tools

- **`pnpm release:prepare <version>`:**
  - refuses to run with uncommitted changes and checks that the version is higher than every release tag;
  - sets `version` and `preview` in `package.json`;
  - turns `## Unreleased` in `CHANGELOG.md` into the version heading with the channel and the platforms (per section 3);
  - adds the version to `docs/version-history.md`;
  - prints the release type, the system files that changed and the acceptance required.

  It does not commit, push or publish. The release PR and its independent review stay; the review checks the type and the platform claims.
- **`pnpm acceptance:candidate`:**
  - finds the newest successful CI run for the current `main` head;
  - downloads its `release-candidate` artifact into a new temporary folder;
  - checks the VSIX SHA-256 against the artifact's checksum file;
  - verifies the attestation with the same `gh attestation verify` options as the release workflow;
  - starts the synthetic demo with exactly that VSIX (`demo:setup --vsix`).

  It uses the same trusted-run selection as the release workflow, so a newer failed or unfinished run for the same commit stops it. It prints the release type for the exact candidate commit. It reads only public CI data through the maintainer's `gh` sign-in and writes only into its temporary folder, the demo folder and git's own fetch data.

### 6. Dry run

- A separate dry run is no longer required before a live run.
- The live run's preflight runs the same checks and stops at the protected `release` environment. Its summary is reviewed before approval.
- Dry runs stay available.

## Unchanged

- Only the maintainer dispatches the live run and approves the `release` environment. Agents never do.
- The workflow is unchanged: candidate selection, re-verification, attestation, create-only publishing, signed commits and the `main` ruleset.
- SC1 and SC5 wording. Issue #61 still blocks itemised Windows acceptance claims.

## Testing

- `release-class` unit tests:
  - each list;
  - an unlisted `src/` file fails;
  - `package.json` field rules;
  - the cost flag.
- `release:prepare` tests on a synthetic temporary repository:
  - version must be higher than the last tag;
  - CHANGELOG and version history edits;
  - platform inheritance for an app release;
  - no Unreleased section fails.
- `acceptance:candidate`: its pure parts (run selection, checksum comparison, attestation arguments) are unit-tested. The download and demo start are a manual maintainer step.
