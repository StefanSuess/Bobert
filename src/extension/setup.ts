// Pure setup choices and the one-time notice rule. No vscode import: Task 4 wires these into the UI.
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
