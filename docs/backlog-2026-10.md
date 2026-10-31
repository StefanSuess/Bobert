# Backlog review, 31 October 2026 — proposals for the maintainer

Status: **proposal only. Nothing here is approved.** Per [AGENTS.md](../AGENTS.md) and the [roadmap](../ROADMAP.md), each feature needs its own maintainer approval before implementation. This page records a team-style review of Bobert 1.4.0 so the maintainer can pick items. Size is S (under a day), M (a few days) or L (a week or more).

## Health check (QA and Scrum Master view)

- `pnpm typecheck` and `pnpm test` pass on `main` at 1.4.0 (878 tests, 865 pass, 13 skipped for platform reasons such as Windows-only ACL tests or root-only permission tests).
- Line coverage is high; the only file below 85 % is `windows-storage.ts` (Windows-only code, covered when the suite runs on Windows).
- `pnpm audit --prod` reports no known vulnerabilities. No open GitHub issues.
- Settings readers (`identity.ts`) already tolerate wrong types and out-of-range numbers. No defect was found in a review of the settings, timezone and presentation paths.

## Ranked backlog

Ranking uses value for users against risk and effort (PM), then risk class under [agent-workflow](agent-workflow.md) (Architect).

| # | Item | Persona rationale | Size | Risk class | Needs |
| --- | --- | --- | --- | --- | --- |
| 1 | Keep the roadmap status line current at each release | Scrum Master: the first paragraph of `ROADMAP.md` still stops at 1.2.0 although 1.4.0 is current; stale status wastes onboarding time. Not changed here (see the note below). | S | docs | none |
| 2 | Bobert's face follows the budget state (smiling on track, worried when likely to exceed) | Designer and PM: already listed under "After 1.0"; cheap, visible, no data-access change. | S | presentation | approval, synthetic theme checks |
| 3 | Accessibility pass on the dashboard and audit views (focus order, contrast in high-contrast themes, reduced motion) | UX and QA: the product is script-light and already uses ARIA; a checked pass would catch regressions before they reach users. | M | webview | approval, host test |
| 4 | Automated check that every setting in `package.json` appears in `docs/usage.md` and the test inventory | Tech Lead: documentation drift is the most likely recurring defect given how many settings 1.4.0 added. | S | test only | approval |
| 5 | German-language UI strings | PM: localisation is a real adoption lever, but it touches every string and the privacy-reviewed wording. | L | presentation | approval, design |
| 6 | README badges once Open VSX downloads and ratings support them | Marketing: already decided on 2026-10-26, waiting on numbers (294 downloads, 0 ratings then). | S | docs | numbers |
| 7 | Session attribution and usage-efficiency insights | Architect: highest long-term value but needs separate evidence and approval; stays deferred and unauthorized. | L | high | separate evidence |

## Recommendation

Do item 1 with the next signed docs commit, then ask for approval of items 2 and 4 together as one small release candidate for 1.4.x or 1.6.0: both are low-risk and independent. Item 3 follows if the maintainer wants a quality-focused release. Items 5 and 7 need a design conversation first.

## Evaluation of this PR

Note: this PR was created through the GitHub API so its commit is signed by GitHub. The one-sentence roadmap fix was left out because it would need a full-file rewrite of a long document through that route.

- QA: documentation only; `git diff --check` clean, no code or fixture change, so unit tests are unaffected.
- Architect: no trust boundary, storage or data-format change.
- PM: gives the maintainer one decision list instead of unrequested feature code.
