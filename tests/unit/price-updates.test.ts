import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePriceFile, builtInPriceFile, PRICE_FILE_URL, MAX_PRICE_FILE_BYTES } from '../../src/session/price-data.ts';
import { activeCatalog, reviewedCatalog } from '../../src/cost/catalog.ts';
import { activeModels, modelHint, MODELS, TABLE_DATE } from '../../src/session/models.ts';
import { applyStoredPrices, readPriceState, readPriceUpdates, runPriceUpdates, type PriceDeps, type PriceState, type PriceChoice } from '../../src/extension/price-updates.ts';

const NOW = '2030-06-15T12:00:00Z';
// A synthetic newer file: the built-in data with a later date, one changed fee and one changed multiplier.
const newer = (edit?: (f: any) => void): string => {
 const f = JSON.parse(JSON.stringify(builtInPriceFile()));
 f.catalog.version = '2030-06-01'; f.catalog.verifiedOn = '2030-06-01T00:00:00Z';
 f.catalog.plans[1].fee = '25';
 f.models.date = '2030-06-01';
 f.models.rows.find((r: any) => r.id === 'claude-sonnet-5').multiplier = '1.5';
 edit?.(f);
 return JSON.stringify(f);
};

test('the published price file is exactly the data built into this version', () => {
 const published = JSON.parse(readFileSync(new URL('../../data/prices.json', import.meta.url), 'utf8'));
 assert.deepEqual(published, JSON.parse(JSON.stringify(builtInPriceFile())), 'run scripts/write-prices.ts after changing the catalog or the model table');
});

test('a valid newer file is accepted and a rebuilt projection is returned', () => {
 const update = parsePriceFile(newer(f => { f.extra = 'x'; f.models.rows[0].extra = 'y'; }), NOW)!;
 assert.equal(update.catalog.plans[1].fee, '25');
 assert.equal(update.models.date, '2030-06-01');
 assert.equal(update.models.rows.find(r => r.id === 'claude-sonnet-5')?.multiplier, '1.5');
 assert.ok(!('extra' in update.models.rows[0]));
});

test('a file that is not strictly newer, from the future, oversized, malformed or invalid is refused', () => {
 assert.equal(parsePriceFile(JSON.stringify(builtInPriceFile()), NOW), undefined, 'same date: nothing new');
 assert.equal(parsePriceFile(newer(), '2030-05-01T00:00:00Z'), undefined, 'dated in the future');
 assert.equal(parsePriceFile('x'.repeat(MAX_PRICE_FILE_BYTES + 1), NOW), undefined);
 assert.equal(parsePriceFile('not json', NOW), undefined);
 assert.equal(parsePriceFile('null', NOW), undefined);
 for (const bad of [
  (f: any) => { f.schemaVersion = 2; }, (f: any) => { f.catalog.plans[1].fee = '-1'; }, (f: any) => { f.catalog.plans.pop(); }, (f: any) => { f.catalog.currency = 'EUR'; },
  (f: any) => { f.models.rows[0].multiplier = '1e9'; }, (f: any) => { f.models.rows[0].id = '../x'; }, (f: any) => { f.models.rows[0].name = '<b>'; },
  (f: any) => { f.models.rows.push({ ...f.models.rows[0] }); }, (f: any) => { f.models.rows[0].basis = 'guess'; }, (f: any) => { f.models.date = '2030-13-40'; }, (f: any) => { f.models.rows = []; },
 ]) assert.equal(parsePriceFile(newer(bad), NOW), undefined);
});

test('only the newer part replaces the built-in one', () => {
 const modelsOnly = parsePriceFile(newer(f => { f.catalog = JSON.parse(JSON.stringify(reviewedCatalog)); }), NOW)!;
 assert.equal(modelsOnly.catalog.plans[1].fee, reviewedCatalog.plans[1].fee);
 assert.equal(modelsOnly.models.date, '2030-06-01');
 const catalogOnly = parsePriceFile(newer(f => { f.models.date = TABLE_DATE; f.models.rows = JSON.parse(JSON.stringify(MODELS)); }), NOW)!;
 assert.equal(catalogOnly.catalog.plans[1].fee, '25');
 assert.equal(catalogOnly.models.date, TABLE_DATE);
});

test('the setting is read from the user scope only, and anything else is off', () => {
 assert.equal(readPriceUpdates({ globalValue: 'auto' }), 'auto');
 assert.equal(readPriceUpdates({ globalValue: 'ask' }), 'ask');
 assert.equal(readPriceUpdates({ globalValue: 'on' }), 'off');
 assert.equal(readPriceUpdates(undefined), 'off');
 assert.equal(readPriceUpdates({ workspaceValue: 'auto', globalValue: undefined } as any), 'off');
 assert.deepEqual(readPriceState({ checkedAt: 'nope', askedAt: '2030-06-01T00:00:00Z', x: 1 }), { askedAt: '2030-06-01T00:00:00Z' });
});

const harness = (over: Partial<PriceDeps> & { stored?: string; mode?: 'ask' | 'auto'; answer?: PriceChoice; remote?: string } = {}) => {
 const log = { fetched: [] as string[], written: [] as string[], asked: 0, turnedOff: 0, states: [] as PriceState[] };
 let state: PriceState = {}, stored = over.stored;
 const deps: PriceDeps = {
  now: () => Date.parse(NOW),
  readStored: async () => stored,
  writeStored: async t => { log.written.push(t); stored = t; return true; },
  fetchText: async url => { log.fetched.push(url); return over.remote; },
  state: () => state,
  saveState: async s => { state = s; log.states.push(s); return true; },
  ask: async () => { log.asked++; return over.answer; },
  turnOff: async () => { log.turnedOff++; },
  ...over,
 };
 return { deps, log, get state() { return state; }, set state(s: PriceState) { state = s; } };
};
const reset = () => { applyStoredPrices('off', { now: () => 0, readStored: async () => undefined }); };

test('off: nothing is read, fetched or asked, and the built-in prices are in use', async () => {
 const h = harness({ stored: newer(), remote: newer() });
 await runPriceUpdates('off', h.deps);
 assert.deepEqual([h.log.fetched, h.log.asked], [[], 0]);
 assert.equal(activeCatalog(), reviewedCatalog);
 assert.equal(activeModels().date, TABLE_DATE);
});

test('auto: fetches the one fixed address once, stores a rebuilt copy, uses it, and does not fetch again within a week', async () => {
 reset();
 const h = harness({ remote: newer() });
 await runPriceUpdates('auto', h.deps);
 assert.deepEqual(h.log.fetched, [PRICE_FILE_URL]);
 assert.equal(h.log.asked, 0);
 assert.equal(activeCatalog().plans[1].fee, '25');
 assert.equal(modelHint('claude-sonnet-5', Date.parse(NOW))?.multiplier, '1.5');
 assert.ok(!h.log.written[0].includes('extra'));
 await runPriceUpdates('auto', h.deps);
 assert.equal(h.log.fetched.length, 1, 'weekly limit');
 reset();
 assert.equal(activeCatalog(), reviewedCatalog);
});

test('a failed or invalid download changes nothing, and the weekly limit still holds', async () => {
 reset();
 for (const remote of [undefined, 'garbage', newer(f => { f.schemaVersion = 9; })]) {
  const h = harness({ remote });
  await runPriceUpdates('auto', h.deps);
  assert.deepEqual(h.log.written, []);
  assert.equal(activeCatalog(), reviewedCatalog);
  assert.ok(h.state.checkedAt);
 }
});

test('ask: asks once a week; "Check now" fetches, "Not now" and dismiss do not, "Turn off" switches the setting off', async () => {
 reset();
 let h = harness({ answer: 'check', remote: newer() });
 await runPriceUpdates('ask', h.deps);
 assert.deepEqual([h.log.asked, h.log.fetched.length], [1, 1]);
 reset();
 for (const answer of ['later', undefined] as const) {
  h = harness({ answer, remote: newer() });
  await runPriceUpdates('ask', h.deps);
  assert.deepEqual([h.log.asked, h.log.fetched.length], [1, 0]);
  await runPriceUpdates('ask', h.deps);
  assert.equal(h.log.asked, 1, 'not asked again within a week');
 }
 h = harness({ answer: 'off', remote: newer() });
 await runPriceUpdates('ask', h.deps);
 assert.deepEqual([h.log.turnedOff, h.log.fetched.length], [1, 0]);
});

test('a stored newer copy is used on start-up in ask and auto mode, ignored when off, and dropped when it is no longer newer', async () => {
 reset();
 const h = harness({ stored: newer() });
 h.state = { checkedAt: NOW, askedAt: NOW };
 await runPriceUpdates('ask', h.deps);
 assert.equal(activeCatalog().plans[1].fee, '25');
 await runPriceUpdates('off', h.deps);
 assert.equal(activeCatalog(), reviewedCatalog);
 assert.equal(await applyStoredPrices('auto', { now: () => Date.parse(NOW), readStored: async () => JSON.stringify(builtInPriceFile()) }), false);
 assert.equal(activeCatalog(), reviewedCatalog);
 reset();
});

test('the price refresh is the only place that opens a connection, and the address is fixed', () => {
 const ext = readFileSync(new URL('../../src/extension/extension.ts', import.meta.url), 'utf8');
 assert.equal((ext.match(/\bfetch\(/g) ?? []).length, 1);
 assert.match(ext, /if \(url !== PRICE_FILE_URL\) return undefined;/);
 assert.match(ext, /redirect: 'error', credentials: 'omit'/);
 assert.equal(PRICE_FILE_URL, 'https://raw.githubusercontent.com/StefanSuess/Bobert/main/data/prices.json');
});
