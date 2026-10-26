# Forecast gaps lower confidence instead of restarting — design proposal

Status: **approved by the maintainer on 2026-10-26** for three parts:

- **A:** gaps lower confidence instead of restarting (this document's original proposal);
- **B:** show the allowance instead of a bare "Collecting data";
- **C:** an at-least average since cycle start, as a lower bound.

These change the forecast policy and the JSON forecast contract. Forecasts are high-risk, so the implementation needs independent review.

**Outcome:** only **B and C shipped**. Part A was implemented and then **withdrawn after the backtest**; it remains a proposal.

Backtest: synthetic "gappy" worlds, in which the last update before a weekend is missing, 10-day warm-up.
- Part A raised coverage on Mondays from 55% to 95% (held-out).
- On the points it newly covered, the projected usage at reset was:
  - typically 4–8% too low (median);
  - 40–48% too low in the worst tenth of cases;
  - more than 10% too low on 41 of 102 held-out points.
- Material underprediction in `all` rose by 2.6 percentage points, against a limit of 1.
- Cause: a short window that contains a weekend over-weights low-use days. A revised Part A needs weekday-aware rates, or must never reassure from a gap-spanning window.

Goal: "Collecting data" alone should almost never be shown. Whenever a fresh account update exists, the user sees what is certain: credits left, days left, the daily allowance, and how much they have used per day at least so far.

## Problem

An interval between two comparable account updates that is longer than 36 hours **and** has a changed counter is an `observation_gap` (`src/history.ts`). `forecast()` treats every non-comparable interval as a barrier: in-cycle windows (`observed_window`, `rolling_7_day`, `cycle_to_date`) start only after the last one (`cleanStart` in `src/forecast.ts`).

For someone who works on weekdays, Friday evening to Monday morning is about 64 hours. If any usage happened after Friday's last update, Monday's first update creates a gap and:

- the provisional estimate disappears and the view says *Forecast not ready yet* until Wednesday (48 hours after the gap);
- `rolling_7_day` and `cycle_to_date` can never qualify, because every 7-day window contains a weekend;
- only the pooled history methods (`history_7_day` and longer) survive weekends. They need about 6 observed days, 8 updates and 4 update days, so the first one to two weeks are affected most.

**Synthetic check against the current code** (2026-10-26):

- Setup: an invented weekday worker with updates Monday to Friday at 07, 11, 15 and 17 UTC, and usage after the last Friday update.
- `history_7_day` is `insufficient_exposure` on **every Monday**. Its window ends at the start of the latest UTC day, so the weekend interval, which ends on Monday morning, is cut off.
- Overall:
  - no forecast at all on Mondays in weeks 1–4;
  - from week 2, `history_7_day` qualifies again on Tuesday;
  - only from week 5 does `history_28_day` also cover Mondays.

A maintainer's real installation also showed *Forecast not ready yet* on a Monday. Its main cause, however, was a stretch of more than 5 days with no account updates at all, not a weekend. Neither this proposal nor its 96-hour cap would bridge that, and it should not: those days are genuinely unobserved. This shows the weekend fix does not solve every "collecting" case.

This is a policy result, not missing data: the net change across the gap is known exactly. Only *when* inside the gap it happened is unknown.

## Proposal

### Principle

A gap means the path is unknown, not the total. A window may include short gaps. The rate is then the exact average over the whole window, including the gap. The estimate carries a note and a lower-confidence marker instead of being withdrawn. Days inside the gap stay unknown in the history; nothing is spread across days.

### Rules

1. **Soft and hard gaps.** Keep the existing `observation_gap` label for a changed interval over 36 hours (chart, coverage and gap list unchanged).
   - A *soft gap* is an `observation_gap` of at most **96 hours**. 96 hours covers a long weekend: Friday afternoon to Tuesday morning.
   - A changed interval over 96 hours becomes a *long gap* (`long_observation_gap`) and stays a barrier, as today.
2. **Hard barriers unchanged.** `usage_adjustment`, `limit_change`, `conflicting_snapshots`, `missing_billing`, `unsupported_extra_credits`, cycle changes, a long gap and every existing `block()` reason (`stale`, `reset_elapsed` …) still restart or block in-cycle windows exactly as today.
3. **In-cycle windows may include soft gaps.** `cleanStart` is computed from hard barriers only. A window that contains soft gaps qualifies only if, in addition to its current requirements, **no single interval is longer than half of the window** (`maximumSingleIntervalShare: '1/2'`, the rule the pooled methods already use; exactly half passes). Candidate start points are:
   - the first update after the last hard barrier;
   - then the first update after each soft gap, from oldest to newest.

   The first (longest) candidate that meets all requirements is used. The last candidate is today's window, so v4 never qualifies less often than v3.
4. **Same tier thresholds.**
   - Provisional: 3 updates over 48 hours.
   - Regular: 8 updates over 7 days.
   - Updates are counted as today; a gap never counts as an update.
5. **Arithmetic unchanged.** The rate is `(latest usage − window start usage) / window duration`, computed with exact decimals. Projection, exhaustion and budget comparison stay the same formulas.
6. **Pooled history methods unchanged**, including break exclusion, and so is the selection order. Recent trend uses the same validity check as `rolling_7_day`.
7. **Freshness unchanged.** On Monday, before Kiro writes its first update, Friday's update is older than 24 hours, so the forecast still pauses as `stale`. That is a separate question and not part of this proposal.

### Contract changes (schema and policy version 4)

- Policy `maximumGapHours: 36` is replaced by:
  - `gapThresholdHours: 36`: the point above which a changed interval is labelled a gap;
  - `maximumSoftGapHours: 96`.
- The policy-level `maximumSingleIntervalShare: '1/2'` now also applies to in-cycle windows.
- Two new fields on each estimate:
  - `gapMilliseconds`: the sum of soft gaps inside the window, `0` when there are none, `null` for pooled methods;
  - `longestIntervalMilliseconds`.
- A new estimate reason `includes_observation_gap` and a result assumption `window_includes_observation_gap` appear when the selected estimate has `gapMilliseconds > 0`.
- The new history interval status is `long_observation_gap`.
- No identifiers, paths or raw values are added. Store and collector are unchanged; this is a pure recalculation over the snapshots already stored.

## Part B: allowance instead of a bare "Collecting data"

`forecast()` already computes `remainingBaseCredits` and `dynamicDailyBudget` before any window check, so both exist while collecting. Presentation only, no core change.

When the forecast is not eligible, not stale, and `availablePerDay` is known (today's *collecting* state):

- **Status bar text:** `<remaining> left • <allowance>/day` instead of `Collecting data`.
  - Both numbers use the existing truncating `compact()`.
  - No warning icon and no warning background, unless the Part C floor is above the allowance. Then the status bar warns like any other budget risk.
  - The tooltip keeps the collecting explanation.
- **Detail heading:** `Up to <allowance> credits/day until the reset` instead of `Collecting data`.
- **Detail explanation:** `<remaining> credits left and <days> until the reset on <date>, so up to <allowance> per day.` followed by the Part C sentence when it is available, then the existing collecting explanation.
- **Tier line:** `Forecast not ready yet — more history needed` stays, so it remains clear there is no forecast of the pace yet.
- **Never shown in this state:** "On track", a projection, an exhaustion date or a forecast trajectory.

If `availablePerDay` is unknown (missing billing, reset passed), today's behaviour stays unchanged.

## Part C: at-least average since cycle start (lower bound)

Kiro's public billing documentation says only that plan credits renew at the start of the next billing cycle. It does not document when a cycle starts. The first paid month after leaving the free plan is prorated, and upgrades recalculate the month. So the exact cycle start must not be derived from the reset date.

What is safe is a **lower bound**, under one stated assumption: *a billing cycle lasts at most 31 days* (`maximum_cycle_length_assumed`).

**Definitions**
- `earliestStart = resetAt − 31 days`.
- When an evidence-backed `cycleStartAt` exists, `start = cycleStartAt` and the basis is `evidence_cycle_start`.
- Otherwise `start = earliestStart` and the basis is `maximum_cycle_length`.
- `floorRatePerDay = latest.usage / (latest.observedAt − start)`, with the existing exact decimal helpers, truncated like the other rates.

**Why it is a lower bound**
The current-cycle usage counter covers the time since the real start. The real start is never earlier than `start`. So the real average is at least the floor.

**Gates.** The floor exists only when `forecast()` reaches the window checks, so every existing `block()` reason (stale, reset passed, missing billing, unsupported extra credits …) also suppresses it. In addition it is unavailable when:
- `observedAt − start` is not positive;
- the first update of the current cycle is earlier than `earliestStart` (`cycle_longer_than_assumed`: the assumption is contradicted, so stay silent).

**Contract.** A new top-level field on `ForecastResult`:

```
cycleAverageFloor: null | {
  ratePerDay,
  from: start,
  to: observedAt,
  basis: 'evidence_cycle_start' | 'maximum_cycle_length',
  projectedUsageAtResetFloor,
  budgetComparison
}
```

- `projectedUsageAtResetFloor = usage + floorRate × time until reset`.
- `budgetComparison` compares `floorRatePerDay` with the daily budget, using the same comparison as the estimates.

**Selection.** The floor is **not** an estimate. It is not in `estimates`, never becomes `selectedMethod`, never sets `tier` or `status`, and the backtest is unaffected.

**UI**
- Used only when no eligible forecast is shown. Sentence: `So far this cycle you have used at least <floor> credits per day on average.`
- When the basis is `maximum_cycle_length`, add: `(assuming the cycle started no earlier than <date>; if it started later, your average was higher)`.
- If `budgetComparison` is `above_budget`, add: `Even this minimum is above your daily allowance.` and use the warning tone, without "Likely to exceed" and without an exhaustion date.
- A floor below the allowance never produces "On track".
- Added after independent review:
  - With no base credits left, the old collecting text stays.
  - The floor sentence needs a floor of at least 0.1.
  - The warning needs a floor spanning at least one day whose displayed value is above the displayed allowance.
  - A reduced-precision latest update withholds the floor.

## UI wording (draft)

| Place | Today | Proposed |
| --- | --- | --- |
| Detail view note, only when the selected estimate has a gap | — | **Includes a break without updates.** This estimate spans 2.6 days with no account updates (for example a weekend). Usage in that time is known only as a total, so the rate is the average over the whole window, including the break. |
| Status bar tooltip addendum | — | Includes a break without account updates; rate is an average. |
| Collecting explanation (`insufficient_comparable_coverage`) | Keep using Kiro. A first estimate appears after about 2 days and 3 account updates; a regular forecast after 7 days. | Keep using Kiro. A first estimate appears after about 2 days and 3 account updates; a regular forecast after 7 days. A short break such as a weekend doesn't restart this. |
| Collecting policy (Advanced details) | … Gaps and billing changes can restart this window. | … A break of up to 4 days without updates is included as an average and noted. Longer breaks, billing changes and corrections restart this window. |
| Policy sentence in Data quality | Positive gaps over 36 hours are barriers for in-cycle methods … | Positive gaps over 36 hours are included in in-cycle windows up to 96 hours if no single interval exceeds half the window; the rate is then an average across the gap. Longer gaps remain barriers … |
| Advisor condition (`advisor-presentation.ts`) | — | `window_includes_observation_gap`: The forecast includes a period without account updates and uses the average over it. |

The tier labels (*Provisional estimate — limited history*, *Regular forecast*) and the chart's *Observation gap — daily path unknown* stay unchanged. The note says "2.6 days" with one decimal, truncated.

## Synthetic test cases

All data is invented, in the style of `tests/unit/forecast.test.ts`:

- base limit `1000`, reset `2030-07-01T00:00:00Z`, one synthetic account;
- all times are UTC;
- each case is evaluated one hour after its last update unless stated otherwise.

| # | Case | Updates (time → usage) | Expected v4 | Today (v3) |
| --- | --- | --- | --- | --- |
| G1 | First week, weekend gap | Tue 06-04 09:00 → 0, Tue 17:00 → 10, Wed 06-05 09:00 → 12, Wed 17:00 → 22, Thu 06-06 09:00 → 25, Thu 17:00 → 35, Fri 06-07 09:00 → 38, Fri 17:00 → 48, Mon 06-10 09:00 → 60 | `observed_window`: provisional, window 6 days, rate `10`, `gapMilliseconds` 230400000 (64 h), assumption `window_includes_observation_gap` | Unavailable (`insufficient_comparable_coverage`) |
| G2 | Install on Friday, share boundary | Fri 06-07 09:00 → 0, Fri 17:00 → 8, Mon 06-10 09:00 → 12, Tue 06-11 09:00 → 20, Tue 17:00 → 28, Wed 06-12 17:00 → 40 | Unavailable at Mon 10:00 and at Tue 18:00 (gap 64 h > half the span). Qualifies at Wed 18:00: span 128 h, exactly half passes, with the gap noted. With one ms less span, the post-gap window (Mon 09:00 to Wed 17:00, 56 h) qualifies instead, without a note | Provisional from Wed (clean Mon to Wed window); assert no earlier qualification is lost |
| G2b | Fallback to the post-gap window | Fri 06-07 09:00 → 0, Fri 17:00 → 8, Mon 06-10 09:00 → 12, Tue 06-11 09:00 → 20, Wed 06-12 09:00 → 30 | At Wed 10:00 the full window (120 h, gap 64 h > half) fails. The Mon to Wed window (48 h, 3 updates) qualifies as provisional, with `gapMilliseconds` 0 and no note | Same provisional estimate |
| G3 | Soft gap cap | Long weekday history. A changed gap of exactly 96 h passes; 96 h + 1 ms becomes `long_observation_gap` and restarts the window | As described | Both restart |
| G4 | Hard barriers unchanged | G1 with `usage_adjustment`, `limit_change`, conflicting or `missing_billing` inside the window | Window restarts after the barrier, exactly as v3; existing barrier tests unchanged and green | Same |
| G5 | Unchanged counter over a long interval | Fri 17:00 → 48, Mon 09:00 → 48 | Comparable as today, `gapMilliseconds` 0, no note | Same |
| G6 | Regular tier across weekends | 15 weekdays with two updates each, a changed counter every weekend, cycle start observed | `observed_window` regular; `cycle_to_date` and `rolling_7_day` qualify when their boundaries are observed. Pooled estimates byte-identical to v3. Selection order unchanged | `rolling_7_day` and `cycle_to_date` never qualify |
| G7 | Monday before the first update | G1 without the Monday update, evaluated Mon 06-10 09:00 | `stale` (unchanged, documents the open question) | Same |
| G8 | Exact decimals, unknown days | G1 with usage `0.125` at the start and `60.625` at the end | Rate `10.083333` (truncated, 6 decimals). History days 06-08 and 06-09 stay `netChange: null`. Nothing is spread across them | — |
| G9 | Projection formula | G1 | `projectedUsageAtReset = 60 + 10 × horizon days`, equal to v3's formula for a gap-free window with the same endpoints | — |
| G10 | JSON contract | G1 via `view()` and CLI `--json` | `schemaVersion` 4, the new policy and estimate fields, no new identity, source or path fields (privacy check) | — |
| G11 | UI | `present()` with G1 and with a gap-free window | Note and tooltip addendum only when the selected estimate has `gapMilliseconds > 0`. Collecting texts updated. Tier labels unchanged | — |
| G12 | Trend | G6 with exact 7- and 14-day boundaries observed | `recentTrend` computed across soft gaps, same validity as `rolling_7_day` | `unavailable` |

### Parts B and C

| # | Case | Expected |
| --- | --- | --- |
| C1 | One update, `2030-06-25T00:00:00Z` → usage `620`, limit 1000, reset `2030-07-01`, no evidence-backed cycle start | Start `2030-05-31T00:00:00Z` (reset − 31 days). Floor rate `620 / 25 = 24.8`. Basis `maximum_cycle_length`. `projectedUsageAtResetFloor = 620 + 24.8 × 6 = 768.8`. Budget `380 / 6 = 63.333333` → `within_budget`. `selectedMethod` is null and `status` unavailable |
| C2 | Evidence-backed cycle start `2030-06-01T00:00:00Z` (prior update with that reset), latest `2030-06-11T00:00:00Z` → 300 | Start `2030-06-01`, basis `evidence_cycle_start`, rate `30` |
| C3 | First update of the cycle is earlier than reset − 31 days | `cycleAverageFloor` null (`cycle_longer_than_assumed`) |
| C4 | Stale, reset passed, missing billing or unsupported extra credits | `cycleAverageFloor` null |
| C5 | Floor above the budget: usage 900 at C1's time | Rate `36`; budget `100 / 6 = 16.666666` → `above_budget` |
| C6 | Floor present while a regular forecast is selected | Selection, tier and estimates byte-identical to the result without the floor |
| B1 | `present()` while collecting with C1 | Status bar `380 left • 63.3/day`. Heading `Up to 63.3 credits/day until the reset`. The floor sentence includes the assumption clause. No "On track", no warning icon |
| B2 | `present()` while collecting with C5 | Warning tone plus the "Even this minimum…" sentence, no "Likely to exceed", no exhaustion date |
| B3 | `present()` while stale or with an eligible forecast | Unchanged from today |

### Backtest acceptance

Add a candidate `v4_soft_gap` to `tests/unit/backtest.ts` and report it next to `v3_break` for the `all`, `monday` and `weekend` segments:

- **Coverage:** the share of evaluation points with a qualified forecast. Expected to rise in `monday`.
- **Material underprediction:** projection more than 10% below the realized total. Must not rise by more than 1 percentage point in `all` (threshold to be confirmed).
- **Median absolute error and forecast churn**, for information.

If underprediction regresses, the fallback is to keep soft gaps for the provisional tier only.

## Likely touched files at implementation

- `src/history.ts`
- `src/forecast.ts`
- `src/extension/presentation.ts`
- `src/extension/advisor-presentation.ts`
- `tests/unit/forecast.test.ts`, `history.test.ts`, `backtest.ts`, the presentation tests
- `SPEC.md` (forecast policy paragraph)
- `docs/forecasting.md`, `docs/how-values-are-calculated.md`

No storage, collector or source-reading change.

## Open questions for the maintainer

1. Is a 96-hour cap right, or should the share rule alone decide (no cap)?
2. Should soft gaps also be allowed for the regular tier and `cycle_to_date`, or for the provisional tier only?
3. Is the backtest threshold (at most 1 percentage point more material underprediction) acceptable?
4. Should the Monday `stale` pause get its own follow-up? For example, keep showing the last estimate marked "last update Friday" instead of pausing.
