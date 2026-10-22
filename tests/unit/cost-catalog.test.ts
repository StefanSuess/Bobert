import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewedCatalog, validateCatalog } from '../../src/cost/catalog.ts';
import { syntheticCatalog } from './cost-synthetic.ts';

test('catalog rejects invalid rules without returning rejected data', () => {
 const mutations = [
  (c:any)=>c.schemaVersion=999, (c:any)=>c.plans[0].source.url='',
  (c:any)=>c.plans.push(c.plans[0]), (c:any)=>c.plans[1].fee='-1',
  (c:any)=>c.consumer.minimumCredits='2501', (c:any)=>c.consumer.billingSystem='enterprise_postpaid',
  (c:any)=>c.rules[0].effectiveTo='2029-01-01T00:00:00Z',
  (c:any)=>c.rules[0].status='conflicting', (c:any)=>c.currency='EUR',
 ];
 for (const mutate of mutations) {
  const c=syntheticCatalog(); mutate(c);
  const r=validateCatalog(c,'2030-01-01T00:00:00Z');
  assert.equal(r.status,'unavailable'); assert.equal(r.catalog,null);
  assert.ok(r.reasons.every(x=>/^[a-z_]+$/.test(x)));
 }
});
test('reviewed catalog retains all tiers; purchase step and rounding are documented, slot release is still unknown', () => {
 const r=validateCatalog(reviewedCatalog,'2026-10-22T12:00:00Z');
 assert.equal(r.catalog!.version,'2026-10-22');assert.equal(r.catalog!.verifiedOn,'2026-10-22T00:00:00Z');
 assert.equal(validateCatalog(reviewedCatalog,'2026-10-21T23:59:59Z').status,'unavailable');
 assert.equal(r.status,'available'); assert.equal(r.catalog!.plans.length,5);
 assert.equal(r.catalog!.enterprise.allowedPlans.length,4);
 assert.equal(r.catalog!.consumer.purchaseStepCredits,'1');
 assert.equal(r.catalog!.consumer.moneyRounding,'exact');
 assert.deepEqual(r.catalog!.plans.map(p=>[p.id,p.fee,p.credits]),[['free','0','50'],['pro','20','1000'],['pro_plus','40','2000'],['pro_max','100','5000'],['power','200','10000']]);
 assert.deepEqual([r.catalog!.consumer.pricePerCredit,r.catalog!.consumer.minimumCredits,r.catalog!.consumer.maximumCredits,r.catalog!.consumer.maximumPacks],['0.04','125','2500',5]);
 assert.ok(r.catalog!.rules.some(x=>x.id==='B1'&&x.url==='https://kiro.dev/docs/billing/add-on-credits/'));
 assert.equal(r.catalog!.consumer.depletedSlotRelease,null);
 assert.equal(r.catalog!.market,'commercial');
 assert.equal(r.catalog!.rules.find(x=>x.id==='B3')!.effectiveFrom,null);
});
test('review policy keeps day 30 dated and day 31 conditional', () => {
 assert.equal(validateCatalog(syntheticCatalog(),'2030-01-31T00:00:00Z').status,'available');
 const r=validateCatalog(syntheticCatalog(),'2030-02-01T00:00:00Z');
 assert.equal(r.status,'conditional'); assert.deepEqual(r.reasons,['catalog_review_due']);
});
test('future effective changes are retained and unknown properties dropped', () => {
 const c:any=syntheticCatalog(); c.privateSentinel='synthetic-private-marker';
 c.changes=[{at:'2030-02-01T00:00:00Z',planId:'pro',fee:'21',credits:'1000',source:c.plans[0].source}];
 const r=validateCatalog(c,'2030-01-01T00:00:00Z');
 assert.equal(r.catalog!.changes[0].at,'2030-02-01T00:00:00Z');
 assert.ok(!JSON.stringify(r).includes('synthetic-private-marker'));
 c.changes.push({...c.changes[0],fee:'22'});
 assert.equal(validateCatalog(c,'2030-01-01T00:00:00Z').status,'unavailable');
});

test('incompatible purchase quantum is rejected before simulation',()=>{
 const c=syntheticCatalog();c.consumer.minimumCredits='2499';c.consumer.purchaseStepCredits='2498';
 assert.equal(validateCatalog(c,'2030-01-01T00:00:00Z').status,'unavailable');
});
