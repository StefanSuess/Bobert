import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const usage = readFileSync(new URL('../../docs/usage.md', import.meta.url), 'utf8');

function settingKeys(): string[] {
 const configuration = manifest.contributes.configuration;
 const sections: Array<{ properties?: Record<string, unknown> }> = Array.isArray(configuration) ? configuration : [configuration];
 return sections.flatMap(section => Object.keys(section.properties ?? {}));
}

test('every contributed setting is documented in docs/usage.md', () => {
 const keys = settingKeys();
 assert.ok(keys.length > 0, 'the manifest contributes at least one setting');
 const missing = keys.filter(key => !usage.includes(`\`${key}\``));
 assert.deepEqual(missing, [], `document these settings in docs/usage.md: ${missing.join(', ')}`);
});

test('every contributed setting has a description in the manifest', () => {
 const configuration = manifest.contributes.configuration;
 const sections: Array<{ properties?: Record<string, { description?: string; markdownDescription?: string }> }> = Array.isArray(configuration) ? configuration : [configuration];
 const undescribed = sections.flatMap(section => Object.entries(section.properties ?? {})).filter(([, value]) => !value.description && !value.markdownDescription).map(([key]) => key);
 assert.deepEqual(undescribed, []);
});
