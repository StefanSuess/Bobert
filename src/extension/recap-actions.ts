// Fixed vocabulary shared by the extension and the dashboard script (no Node or editor API): the result codes the extension answers an action
// with, and the only texts the page shows for them. A reply never carries a path, a value or an error message.
export const ACTION_CODES = ['saved', 'image_copied', 'image_unsupported', 'copied', 'dismissed', 'cancelled', 'failed', 'busy', 'refused_target', 'invalid_image', 'no_history', 'multiple_accounts', 'unavailable'] as const;
export type ActionCode = (typeof ACTION_CODES)[number];
export const ACTION_NAMES = ['exportCsv', 'copyRecapText', 'dismissRecap', 'saveRecapImage', 'shareRecap'] as const;
export type ActionName = (typeof ACTION_NAMES)[number];

export const ACTION_TEXT: Record<ActionCode, string> = {
 saved: 'Saved. Check the file before you share it.',
 image_copied: 'Image copied. Paste it into Teams, Slack, an email or a post with Ctrl+V (⌘V on a Mac).',
 image_unsupported: 'The image could not be copied here. Use Save image… and attach the file instead.',
 copied: 'Recap text copied.',
 dismissed: 'Recap dismissed.',
 cancelled: 'Nothing was saved.',
 failed: 'This could not be completed.',
 busy: 'Please wait a moment and try again.',
 refused_target: 'That location is not allowed. Choose a folder outside Kiro and Bobert storage, and not a link or special file.',
 invalid_image: 'The image could not be checked, so nothing was saved.',
 no_history: 'There are no account updates to export yet.',
 multiple_accounts: 'No CSV export: the retained updates come from more than one account, or the account could not be established, so they are not combined.',
 unavailable: 'This is not available right now.',
};
