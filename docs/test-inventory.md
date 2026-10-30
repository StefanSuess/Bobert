# Test inventory

What must be verified for Bobert, how each item is verified today, and what is still manual. This is the single list release acceptance works from; [macos-acceptance.md](macos-acceptance.md) is the manual procedure for the rows marked **M**.

## Rules

1. **Every PR that adds or changes a user-visible feature updates this file** (new row or changed row), in the same PR as the code.
2. **Automate first.** A check goes to **M** (manual in native Kiro) only when it needs Kiro's own UI, sign-in, the operating system or a human sense (screen reader, look and feel). Before adding an **M** row, say why it cannot be a unit test, a release test or a step in the extension-host suite (`tests/host/suite.ts`). Prefer synthetic fixtures (invented session files, workspace trees, store data) over clicking.
3. Status: **A** = automated and run by `pnpm test` / `pnpm test:release` / CI; **H** = could run in the extension-host suite but does not yet (backlog below); **M** = manual native Kiro only.
4. Never use real Kiro data, the agent, or real accounts. The native demo needs the maintainer's Kiro sign-in each run and the demo folder is deleted afterwards (see [synthetic-demo.md](synthetic-demo.md)).
5. Acceptance evidence names the candidate (version, short SHA, SHA-256), the platform and what was **not** covered. A macOS result says nothing about Windows or Linux.

## Inventory

| Area | What to verify | Automated by | Status | Last native result |
| --- | --- | --- | --- | --- |
| Packaging | VSIX contents allowlist, ID, version, no tests/logs/caches, checksum, attestation | `tests/release/vsix`, `version-consistency`, `attestation-workflow`, CI | A | 2026-10-23 pass (aa42b39) |
| Release type and release tools | Every `src/` file is classified as app or system; system paths, manifest fields and the cost flag; `release:prepare` version order, CHANGELOG and history edits, platform inheritance; `acceptance:candidate` run choice, checksum and the same attestation flags as the release workflow | `tests/release/release-class`, `prepare-release`, `candidate-acceptance` | A for those; **M** for the download and demo start of `acceptance:candidate` (needs the maintainer's `gh` sign-in and native Kiro) | not run natively |
| Collector, store, history | Allowlisted fields only, repeat import, resets, UTC boundaries, read-only source | `collector`, `store-version`, `history`, `safety`, `projection`, `windows-storage` | A | pass |
| Forecast, overage | Regular/qualified forecast, add-on credits, dollar figure, at-least average since cycle start (lower bound, 31-day assumption) | `forecast`, `overage`, `forecast-history`, `forecast-floor`, `backtest` | A | pass (4210/5000, 963 credits, about $38.52) |
| Credit view | Hero, metrics, chart text, About these numbers, narrow width, themes | `dashboard-*`, `chart`, `presentation`, `view` | A for content; **M** for look in Kiro | pass: Dark, Light, High Contrast Dark, about 390 px |
| Status bar | Item text and state colour, opens the credit view; while collecting: credits left and allowance, warning when even the at-least average is above it | `view`, `presentation`, `forecast-floor` | A for text; **M** for placement next to Kiro items | pass |
| Cost Advisor | Plan hint vs confirmed answer, modelled USD with UTC period, details, cancel keeps, clear/reload resets, unsupported inputs withhold figures | `cost-*`, `advisor-inline`, `plan-hints`, `cost-extension` | A; native questions flow **M** | pass (Pro Max path); unknown plan, Enterprise, entered add-ons, changed limit not run natively |
| Budget warnings | Notice at the configured percent, once per cycle, Show details, Turn off | `budget-warning` | A | pass |
| Unused-credits reminder | Due only 3 days or less before the reset with a fresh regular forecast, projected and current remaining at or above `bobert.unusedCreditsPercent`, on a budget day; once per cycle; never after `limit`, `forecast` or `rightsize`; the lapse sentence names plan credits only, no money; **Don't remind me** sets 0; credit-view line in the same days, also with the reminder off; the setting is pinned in the VSIX manifest | `budget-warning`, `presentation`, `identity`, `vsix` (manifest) | A for the decision, copy, setting and credit-view line; **M** for the notice and its buttons in Kiro (needs Kiro's own notification UI) | not run natively |
| Session hints, context reminder | 70 % and 85 % notices, re-arm, per-session limits | `session-notices`, `session-hints`, `session-reader`, `session-parse`, `acceptance-env` (invented session, real reader) | A | pass (synthetic session files, 88 %) |
| Session hints, model hint | Only with a reason (tight budget or 30 % full), once per model, wording, buttons | `session-notices`, `session-hints`, `acceptance-env` | A | pass (Opus 4.5 row) |
| Workspace audit | Filename findings by kind, groups, Not checked, partial check, hide/show again | `audit*`, `audit-model`, `audit-walk`, `acceptance-env` (rich demo workspace yields 6 findings) | A | pass (6 findings of 6 seeded) |
| Audit actions | Exclude from Kiro preview, tick and Apply, nothing-ticked message, unsaved-only, re-check after save, `.kiroignore` not active note | `file-target`, `audit-ignore`, `audit-schedule` | A for logic; **M** for Kiro's change preview | pass |
| Steering and Hooks review | Always-included Steering, broad hooks, AGENTS.md size, fileMatch `**/*`, combined size, overlap | `config-*`, `acceptance-env` | A | pass; F1 fixed (test in `config-rules`) |
| Steering and Hooks actions | Load only when needed, Run only manually, Disable hook, Narrow the pattern, guards (unsaved, autosave, changed file) | `config-apply`, `config-edit`, `config-extension` | A for logic; **M** for preview and save | pass for the first two; Disable hook and Narrow the pattern not run natively |
| Automatic review and audit | `onOpen`, `onOpenAndChanges`, watcher, reminders, snooze, Don't remind me | `config-auto`, `config-schedule`, `audit-schedule` | A | not run natively (default off) |
| Today's usage and day budget | Local-day used-today lower bound, fixed day-anchored allowance, day off, no budget day left, stale/unavailable unchanged, status bar and credit view texts | `daily-budget`, `presentation` | A | macOS, 2026-10-28: passed in the synthetic demo (Kiro, extension built from `main` at `37578cc`, not a CI artifact); Windows and Linux not run |
| Budget days setting | `bobert.budgetDays` values, default every day, invalid or empty counts as every day, application scope | `identity`, `setup` | A | macOS, 2026-10-28: passed in the synthetic demo (Kiro, extension built from `main` at `37578cc`, not a CI artifact); Windows and Linux not run |
| Set Up command and walkthrough step | Pure answer-to-settings mapping (`dayWrites`, `noticeWrites`, `hintWrites`), the run order and its re-entry guard (`setupRunner`) and the `bobert.setup` command being registered | `setup` (`dayWrites writes the exact days`, `noticeWrites writes the exact settings`, `hintWrites writes sessionHints`, `setupRunner ignores a second start while steps are open, but not while the confirmation is open`, `setupRunner stops at a step the user ends…`), extension-host suite (`tests/host/suite.ts`, command registered) | A for those; **M** for the three quick picks, that answers are written to user settings, that Escape keeps answers and the first walkthrough step (needs Kiro's own quick-pick and settings UI) | macOS, 2026-10-28: passed in the synthetic demo (Kiro, extension built from `main` at `37578cc`, not a CI artifact); Windows and Linux not run; found and fixed: a second start did nothing while the closing confirmation was open |
| Budget days notice | Pure due check (`budgetDaysNoticeDue` needs every condition) and prompt order (budget, then support, then days notice) | `setup` (`budgetDaysNoticeDue needs every condition`, `the prompt claim gives the window one prompt`) | A for those; **M** for showing the notice only in Kiro and only for earlier users (the `newUserNow` and `'new_user'` marker are untested), and for **Choose days** opening step 1 (needs Kiro's own notification UI) | not run natively |
| Support prompts, walkthrough | Offer once, off switch, walkthrough steps tick | `support-schedule`, `extension` | A | pass (prompt and walkthrough shown) |
| Share, recap, CSV, report a problem | Fixed text and links, no private values, PNG/CSV content | `recap*`, `csv-export`, `diagnostics`, `identity` | A; opening the browser **M** | not run natively |
| Diagnostics | Fixed codes only, no paths or values | `diagnostics`, `safety` | A | pass (copy shows codes only) |
| Settings | All settings present, user scope, workspace values ignored for sourceRoot/storageRoot | `extension`, `runtime-guard` | A for the list; **H** for workspace hardening | pass (10 settings, workspace roots ignored) |
| Commands | All commands titled `Bobert: …`, none duplicated, expected ones registered | `extension`, `tests/host/suite.ts` | A | pass (11 palette commands) |
| CLI | Output, exit codes, data folder `Bobert` | `cli` | A | not run natively |
| Accessibility | Heading order, keyboard reach, screen reader text, High Contrast Light | `dashboard-webview` (markup only) | **M** | keyboard and screen reader not run |
| Stale / unavailable / collecting states | Own label and colour, no false certainty | `presentation`, `view` | A | not run natively |
| Windows, Ubuntu | Same checks on their own hosts | CI jobs on three systems (x64); `scripts/acceptance/*` set up the native environment | A for tests; **M** for native Kiro | 2026-10-23, ARM64 VMs (Windows 11, Ubuntu 26.04): maintainer reported pass; Windows audit view seen by the agent |

## Findings from the 2026-10-23 acceptance (aa42b39)

- **F1, Hooks may overlap after Run only manually.** Fixed in PR 7: `Manual` hooks are left out of the overlap grouping (test `H5 ignores Manual hooks…`).
- **F2, stale checklist.** `macos-acceptance.md` A6 said three settings; there are ten. Fixed here.

## Native test environment

`pnpm demo:setup --rich --install --pace high --open` (or `scripts/acceptance/mac.sh`, `ubuntu.sh`, `windows.ps1`) creates invented usage, an invented workspace that triggers every audit and review group, the extension pre-installed in an isolated Kiro profile and a Kiro window; `seed-session.mjs` in the demo folder writes an invented chat session for the hints. Only the Kiro sign-in is manual, and it is the maintainer's. See [synthetic-demo.md](synthetic-demo.md).

## Automation backlog (do these before adding manual checks)

1. **Session hints in the host suite:** the invented-session reader and notice logic are automated in `acceptance-env`; the remaining step is asserting the notice and the diagnostics counter through the real extension in the host suite.
2. **Settings hardening in the host suite:** write a workspace `settings.json` with `bobert.sourceRoot` and `bobert.storageRoot` and assert they are ignored and nothing is created (replaces check B1).
3. **Audit and review in the host suite:** groups and counts on the invented tree are automated in `acceptance-env`; still open: running the commands through the extension and asserting the prepared edits for Load only when needed and Run only manually.
4. **Cost Advisor answers by command:** drive the quick-pick answers programmatically and assert the modelled figure for the documented example.
5. **Unsupported advisor inputs and stale/unavailable states:** table tests over `presentation` and `cost-*` with fixed synthetic observations (E3, D3).
6. **Run the host suite against Kiro without sign-in:** check whether `BOBERT_TEST_KIRO_EXECUTABLE` ([platform verification](platform-verification.md)) reaches the workbench unauthenticated; if yes, most native checks above can run without the maintainer.
7. **Screenshot capture:** a script that opens the synthetic demo and saves fixed stills would remove the manual marketing capture; blocked by Kiro's sign-in wall like item 6.

## How to run a full acceptance

A full walk of this table is for stable releases. A pre-release runs the subset in [release-process.md](release-process.md#2-gates-before-publishing-all-mandatory), gate 3.

1. Automatic: `pnpm typecheck`, `pnpm test`, `pnpm test:release`, `python3 tests/fixtures/kiro/validate.py`, the CI run of the exact commit, checksum and `gh attestation verify` of the candidate.
2. Native: follow [macos-acceptance.md](macos-acceptance.md) for the **M** rows, then walk this table and record every row as pass, fail, blocked or not run.
3. Put the result, candidate SHA-256 and the "not covered" list in the release notes.
