# Daily Budget Days Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The status bar shows today's observed usage against a day-anchored allowance spread over user-chosen budget days, plus a short setup command and a one-time notice for existing users.

**Architecture:** A new pure module `src/extension/daily-budget.ts` computes the day budget from the existing `view()` result. `present()` consumes it for the status bar, tooltip, detail view and the *Observed usage* card, replacing `todayPace`. Setup choices and notice eligibility are pure functions in `src/extension/setup.ts`. `extension.ts` only wires quick picks, setting writes and global state. The forecast core, history, Store, collector and CLI are not touched.

**Tech Stack:** TypeScript (strip-types, `node --test`), VS Code extension API, exact decimals from `src/decimal.ts`.

**Spec:** [docs/daily-budget-days-proposal.md](../../daily-budget-days-proposal.md) (approved 2026-10-28). Read it before any task.

## Global Constraints

- Do not modify `src/forecast.ts`, `src/history.ts`, `src/store.ts`, `src/collector.ts`, `src/view.ts`, `src/cli.ts` or `availablePerDay` semantics.
- Never convert billing values to `Number` for arithmetic. Use `subtract`, `compare` and `scaleRatio` from `src/decimal.ts`. Compact display uses the existing `compact()` in `presentation.ts`: truncate to one decimal, `<0.1` for small values.
- Setting `bobert.budgetDays`:
  - array of unique `mon`..`sun`, default all seven, `"scope": "application"`;
  - read only the user (global) value or the default, never workspace values;
  - empty, invalid or unreadable means all seven.
- Status bar and colours: severity, warning and icon logic stays exactly as now. Only the ` • <allowance>/day` suffix changes.
- Copy, exact as in the spec:
  - notice `New: spread your daily budget only over the days you work?`;
  - buttons `Choose days` / `No thanks`;
  - command title `Bobert: Set Up`;
  - walkthrough step title `Set up Bobert`.
- Global-state key `bobert.budgetDaysNotice.v1`. Write it **before** showing the notice; a failed write means no notice.
- Every new UI path is wrapped so a failure can never take down the gauge (follow the existing `try { … } catch { /* … */ }` pattern).
- No new diagnostics codes, no new persisted data beyond that one key, no network, no telemetry.
- Tests use synthetic data only (`tests/unit/synthetic.ts`). Run `pnpm typecheck` and `pnpm test` before each commit.
- Commits are SSH-signed (`git commit -S`). Stage explicit paths only.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A user in a UTC+ zone shortly after local midnight** (e.g. 00:30 in Berlin = 22:30Z the previous UTC day). "Today" must be the local day, and yesterday's UTC-evening updates must not count. Test in Task 1.
2. **A daylight-saving change day.** A 23- or 25-hour day has weight 1 when today, and the reset day's fraction uses that day's real length. Test in Task 1.
3. **Reset during today**, e.g. the cycle renews at 09:00 local. Updates before the reset are from the old cycle, so used today is `null` and the anchor is the latest update. The allowance must never use the old cycle's remaining credits. Test in Task 1.
4. **The user changes `bobert.budgetDays` while Kiro is open.** The status bar must update without a reload. Test in Task 4 (controller rerender on change).
5. **Several updates today with usage above the reported limit.** Remaining is clamped to 0, so the allowance is 0 and the text is `On track • 12/0 today`. The text must not show negative figures or throw. Test in Task 1 (allowance 0) and Task 2 (text).

---

### Task 1: Day budget core module

**Files:**
- Create: `src/extension/daily-budget.ts`
- Test: `tests/unit/daily-budget.test.ts`

**Interfaces:**
- Consumes: `view()` result type (`ReturnType<typeof view>` from `src/view.ts`); `timestamp(text, zone)` from `src/time.ts` to resolve a local wall time `YYYY-MM-DDT00:00:00` to an instant; `subtract`, `compare`, `scaleRatio` from `src/decimal.ts`.
- Produces:

```ts
export type BudgetDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export const ALL_DAYS: readonly BudgetDay[]; // ['mon','tue','wed','thu','fri','sat','sun']
export type DayBudget =
 | { status: 'available'; day: string; allowance: string; remainingAtAnchor: string; anchorAt: string;
     weightSum: string; budgetDaysLeft: number; used: string | null; since: string | null; asOf: string }
 | { status: 'day_off'; day: string; used: string | null; since: string | null; asOf: string }
 | { status: 'unavailable'; reason: 'not_observed' | 'missing_billing' | 'reset_unknown' | 'unsupported_timezone' };
export function dayBudget(o: ReturnType<typeof view>, now: string, zone: string, days: readonly BudgetDay[]): DayBudget;
export function restricted(days: readonly BudgetDay[]): boolean; // false when all seven
export function daysLabel(days: readonly BudgetDay[]): string;   // 'Mon–Fri', 'Mon–Thu', 'Mon, Wed, Fri', 'Every day'
export function localTime(instant: string, zone: string): string; // 'HH:MM' 24h in zone
```

Field meanings:
- `day`: local `YYYY-MM-DD`.
- `allowance`: exact, 6 decimals.
- `weightSum`: exact sum of budget-day weights, 6 decimals.
- `budgetDaysLeft`: `Math.ceil` of the weight sum, for wording only.
- `used` / `since`: `null` unless every update of today is comparable.
- `asOf`: the latest update.

Rules (from the spec, section 1):
- **Fresh data required.** `o.status !== 'observed'` gives `unavailable`/`not_observed`.
- **Billing must be known.** Missing `baseLimit`/`usage` gives `missing_billing`. A missing `resetAt`, or `resetAt <= now`, gives `reset_unknown`.
- **Today's points** are the `o.history.points` whose local day equals today's local day and whose `observedAt <= now`.
- **Used today** is computed only when all of today's points and all `o.history.intervals` between them meet the `todayPace` conditions:
  - same reset and limit, no conflicts, no null usage or limit, no `unsupported_extra_credits`;
  - the intervals chain exactly and every interval has `status === 'comparable'`.
  - Then `used = last.usage − first.usage`, `since = first.observedAt` and the anchor is `first`.
  - Otherwise `used = since = null` and the anchor is the latest point (`o.observedAt` with `o.usage`).
- **Remaining at the anchor** = `max(baseLimit − anchorUsage, 0)`.
- **Weights.** Iterate local days from today to the day containing `resetAt`, at most 400 iterations; beyond that, `reset_unknown`.
  - For a day whose weekday is in `days`, the weight is `(min(nextMidnight, reset) − midnight) / (nextMidnight − midnight)`; other days weigh 0.
  - Sum the weights as an exact BigInt fraction reduced by gcd.
  - Then `allowance = scaleRatio(remaining, den, num)`. `weightSum` uses the same fraction via `scaleRatio('1', num, den)`.
  - The weekday comes from `new Date(`${ymd}T00:00:00Z`).getUTCDay()`. A `timestamp()` result other than `valid` gives `unsupported_timezone`.
- **Day off.** If today's weekday is not in `days`, return `day_off` with the same `used`/`since` rule.

- [ ] **Step 1: Write the failing tests** in `tests/unit/daily-budget.test.ts`. Build the data with `history`-backed `view(snapshots, now)` and `syntheticSnapshot(at, usage, { resetAt, limit })`. Use a reset `2030-06-15T00:00:00.000Z` unless stated. Each test is named for its assertion:
  - `day budget anchors at the first update of the local day`: zone `UTC`; limit 1000; updates 06-08T08:00Z usage 300 and 06-08T12:00Z usage 355; now 06-08T13:00Z. Expect `status` `available`, `used` `'55'`, `since` `'2030-06-08T08:00:00.000Z'`, `remainingAtAnchor` `'700'` and `allowance` `'100'` (7 whole days 06-08..06-14).
  - `day budget uses the local day, not the UTC day`: zone `Europe/Berlin`; updates 06-07T21:30Z (23:30 local on 06-07) usage 200 and 06-07T22:30Z (00:30 local on 06-08) usage 210; now 06-07T23:00Z. Expect `day` `'2030-06-08'`, `used` `'0'` and `since` `'2030-06-07T22:30:00.000Z'`.
  - `day budget skips days that are not budget days`: zone `UTC`; days `mon`–`fri`; now Wed 2030-06-12T12:00Z; one update that day, usage 300, limit 1000; reset 2030-06-18T00:00Z. Budget days are Wed 12, Thu 13, Fri 14 and Mon 17 (Sat 15 and Sun 16 weigh 0), weight 4. Expect `allowance` `'175'` and `budgetDaysLeft` `4`.
  - `day budget counts only the part of the reset day before the reset`: reset 2030-06-10T06:00Z, zone `UTC`, now 06-08T10:00Z, one update usage 0, limit 225. Weights 1 + 1 + 0.25. Expect `allowance` `'100'` and `weightSum` `'2.25'`.
  - `day budget on a 23-hour daylight-saving day`: zone `Europe/Berlin`; today 2030-03-31 (DST starts), reset 2030-04-02T22:00Z (midnight local). Expect `weightSum` `'3'`.
  - `day budget returns day_off on a weekend`: Saturday 2030-06-08, days `mon`–`fri`, two comparable updates. Expect `status` `day_off` and `used` equal to the difference.
  - `day budget without an update today anchors at the latest update`: the only update was yesterday. Expect `used` `null`, `since` `null` and `anchorAt` equal to yesterday's update.
  - `day budget drops used today when the cycle resets during the day`: updates at 08:00 on the old `resetAt` and at 10:00 on the new one. Expect `used` `null` and `anchorAt` equal to the 10:00 update.
  - `day budget clamps remaining at zero above the limit`: usage 1200, limit 1000. Expect `allowance` `'0'`.
  - `day budget is unavailable for stale data`: now 30 h after the latest update. Expect the `unavailable` reason `not_observed`.
  - `day budget treats an unknown zone as unavailable`: zone `'Not/AZone'`. Expect `unsupported_timezone`.
  - `days label`: `daysLabel(ALL_DAYS)` is `'Every day'`, `['mon','tue','wed','thu','fri']` is `'Mon–Fri'`, `['mon','tue','wed','thu']` is `'Mon–Thu'`, `['mon','wed','fri']` is `'Mon, Wed, Fri'`, and `restricted(ALL_DAYS)` is `false`.

- [ ] **Step 2: Run the tests and see them fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/unit/daily-budget.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/extension/daily-budget.ts`** with the interfaces and rules above. Match the terse style of `dashboard-insights.ts` (one-space indent, short comments that explain *why*).

- [ ] **Step 4: Run the tests and see them pass**

Run: `node --disable-warning=ExperimentalWarning --test tests/unit/daily-budget.test.ts && pnpm typecheck`
Expected: all pass, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/extension/daily-budget.ts tests/unit/daily-budget.test.ts
git commit -S -m "feat: compute a day-anchored budget over chosen budget days"
```

### Task 2: Presentation uses the day budget

**Files:**
- Modify: `src/extension/presentation.ts`
  - `present()` signature at line 150;
  - `allowance`/`status`/`tooltip`/`heading`/`explanation`/`details` around lines 160–235;
  - the *Credits left* stat at line 268;
  - `observedContext()` at lines 114–127.
- Modify: `src/extension/dashboard-insights.ts`: delete `todayPace`, `TodayPace` and `noPace`.
- Modify: `tests/unit/dashboard-insights.test.ts`: delete the `todayPace` tests.
- Test: `tests/unit/presentation.test.ts`

**Interfaces:**
- Consumes: Task 1's `dayBudget`, `restricted`, `daysLabel`, `localTime`, `ALL_DAYS` and `BudgetDay`.
- Produces:
  - `present(…existing 12 params…, daily: { days: readonly BudgetDay[]; zone: string } = { days: ALL_DAYS, zone: 'UTC' })`;
  - its return object gains `allowance: boolean`, true when the status text contains a day-budget figure (status `available`).

Text rules (spec section 2):
- **Status bar suffix.** Wherever the code now appends `allowance` (` • ${compact(budget)}/day`), use:
  - `available` with `used`: ` • ${compact(used)}/${compact(allowance)} today`;
  - `available` without `used`: ` • ${compact(allowance)}/day`;
  - `day_off`: ` • ${compact(used)} today (day off)`, or ` • day off` without usage;
  - `unavailable`: the existing core suffix.
  - The `allowanceShown` condition and run-out texts are unchanged.
- **Tooltip.** When the day budget is `available` or `day_off`, replace the line `Daily credit budget until reset: …` with one of these, appending ` · Budget days: ${daysLabel(days)}` when `restricted(days)`:
  - `Today: ${compact(used)} of ${compact(allowance)} credits used (since your first Kiro update at ${localTime(since, zone)})`;
  - `Today: up to ${compact(allowance)} credits`;
  - `Today is not a budget day` plus `: ${compact(used)} credits used (since ${localTime(since, zone)})` when used is known.
- ***Credits left* subline:**
  - `Today: ${compact(used)} of ${compact(allowance)} used`;
  - `Up to ${compact(allowance)} per ${restricted ? 'budget day' : 'day'}`;
  - `Today is not a budget day`;
  - otherwise the existing text.
- **Collecting heading** when `available`: restricted gives `Up to ${compact(allowance)} credits per budget day until the reset`; otherwise `Up to ${compact(allowance)} credits/day until the reset` (today's spelling).
- **Collecting explanation sentence** when `available`. With `used`: `At your first update today you had ${compact(remainingAtAnchor)} credits left and ${budgetDaysLeft} ${restricted ? 'budget days' : 'days'} until the reset${on date}, so up to ${compact(allowance)} per ${restricted ? 'budget day' : 'day'}; ${compact(used)} used so far.` Without `used`, the existing sentence shape with `remainingAtAnchor`, `budgetDaysLeft` and the allowance.
- **Floor sentence.** The comparison logic is unchanged. When `restricted(days)`, replace ` Even this minimum is above your daily allowance.` with ` Even this minimum is above the ${compact(budget)} credits per calendar day that would last until the reset.`
- **Technical details.** Relabel `Exact daily credit budget / 24h` to `24-hour allocation from the last update (CLI)`. Add these rows, `null` when not available:
  - `Today's allowance (exact)`;
  - `Today's allowance anchor (UTC)`;
  - `Used today since (UTC)`;
  - `Budget days` (`daysLabel`);
  - `Budget-day weight until reset` (`weightSum`).
- ***Observed usage* card.** The `Today (UTC)` heading becomes `Today`. The text is `Since ${localTime(since, zone)}: ${used} credits used, as of ${updated(asOf)}. Today's allowance: ${compact(allowance)} credits.` When `used` is null: `Today's usage isn't available yet.` The card's early return uses the day budget's `used === null` instead of `pace.status`.

- [ ] **Step 1: Write the failing tests** in `tests/unit/presentation.test.ts`, using synthetic series:
  - `status bar shows used against today's allowance`: matches `/On track • 55\/100 today/`.
  - `status bar keeps run-out text and moves today into the tooltip`: a `Likely to exceed` case with an exhaustion date. The text has no `today`; the tooltip matches `/^Today: /m`.
  - `status bar shows day off with and without usage`: weekday-only days on a Saturday give ` • day off` and ` • 12 today (day off)`.
  - `budget days appear in the tooltip only when restricted`.
  - `colours and severity are unchanged by the day budget`: `warning` and `severity` equal the values of the same view rendered with `ALL_DAYS`.
  - `technical details relabel the 24-hour allocation`: the html contains `24-hour allocation from the last update (CLI)` and not `Exact daily credit budget / 24h`.
  - `restricted days rename the floor comparison to calendar days`.
  - `observed usage card reports today in local time`.
  - `allowance above zero but used above it renders without negatives`: `12/0 today`.

- [ ] **Step 2: Run the tests and see them fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/unit/presentation.test.ts`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement the presentation changes** listed above. Then update the existing expectations in `presentation.test.ts`, `dashboard-insights.test.ts`, `dashboard-panel.test.ts` and `view.test.ts` that asserted the old ` • X/day` suffix, `Today (UTC)` or `todayPace`. Each must now assert the spec's new text. Do not weaken any assertion: replace it with the new exact value.

- [ ] **Step 4: Run the full suite**

Run: `pnpm typecheck && pnpm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/extension/presentation.ts src/extension/dashboard-insights.ts tests/unit/presentation.test.ts tests/unit/dashboard-insights.test.ts <other updated test files>
git commit -S -m "feat: show today's usage against the day budget in the status bar and credit view"
```

### Task 3: Setting and pure setup/notice logic

**Files:**
- Modify: `package.json`:
  - new setting `bobert.budgetDays` after `bobert.budgetWarningPercent` (order 3; renumber later `order` values only if needed);
  - new command `bobert.setup`, title `Bobert: Set Up`.
- Modify: `src/extension/identity.ts`: add `'budgetDays'` to `BUDGET_SETTING_KEYS`; add `readBudgetDays`.
- Create: `src/extension/setup.ts`
- Test: `tests/unit/setup.test.ts`, `tests/unit/identity.test.ts`

**Interfaces:**
- Consumes: Task 1's `BudgetDay` and `ALL_DAYS`.
- Produces:

```ts
// identity.ts
export function readBudgetDays(inspect: { globalValue?: unknown; defaultValue?: unknown } | undefined): BudgetDay[]; // unique, Mon..Sun order; invalid/empty -> [...ALL_DAYS]

// setup.ts
export type SetupWrite = { key: 'budgetDays' | 'budgetWarnings' | 'budgetWarningPercent' | 'sessionHints'; value: unknown };
export type DayChoice = 'every_day' | 'weekdays' | 'custom';
export type NoticeChoice = 'notify_80' | 'notify_90' | 'off';
export const WEEKDAYS: readonly BudgetDay[]; // mon..fri
export function currentDayChoice(days: readonly BudgetDay[]): DayChoice;
export function dayWrites(choice: 'every_day' | 'weekdays' | readonly BudgetDay[]): SetupWrite[];
export function currentNoticeChoice(enabled: boolean, percent: number): NoticeChoice | null; // null for other percents
export function noticeWrites(choice: NoticeChoice): SetupWrite[];
export function hintWrites(on: boolean): SetupWrite[];
export function budgetDaysNoticeDue(i: { kiro: boolean; testing: boolean; stored: unknown; newUser: boolean;
  daysSet: boolean; otherPromptShown: boolean; allowanceShown: boolean }): boolean;
export const BUDGET_DAYS_NOTICE_KEY = 'bobert.budgetDaysNotice.v1';
export const NOTICE_TEXT = 'New: spread your daily budget only over the days you work?';
```

Exact writes:
- `every_day` writes `budgetDays` = all seven.
- `weekdays` writes `mon`–`fri`.
- An array writes itself, sorted Mon..Sun.
- `notify_80` writes `budgetWarnings: true` and `budgetWarningPercent: 80`; `notify_90` writes `true` and `90`; `off` writes `budgetWarnings: false` only.
- `hintWrites(b)` writes `sessionHints: b`.

`budgetDaysNoticeDue` is true only when every one of these holds:
- `kiro`;
- not `testing`;
- `stored === undefined`;
- not `newUser`;
- not `daysSet` (the user already has a global `budgetDays`);
- not `otherPromptShown`;
- `allowanceShown`.

- [ ] **Step 1: Write the failing tests:**
  - `readBudgetDays` covers default, global value, workspace-only value ignored (`inspect` without `globalValue`), empty array, unknown strings, duplicates and order.
  - `setup.ts` has one test per exported function with the exact writes above.
  - `budgetDaysNoticeDue` gets a table test that flips each condition.
  - In `identity.test.ts`, the existing manifest scope test now covers `budgetDays` as `application`. Add an assertion that its default equals all seven and its items enum is `mon`..`sun`.

- [ ] **Step 2: Run the tests and see them fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/unit/setup.test.ts tests/unit/identity.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `readBudgetDays`, `setup.ts` and the `package.json` entries. The setting description: `Weekdays your daily credit budget is spread over. Days not listed get no budget; usage on them still counts. Default: every day.`

- [ ] **Step 4: Run the full suite**

Run: `pnpm typecheck && pnpm test`
Expected: all pass, including the command-title and settings-list tests in `extension.test.ts`. Update their expected counts (settings 10 → 11, palette commands +1) to the new exact numbers.

- [ ] **Step 5: Commit**

```bash
git add package.json src/extension/identity.ts src/extension/setup.ts tests/unit/setup.test.ts tests/unit/identity.test.ts tests/unit/extension.test.ts
git commit -S -m "feat: add the budget days setting and setup choices"
```

### Task 4: Wire controller, setup command, notice and walkthrough

**Files:**
- Modify: `src/extension/controller.ts`:
  - `ExtensionOptions` gains `budgetDays?: () => readonly BudgetDay[]`, `dayZone?: string` and `onAllowance?: () => void`;
  - `render()` passes `{ days: budgetDays?.() ?? ALL_DAYS, zone: dayZone ?? 'UTC' }` to `present`;
  - it calls `onAllowance` when `presentation.allowance`, wrapped like `onForecast`.
- Modify: `src/extension/extension.ts`:
  - `startGauge` passes `budgetDays: () => readBudgetDays(vscode.workspace.getConfiguration('bobert').inspect('budgetDays'))`, `dayZone: Intl.DateTimeFormat().resolvedOptions().timeZone` and `onAllowance`;
  - it registers an `onDidChangeConfiguration` listener that calls `controllerRef?.rerender()` when `bobert.budgetDays` changes;
  - add `registerSetup` and the notice;
  - in `registerWalkthrough`, a new user (`!existing`) sets a module flag `newUserNow = true` synchronously and writes `BUDGET_DAYS_NOTICE_KEY = 'new_user'`;
  - `BudgetLink` gains `shown(): boolean`, true once that window's budget notice is kept.
- Modify: `package.json`: new first walkthrough step.
- Modify: `tests/host/suite.ts`.
- Test: `tests/unit/presentation.test.ts` (controller section, which already uses `startExtension`).

**Interfaces:**
- Consumes:
  - from Task 1: `ALL_DAYS`, `BudgetDay`;
  - from Task 2: the `present` daily param and `allowance`;
  - from Task 3: `readBudgetDays`, everything in `setup.ts`.
- Produces: the command `bobert.setup` and the walkthrough step `bobert.gettingStarted.setup`.

The setup runner is `runSetup(scope: 'all' | 'days')`, local to `extension.ts`.
- Use `vscode.window.createQuickPick` with `step`/`totalSteps` (3 for `all`, 1 for `days`), `ignoreFocusOut: true`, and `activeItems` set to the current choice.
- Step 1 items: `Every day`, `Monday to Friday`, `Choose days…`.
  - `Choose days…` opens a `canSelectMany` pick of the seven weekdays with the current days `picked`.
  - An accept with nothing selected is ignored, so the picker stays open.
- Step 2 items: `Notify at 80 % (recommended)`, `Notify at 90 %`, `Off`.
- Step 3 items: `On`, `Off`, with the detail `Reads only the newest session's model, context level and time, on your computer. Nothing is stored or sent.`
- After each accept, apply the writes with `getConfiguration('bobert').update(key, value, ConfigurationTarget.Global)`. Escape or hide ends the run.
- After completing `all`, show `showInformationMessage('Bobert is set up. You can change this any time in Settings.', 'Open settings')`. *Open settings* runs `workbench.action.openSettings` with `'@ext:StefanSuess.bobert'`.

Notice flow on `onAllowance`:
- If `budgetDaysNoticeDue(…)` holds, write the key `'shown'`, then call `support?.pause()`, then show `NOTICE_TEXT` with `Choose days` / `No thanks`.
- `Choose days` runs `runSetup('days')`.
- The notice is evaluated at most once per window; a module flag is set before the first await.
- `otherPromptShown` = `budget?.shown()`.

Walkthrough step, inserted first:

```json
{ "id": "bobert.gettingStarted.setup", "title": "Set up Bobert",
  "description": "Tell Bobert on which days you work, when to warn you about your budget and whether to show session hints. Takes under a minute; you can change everything later in Settings.\n[Set up Bobert](command:bobert.setup)",
  "media": { "image": "assets/branding/bobert-icon-256.png", "altText": "Bobert setup questions" },
  "completionEvents": ["onCommand:bobert.setup"] }
```

The credits step's description gains the sentence: `It shows how much of today's budget you have used, for example "55/100 today".`

- [ ] **Step 1: Write the failing tests:**
  - Controller: `startExtension` with `budgetDays: () => ['mon','tue','wed','thu','fri']`, `dayZone: 'UTC'` and a Saturday `now` sets a status text containing `day off`.
  - Controller: `onAllowance` is called once per render that shows an allowance and never when stale.
  - Controller: changing what `budgetDays()` returns and calling `rerender()` changes the text.
  - Host suite (`tests/host/suite.ts`): `commands.includes('bobert.setup')`; the manifest's walkthrough steps\[0].id is `bobert.gettingStarted.setup`.

- [ ] **Step 2: Run the tests and see them fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/unit/presentation.test.ts`
Expected: the new controller tests FAIL.

- [ ] **Step 3: Implement** the controller options, the `extension.ts` wiring, `runSetup`, the notice and the walkthrough JSON.

- [ ] **Step 4: Run the checks**

Run: `pnpm typecheck && pnpm test`, then the host suite exactly as [docs/development.md](../../development.md) describes it.
Expected: all pass. If the host suite cannot run locally, say so in the PR; do not skip it silently.

- [ ] **Step 5: Commit**

```bash
git add src/extension/controller.ts src/extension/extension.ts package.json tests/unit/presentation.test.ts tests/host/suite.ts
git commit -S -m "feat: add Bobert: Set Up, the budget days notice and the walkthrough step"
```

### Task 5: Documentation, inventory, review and PR

**Files:**
- Modify:
  - `SPEC.md`: the extension presentation paragraphs (line 40, the allowance paragraph at line 62, line 70);
  - `docs/how-values-are-calculated.md`;
  - `README.md` (the status bar lines 27 and 66);
  - `docs/test-inventory.md`;
  - `CHANGELOG.md`: a new *Unreleased* section at the top with *Added* and *Changed*.

- [ ] **Step 1: Update the docs.**
  - SPEC.md states, in the spec's own words:
    - the day-anchored allowance;
    - the budget-day weights;
    - used today as an observed lower bound from the first update of the local day;
    - that `availablePerDay` and the CLI are unchanged.
  - The CHANGELOG names:
    - the visible change for default users (the allowance stays fixed during the day);
    - the new setting;
    - the setup command;
    - the one-time notice.
  - The test inventory gets rows for:
    - *Today's usage and day budget* (`daily-budget`, `presentation`, A);
    - *Budget days setting* (`identity`, `setup`, A);
    - *Set Up command and walkthrough step* (`setup`, host suite, A, plus **M** for the look of the quick picks in Kiro because quick-pick rendering needs Kiro's own UI);
    - *Budget days notice* (`setup`, A).

- [ ] **Step 2: Run the checks**

Run: `pnpm typecheck && pnpm test && git diff --check`
Expected: all pass, no whitespace errors.

- [ ] **Step 3: Commit**

```bash
git add SPEC.md docs/how-values-are-calculated.md README.md docs/test-inventory.md CHANGELOG.md
git commit -S -m "docs: describe the day budget, budget days and setup"
```

- [ ] **Step 4: Run the independent review.**
  - Write `git diff origin/main...HEAD` to a file in the scratchpad.
  - Dispatch `security-reviewer`. Its brief contains the diff path, the spec path, this plan's Global Constraints and Review Focus, and the check results.
  - Fix the confirmed findings in follow-up signed commits, and re-run `pnpm typecheck && pnpm test`.

- [ ] **Step 5: Push and open the PR.**
  - Push `feat/daily-budget-days` and open a PR against `main`.
  - The PR text is short: summary, checks actually run, limitations (host suite or manual Kiro checks not run), and decisions (link to the proposal and the ROADMAP entry).
  - End the PR text with the attribution line from the session.
  - Do not merge without the maintainer's go-ahead per the session's rules.
