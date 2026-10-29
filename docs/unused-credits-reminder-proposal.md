# Reminder before the reset when many credits look likely to stay unused — design proposal

Status: **proposal, not approved.** It is outside the approved 1.0 scope, so it needs a dated ROADMAP decision (scope) and approval of this design before any implementation. It adds one notice kind to the existing budget notices, one setting, one optional dashboard line and a section in [credit-tips.md](credit-tips.md). The notice rests on the forecast, which is high-risk presentation, so the implementation needs independent review.

## Problem

Bobert warns before credits run out (the WP7 budget notices) and, after two cycles with many unused credits, hints at a smaller plan (WP8b, the `rightsize` notice). Nothing covers the common case in between: a user on the right plan who simply had a quiet month and has many credits left a few days before the reset. Kiro's plan credits don't carry over, so a short reminder at that point, with a few ideas for useful work, turns a quiet month into progress instead of nothing.

## Goals

- At most one short notice per billing cycle, a few days before the reset, when a fresh forecast says a large share of the plan's credits will likely be left.
- A few static, generic tips on work that is worth doing with spare capacity.
- Never two opposite messages in one cycle ("use your credits" and "you may not need this plan", or "you will run out" and "you will have many left").

## Non-goals

- No analysis of prompts, sessions, conversations, workspace content or per-task usage. The tips are the same for everyone. Personalised suggestions would be content or usage-efficiency analysis, which needs separate approval under [AGENTS.md](../AGENTS.md).
- No change to the forecast core, history, Store, collector, CLI JSON or the Cost Advisor.
- No status-bar change and no new colour or severity.
- No claim about add-on or bonus credits. Accounts with extra credits are not supported by the budget notices today and get no reminder.
- No encouragement to spend for its own sake: the copy offers ideas, it does not ask the user to use up credits.

## Evidence: do plan credits expire at the reset?

Checked on 2026-10-29 in public Kiro documentation only:

| Source | What it says | Label |
| --- | --- | --- |
| [kiro.dev/pricing](https://kiro.dev/pricing/), FAQ "What happens if I don't use all my monthly credits?" | Usage limits reset at the start of each billing month; unused credits do not roll over to the next month. | Documentation |
| [kiro.dev/docs/billing](https://kiro.dev/docs/billing/) (page updated 2026-08-04), "Credit reset" | For all tiers, the usage cap renews at the beginning of the next billing cycle. It says nothing about rollover. | Documentation |
| [kiro.dev/docs/billing/add-on-credits](https://kiro.dev/docs/billing/add-on-credits/) (page updated 2026-08-04) | Add-on credits roll over month to month and expire 12 months after purchase; the earliest-expiring pack is used first. | Documentation (add-ons only) |

Conclusions:

- **Documented:** plan credits do not roll over to the next month. The pricing FAQ is the only source that says so; the billing page only says the cap renews.
- **Not documented, so unknown:** whether a mid-cycle plan change, a promotion or a trial changes this; how bonus credits behave; and whether the reset Bobert observes always matches the "billing month" in the FAQ. The pricing page is not a versioned contract and can change.
- **Not observed:** Bobert has no local evidence of what happens to unused credits. It sees the reported limit and usage reset; that does not prove where unused credits go.

Wording rules that follow from this:

- The notice may say **"plan credits don't carry over to the next month"**, which restates the FAQ. It must not say credits are "lost", "wasted" or "thrown away", and never anything about add-on credits.
- The tips section cites the pricing FAQ with its check date, like the dated model-rate table.
- If a later check finds the FAQ changed or removed, the sentence is dropped and the notice keeps only the projection (see Open questions).

## Design

### 1. Trigger (pure, in `src/extension/budget-warning.ts`)

A new kind `unused` joins `NOTICE_KINDS` after `rightsize`, so it uses the same decision function, the same per-cycle state (`BudgetState`, keyed by the observed reset instant) and the same "most severe first" logic. It is due only when **all** of these hold:

1. **Same gates as the other forecast notices:** `bobert.budgetWarnings` is on; the view is `observed`; no `unsupported_extra_credits` flag; usage, base limit and reset are known; the reset is in the future; the presentation's `eligible` verdict says the forecast is fresh and qualified.
2. **A regular forecast:** the selected estimate is `qualified` with `tier === 'regular'` and a `projectedRemainingBaseAtReset`. A provisional estimate is too early to interrupt anyone.
3. **Close to the reset:** `ceil((reset − now) / 1 day) ≤ UNUSED_DAYS`, with `UNUSED_DAYS = 3`. That is late enough for the projection to be fairly certain and early enough to plan a few tasks.
4. **A large share left:** projected remaining at the reset ÷ base limit ≥ `bobert.unusedCreditsPercent` ÷ 100, compared exactly with rationals like `compareShare`. The setting must be above 0.
5. **Also left now in absolute terms:** limit − usage now ≥ the same share. This is implied by condition 4 for any non-negative rate, but checking it keeps the notice honest if a projection ever goes wrong.
6. **A budget day with budget left:** `dayBudget` returns `available` (today is a budget day and at least one budget day is left before the reset). There is no point in a reminder on a day off or when no working day remains.

Anything stale, conflicting, unknown or missing means **no notice**. Gaps are unknown, not zero: a forecast that is not qualified is not read as "nothing will be used".

**Conservative figure.** The notice quotes the projected remaining credits rounded **down** to whole credits (as `rightSizeText` does), so it never claims more unused credits than forecast. It uses the selected forecast only, not a lower-consumption scenario. Whether to use the higher-consumption scenario instead is an open question.

### 2. Interaction with the other notices

The existing rule never shows a less severe kind after a more severe one in the same cycle. For `unused` that rule is kept and tightened:

| Already due or done this cycle | Effect on `unused` | Why |
| --- | --- | --- |
| `limit` or `forecast` | never shown | A run-out warning and a "many credits left" reminder contradict each other. |
| `rightsize` | never shown | Both talk about unused credits; the plan hint is the more useful one. |
| `percent` | **does not block** | It only says a share was used. With a low percent setting (say 50 %), the percent notice can come early in the cycle while many credits are still likely to be left. |

And the other way round: when `unused` is shown, `rightsize` is marked done for the cycle too, so a user never gets "use your spare credits" and "consider a smaller plan" in the same cycle. In practice `rightsize` (last 7 days) comes before `unused` (last 3 days), so the plan hint wins when both apply. This needs a small, explicit exception in `decideBudgetNotice` rather than reordering `NOTICE_KINDS`, because `percent` must not block `unused`. Earlier versions that read a stored state with `unused` drop the unknown kind, as today.

**Budget days.** The trigger only reads `dayBudget`; the setting itself is unchanged. The copy uses "per budget day" only when budget days are restricted, like the detail view.

**Window pacing.** The notice goes through the existing `beforeShow` / prompt claim, so it never appears in the same window as the support prompt, the budget-days notice or a session hint shown just before it.

### 3. Settings

| Setting | Type, default | Meaning |
| --- | --- | --- |
| `bobert.budgetWarnings` (existing) | boolean, `true` | Off turns off all budget notices, including this one. Its description gains a few words for the new kind. |
| `bobert.unusedCreditsPercent` (new) | number 0–100, default **30**, `application` scope | Remind me when at least this percent of my reported credits will likely be left at the reset. 0 turns only this reminder off. |

- The default of 30 % means, on a 1,000-credit plan, at least 300 credits projected to be left three days before the reset. It is a judgement call, not an evidence-based threshold, and is listed as an open question.
- An invalid or unreadable value counts as the default; nothing is reported.
- `application` scope, so a repository's settings cannot change it.
- **Set Up** is not changed: the three-step setup stays short. The notice's own button turns the reminder off.

### 4. Tips

A new section in [credit-tips.md](credit-tips.md), **"Credits left before the reset"**, static and the same for everyone. The notice's **Show tips** button opens it the same way the model hint opens that page (`LINKS.tips` in `identity.ts`, a public GitHub page, with an anchor for the new section). Draft:

> Kiro's plan credits don't carry over to the next month (Kiro pricing FAQ, checked 2026-10-29). If you have time before the reset, a few kinds of work suit spare credits well:
>
> - **Tests** for code that has none, or for the bug you fixed last week.
> - **Docs:** a README, a setup guide or comments for the module only you understand.
> - **A refactor you keep postponing,** planned once with the Plan or Spec agent and built in small steps.
> - **A review** of a larger change with a stronger model, checked against its plan.
> - **A spike:** try the library or approach you've been curious about on a branch.
> - **Clean up what Kiro reads:** run **Workspace Audit** and tidy Steering and hooks so next month starts lean.
>
> There's no need to use credits just because they're there. If this happens every month, **Bobert: Open Cost Advisor** shows whether a smaller plan would fit.

The tips name kinds of work, not anything Bobert has seen. Nothing in them depends on the user's prompts, sessions or files.

### 5. Copy and placement

**Notice** (information message, not a warning), example on a 1,000-credit plan with every day a budget day:

> You'll likely have about 420 of your 1,000 Kiro credits left when they reset in 3 days. Plan credits don't carry over, so it's a good moment for the tests, docs or refactor you've been putting off.
>
> Buttons: **Show tips** · **Don't remind me**

- With restricted budget days the middle adds: `— about 140 per budget day`.
- `when they reset in 3 days` uses the existing `resetIn` wording (`today`, `in 1 day`, `in N days`).
- **Show tips** opens the tips section. **Don't remind me** writes `bobert.unusedCreditsPercent: 0` to the user settings, leaving the other budget notices on. Dismissal does nothing further.
- Credits only. No dollar figure: the value of unused plan credits is not money the user gets back, and a figure could be misread that way.

**Dashboard:** during the last `UNUSED_DAYS` days, when the trigger's data conditions 1–5 hold (whether or not the notice was shown or turned off), the forecast card adds one line: `Likely left at the reset: about 420 credits. Plan credits don't carry over — see tips.` with a link to the tips section. This lets a user who turned the notice off still see the figure where they look for it.

**Status bar:** unchanged. A notice once per cycle plus one dashboard line is enough; the status bar stays about today's budget.

## Privacy, storage and contracts

- **Nothing new is read.** The trigger uses the account history, forecast and day budget the extension already holds.
- **Nothing new is stored.** The kind goes into the existing per-cycle budget state; the only write besides it is the user's own setting on **Don't remind me**.
- **Diagnostics unchanged:** no new codes, no values.
- **Core contracts unchanged:** collector, Store, history, forecast policy and schema, CLI JSON, Cost Advisor.
- No content analysis, no session data, no external calls. The tips link is the same kind of static public documentation link the model hint already opens.

## Release type

Expected files and their class in [`scripts/release/release-class.ts`](../scripts/release/release-class.ts):

| File | Class |
| --- | --- |
| `src/extension/budget-warning.ts` (trigger, copy) | app (also a cost path) |
| `src/extension/presentation.ts`, `dashboard-*` (dashboard line) | app |
| `src/extension/identity.ts` or wherever settings are parsed | app |
| `src/extension/extension.ts` (buttons, reading the new setting) | review |
| `package.json` (`contributes.configuration` only) | app field |
| `docs/credit-tips.md`, other docs | not classified |

Because `extension.ts` is on the review list, the classifier reports **review**; the release PR review should rule it an **app** release, since no data access, file reading or writing, packaging or manifest field outside `contributes` changes. `budget-warning.ts` and `extension.ts` are cost paths, so the Cost Advisor acceptance section is included. Native checks on macOS only; other systems via CI.

## Testing

All with synthetic data.

- **`budget-warning` unit tests:**
  - due at exactly the threshold and 3 days before the reset; not due at 4 days, below the threshold or with the setting at 0;
  - not due with a provisional, unqualified or stale forecast, `eligible` false, missing reset/limit/usage, unsupported extra credits, reset in the past;
  - not due on a day off or with no budget day left;
  - never after `limit`, `forecast` or `rightsize` in the same cycle; shown after `percent`; showing it marks `rightsize` done;
  - once per cycle; a new reset instant re-arms it; a stored state from an older version with or without `unused` reads correctly;
  - exact rational threshold comparison (no floating point at the boundary), credits rounded down, one-decimal limits;
  - copy: example text, budget-day variant, `today` / `in 1 day` wording, no dollar figure, no "lost"/"wasted".
- **Settings:** `bobert.unusedCreditsPercent` default, bounds, invalid value counts as default, `application` scope (extension-host suite).
- **Presentation/dashboard:** the line appears only in the last 3 days with the data conditions met, also when the notice is off, and never in run-out states.
- **Docs:** a link check that the notice's tips target exists in `credit-tips.md`.

**Proposed [test-inventory.md](test-inventory.md) row** (added with the implementation, not now):

| Area | What to verify | Automated by | Status | Last native result |
| --- | --- | --- | --- | --- |
| Unused-credits reminder | Due only 3 days or less before the reset with a fresh regular forecast, projected remaining at or above `bobert.unusedCreditsPercent`, on a budget day; once per cycle; never with `limit`, `forecast` or `rightsize`; copy without "lost" or money; **Don't remind me** sets 0; dashboard line | `budget-warning`, `presentation`, extension-host suite (setting) | A for those; **M** for the notice and **Show tips** opening the page in Kiro (needs Kiro's own notification UI) | not run natively |

## Documentation

With the implementation: [SPEC.md](../SPEC.md) (budget notices), [credit-tips.md](credit-tips.md) (new section), [how-values-are-calculated.md](how-values-are-calculated.md) (projected remaining), the README notice list, [CHANGELOG.md](../CHANGELOG.md), and a dated [ROADMAP.md](../ROADMAP.md) entry once approved.

## Open questions for the maintainer

1. **Scope:** approve adding this to the roadmap (it is outside the 1.0 scope line)?
2. **Threshold and timing:** 30 % and 3 days as defaults, or different values? Should the days be a setting too (proposal: no)?
3. **Projection:** quote the selected forecast (proposal) or the more conservative higher-consumption scenario?
4. **Carry-over sentence:** keep "plan credits don't carry over", based on the pricing FAQ alone, or leave it out until the billing docs say so too?
5. **Dashboard line:** wanted, or notice only?
