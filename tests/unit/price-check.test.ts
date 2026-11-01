import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkPricing, checkModels, combine, pageText, report } from '../../scripts/price-check.ts';
import { reviewedCatalog } from '../../src/cost/catalog.ts';
import { MODELS } from '../../src/session/models.ts';

// Synthetic page text built from the catalog itself; no real page content is stored.
const pricingPage = (): string => reviewedCatalog.plans.map(p => `<li>${p.id} $${p.fee} per month, ${Number(p.credits).toLocaleString('en-US')} credits</li>`).join('') + '<p>Extra credits cost $0.04 each.</p>';
const modelsPage = (): string => MODELS.filter(m => m.flag !== 'silent').map(m => `<tr><td>${m.name}</td><td>${m.multiplier}x</td></tr>`).join('');

test('the pricing check passes on a page that matches the catalog and names the plan whose figure changed', () => {
 const text = pageText(pricingPage());
 assert.deepEqual(checkPricing(text), { status: 'ok', findings: [] });
 const changed = checkPricing(text.replace('$40', '$45'));
 assert.equal(changed.status, 'differs');
 assert.match(changed.findings.join('\n'), /fee \$40/);
 assert.equal(checkPricing(text.replace('$0.04', '$0.05')).status, 'differs');
 assert.equal(checkPricing(text.replace('2,000 credits', '2,500 credits')).status, 'differs');
});

test('page text decodes entities once and collapses whitespace',()=>{
 assert.equal(pageText('<p>A&nbsp;&amp;\n B</p><script>x</script>&amp;#36;5'),'A & B &#36;5');
});

test('a page that no longer looks like the known one is unverified, never a difference', () => {
 assert.equal(checkPricing('Page not found').status, 'unverified');
 assert.equal(checkModels('Page not found').status, 'unverified');
 assert.equal(checkPricing('').status, 'unverified');
});

test('the models check compares each multiplier next to its model name', () => {
 const text = pageText(modelsPage());
 assert.deepEqual(checkModels(text), { status: 'ok', findings: [] });
 const changed = checkModels(text.replace(/(Claude Haiku 4\.5\s+)0\.4x/, '$10.5x'));
 assert.equal(changed.status, 'differs');
 assert.match(changed.findings.join('\n'), /Claude Haiku 4\.5: the page shows 0\.5x, the table has 0\.4x/);
 const removed = checkModels(text.replace('GLM-5', 'Something else'));
 assert.match(removed.findings.join('\n'), /GLM-5 is not on the models page any more/);
});

test('a readable difference outranks an unverifiable page, and the report is plain text with the two public sources', () => {
 const diff = { status: 'differs' as const, findings: ['x'] }, unk = { status: 'unverified' as const, findings: ['y'] }, ok = { status: 'ok' as const, findings: [] };
 assert.equal(combine([diff, unk]).status, 'differs');
 assert.equal(combine([ok, unk]).status, 'unverified');
 assert.equal(combine([ok, ok]).status, 'ok');
 const text = report(combine([diff, unk]), '2030-06-01');
 assert.match(text, /^# Kiro price check 2030-06-01/);
 assert.match(text, /https:\/\/kiro\.dev\/pricing\/ and https:\/\/kiro\.dev\/docs\/models\//);
});

test('the weekly workflow is read-only except for issues, pinned, secret-free and fetches nothing but the two pages', () => {
 const wf = readFileSync(new URL('../../.github/workflows/price-check.yml', import.meta.url), 'utf8');
 assert.match(wf, /^permissions:\n  contents: read\n  issues: write$/m);
 assert.match(wf, /^on:\n  schedule:\n    - cron: '[^']+'\n  workflow_dispatch:/m);
 assert.doesNotMatch(wf, /secrets\./);
 for (const line of wf.split('\n').filter(l => /^\s*- uses:/.test(l))) assert.match(line, /@[0-9a-f]{40} # v/);
 const script = readFileSync(new URL('../../scripts/price-check.ts', import.meta.url), 'utf8');
 assert.deepEqual([...new Set(script.match(/https:\/\/[^\s'"`)]+/g))].sort(), ['https://kiro.dev/docs/models/', 'https://kiro.dev/pricing/']);
});
