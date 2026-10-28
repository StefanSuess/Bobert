import assert from 'node:assert/strict';
import test from 'node:test';
import { ALL_DAYS } from '../../src/extension/daily-budget.ts';
import { BUDGET_DAYS_NOTICE_KEY, NOTICE_TEXT, WEEKDAYS, budgetDaysNoticeDue, currentDayChoice, currentNoticeChoice, dayWrites, hintWrites, noticeWrites, PromptClaim } from '../../src/extension/setup.ts';

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

test('the prompt claim gives the window one prompt: budget first, then support, then the days notice', () => {
 // The budget notice claimed first (or already shown): the days notice is refused and the budget notice keeps its slot.
 const first = new PromptClaim();
 assert.equal(first.claim('budget'), true); assert.equal(first.held(), 'budget');
 assert.equal(first.claim('days'), false); first.release('days'); assert.equal(first.held(), 'budget');
 // The days notice is open: the budget notice is refused (and consumes nothing), then wins once the days notice closed.
 const second = new PromptClaim();
 assert.equal(second.claim('days'), true);
 assert.equal(second.claim('budget'), false); assert.equal(second.held(), 'days');
 second.release('budget'); assert.equal(second.held(), 'days'); // only the holder releases
 second.release('days'); assert.equal(second.held(), null);
 assert.equal(second.claim('budget'), true);
 // An open or already shown support prompt blocks the days notice, never the budget notice; a refusal leaves the slot free.
 const third = new PromptClaim();
 assert.equal(third.claim('days', true), false); assert.equal(third.held(), null);
 assert.equal(third.claim('budget', true), true);
 const fourth = new PromptClaim();
 assert.equal(fourth.claim('days', false), true); assert.equal(fourth.claim('days', true), true); // re-claim by the holder
});
