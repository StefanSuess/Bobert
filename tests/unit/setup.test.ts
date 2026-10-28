import assert from 'node:assert/strict';
import test from 'node:test';
import { ALL_DAYS } from '../../src/extension/daily-budget.ts';
import { BUDGET_DAYS_NOTICE_KEY, NOTICE_TEXT, WEEKDAYS, budgetDaysNoticeDue, currentDayChoice, currentNoticeChoice, dayWrites, hintWrites, noticeWrites } from '../../src/extension/setup.ts';

test('WEEKDAYS is mon..fri and the notice constants are fixed', () => {
 assert.deepEqual([...WEEKDAYS], ['mon', 'tue', 'wed', 'thu', 'fri']);
 assert.equal(BUDGET_DAYS_NOTICE_KEY, 'bobert.budgetDaysNotice.v1');
 assert.equal(NOTICE_TEXT, 'New: spread your daily budget only over the days you work?');
});
test('currentDayChoice classifies the days', () => {
 assert.equal(currentDayChoice(ALL_DAYS), 'every_day');
 assert.equal(currentDayChoice(['fri', 'mon', 'wed', 'thu', 'tue']), 'weekdays');
 assert.equal(currentDayChoice(['mon', 'wed']), 'custom');
 assert.equal(currentDayChoice([]), 'custom');
});
test('dayWrites writes the exact days', () => {
 assert.deepEqual(dayWrites('every_day'), [{ key: 'budgetDays', value: [...ALL_DAYS] }]);
 assert.deepEqual(dayWrites('weekdays'), [{ key: 'budgetDays', value: ['mon', 'tue', 'wed', 'thu', 'fri'] }]);
 assert.deepEqual(dayWrites(['sun', 'wed', 'mon']), [{ key: 'budgetDays', value: ['mon', 'wed', 'sun'] }]);
});
test('currentNoticeChoice maps switch and percent', () => {
 assert.equal(currentNoticeChoice(true, 80), 'notify_80');
 assert.equal(currentNoticeChoice(true, 90), 'notify_90');
 assert.equal(currentNoticeChoice(false, 80), 'off');
 assert.equal(currentNoticeChoice(true, 75), null);
});
test('noticeWrites writes the exact settings', () => {
 assert.deepEqual(noticeWrites('notify_80'), [{ key: 'budgetWarnings', value: true }, { key: 'budgetWarningPercent', value: 80 }]);
 assert.deepEqual(noticeWrites('notify_90'), [{ key: 'budgetWarnings', value: true }, { key: 'budgetWarningPercent', value: 90 }]);
 assert.deepEqual(noticeWrites('off'), [{ key: 'budgetWarnings', value: false }]);
});
test('hintWrites writes sessionHints', () => {
 assert.deepEqual(hintWrites(true), [{ key: 'sessionHints', value: true }]);
 assert.deepEqual(hintWrites(false), [{ key: 'sessionHints', value: false }]);
});
test('budgetDaysNoticeDue needs every condition', () => {
 const ok = { kiro: true, testing: false, stored: undefined as unknown, newUser: false, daysSet: false, otherPromptShown: false, allowanceShown: true };
 assert.equal(budgetDaysNoticeDue(ok), true);
 for (const flip of [{ kiro: false }, { testing: true }, { stored: true }, { stored: 1 }, { newUser: true }, { daysSet: true }, { otherPromptShown: true }, { allowanceShown: false }]) {
  assert.equal(budgetDaysNoticeDue({ ...ok, ...flip }), false, JSON.stringify(flip));
 }
});
