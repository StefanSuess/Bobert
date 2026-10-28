// Pure setup choices, the one-time notice rule and the per-window prompt claim. No vscode import: extension.ts wires these into the UI.
import { ALL_DAYS, type BudgetDay } from './daily-budget.ts';

export type SetupWrite = { key: 'budgetDays' | 'budgetWarnings' | 'budgetWarningPercent' | 'sessionHints'; value: unknown };
export type DayChoice = 'every_day' | 'weekdays' | 'custom';
export type NoticeChoice = 'notify_80' | 'notify_90' | 'off';
export const WEEKDAYS: readonly BudgetDay[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
export const BUDGET_DAYS_NOTICE_KEY = 'bobert.budgetDaysNotice.v1';
export const NOTICE_TEXT = 'New: spread your daily budget only over the days you work?';

const same = (a: readonly BudgetDay[], b: readonly BudgetDay[]) => a.length === b.length && b.every(d => a.includes(d));
export function currentDayChoice(days: readonly BudgetDay[]): DayChoice {
 return same(days, ALL_DAYS) ? 'every_day' : same(days, WEEKDAYS) ? 'weekdays' : 'custom';
}
export function dayWrites(choice: 'every_day' | 'weekdays' | readonly BudgetDay[]): SetupWrite[] {
 const days = choice === 'every_day' ? ALL_DAYS : choice === 'weekdays' ? WEEKDAYS : ALL_DAYS.filter(d => choice.includes(d));
 return [{ key: 'budgetDays', value: [...days] }];
}
export function currentNoticeChoice(enabled: boolean, percent: number): NoticeChoice | null {
 return !enabled ? 'off' : percent === 80 ? 'notify_80' : percent === 90 ? 'notify_90' : null;
}
export function noticeWrites(choice: NoticeChoice): SetupWrite[] {
 if (choice === 'off') return [{ key: 'budgetWarnings', value: false }];
 return [{ key: 'budgetWarnings', value: true }, { key: 'budgetWarningPercent', value: choice === 'notify_80' ? 80 : 90 }];
}
export function hintWrites(on: boolean): SetupWrite[] {
 return [{ key: 'sessionHints', value: on }];
}
export function budgetDaysNoticeDue(i: { kiro: boolean; testing: boolean; stored: unknown; newUser: boolean; daysSet: boolean; otherPromptShown: boolean; allowanceShown: boolean }): boolean {
 return i.kiro && !i.testing && i.stored === undefined && !i.newUser && !i.daysSet && !i.otherPromptShown && i.allowanceShown;
}

export type PromptKind = 'budget' | 'days';
/**
 * One Bobert notice at a time per window. Priority: budget notice, then the support prompt, then the budget days notice.
 * A notice claims synchronously, after its own due decision and before its first await. A refused claim consumes nothing: the caller just does not show this time.
 * The budget notice keeps its claim for the rest of the window once shown; the days notice releases it when it closes.
 */
export class PromptClaim {
 #holder: PromptKind | null = null;
 claim(kind: PromptKind, supportBusy = false): boolean {
  if (this.#holder === kind) return true;
  if (this.#holder !== null) return false;
  if (kind === 'days' && supportBusy) return false;
  this.#holder = kind;
  return true;
 }
 release(kind: PromptKind): void { if (this.#holder === kind) this.#holder = null; }
 held(): PromptKind | null { return this.#holder; }
}

/**
 * Runs Set Up's steps in order; a start while steps are open is ignored. Each step resolves false when the user ends it (Escape).
 * The closing confirmation runs after the guard is released, so a confirmation left in the notification centre never blocks the next run.
 * Failures stay silent: a failed setup never affects the gauge.
 */
export function setupRunner(): (steps: readonly (() => Promise<boolean>)[], confirm?: () => Promise<void>) => Promise<void> {
 let open = false;
 return async (steps, confirm) => {
  if (open) return;
  open = true;
  let finished = false;
  try {
   finished = true;
   for (const step of steps) if (!(await step())) { finished = false; break; }
  } catch { finished = false; } finally { open = false; }
  if (finished && confirm) try { await confirm(); } catch { /* fixed and silent */ }
 };
}
