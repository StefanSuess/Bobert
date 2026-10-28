# Today's usage against a day-anchored budget, budget days and a short setup — design proposal

Status: **approved by the maintainer on 2026-10-28.** It changes how the extension presents the daily budget, adds one setting, one command and one one-time notice. The daily budget shown to users is forecast presentation, which is high-risk, so the implementation needs independent review.

## Problem

The status bar shows an allowance such as `On track • 100/day`. Two things make it less useful than it could be:

1. **No link to today.** It does not say how much of that allowance has already been used today, which is the question a user asks while working.
2. **The number moves.** The allowance is `max(limit − usage, 0) / (reset − query time)` in 24-hour days (`availablePerDay`), recomputed every minute from the latest update. Spending lowers it during the day, so "55 of 100 used" would not add up.
3. **Every day counts.** Someone who works Monday to Friday sees an allowance spread over weekends they never use, so the per-day figure is lower than what they can actually spend on a working day.

## Goals

- The status bar shows today's observed usage against today's allowance, for example `On track • 55/100 today`.
- Today's allowance stays fixed during the day.
- The user chooses on which weekdays the budget is spread (default: every day).
- New users are asked the few settings that matter in a short setup; existing users learn about budget days once.

## Non-goals

- No change to the forecast core (`src/forecast.ts`), history (`src/history.ts`), the Store, the collector or the CLI JSON contract. `availablePerDay` keeps its documented meaning.
- No weekday-weighted rates or projections. The selected forecast already averages over observed calendar time, weekends included, so its projection to the reset is unaffected by the budget-day setting.
- No holidays, vacations or per-date exceptions.
- No warning colour or notice for exceeding today's allowance. Risk colours and notices stay tied to the projection until the reset, so one busy day is not a false alarm.
- No daily allowance in the CLI.

## Design

### 1. Calculation (pure module `src/extension/daily-budget.ts`)

A pure function, like `todayPace` in `src/extension/dashboard-insights.ts`, takes the account history, the latest observation, the current time, an IANA time zone (the device's) and the budget days. It returns either a day budget or a fixed unavailable reason.

- **Today** is the user's local calendar day in the device time zone, not the UTC day. Day boundaries come from the zone, so a day can be 23 or 25 hours long at a daylight-saving change.
- **Used today** = usage at the latest update − usage at the first update of today. It is only computed when every update of today and every interval between them is comparable: same reset, same limit, no conflicts, no missing usage or limit, no unsupported extra credits. These are the same conditions as `todayPace`. Usage before the first update of today is unknown, not zero. The figure is therefore an observed lower bound, and the tooltip says from when it is measured.
- **Anchor.** The anchor is the first comparable update of today. If there is none yet, the anchor is the latest update. In both cases that update must be fresh by the existing freshness rule. Stale or unavailable data shows no day figures (the existing "Stale data" or "Unavailable" text stays).
- **Remaining at the anchor** = max(limit − usage at the anchor, 0).
- **Budget-day weight.** For each local calendar day from today up to and including the day that contains the reset:
  - The weight is 0 if the day's weekday is not a budget day.
  - Otherwise the weight is the share of that day before the reset: (min(end of day, reset) − start of day) / length of day.
  - Today counts from its start, so a budget day today has weight 1. The reset day counts only with its part before the reset, and a reset at exactly midnight gives that day 0.
- **Today's allowance** = remaining at the anchor / sum of weights, using exact decimal and rational arithmetic and truncated to one decimal for display like every compact figure.
- **Day off.** If today is not a budget day, today has no allowance; the result is `day_off` together with today's observed usage, if any. Usage on a day off lowers the remaining credits and so the next budget day's allowance; this is not hidden.
- **No budget day left before the reset.** If the sum of weights is 0, the result is `no_budget_days_left` and the status bar shows no allowance.
- **Default.** The default (all seven days) also uses this day-anchored allowance, so for every user the figure stays fixed during the day instead of moving with each update. This is the only visible change for users who keep the default.

### 2. Display

**Status bar** (only where today's figure replaces the existing ` • <allowance>/day` part):

| State | Text |
| --- | --- |
| On track / At risk / Provisional without run-out date, update today | `On track • 55/100 today` |
| Collecting with known allowance, update today | `1,240 left • 55/100 today` |
| No update today yet | `On track • 100/day` (allowance from the latest update, same budget-day rule) |
| Today is not a budget day | `On track • day off`, or `On track • 12 today (day off)` with usage |
| Run-out or limit states (`Likely to exceed • runs out …`, `Reported limit reached` …) | unchanged; today's figures only in the tooltip |
| Stale, unavailable, Kiro not detected | unchanged |

The status bar's icon, colour and severity are unchanged and still come from the forecast.

**Tooltip** adds one line, for example `Today: 55 of 100 credits used (since your first Kiro update at 08:12) · Budget days: Mon–Fri`. With all seven days, the budget-day part is omitted. On a day off it reads `Today is not a budget day: 12 credits used (since 08:12)`.

**Detail view**:
- The *Credits left* card's subline becomes `Today: 55 of 100 used`, or `Up to 100 per budget day` without an update today.
- The collecting heading and explanation count budget days. For example: `1,240 credits left and 12 budget days until the reset on Nov 15, so up to 103 per budget day.` With all seven days the wording stays "days" and "per day".
- The at-least-average sentence ("Even this minimum is above your daily allowance") keeps comparing per calendar day against the core `availablePerDay`. When budget days are restricted, it names that calendar figure explicitly, so a per-calendar-day floor is never compared with a per-budget-day allowance.
- *Technical details* add the exact today's allowance, the anchor time, the budget days and the sum of weights. The existing `Exact daily credit budget / 24h` row is relabelled `24-hour allocation from the last update (CLI)`.
- `tight` (*At risk*) and the warning tone keep using the core `availablePerDay` and the selected forecast, unchanged.

**Dashboard *Today's pace*** switches to the same module and the local day, so the status bar and the dashboard never show different "today" values.

### 3. Setting, setup and notice

**Setting `bobert.budgetDays`**
- Type: array of unique values from `mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `sun`.
- Default: all seven.
- Scope: `application`, so a repository's settings cannot change it.
- An empty, invalid or unreadable value counts as all seven days, and nothing is reported.

**Command `Bobert: Set Up` (`bobert.setup`)** shows up to three quick picks with a step counter. Each has the user's current value preselected:
1. **Budget days:** *Every day* / *Monday to Friday* / *Choose days…* (multi-select of weekdays, at least one).
2. **Budget notices:** *Notify at 80 % (recommended)* / *Notify at 90 %* / *Off*. This writes `bobert.budgetWarningPercent`, and for *Off* `bobert.budgetWarnings: false`.
3. **Session hints:** *On* / *Off*, with one sentence on what is read (the newest session's model, context level and time; nothing stored or sent). This writes `bobert.sessionHints`.

Rules for the setup:
- Each answer is written to the user (global) settings when it is chosen. This is the same mechanism the existing *Turn off budget notices* button uses. Escape ends the setup and keeps the answers already given.
- At the end a fixed confirmation offers *Open settings*.
- Nothing else is written, and no workspace setting is touched.

**Walkthrough**
- A new first step *Set up Bobert* with a button for `bobert.setup` (completion: `onCommand:bobert.setup`).
- The credits step explains the `55/100 today` figure.

**One-time notice for existing users**
- Who sees it: only in Kiro, never in extension tests, and only for a user who used Bobert before this version. The existing first-use and walkthrough markers identify these users. A new user who gets the walkthrough never sees the notice.
- When it appears: once, after the status bar shows an allowance.
- Text: `New: spread your daily budget only over the days you work?` with **Choose days** and **No thanks**.
  - **Choose days** opens setup step 1 only.
  - **No thanks** and dismissal do nothing further.
- Pacing: at most one Bobert prompt per window. It never appears together with a budget notice or the support prompt; this uses the existing `beforeShow` coordination.
- Stored state: one global-state flag (`bobert.budgetDaysNotice.v1`), written before the notice is shown. A failed write means no notice.

## Privacy, storage and contracts

- **Nothing new is read.** The module uses the account history the extension already holds.
- **Nothing new is stored** except the one global-state flag. The setup writes only Bobert's own user settings, on the user's explicit choice.
- **Diagnostics are unchanged:** no new codes, no values.
- **Core contracts are unchanged.** Collector, Store, history, forecast policy and schema, CLI JSON and `availablePerDay` all stay as they are.
- **SPEC.md changes** in the extension presentation paragraphs only: day-anchored allowance, budget days and today's observed usage. The line "Daily budget is max(limit − observed usage, 0) / (reset − query time)" stays true for the core and the CLI.

## Testing

All tests use synthetic data.

- **`daily-budget` unit tests:**
  - local day in UTC−, UTC+ and a half-hour zone;
  - both daylight-saving changes (23- and 25-hour days);
  - budget days all seven, Mon–Fri and Mon–Thu;
  - day off with and without usage;
  - reset at midnight and mid-day;
  - no update today, one update today, several updates;
  - reset, limit or conflict change during the day (no figure);
  - stale latest update (no figure);
  - usage above the limit (remaining 0);
  - exact decimals and one-decimal truncation.
- **Presentation tests:** status bar texts, tooltip and detail view wording for each state in the table above. They also check that colours and severity are unchanged and that the 24-hour row is relabelled.
- **Settings:** parsing of `bobert.budgetDays` (default, empty, invalid entries, duplicates).
- **Setup and notice logic** as pure functions:
  - which settings are written for each choice;
  - Escape keeps earlier answers;
  - the notice is eligible only for existing users, once, and never in the same window as another prompt.
- **Extension host:**
  - `bobert.budgetDays` exists with `application` scope and a workspace value is ignored;
  - `bobert.setup` is registered;
  - the walkthrough has the new first step.
- **Dashboard:** *Today's pace* uses the local day.
- **Inventory:** [test-inventory.md](test-inventory.md) gains rows for today's figure, budget days, setup and the notice. A manual native check is kept only for the look of the quick picks and the notice in Kiro.

## Documentation

These documents change with the implementation:
- [SPEC.md](../SPEC.md): the presentation paragraphs.
- [how-values-are-calculated.md](how-values-are-calculated.md): today's allowance, budget days and used today.
- The README's status bar description.
- The walkthrough texts.
- [CHANGELOG.md](../CHANGELOG.md).
- [ROADMAP.md](../ROADMAP.md): a dated approval entry once this proposal is approved.
