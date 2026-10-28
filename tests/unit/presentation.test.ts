import { test } from 'node:test';
import assert from 'node:assert/strict';
import { view } from '../../src/view.ts';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { present } from '../../src/extension/presentation.ts';
import { ALL_DAYS, type BudgetDay } from '../../src/extension/daily-budget.ts';
import { largerPlanText, rightSizeText } from '../../src/extension/budget-warning.ts';
import { ESTIMATE_MARKER } from '../../src/extension/advisor-presentation.ts';
import { startExtension } from '../../src/extension/controller.ts';
import type { AuditSummary } from '../../src/extension/audit-model.ts';
import { syntheticSnapshot as snapshot } from './synthetic.ts';
const series=(rate:number,limit='1000',count=8)=>Array.from({length:count},(_,i)=>snapshot(`2030-06-${String(i+1).padStart(2,'0')}T00:00:00Z`,String(i*rate),{limit}));
const render=(rate:number,limit='1000',count=8,now=`2030-06-${String(count).padStart(2,'0')}T00:00:00Z`)=>present(view(series(rate,limit,count),now),[],'','',undefined,now);

test('status emphasizes daily budget and outlook without repeating balance',()=>{
 const r=render(10);assert.equal(r.text,'$(gauge) Kiro credits: On track • 0/40.4 today');
 assert.ok(!r.text.includes('930'));assert.match(r.tooltip,/Regular forecast/);
 assert.match(r.tooltip,/^Today: 0 of 40\.4 credits used \(since your first Kiro update at 00:00\)$/m);assert.match(r.tooltip,/Observed rate: 10 credits per day/);
 assert.match(r.html,/<dd class="muted small">Today: 0 of 40\.4 used<\/dd>/);assert.match(r.html,/Credits left/);
 assert.match(r.html,/id="status-heading"/);assert.match(r.html,/Data quality \/ notes/);
 assert.ok(r.html.indexOf('class="stats"')<r.html.indexOf('Observed history'));
});
test('regular tight and over-budget states reflect the modeled budget and conditional exhaustion',()=>{
 assert.match(render(10,'321').text,/At risk • 0\/10\.9 today/);
 assert.match(render(10,'300').text,/At risk/); // Rate equals budget, no exhaustion before reset.
 const r=render(10,'100');assert.match(r.text,/Likely to exceed • runs out 11 Jun/);
 assert.equal(r.warning,true);assert.match(r.html,/your credits run out on 11 Jun 2030 \(UTC\), before the reset on 1 Jul/);
 assert.match(r.html,/UTC/);
 assert.match(render(10,'60').text,/Above reported limit/);assert.match(render(10,'70').text,/Reported limit reached/);
 assert.match(render(0).text,/On track/);assert.match(render(0).html,/no run-out date is projected/);
});
test('provisional tier remains visible even when the early rate predicts exhaustion',()=>{
 const r=render(10,'1000',3);assert.match(r.text,/Provisional • 0\/35 today/);
 assert.match(r.html,/<span class="tag">Based on limited history<\/span>/);assert.ok(!r.html.includes('Regular forecast</span>'));
 assert.match(r.html,/limited window may not represent future usage/);
 const risk=render(10,'25',3);assert.match(risk.text,/Provisional • runs out 3 Jun/);
 assert.match(risk.tooltip,/Likely to exceed/);assert.equal(risk.warning,true);
});
test('collecting, stale and unsafe data never display reassuring outlooks',()=>{
 const collecting=render(10,'1000',1);assert.equal(collecting.text,'$(gauge) Kiro credits: 1000 left • 0/33.3 today');
 assert.match(collecting.html,/Keep using Kiro\. A first estimate appears after about 2 days and 3 account updates; a regular forecast after 7 days\./);
 assert.match(collecting.html,/at least 48 hours/);assert.match(collecting.html,/at least 7 days/);
 const stale=render(10,'1000',8,'2030-06-09T00:00:00.001Z');assert.match(stale.text,/Stale data/);
 assert.match(stale.html,/Forecast paused — the last account update is too old\. Use Kiro for a few minutes to get a fresh one\./);assert.ok(!stale.text.includes('/day'));assert.ok(!stale.text.includes('today'));
 const accounts=series(10);accounts[2].partition='synthetic-other';
 assert.match(present(view(accounts,'2030-06-08T00:00:00Z')).text,/Unavailable/);
 const extras=series(10).map(p=>({...p,flags:['unsupported_extra_credits']}));
 assert.match(present(view(extras,'2030-06-08T00:00:00Z')).text,/Unavailable/);
 assert.match(render(10,'1000',8,'2030-07-01T00:00:00Z').text,/Unavailable/);
});
test('presentation preserves exact amounts and private keys stay absent',()=>{
 const r=present(view([snapshot('2030-06-01T00:00:00Z','0.123456789')],'2030-06-01T00:00:00Z'));
 assert.match(r.html,/0\.123456789/);
 for(const marker of ['synthetic-private','partition','sourceTimezone']) assert.ok(!r.html.includes(marker));
 assert.match(r.html,/default-src 'none'/);
});

test('headline live region contains only the changing credit figure', () => {
 const html = render(10).html;
 assert.match(html, /<dd id="usage-live" aria-live="polite" aria-atomic="true">70<\/dd>/);
 assert.equal((html.match(/aria-live=/g) ?? []).length, 1);
});

test('static view gives today\'s usage since the first update, with the allowance and no short-window allocation claim', () => {
 const points = [snapshot('2030-06-08T00:40:00Z', '1.1'), snapshot('2030-06-08T02:50:00Z', '2.223456789')];
 const html = present(view(points, '2030-06-08T02:51:00Z'), [], '', '', undefined, '2030-06-08T02:51:00Z').html;
 assert.match(html, /<h3>Today<\/h3><p>Since 00:40: 1\.123456789 credits used, as of 8 Jun 2030, 02:50 UTC\. Today&#39;s allowance: 43\.4 credits\./);
 assert.ok(!html.includes('24-hour allocation as of the last update'));
});

// v0.5.1 progressive disclosure: concise default reading flow, one collapsed Advanced details section.
const split=(html:string)=>{const i=html.indexOf('<section id="advanced-details"');assert.ok(i>0);return {primary:html.slice(0,i),advanced:html.slice(i)};};
const visible=(html:string)=>{
 let current=html,previous:string;
 do{
  previous=current;
  current=current.replace(/<(title|desc|style)\b[\s\S]*?<\/\1>/g,'');
 }while(current!==previous);
 return current.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
};

test('default view is concise and exactly one Advanced details section is collapsed',()=>{
 const {html}=render(10);const {primary,advanced}=split(html);
 assert.equal((html.match(/<details class="advanced">/g)??[]).length,1);
 assert.ok(!/<details[^>]*\bopen\b/.test(html),'no details element is expanded by default');
 assert.match(advanced,/<summary>Advanced details<\/summary>/);
 for(const technical of ['Forecast methods','Quality codes','Exact billing reset','Forecast qualifiers','Chart data table','Forecast policy','Gaps and quality barriers','Evidence-backed cycle start','comparable snapshots over','Source time interpretation']){
  assert.ok(!primary.includes(technical),`${technical} must not be in the primary view`);
  assert.ok(advanced.includes(technical),`${technical} must remain in Advanced details`);
 }
 for(const essential of ['Credits used','Credits left','Today: 0 of 40.4 used','status-heading','Usage trajectory','Next reset','Last account update']) assert.ok(primary.includes(essential),essential);
 assert.ok(primary.indexOf('class="stats"')<primary.indexOf('id="usage-chart"'));
 assert.ok(primary.indexOf('id="usage-chart"')<primary.indexOf('id="cost-optimizer"')||!primary.includes('id="cost-optimizer"'));
});

test('forecast-unavailable and collecting messages appear once in the default reading flow',()=>{
 const collecting=split(render(10,'1000',1).html).primary;
 assert.equal((visible(collecting).match(/A first estimate appears after about 2 days/g)??[]).length,1);
 assert.ok(!/Forecast not ready yet/.test(visible(collecting)));
 assert.ok(!/at least 48 hours/.test(collecting));assert.match(split(render(10,'1000',1).html).advanced,/at least 48 hours/);
 const unavailable=visible(split(present(view(series(10),'2030-07-01T00:00:00Z')).html).primary);
 assert.ok(!/Projection not shown/.test(unavailable));
});

test('freshness, uncertainty and above-limit warnings stay in the default view',()=>{
 const stale=visible(split(render(10,'1000',8,'2030-06-09T00:00:00.001Z').html).primary);
 assert.match(stale,/Forecast paused — the last account update is too old/);assert.match(stale,/Stale — waiting for a fresh account update/);
 const provisional=visible(split(render(10,'1000',3).html).primary);
 assert.match(provisional,/Based on limited history/);assert.match(provisional,/may not represent future usage/);
 const above=visible(split(render(10,'60').html).primary);
 assert.match(above,/Above reported limit/);assert.match(above,/not verified as base-only or total capacity/);
 const fresh=visible(split(render(10).html).primary);assert.match(fresh,/Fresh/);
 assert.match(fresh,/run out|not projected to run out|On track/);
});

test('chart default shows a compact legend and a shorter frame only when history is sparse',()=>{
 const full=render(10).html,sparse=render(10,'1000',3).html;
 const frame=(h:string)=>Number(/<svg viewBox="0 0 640 (\d+)"/.exec(h)![1]);
 assert.equal(frame(full),340);assert.equal(frame(sparse),240);
 const {primary,advanced}=split(full);
 const items=(h:string,cls:string)=>(new RegExp(`<ul class="${cls}">([\\s\\S]*?)</ul>`).exec(h)?.[1].match(/<li>/g)??[]).length;
 assert.ok(items(primary,'chart-legend')>0&&items(primary,'chart-legend')<=items(primary,'chart-legend chart-legend-full'));
 assert.ok(!/not verified gross charges/.test(primary.replace(/<desc[\s\S]*?<\/desc>/,'').replace(/<details class="chart-help">[\s\S]*?<\/details>/,'')));
 assert.match(primary,/<details class="chart-help"><summary>How to read this chart/);
 assert.match(advanced,/id="chart-summary"/);assert.match(advanced,/<summary>Chart data table/);
 assert.match(primary,/<desc id="chart-desc">[^<]*Expected trajectory/);
 assert.ok(!/<script/i.test(full));assert.ok(!/\sstyle=/i.test(full));
 assert.match(full,/<svg[^>]*role="group"/);assert.match(full,/prefers-color-scheme|var\(--vscode-/);
});

// Dashboard redesign: status first, one-click details, advanced only behind the collapsed section.
const hero=(html:string)=>/<section class="hero[^"]*"[\s\S]*?<\/section>/.exec(html)![0];
test('hero answers used, remaining and reset first and labels the forecast status in plain words',()=>{
 const h=visible(hero(render(10).html));
 for(const t of ['On track','Credits used','Credits left','Next reset','Last account update','Based on 7\\+ days']) assert.match(h,new RegExp(t));
 assert.ok(!/Regular forecast/.test(h));
 assert.match(h,/will use about \d+ of 1000 reported credits/);
 // The bar is decorative: its text follows, so the SVG is hidden from assistive technology.
 assert.match(hero(render(10).html),/<svg class="bar"[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/svg><p class="bar-label muted small">\d+% of the reported credit limit used<\/p>/);
 assert.ok(!/<svg class="bar"[^>]*(role=|aria-label=)/.test(hero(render(10).html)));
 assert.match(visible(hero(render(10,'321').html)),/At risk/);assert.match(visible(hero(render(10,'321').html)),/within 10% of the daily budget/);
 assert.match(visible(hero(render(10,'100').html)),/Likely to exceed/);
 assert.ok(!/Tight budget|Over budget/.test(render(10,'321').html+render(10,'100').html));
 // Status carries an icon glyph as well as colour, and the hero is a labelled landmark.
 assert.match(hero(render(10).html),/class="status-icon" aria-hidden="true"/);assert.match(render(10).html,/aria-labelledby="status-heading"/);
});
test('uncertain states are never styled as on track and keep their warning in the hero',()=>{
 for(const [r,label] of [[render(10,'1000',8,'2030-06-09T00:00:00.001Z'),'Stale data'],[render(10,'1000',1),'Up to 33\\.3 credits/day until the reset'],[render(10,'1000',3),'Based on limited history']] as const){
  const h=hero(r.html);assert.match(visible(h),new RegExp(label));assert.ok(!/class="hero ok"/.test(h));
 }
 assert.match(hero(render(10,'1000',8,'2030-06-09T00:00:00.001Z').html),/class="hero warn"/);
 assert.match(hero(render(10,'1000',3).html),/may not represent future usage/);
 assert.match(visible(hero(render(10,'60').html)),/Above reported limit/);
});
test('chart key and caveats are one click away, collapsed, and only one top-level advanced section exists',()=>{
 const {primary}=split(render(10).html);
 assert.match(primary,/<details class="chart-help">/);assert.ok(!/<details[^>]*\bopen\b/.test(primary));
 assert.match(primary,/class="split"/);
 const late=split(render(10,'1000',20).html).primary;assert.match(late,/>Observed<\/text>/);assert.match(late,/>Forecast<\/text>/);
 assert.ok(!/class="zone"/.test(primary),'zone labels are omitted when they would collide with the limit label');
 assert.equal((render(10).html.match(/<h1>/g)??[]).length,1);
});

test('provisional on-track forecasts are neutral, passed resets are labelled, usage bar is clamped',()=>{
 const prov=hero(render(10,'1000',3).html);
 assert.match(prov,/class="hero neutral"/);assert.match(visible(prov),/Looks on track so far/);assert.ok(!/On track/.test(visible(prov)));
 assert.ok(!/class="status-icon"[^>]*>✓/.test(hero(render(10,'1000',1).html)));
 assert.match(hero(render(10,'1000',8,'2030-07-01T00:00:00Z').html),/class="hero warn"/);
 assert.ok(!/class="hero ok"/.test(hero(render(10,'1000',8,'2030-07-01T00:00:00Z').html)));
 assert.match(hero(render(10,'60').html),/<p class="bar-label muted small">100% of the reported credit limit used<\/p>/);
});

// Workspace-check card: counts and times only; its two links are the only links in the view and carry no arguments.
const card = (audit: AuditSummary | undefined, now = '2030-06-15T12:00:00.000Z') => present(view(series(10), '2030-06-08T00:00:00Z'), [], '', '', audit, now).html;
const allHrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map(m => m[1]);
// The footer is covered by its own test; the card tests look at the command links only.
const hrefs = (html: string) => allHrefs(html).filter(h => h!.startsWith('command:') && h !== 'command:bobert.share' && h !== 'command:bobert.reportProblem');
const ADVISOR = 'command:bobert.costAdvisor';
const ALLOWED = ['command:bobert.auditWorkspace', 'command:bobert.audit.show'];
const cardHrefs = (html: string) => hrefs(html).filter(h => h !== ADVISOR);
test('workspace audit card: never checked offers only Run audit', () => {
 const html = card({ state: 'never' });
 assert.match(html, /<h2 id="audit-heading">Workspace audit<\/h2>/); assert.match(html, /Run the workspace audit to find files Kiro can read but probably doesn&#39;t need\./);
 assert.deepEqual(cardHrefs(html), ['command:bobert.auditWorkspace']); assert.match(html, />Run audit<\/a>/); assert.ok(!html.includes('>Show results</a>'));
 assert.ok(html.indexOf('class="stats"') < html.indexOf('class="audit-card"'));
 assert.match(card({ state: 'never', lastDate: '2030-03-01' }), /Last checked 2030-03-01 \(UTC\)\./);
 assert.ok(!card({ state: 'never', lastDate: '<b>synthetic</b>' }).includes('Last checked'));
});
test('workspace audit card: checked states show the count and a relative time, plus Show', () => {
 const now = new Date(2030, 5, 15, 12, 0, 0), ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
 const some = card({ state: 'checked', items: 3, checkedAt: ago(5 * 60_000) }, now.toISOString());
 assert.match(some, /3 items Kiro may read · checked 5 min ago/); assert.deepEqual(cardHrefs(some), ALLOWED); assert.match(some, /<a class="button primary" href="command:bobert\.auditWorkspace">Run audit<\/a>/); assert.match(some, /<a class="button secondary" href="[^"]+">Show results<\/a>/);
 assert.match(card({ state: 'checked', items: 1, checkedAt: ago(0) }, now.toISOString()), /1 item Kiro may read · checked just now/);
 const none = card({ state: 'checked', items: 0, checkedAt: ago(26 * 3_600_000) }, now.toISOString());
 assert.match(none, /No risky files found · checked (yesterday|2 days ago|today)/); assert.deepEqual(cardHrefs(none), ALLOWED);
 const mixedCard = card({ state: 'checked', items: 2, unclear: 3, checkedAt: ago(0) }, now.toISOString());
 assert.match(mixedCard, /2 items Kiro may read · 3 unclear · checked just now/);
 assert.match(card({ state: 'checked', items: 0, unclear: 4, checkedAt: ago(0) }, now.toISOString()), /4 items to review · checked just now/);
 assert.match(card({ state: 'checked', items: 2 }), /2 items Kiro may read<\/p>/); // no usable time: no relative part
});
test('workspace audit card: the size total sits after the count, escaped and only for checked states', () => {
 const now = new Date(2030, 5, 15, 12, 0, 0), ago = (ms: number) => new Date(now.getTime() - ms).toISOString(), MB = 1024 * 1024;
 assert.match(card({ state: 'checked', items: 4, bytes: 240.3 * MB, lowerBound: false, checkedAt: ago(0) }, now.toISOString()), /4 items Kiro may read \(about 240\.3 MiB\) · checked just now/);
 assert.match(card({ state: 'checked', items: 2, unclear: 3, bytes: 1.2 * 1024 * MB, lowerBound: true, checkedAt: ago(0) }, now.toISOString()), /2 items Kiro may read \(at least 1\.2 GiB\) · 3 unclear · checked just now/);
 assert.match(card({ state: 'checked', items: 1, bytes: 512 * 1024, checkedAt: ago(0) }, now.toISOString()), /1 item Kiro may read \(about 512 KiB\) · checked just now/);
 assert.match(card({ state: 'checked', items: 1, bytes: 0, checkedAt: ago(0) }, now.toISOString()), /1 item Kiro may read · checked just now/);
 assert.match(card({ state: 'checked', items: 1, bytes: Number.NaN, checkedAt: ago(0) }, now.toISOString()), /1 item Kiro may read · checked just now/);
 assert.match(card({ state: 'never', bytes: 5 }), /Run the workspace audit to find files Kiro can read/);
 const hostile = card({ state: 'checked', items: 1, bytes: 1024, lowerBound: true, checkedAt: 'synthetic-not-a-time' });
 assert.match(hostile, /1 item Kiro may read \(at least 1 KiB\)<\/p>/);
});
test('workspace audit card: unavailable asks for a trusted local folder; no claims of savings', () => {
 const html = card({ state: 'unavailable' });
 assert.match(html, /This folder can&#39;t be checked\. Run the audit to see why\./); assert.deepEqual(cardHrefs(html), ['command:bobert.auditWorkspace']);
 for (const state of ['never', 'checked', 'unavailable'] as const) assert.ok(!/sav(e|ing)|reduc|cheaper|measured/i.test(card({ state, items: 2, bytes: 2048, lowerBound: true, checkedAt: '2030-06-15T11:00:00Z' }).match(/<section class="audit-card".*?<\/section>/s)![0]), state);
});
test('the view has one Open Cost Advisor button, inside the Cost Advisor section and below the figures, in every state', () => {
 const section = '<section id="cost-advisor" aria-labelledby="advisor-heading"><h2 id="advisor-heading">Cost Advisor</h2><p>synthetic</p></section>';
 for (const s of [undefined, { state: 'never' }, { state: 'checked', items: 1 }, { state: 'unavailable' }] as (AuditSummary | undefined)[]) {
  for (const html of [card(s), present(view(series(10), '2030-06-08T00:00:00Z'), [], '', section, s, '2030-06-15T12:00:00.000Z').html]) {
   assert.equal(hrefs(html).filter(h => h === ADVISOR).length, 1);
   assert.match(html, /<p class="advisor-actions"><a class="button primary" href="command:bobert\.costAdvisor">Open Cost Advisor<\/a><\/p>/);
   assert.ok(html.indexOf('class="hero') < html.indexOf('advisor-actions"')); assert.ok(!html.includes('top-actions'));
  }
  assert.match(present(view(series(10), '2030-06-08T00:00:00Z'), [], '', section, s).html, /<p>synthetic<\/p><p class="advisor-actions">.*?<\/p><\/section>/);
 }
});
test('workspace audit card: only the three allowed command links, none with arguments, no other href, no path or folder name, script-free', () => {
 const states: AuditSummary[] = [{ state: 'never' }, { state: 'checked', items: 4, checkedAt: '2030-06-15T11:59:00Z' }, { state: 'checked', items: 0 }, { state: 'unavailable' }];
 for (const s of states) {
  const html = card(s); for (const h of hrefs(html)) { assert.ok([ADVISOR, ...ALLOWED].includes(h!), h); assert.ok(!/[?#%&=({\[]/.test(h!.slice('command:'.length)), h); }
  assert.ok(!/<script|javascript:|src=|\sonclick=|<form|<iframe/i.test(html)); assert.match(html, /Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"/);
 }
 // Even a malicious summary cannot put a name or path into the card: only the number and the time are used.
 const evil = card({ state: 'checked', items: 2, checkedAt: '2030-06-15T11:59:00Z', folder: '/synthetic/private/folder', name: 'synthetic-folder' } as AuditSummary & Record<string, unknown>);
 assert.ok(!evil.includes('synthetic-folder') && !evil.includes('/synthetic/private'));
 assert.deepEqual(hrefs(card(undefined)), [ADVISOR]); assert.ok(!card(undefined).includes('class="audit-card"'));
 // Garbage never throws and never removes the figures.
 const garbage = card({ state: 'checked', items: Number.NaN, checkedAt: 'synthetic-not-a-time' }); assert.match(garbage, /No risky files found<\/p>/); assert.match(garbage, /id="status-heading"/);
});
test('the controller reads the summary on every render, re-renders on request and drops the card when the getter throws', async () => {
 const base = await realpath(await mkdtemp(join(tmpdir(), 'synthetic-audit-card-')));
 const htmls: string[] = []; let summary: () => AuditSummary = () => ({ state: 'never' });
 const ui = { setStatus(_t: string, html: string) { htmls.push(html); }, showDetails() {}, onClick() {}, onChange() {}, everyMinute() {}, dispose() {} };
 try {
  const extension = await startExtension(ui, { source: join(base, 'synthetic-missing'), storage: join(base, 'owned'), timezone: 'UTC', now: () => '2030-06-15T12:00:00.000Z', auditSummary: () => summary() });
  assert.match(htmls.at(-1)!, /Workspace audit/);
  summary = () => ({ state: 'checked', items: 7, checkedAt: '2030-06-15T11:58:00.000Z' }); const count = htmls.length; extension.rerender();
  assert.equal(htmls.length, count + 1); assert.match(htmls.at(-1)!, /7 items Kiro may read · checked 2 min ago/);
  summary = () => { throw new Error('synthetic-failure'); }; extension.rerender();
  assert.ok(!htmls.at(-1)!.includes('Workspace audit')); assert.match(htmls.at(-1)!, /id="status-heading"/); assert.deepEqual(hrefs(htmls.at(-1)!), [ADVISOR]);
  extension.dispose(); const after = htmls.length; extension.rerender(); assert.equal(htmls.length, after);
 } finally { await rm(base, { recursive: true, force: true }); }
});

// Community footer: three fixed https constants plus the Share and Report a problem commands, in every state; nothing else is linked, no arguments, no scripts.
const FOOTER_LINKS = ['command:bobert.reportProblem', 'command:bobert.share', 'https://open-vsx.org/extension/StefanSuess/bobert/reviews', 'https://github.com/StefanSuess/Bobert', 'https://ko-fi.com/stefansuess'];
test('the footer links exactly the three web constants plus the share and report-a-problem commands, below the main content', () => {
 for (const s of [undefined, { state: 'never' }, { state: 'checked', items: 2, checkedAt: '2030-06-15T11:59:00Z' }, { state: 'unavailable' }] as (AuditSummary | undefined)[]) {
  const html = card(s);
  assert.deepEqual(allHrefs(html).filter(h => !h!.startsWith('command:bobert.') || h === 'command:bobert.share' || h === 'command:bobert.reportProblem'), FOOTER_LINKS);
  for (const h of allHrefs(html)) assert.ok([ADVISOR, ...ALLOWED, ...FOOTER_LINKS].includes(h!), h);
  assert.match(html, /<footer class="community muted small"><a href="command:bobert\.reportProblem">Report a problem<\/a> · <a href="command:bobert\.share">Copy share link<\/a> · <a href="https:\/\/open-vsx\.org[^"]*"><span aria-hidden="true">★<\/span> Rate on Open VSX<\/a> · <a href="https:\/\/github\.com[^"]*">Star on GitHub<\/a> · <a href="https:\/\/ko-fi\.com[^"]*"><span aria-hidden="true">☕<\/span> Support<\/a><\/footer><\/main>/);
  assert.ok(html.indexOf('<footer') > html.indexOf('id="advanced-details"'));
  assert.equal((html.match(/<footer/g) ?? []).length, 1);
  assert.ok(!/<script|javascript:|\?utm_|[?&]ref=|\sonclick=/i.test(html)); assert.match(html, /default-src 'none'; style-src 'unsafe-inline'/);
 }
 for (const h of FOOTER_LINKS) assert.ok(!/[?#%&=({\[]/.test(h.replace(/^https:\/\//, '').replace(/^command:/, '')), h);
});

// Outside Kiro without a chosen source, the empty source is expected and says so; everywhere else nothing changes.
const empty = (notKiro: boolean, codes: string[] = ['no_source_logs']) => present(view([], '2030-06-08T00:00:00Z'), codes, '', '', undefined, '2030-06-08T00:00:00Z', notKiro);
test('not in Kiro and no source logs: "Kiro not detected" in the status bar and the detail view', () => {
 const r = empty(true);
 assert.equal(r.text, '$(info) Kiro not detected'); assert.equal(r.warning, false);
 const text = "Bobert is built for Kiro IDE, so there is no credit view in this editor. What helps here is the workspace audit: run Bobert: Run Workspace Audit to find files Kiro may read but doesn't need.";
 assert.equal(r.tooltip, text);
 assert.match(r.html, /What helps here is the workspace audit: run Bobert: Run Workspace Audit to find files Kiro may read but doesn&#39;t need\./);
 assert.ok(!r.html.includes('class="stats"') && !r.html.includes('About these numbers')); // nothing to qualify without an account update
 assert.match(r.html, /Kiro not detected<\/h2>/); assert.match(r.html, /class="hero neutral"/); assert.equal(r.forecast, false);
 assert.match(r.html, /<footer class="community/);
});
test('the notice does not apply inside Kiro, with other codes or when the flag is off', () => {
 assert.equal(empty(false).text, '$(warning) Kiro credits: Unavailable'); assert.ok(!empty(false).html.includes('Kiro not detected'));
 assert.equal(present(view([], '2030-06-08T00:00:00Z'), ['no_source_logs']).text, empty(false).text);
 assert.ok(!empty(true, ['source_unavailable']).text.includes('not detected'));
 assert.ok(!empty(true, []).text.includes('not detected'));
 assert.equal(empty(true, ['no_source_logs', 'runtime_unsupported']).text, '$(warning) Kiro: Needs a newer Kiro');
 // With data present the normal view is unchanged even if the flag is set.
 const withData = present(view(series(10), '2030-06-08T00:00:00Z'), [], '', '', undefined, '2030-06-08T00:00:00Z', true);
 assert.equal(withData.text, render(10).text); assert.equal(withData.forecast, true);
});
test('a throwing forecast hook never stops the gauge from rendering a forecast', async () => {
 const base = await realpath(await mkdtemp(join(tmpdir(), 'synthetic-forecast-throw-')));
 const dir = join(base, 'source', 'logs', 'synthetic-run', 'synthetic-window', 'exthost', 'kiro.kiroAgent'); await mkdir(dir, { recursive: true });
 const line = (day: number) => `2030-01-0${day} 00:00:00.000 [info] synthetic-envelope ` + JSON.stringify({ commandName: 'GetUsageLimitsCommand', input: {}, output: { userInfo: { userId: 'synthetic-hook-account' }, nextDateReset: '2030-02-01T00:00:00Z', usageBreakdownList: [{ resourceType: 'CREDIT', unit: 'INVOCATIONS', currentUsageWithPrecision: day * 10, usageLimitWithPrecision: 5000, nextDateReset: '2030-02-01T00:00:00Z', bonuses: [], overageCredits: [] }] }, metadata: { httpStatusCode: 200 } }) + '\n';
 await writeFile(join(dir, 'q-client.log'), [1, 2, 3, 4].map(line).join(''));
 const texts: string[] = []; let calls = 0;
 const ui = { setStatus(t: string) { texts.push(t); }, showDetails() {}, onClick() {}, onChange() {}, everyMinute() {}, dispose() {} };
 try {
  const extension = await startExtension(ui, { source: join(base, 'source'), storage: join(base, 'owned'), timezone: 'UTC', now: () => '2030-01-04T00:00:00.000Z', onForecast: () => { calls++; throw new Error('synthetic-failure'); } });
  assert.ok(calls >= 1); assert.match(texts.at(-1)!, /Kiro credits: (Provisional|On track|At risk)/);
  extension.rerender(); assert.ok(calls >= 2); assert.match(texts.at(-1)!, /Kiro credits: /); extension.dispose();
 } finally { await rm(base, { recursive: true, force: true }); }
});
test('a throwing absent hook never stops the gauge from showing "Kiro not detected"', async () => {
 const base = await realpath(await mkdtemp(join(tmpdir(), 'synthetic-absent-throw-')));
 const texts: string[] = []; let calls = 0;
 const ui = { setStatus(t: string) { texts.push(t); }, showDetails() {}, onClick() {}, onChange() {}, everyMinute() {}, dispose() {} };
 try {
  const extension = await startExtension(ui, { source: join(base, 'synthetic-missing'), storage: join(base, 'owned'), timezone: 'UTC', now: () => '2030-01-04T00:00:00.000Z', notKiro: true, onAbsent: () => { calls++; throw new Error('synthetic-failure'); } });
  assert.ok(calls >= 1); assert.equal(texts.at(-1), '$(info) Kiro not detected'); extension.dispose();
  const normal = await startExtension(ui, { source: join(base, 'synthetic-missing'), storage: join(base, 'owned'), timezone: 'UTC', now: () => '2030-01-04T00:00:00.000Z', onAbsent: () => { calls += 100; } });
  assert.ok(calls < 100); normal.dispose();
 } finally { await rm(base, { recursive: true, force: true }); }
});
test('the controller passes the not-Kiro flag through and does not report a forecast when there is none', async () => {
 const base = await realpath(await mkdtemp(join(tmpdir(), 'synthetic-forecast-hook-')));
 const texts: string[] = []; let calls = 0;
 const ui = { setStatus(t: string) { texts.push(t); }, showDetails() {}, onClick() {}, onChange() {}, everyMinute() {}, dispose() {} };
 try {
  const extension = await startExtension(ui, { source: join(base, 'synthetic-missing'), storage: join(base, 'owned'), timezone: 'UTC', now: () => '2030-06-15T12:00:00.000Z', notKiro: true, onForecast: () => { calls++; throw new Error('synthetic-failure'); } });
  assert.equal(calls, 0); assert.equal(texts.at(-1), '$(info) Kiro not detected');
  extension.rerender(); assert.equal(texts.at(-1), '$(info) Kiro not detected');
  extension.dispose();
 } finally { await rm(base, { recursive: true, force: true }); }
});

// Modelled overage cost lines and the status bar severity.
const NOW = '2030-06-08T00:00:00Z';
const at = (v: ReturnType<typeof view>, now = NOW) => present(v, [], '', '', undefined, now);
// A paid consumer plan (confirmed or assumed): the projected overage is worded as add-on credits to buy.
const atPaid = (v: ReturnType<typeof view>, now = NOW) => present(v, [], '', '', undefined, now, false, undefined, '', undefined, undefined, true);
const heroText = (html: string) => html.slice(html.indexOf('class="hero'), html.indexOf('<dl class="stats">'));
const PROJECTED = 'At this pace by the reset: about 200 credits over (≈ $8.00, modelled).';
const PROJECTED_ADD_ON = 'At this pace you would need about 200 add-on credits (≈ $8.00) to avoid running out before the reset on 1 Jul.';
test('a forecast beyond the reported limit shows the modelled overage below the outlook, with the catalog price and review date', () => {
 const r = at(view(series(10, '100'), NOW));
 const hero = heroText(r.html);
 assert.ok(hero.includes(`<p class="small overage">${PROJECTED}</p>`), hero);
 assert.ok(heroText(atPaid(view(series(10, '100'), NOW)).html).includes(`<p class="small overage">${PROJECTED_ADD_ON}</p>`));
 assert.ok(hero.indexOf('class="lead"') < hero.indexOf('class="small overage"'));
 assert.ok(!r.html.includes('over the limit so far')); // nothing is above the limit yet
 assert.ok(!hero.includes('does not establish overage charges') && !/The counter alone/.test(r.html)); // the caveat is said once, in About these numbers
 assert.ok(!/\$\d/.test(r.text) && !/\$\d/.test(r.tooltip)); // the status bar stays short
 // The dollar figure traces back to the catalog price, version and review date, said once in About these numbers.
 assert.match(r.html, /<details class="about">[\s\S]*?<p>Dollar figures use \$\d+\.\d+ per credit from price list [^<]+, reviewed [^<]+\.<\/p><\/details>/);
});
test('already-observed overage gets its own modelled line; the projected line stays separate', () => {
 const hero = heroText(at(view(series(10, '60'), NOW)).html);
 // One headline figure for what is over so far, then one line for the pace until the reset; the legalistic sentence is gone from the hero.
 assert.ok(hero.includes('<p class="lead overage-now"><strong>10 credits</strong> over the limit so far (≈ $0.40, modelled).</p>'), hero);
 assert.ok(hero.includes('<p class="small overage">At this pace by the reset: about 240 credits over (≈ $9.60, modelled).</p>'), hero);
 assert.ok(hero.indexOf('overage-now') < hero.indexOf('At this pace by the reset'));
 assert.ok(!/The counter alone|does not establish overage/.test(hero));
 assert.match(at(view(series(10, '60'), NOW)).html, /<details class="about">[\s\S]*?do not by themselves establish overage charges[\s\S]*?<\/details>/);
 // Exactly at the limit is not above it.
 assert.ok(!heroText(at(view(series(10, '70'), NOW)).html).includes('over the limit so far'));
});
test('no overage line when the forecast stays below the limit, is unavailable or stale', () => {
 for (const html of [at(view(series(10, '1000'), NOW)).html, at(view(series(0, '1000'), NOW)).html, at(view(series(10, '1000', 1), '2030-06-01T00:00:00Z'), '2030-06-01T00:00:00Z').html, at(view(series(10, '100'), '2030-06-12T00:00:00Z')).html, at(view([], NOW)).html]) assert.ok(!html.includes('class="small overage"') && !html.includes('over the limit so far') && !html.includes('credits over'), 'no line');
});
test('without a validated price the credits are shown but never a money figure', () => {
 const hero = heroText(at(view(series(10, '100'), NOW), '2020-01-01T00:00:00Z').html); // before the catalog was verified
 assert.ok(hero.includes('At this pace by the reset: about 200 credits over.'), hero);
 assert.ok(heroText(atPaid(view(series(10, '100'), NOW), '2020-01-01T00:00:00Z').html).includes('At this pace you would need about 200 add-on credits to avoid running out before the reset on 1 Jul.'));
 assert.ok(!/\$\d/.test(hero));
 assert.ok(heroText(at(view(series(10, '60'), NOW), 'not-a-time').html).includes('<strong>10 credits</strong> over the limit so far.'));
});
test('the status bar colour: red only at or above the reported limit, warning only for budget risk, icon only for stale or unavailable', () => {
 const status = (rate: number, limit: string, count = 8, now = `2030-06-${String(count).padStart(2, '0')}T00:00:00Z`) => { const r = present(view(series(rate, limit, count), now), [], '', '', undefined, now); return [r.severity, r.warning, r.text.startsWith('$(warning)')]; };
 assert.deepEqual(status(10, '100'), ['warning', true, true]); // likely to exceed: a risk, not yet a reached limit
 assert.deepEqual(status(10, '70'), ['error', true, true]); // limit reached
 assert.deepEqual(status(10, '60'), ['error', true, true]); // above the limit
 assert.deepEqual(status(10, '25', 3), ['warning', true, true]); // provisional "Likely to exceed" stays a warning
 assert.deepEqual(status(10, '20', 3), ['error', true, true]); // provisional, but the observed usage has reached the limit
 assert.deepEqual(status(10, '321'), ['warning', true, true]); // at risk
 assert.deepEqual(status(10, '1000'), ['none', false, false]);
 assert.deepEqual(status(0, '1000'), ['none', false, false]);
 assert.deepEqual(status(10, '1000', 1), ['none', false, false]); // collecting
 assert.deepEqual(status(10, '1000', 8, '2030-06-09T00:00:00.001Z'), ['none', false, true]); // stale: icon only, no colour
 assert.deepEqual(status(10, '1000', 8, '2030-07-01T00:00:00Z'), ['none', false, true]); // unavailable: icon only, no colour
 assert.equal(present(view([], NOW), ['no_source_logs'], '', '', undefined, NOW, true).severity, 'none'); // Kiro not detected
 assert.equal(present(view([], NOW), ['runtime_unsupported']).severity, 'none');
});
test('the status bar text uses per-day units and a run-out date instead of "empty"', () => {
 const texts = [at(view(series(10, '100'), NOW)).text, at(view(series(10, '321'), NOW)).text, at(view(series(10, '25', 3), '2030-06-03T00:00:00Z'), '2030-06-03T00:00:00Z').text, render(10).text];
 assert.deepEqual(texts, ['$(warning) Kiro credits: Likely to exceed • runs out 11 Jun', '$(warning) Kiro credits: At risk • 0/10.9 today', '$(warning) Kiro credits: Provisional • runs out 3 Jun', '$(gauge) Kiro credits: On track • 0/40.4 today']);
 for (const t of texts) assert.ok(!/empty|\/24h/.test(t), t);
 assert.match(render(10).tooltip, /credits per day/); assert.ok(!/credits \/ 24h/.test(render(10).tooltip));
});
test('the controller hands the render to the budget hook with the eligibility and survives a throwing hook', async () => {
 const base = await realpath(await mkdtemp(join(tmpdir(), 'synthetic-budget-hook-')));
 const dir = join(base, 'source', 'logs', 'synthetic-run', 'synthetic-window', 'exthost', 'kiro.kiroAgent'); await mkdir(dir, { recursive: true });
 const line = (day: number) => `2030-01-0${day} 00:00:00.000 [info] synthetic-envelope ` + JSON.stringify({ commandName: 'GetUsageLimitsCommand', input: {}, output: { userInfo: { userId: 'synthetic-budget-account' }, nextDateReset: '2030-02-01T00:00:00Z', usageBreakdownList: [{ resourceType: 'CREDIT', unit: 'INVOCATIONS', currentUsageWithPrecision: day * 10, usageLimitWithPrecision: 5000, nextDateReset: '2030-02-01T00:00:00Z', bonuses: [], overageCredits: [] }] }, metadata: { httpStatusCode: 200 } }) + '\n';
 await writeFile(join(dir, 'q-client.log'), [1, 2, 3, 4].map(line).join(''));
 const texts: string[] = [], metas: unknown[] = [], seen: { status: string; eligible: boolean; now: string }[] = [];
 const ui = { setStatus(t: string, _h: string, m?: unknown) { texts.push(t); metas.push(m); }, showDetails() {}, onClick() {}, onChange() {}, everyMinute() {}, dispose() {} };
 try {
  const extension = await startExtension(ui, { source: join(base, 'source'), storage: join(base, 'owned'), timezone: 'UTC', now: () => '2030-01-04T00:00:00.000Z', onBudget: (o, eligible, now) => { seen.push({ status: o.status, eligible, now }); throw new Error('synthetic-failure'); } });
  assert.ok(seen.length >= 1); assert.deepEqual(seen.at(-1), { status: 'observed', eligible: true, now: '2030-01-04T00:00:00.000Z' });
  assert.match(texts.at(-1)!, /Kiro credits: /); assert.ok(['none', 'warning', 'error'].includes((metas.at(-1) as { severity: string }).severity));
  const before = seen.length; extension.rerender(); assert.equal(seen.length, before + 1); extension.dispose();
 } finally { await rm(base, { recursive: true, force: true }); }
});
test('no budget hook call for Kiro not detected', async () => {
 const base = await realpath(await mkdtemp(join(tmpdir(), 'synthetic-budget-absent-')));
 let calls = 0;
 const ui = { setStatus() {}, showDetails() {}, onClick() {}, onChange() {}, everyMinute() {}, dispose() {} };
 try {
  const extension = await startExtension(ui, { source: join(base, 'synthetic-missing'), storage: join(base, 'owned'), timezone: 'UTC', now: () => '2030-06-15T12:00:00.000Z', notKiro: true, onBudget: () => { calls++; } });
  assert.equal(calls, 0); extension.dispose();
 } finally { await rm(base, { recursive: true, force: true }); }
});

test('no observed-overage line for accounts with unsupported extra credits', () => {
 const flagged = series(10, '60').map(p => ({ ...p, flags: ['unsupported_extra_credits'] }));
 const html = at(view(flagged, NOW)).html;
 assert.ok(!html.includes('over the limit so far') && !html.includes('class="small overage"'));
 assert.ok(at(view(series(10, '60'), NOW)).html.includes('over the limit so far')); // control
});

// Plan hints (computed by the controller) shown in the credit view.
const LARGER_LINE = 'For comparison, if you are on Pro: Pro+ costs $20 a month more than Pro and includes 1000 more credits (list prices, price list reviewed 10 Oct 2026).';
const RIGHTSIZE_LINE = 'If you are on Pro+: You will likely leave about 1444 credits unused this cycle, and the last cycle also fit within Pro. Pro would cost about $20 a month less (modelled).';
const larger = { current: 'pro', next: 'pro_plus', feeDiff: '20', creditDiff: '1000', hint: true, reviewedOn: '2026-10-10T00:00:00Z' } as const;
const rightsize = { current: 'pro_plus', plan: 'pro', saving: '20', unusedCredits: '1444.5', hint: true } as const;
const withHints = (v: ReturnType<typeof view>, insights: Parameters<typeof present>[7], addOns = false) => present(v, [], '', '', undefined, NOW, false, insights, '', undefined, undefined, addOns);
const overLines = (html: string) => [...heroText(html).matchAll(/<p class="small overage">([^<]*)<\/p>/g)].map(m => m[1]!);
test('the credit view says what to do about a projected overage instead of comparing plans', () => {
 const hero = heroText(withHints(view(series(10, '60'), NOW), { larger, rightsize: null }, true).html);
 const lines = [...hero.matchAll(/<p class="small overage">([^<]*)<\/p>/g)].map(m => m[1]!);
 // The larger-plan comparison is gone from this card, hinted or not; the add-on need follows the observed overage line.
 assert.equal(lines.length, 1);
 assert.equal(lines[0], 'At this pace you would need about 240 add-on credits (≈ $9.60) to avoid running out before the reset on 1 Jul.');
 assert.ok(!hero.includes('For comparison') && !hero.includes('Pro+ costs'));
 assert.ok(hero.indexOf('over the limit so far') < hero.indexOf('At this pace you would need'));
 assert.ok(!heroText(withHints(view(series(10, '100'), NOW), { larger: { ...larger, hint: false }, rightsize: null }, true).html).includes('For comparison'));
 assert.ok(!heroText(withHints(view(series(10, '1000'), NOW), { larger, rightsize: null }, true).html).includes('add-on credits')); // no projected overage
 assert.ok(!/save|cheaper|recommend|buy/i.test(lines[0]!));
 // Thousands are grouped.
 assert.ok(heroText(atPaid(view(series(100, '100'), NOW)).html).includes('would need about 2,'));
});
test('add-on wording follows the purchase rules: at least 125 credits, five packs of 2,500; Free, an unknown plan and Enterprise stay neutral', () => {
 const paid = (rate: number, limit: string) => overLines(atPaid(view(series(rate, limit), NOW)).html)[0];
 // Below the smallest purchase (and tiny amounts, which used to read "about under 0.1"): the smallest purchase is named.
 assert.equal(paid(10, '260'), 'At this pace you would need at least 125 add-on credits ($5, the smallest purchase) to avoid running out before the reset on 1 Jul.');
 assert.equal(paid(10, '299.96'), 'At this pace you would need at least 125 add-on credits ($5, the smallest purchase) to avoid running out before the reset on 1 Jul.');
 // The smallest purchase itself and the largest single need (5 packs x 2,500 = 12,500) are priced; beyond it the need exceeds what can be bought at once.
 assert.equal(paid(10, '175'), 'At this pace you would need about 125 add-on credits (≈ $5.00) to avoid running out before the reset on 1 Jul.');
 assert.equal(paid(420, '100'), 'At this pace you would need about 12,500 add-on credits (≈ $500.00) to avoid running out before the reset on 1 Jul.');
 assert.ok(paid(421, '100')!.startsWith('At this pace you would need more add-on credits than can be bought at once'));
 assert.equal(paid(1000, '100'), 'At this pace you would need more add-on credits than can be bought at once (5 packs of 2,500 credits) to avoid running out before the reset on 1 Jul.');
 // Neutral wording (Free, unknown plan, Enterprise, or nothing passed): the old sentence, with no "about under 0.1".
 assert.equal(overLines(at(view(series(10, '260'), NOW)).html)[0], 'At this pace by the reset: about 40 credits over (≈ $1.60, modelled).');
 assert.equal(overLines(at(view(series(10, '299.96'), NOW)).html)[0], 'At this pace by the reset: under 0.1 credits over (≈ under $0.01, modelled).');
 for (const html of [at(view(series(10, '260'), NOW)).html, at(view(series(1000, '100'), NOW)).html, at(view(series(10, '299.96'), NOW)).html]) assert.ok(overLines(html).every(l => !l.includes('add-on credits') && !l.includes('about under')));
});
test('the credit view points to the Cost Advisor only when the Advisor shows a recommendation', () => {
 const pointer = 'For next month, see the Cost Advisor below.';
 const withAdvisor = (html: string) => heroText(present(view(series(10, '100'), NOW), [], '', html, undefined, NOW).html);
 assert.ok(withAdvisor(`<section id="cost-advisor"><div class="estimate" role="group" ${ESTIMATE_MARKER}></div></section>`).includes(`<p class="small overage">${pointer}</p>`));
 assert.ok(!withAdvisor('<section id="cost-advisor"><p class="verdict">Bobert needs a few days of usage before it can compare plans.</p></section>').includes(pointer));
 assert.ok(!heroText(present(view(series(10, '1000'), NOW), [], '', `<section id="cost-advisor"><div ${ESTIMATE_MARKER}></div></section>`, undefined, NOW).html).includes(pointer)); // no projected overage
});
test('the right-sizing line is shown whenever the condition holds, not only near the reset, and a confirmed plan has no prefix', () => {
 const early = withHints(view(series(10, '1000'), NOW), { larger: null, rightsize }); // 23 days before the reset
 assert.ok(heroText(early.html).includes(`<p class="small overage">${RIGHTSIZE_LINE}</p>`));
 const confirmed = withHints(view(series(10, '1000'), NOW), { larger: null, rightsize: { ...rightsize, hint: false } });
 assert.ok(heroText(confirmed.html).includes('<p class="small overage">You will likely leave about 1444 credits unused this cycle, and the last cycle also fit within Pro. Pro would cost about $20 a month less (modelled).</p>'));
 assert.ok(!heroText(at(view(series(10, '1000'), NOW)).html).includes('You will likely leave'));
});
test('plan hint lines hold only constants and formatted decimals, go through the same escaping, and a malformed hint is left out', async () => {
 const plans = ['free', 'pro', 'pro_plus', 'pro_max', 'power'] as const;
 for (const hint of [true, false]) for (let k = 0; k < plans.length - 1; k++) {
  const texts = [largerPlanText({ current: plans[k]!, next: plans[k + 1]!, feeDiff: '20.5', creditDiff: '1000', hint, reviewedOn: '2026-10-10T00:00:00Z' }), largerPlanText({ current: plans[k]!, next: plans[k + 1]!, feeDiff: '20', creditDiff: '1000', hint, reviewedOn: '2026-10-10T00:00:00Z' }, true), rightSizeText({ current: plans[k + 1]!, plan: plans[k]!, saving: '20', unusedCredits: '1444.5', hint })];
  for (const t of texts) assert.ok(!/[<>"&']/.test(t), t);
 }
 // The view escapes every note line the same way as the rest of its text.
 const source = await readFile(new URL('../../src/extension/presentation.ts', import.meta.url), 'utf8');
 assert.ok(source.includes('noteLines.map(l=>`<p class="small overage">${safe(l)}</p>`)'));
 // A hint that cannot be formatted (never produced by the controller) is omitted instead of breaking or injecting anything into the view.
 const odd = { ...larger, next: '<img src=x onerror=synthetic>' as never, feeDiff: '"><script>' };
 const html = withHints(view(series(10, '100'), NOW), { larger: odd, rightsize: null }).html;
 assert.ok(!html.includes('<img') && !html.includes('<script') && !html.includes('For comparison'));
 assert.ok(heroText(html).includes('about 200 credits over')); // the rest of the view is intact
});

// Calm dashboard: plain next steps, one caveat line, no repeated units, cards hidden when empty, one fixed section order.
const leadOf = (html: string) => /<p class="lead">([^<]*)<\/p>/.exec(html)?.[1] ?? '';
const PLAIN_STEP = 'Use Kiro for a few minutes so it can write a credit update. If this stays empty, use Report a problem below.';
test('unavailable and collecting states say what to do next, in plain words', () => {
 assert.equal(leadOf(present(view([], NOW)).html), PLAIN_STEP);
 assert.equal(leadOf(render(10, '1000', 1).html), 'At your first update today you had 1000 credits left and 30 days until the reset on 1 Jul, so up to 33.3 per day; 0 used so far. Keep using Kiro. A first estimate appears after about 2 days and 3 account updates; a regular forecast after 7 days.');
 const unknownAccount = leadOf(at(view(series(10).map(p => ({ ...p, associated: false })), NOW)).html);
 const conflicting = leadOf(at(view([snapshot(NOW, '5'), snapshot(NOW, '6')], NOW)).html);
 const noReset = leadOf(at(view(series(10).map(p => ({ ...p, resetAt: null, resetText: null })), NOW)).html);
 const noLimit = leadOf(at(view(series(10).map(p => ({ ...p, limit: null })), NOW)).html);
 assert.ok(unknownAccount.endsWith(PLAIN_STEP) && noReset.endsWith(PLAIN_STEP) && noLimit.endsWith(PLAIN_STEP));
 assert.match(conflicting, /Use Kiro for a few minutes; a newer update usually resolves this\./);
 assert.match(leadOf(at(view(series(10), '2030-07-05T00:00:00Z'), '2030-07-05T00:00:00Z').html), /Use Kiro for a few minutes to get an account update from the new cycle\./);
 // No account update means no figures: no row of "Not available" values and no caveat block to qualify them.
 const none = present(view([], NOW)).html;
 assert.ok(!none.includes('class="stats"') && !none.includes('About these numbers') && !none.includes('Last account update'));
});
test('the as-of time and freshness stay in the hero; the caveats are said once, behind About these numbers', () => {
 const html = render(10).html, h = hero(html);
 assert.match(visible(h), /Last account update: 8 Jun 2030, 00:00 UTC · Fresh/);
 assert.equal((html.match(/About these numbers/g) ?? []).length, 1);
 assert.match(h, /<details class="about"><summary><span aria-hidden="true">ⓘ<\/span> About these numbers<\/summary><p>[^<]*not verified as base-only or total capacity[^<]*<\/p><\/details>/);
 assert.ok(!/<details[^>]*\bopen\b/.test(h));
 // The hero lead itself carries no hedging.
 assert.ok(!/if the observed rate continues|not verified|does not establish/i.test(leadOf(html)));
 assert.match(visible(hero(render(10, '1000', 8, '2030-06-09T00:00:00.001Z').html)), /Stale — waiting for a fresh account update/);
});
test('stat values do not repeat the unit, and an over-limit hero shows one figure instead of Remaining 0 and Daily budget 0', () => {
 const h = hero(render(10).html);
 assert.match(h, /<dt>Credits used<\/dt><dd id="usage-live" aria-live="polite" aria-atomic="true">70<\/dd><dd class="muted small">of 1000 reported credits<\/dd>/);
 assert.match(h, /<dt>Credits left<\/dt><dd>930<\/dd>/);
 const over = hero(render(10, '60').html);
 assert.ok(!over.includes('Credits left') && !over.includes('Daily budget') && !/0 per day/.test(over));
 assert.match(over, /<strong>10 credits<\/strong> over the limit so far/);
 const atLimit = hero(render(10, '70').html); // exactly at the limit: nothing left, but no per-day budget of 0
 assert.match(atLimit, /<dt>Credits left<\/dt><dd>0<\/dd>/); assert.ok(!atLimit.includes('Daily budget'));
});
test('observed usage has plain headings, one sentence plus a next step when a part is empty, and no card when both are', () => {
 // A single update today already gives today's usage (0), so the card appears with the cycle part empty.
 assert.match(/<section id="usage-context"[\s\S]*?<\/section>/.exec(render(10).html)![0], /<h3>Today<\/h3><p>Since 00:00: 0 credits used, as of 8 Jun 2030, 00:00 UTC\. Today&#39;s allowance: 40\.4 credits\.<\/p>/);
 assert.ok(!render(10, '1000', 7, '2030-06-08T00:00:00Z').html.includes('id="usage-context"'), 'no update today and no cycle comparison: no card');
 assert.ok(!present(view([], NOW)).html.includes('id="usage-context"'));
 const points = [snapshot('2030-06-08T00:40:00Z', '1.1'), snapshot('2030-06-08T02:50:00Z', '2.223456789')];
 const html = present(view(points, '2030-06-08T02:51:00Z'), [], '', '', undefined, '2030-06-08T02:51:00Z').html;
 const ctx = /<section id="usage-context"[\s\S]*?<\/section>/.exec(html)![0];
 assert.match(ctx, /<h2 id="usage-context-heading">Observed usage<\/h2><h3>This cycle vs last cycle<\/h3><p>Not enough history yet to compare with last cycle\. This fills in after your next reset\.<\/p><h3>Today<\/h3><p>Since 00:40: 1\.123456789 credits used/);
 assert.ok(!/quality barrier|not observed/.test(ctx));
 // Today's part empty while the cycle part has something to show.
 const stale = present(view(points, '2030-06-09T12:00:00Z'), [], '', '', undefined, '2030-06-09T12:00:00Z').html;
 assert.ok(!stale.includes('id="usage-context"') || /Today&#39;s usage isn&#39;t available yet\./.test(stale));
});
test('the sections follow one order: hero, chart, observed usage, recap, Cost Advisor, Workspace audit, summary, Advanced details, footer', () => {
 const points = [snapshot('2030-06-08T00:40:00Z', '1.1'), snapshot('2030-06-08T02:50:00Z', '2.223456789')];
 const recap = { cycle: '2030-06-01T00:00:00.000Z', period: 'Period', lines: ['Line'] };
 const results = { status: 'ok' as const, entries: [] };
 const html = present(view(points, '2030-06-08T02:51:00Z'), [], '', '<section id="cost-advisor"></section>', { state: 'never' }, '2030-06-08T02:51:00Z', false, undefined, '', results, recap).html;
 const marks = ['class="hero ', 'id="usage-chart"', 'id="usage-context"', 'id="recap-card"', 'id="cost-advisor"', 'class="audit-card"', 'id="results-summary"', 'id="advanced-details"', '<footer'].map(m => html.indexOf(m));
 assert.ok(marks.every(i => i > 0), JSON.stringify(marks));
 assert.deepEqual([...marks].sort((a, b) => a - b), marks);
 assert.ok(html.indexOf('id="export-tools"') > html.indexOf('id="advanced-details"')); // folded into Advanced details
});
test('Advanced tables use plain units and no raw unit code', () => {
 const { advanced } = split(render(10).html);
 assert.match(advanced, /10 credits \/ 24h; regular/); assert.match(advanced, /<th scope="row">Reported credit limit<\/th>/);
 assert.ok(!/CREDIT \/ 24h|\(CREDIT\)/.test(advanced)); // the chart's own data table is owned by chart.ts
});

// The credit view's add-on wording depends on the plan the controller knows: a paid consumer plan (confirmed or assumed) only.
test('the controller words a projected overage as add-on credits only for a paid consumer plan', async () => {
 const logLine = (day: number, limit: number) => `2030-01-0${day + 1} 00:00:00.000 [info] synthetic-envelope ` + JSON.stringify({ commandName: 'GetUsageLimitsCommand', input: {}, output: { userInfo: { userId: 'synthetic-plan-wording' }, nextDateReset: '2030-02-01T00:00:00.000Z', usageBreakdownList: [{ resourceType: 'CREDIT', unit: 'INVOCATIONS', currentUsageWithPrecision: day * 50, usageLimitWithPrecision: limit, nextDateReset: '2030-02-01T00:00:00.000Z', bonuses: [], overageCredits: [] }] }, metadata: { httpStatusCode: 200 } }) + '\n';
 const run = async (limit: number, answers?: { plan: string; billing: string }) => {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'synthetic-plan-wording-')));
  const dir = join(base, 'Kiro', 'logs', 'synthetic-run', 'synthetic-window', 'exthost', 'kiro.kiroAgent');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'q-client.log'), [0, 1, 2, 3, 4, 5, 6, 7].map(d => logLine(d, limit)).join(''));
  let html = '';
  const ui = { setStatus(_t: string, d: string) { html = d; }, showDetails() {}, onClick() {}, onChange() {}, everyMinute() {}, dispose() {} };
  try {
   const extension: any = await startExtension(ui as never, { source: join(base, 'Kiro'), storage: join(base, 'owned'), timezone: 'UTC', now: () => '2030-01-08T00:30:00.000Z' });
   if (answers) { let r = await extension.submitAdvisor(0, { ...answers, addOns: 'none', addOnCredits: '' }); if (r.status === 'stale') r = await extension.submitAdvisor(r.epoch, { ...answers, addOns: 'none', addOnCredits: '' }); assert.equal(r.status, 'ok'); }
   extension.dispose();
   return [...html.slice(html.indexOf('class="hero'), html.indexOf('<dl class="stats">')).matchAll(/<p class="small overage">([^<]*)<\/p>/g)].map(m => m[1]!);
  } finally { await rm(base, { recursive: true, force: true }); }
 };
 const addOn = /^At this pace you would need (about|at least) [\d,]+ add-on credits .* before the reset on 1 Feb\.$/;
 // Assumed Pro (limit 1000) and confirmed Pro Max / consumer: add-on wording.
 assert.match((await run(1000))[0]!, addOn);
 assert.match((await run(1000, { plan: 'pro_max', billing: 'consumer_prepaid' }))[0]!, addOn);
 assert.match((await run(1000, { plan: 'pro', billing: 'unsure' }))[0]!, addOn); // billing not confirmed counts as consumer
 // Free (confirmed), Enterprise, and a limit that matches no plan: the neutral sentence.
 const neutral = /^At this pace by the reset: (about \d+|under 0\.1) credits over/;
 assert.match((await run(1000, { plan: 'free', billing: 'consumer_prepaid' }))[0]!, neutral);
 assert.match((await run(1000, { plan: 'pro', billing: 'enterprise_postpaid' }))[0]!, neutral);
 assert.match((await run(333))[0]!, neutral);
});

// Day budget (spec section 2): today's usage against the day-anchored allowance. Synthetic data; 2030-06-08 is a Saturday.
const WEEKDAYS: BudgetDay[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
const intraday = (zoneDays: readonly BudgetDay[] = ALL_DAYS, zone = 'UTC') => ({ days: zoneDays, zone });
// Eight daily updates 70 credits apart minus 60, then one update 10 hours into 8 Jun: 55 used today against 2300 credits left over 23 days.
const dayPoints = () => [...Array.from({ length: 8 }, (_, i) => snapshot(`2030-06-${String(i + 1).padStart(2, '0')}T00:00:00Z`, String(i * 10), { limit: '2370' })), snapshot('2030-06-08T10:00:00Z', '125', { limit: '2370' })];
const dayNow = '2030-06-08T12:00:00Z';
const withDay = (points: ReturnType<typeof dayPoints>, now: string, daily?: { days: readonly BudgetDay[]; zone: string }) =>
 present(view(points, now), [], '', '', undefined, now, false, undefined, '', undefined, undefined, false, daily);

test('status bar shows used against today\'s allowance', () => {
 const r = withDay(dayPoints(), dayNow);
 assert.match(r.text, /On track • 55\/100 today/);
 assert.equal(r.allowance, true);
 assert.match(r.tooltip, /^Today: 55 of 100 credits used \(since your first Kiro update at 00:00\)$/m);
 assert.ok(!r.tooltip.includes('Daily credit budget until reset'));
 assert.match(r.html, /Today: 55 of 100 used/);
});
test('status bar keeps run-out text and moves today into the tooltip', () => {
 const r = present(view(series(10, '100'), NOW), [], '', '', undefined, NOW);
 assert.equal(r.text, '$(warning) Kiro credits: Likely to exceed • runs out 11 Jun');
 assert.ok(!r.text.includes('today'));
 assert.match(r.tooltip, /^Today: /m);
 assert.equal(r.allowance, false);
});
test('status bar shows day off with and without usage', () => {
 const weekdays = intraday(WEEKDAYS);
 const without = present(view(series(10, '1000', 7), NOW), [], '', '', undefined, NOW, false, undefined, '', undefined, undefined, false, weekdays);
 assert.match(without.text, /Provisional • day off$/);
 assert.match(without.tooltip, /^Today is not a budget day · Budget days: Mon–Fri$/m);
 assert.equal(without.allowance, false); // no figure in the status text
 const points = [...series(10, '1000', 7), snapshot('2030-06-08T00:00:00Z', '70'), snapshot('2030-06-08T10:00:00Z', '82')];
 const withUsage = withDay(points, dayNow, weekdays);
 assert.match(withUsage.text, / • 12 today \(day off\)$/);
 assert.match(withUsage.tooltip, /^Today is not a budget day: 12 credits used \(since 00:00\) · Budget days: Mon–Fri$/m);
 assert.match(withUsage.html, /<dd class="muted small">Today is not a budget day<\/dd>/);
});
test('budget days appear in the tooltip only when restricted', () => {
 const monday = '2030-06-10T00:00:00Z';
 const points = series(10, '1000', 10);
 const all = withDay(points, monday, intraday());
 const some = withDay(points, monday, intraday(WEEKDAYS));
 assert.match(all.tooltip, /^Today: 0 of /m); assert.ok(!all.tooltip.includes('Budget days'));
 assert.match(some.tooltip, /^Today: 0 of [\d.]+ credits used \(since your first Kiro update at 00:00\) · Budget days: Mon–Fri$/m);
 const noUpdate = withDay(series(10, '1000', 9), monday, intraday(['mon', 'wed']));
 assert.match(noUpdate.tooltip, /^Today: up to [\d.]+ credits · Budget days: Mon, Wed$/m);
 assert.match(noUpdate.text, /• [\d.]+\/day$/);
 assert.match(noUpdate.html, /Up to [\d.]+ per budget day/);
 assert.match(withDay(series(10, '1000', 9), monday, intraday()).html, /Up to [\d.]+ per day/);
});
test('colours and severity are unchanged by the day budget', () => {
 const cases: [ReturnType<typeof series>, string][] = [[series(10, '100'), NOW], [series(10, '321'), NOW], [series(10), NOW], [series(10, '1000', 1), '2030-06-01T00:00:00Z'], [series(10, '70'), NOW]];
 for (const [points, now] of cases) {
  const base = withDay(points, now, intraday()), restrictedView = withDay(points, now, intraday(['sat', 'sun', 'mon']));
  assert.equal(restrictedView.warning, base.warning); assert.equal(restrictedView.severity, base.severity);
  assert.equal(restrictedView.text.slice(0, restrictedView.text.indexOf(':')), base.text.slice(0, base.text.indexOf(':')));
 }
 assert.equal(withDay(series(10, '321'), NOW, intraday(['sat', 'sun', 'mon'])).warning, true);
 assert.match(withDay(series(10, '321'), NOW, intraday(['sat', 'sun', 'mon'])).text, /At risk • 0\/22\.8 today/);
 assert.match(withDay(series(10, '321'), NOW, intraday(WEEKDAYS)).text, /At risk • 0 today \(day off\)/); // Saturday is a day off here
});
test('technical details relabel the 24-hour allocation', () => {
 const r = withDay(dayPoints(), dayNow);
 assert.ok(r.html.includes('24-hour allocation from the last update (CLI)'));
 assert.ok(!r.html.includes('Exact daily credit budget / 24h'));
 assert.match(r.html, /<th scope="row">Today&#39;s allowance \(exact\)<\/th><td>100<\/td>/);
 assert.match(r.html, /<th scope="row">Today&#39;s allowance anchor \(UTC\)<\/th><td>2030-06-08T00:00:00\.000Z<\/td>/);
 assert.match(r.html, /<th scope="row">Used today since \(UTC\)<\/th><td>2030-06-08T00:00:00\.000Z<\/td>/);
 assert.match(r.html, /<th scope="row">Budget days<\/th><td>Every day<\/td>/);
 assert.match(r.html, /<th scope="row">Budget-day weight until reset<\/th><td>23<\/td>/);
 const none = present(view([], NOW));
 assert.match(none.html, /<th scope="row">Today&#39;s allowance \(exact\)<\/th><td>Not available<\/td>/);
 assert.match(none.html, /<th scope="row">Budget days<\/th><td>Not available<\/td>/);
});
test('restricted days rename the floor comparison to calendar days', () => {
 const one = [snapshot('2030-06-25T00:00:00Z', '900')], now = '2030-06-25T00:00:00Z'; // Tuesday
 const hero = (html: string) => /<section class="hero[^"]*"[\s\S]*?<\/section>/.exec(html)![0];
 const plain = hero(withDay(one, now, intraday()).html), restrictedHero = hero(withDay(one, now, intraday(WEEKDAYS)).html);
 assert.match(plain, /Even this minimum is above your daily allowance\./);
 assert.ok(!restrictedHero.includes('above your daily allowance'));
 assert.match(restrictedHero, / Even this minimum is above the 16\.6 credits per calendar day that would last until the reset\./);
 assert.match(restrictedHero, /Up to [\d.]+ credits per budget day until the reset/);
 assert.match(restrictedHero, /At your first update today you had 100 credits left and \d+ budget days until the reset on 1 Jul, so up to [\d.]+ per budget day; 0 used so far\./);
 assert.match(plain, /At your first update today you had 100 credits left and 6 days until the reset on 1 Jul, so up to 16\.6 per day; 0 used so far\./);
});
test('observed usage card reports today in local time', () => {
 const points = [snapshot('2030-06-08T00:40:00Z', '1.1'), snapshot('2030-06-08T02:50:00Z', '2.223456789')];
 const card = (daily?: { days: readonly BudgetDay[]; zone: string }) => /<section id="usage-context"[\s\S]*?<\/section>/.exec(withDay(points, '2030-06-08T02:51:00Z', daily).html)![0];
 assert.match(card(), /<h3>Today<\/h3><p>Since 00:40: 1\.123456789 credits used, as of 8 Jun 2030, 02:50 UTC\. Today&#39;s allowance: 43\.4 credits\.<\/p>/);
 assert.match(card(intraday(ALL_DAYS, 'Europe/Berlin')), /<h3>Today<\/h3><p>Since 02:40: 1\.123456789 credits used, as of 8 Jun 2030, 02:50 UTC\. Today&#39;s allowance: 43\.2 credits\.<\/p>/);
 assert.ok(!card().includes('Today (UTC)'));
 const stale = withDay(points, '2030-06-09T12:00:00Z').html;
 assert.ok(!stale.includes('id="usage-context"') || /Today&#39;s usage isn&#39;t available yet\./.test(stale));
});
test('used above a zero allowance renders without negatives', () => {
 // Over the limit at the first update of the day: nothing was left, and the 12 used since then is still shown.
 const points = [...series(10, '60', 7), snapshot('2030-06-08T00:00:00Z', '70', { limit: '60' }), snapshot('2030-06-08T10:00:00Z', '82', { limit: '60' })];
 const r = withDay(points, dayNow);
 assert.match(r.tooltip, /^Today: 12 of 0 credits used \(since your first Kiro update at 00:00\)$/m);
 assert.ok(!/-\d/.test(r.tooltip)); assert.ok(!/NaN|undefined|Infinity/.test(r.text + r.tooltip + r.html));
 assert.ok(!r.text.includes('-'));
 assert.match(r.html, /At your first update today you had 0 credits left|Above reported limit/);
});
test('a failing day budget keeps the gauge up without day figures', () => {
 const unreadable = { days: null, zone: 'UTC' } as unknown as { days: readonly BudgetDay[]; zone: string };
 let r: ReturnType<typeof present> | undefined;
 assert.doesNotThrow(() => { r = withDay(dayPoints(), dayNow, unreadable); });
 assert.equal(r!.allowance, false); assert.ok(!r!.text.includes('today')); assert.match(r!.text, /On track • 99\.\d\/day/);
 assert.ok(r!.tooltip.includes('Daily credit budget until reset: ')); assert.ok(!r!.tooltip.includes('Budget days'));
});
