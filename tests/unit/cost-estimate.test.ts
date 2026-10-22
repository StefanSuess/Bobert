import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {estimateSavings,formatUsd,insufficientEstimate} from '../../src/cost/estimate.ts';
import {advisorProfile,classifyAdvice,planHint,noAnswers,type AdvisorAnswers,type AdvisorContext} from '../../src/cost/advisor.ts';
import {reviewedCatalog} from '../../src/cost/catalog.ts';
import {optimizeCosts} from '../../src/cost/optimize.ts';
import {calculateCosts} from '../../src/extension/cost-inputs.ts';
import {presentAdvisor} from '../../src/extension/advisor-presentation.ts';
import {reviewAdvisor} from '../../src/extension/advisor-inputs.ts';
import {request,profile,forecastEvidence,syntheticCatalog} from './cost-synthetic.ts';
import type {BillingProfile,CostOptimization,CostRequest,PricingCatalog} from '../../src/cost/types.ts';

// Entirely invented figures. The reviewed bundled prices are used on a synthetic 2030 timeline.
// `fresh` models unknown purchase rules (the state before 2026-10-22): extra credits on a plan cannot be priced, which
// exercises every "could not be priced" path. `current` is the bundled catalog as shipped: whole-credit, exact add-on purchases.
const fresh=():PricingCatalog=>{const c=structuredClone(reviewedCatalog);c.verifiedOn='2030-01-01T00:00:00Z';c.consumer.purchaseStepCredits=null;c.consumer.moneyRounding=null;return c;};
const current=():PricingCatalog=>{const c=structuredClone(reviewedCatalog);c.verifiedOn='2030-01-01T00:00:00Z';return c;};
const ctx=(over:Partial<AdvisorContext>={}):AdvisorContext=>({planSource:'confirmed',plan:'pro_plus',billingConfirmed:true,addOns:'none',assumptions:[],...over});
/** Manual monthly demand through the real simulator and optimizer. `credits` is the base full-cycle demand. */
// Manual what-if demand is never a production advisor input, so the fixture is relabelled as a regular forecast.
const forecastLike=(q:CostRequest):CostRequest=>({...q,demands:q.demands.map(d=>({...d,source:'forecast_regular' as const,assumptions:d.assumptions.filter(a=>a!=='manual_hypothetical_demand'&&a!=='repeat_manual_cycle_total')}))});
const build=(credits:string,p:BillingProfile,months:1|3|6=1,catalog:PricingCatalog=fresh()):CostRequest=>forecastLike({...request(credits,months,p),catalog});
const optimize=(credits:string,p:BillingProfile=profile({currentPlan:'pro_plus'}),months:1|3|6=1,catalog:PricingCatalog=fresh()):CostOptimization=>optimizeCosts(build(credits,p,months,catalog));
const estimate=(credits:string,p?:BillingProfile,over:Partial<AdvisorContext>={},months:1|3|6=1)=>{
 const result=optimize(credits,p,months),context=ctx(over);
 return {result,context,advice:classifyAdvice(result,context),est:estimateSavings(result,context,classifyAdvice(result,context),months)};
};
const present=(est:ReturnType<typeof estimate>,over:Partial<AdvisorContext>={})=>presentAdvisor({hint:planHint('2000',reviewedCatalog),context:ctx(over),horizons:[{months:1,result:est.result,reasons:[]}],advice:[est.advice],singleAccount:true,limit:'2000'});

test('positive modelled savings: a cheaper plan that serves the forecast gives a numerical difference',()=>{
 const {est,advice}=estimate('900');
 assert.equal(est.tier,'modelled');assert.equal(est.outcome,'saving');
 // The engine itself still withholds a verdict (cheapest overall is unknown because mid-cycle upgrades cannot be priced).
 assert.equal(advice.kind,'conditional_comparison');
 assert.equal(est.baselinePlan,'pro_plus');assert.equal(est.base?.baseline,'40');assert.equal(est.base?.best?.plan,'pro');assert.equal(est.base?.best?.cost,'20');
 assert.equal(est.base?.saving,'20');assert.equal(est.currency,'USD');
 assert.deepEqual(est.window,{from:'2030-01-01T00:00:00.000Z',to:'2030-02-01T00:00:00.000Z'});
 assert.equal(est.base?.forecastCredits,'900');
 for(const c of ['list_prices_pre_tax','forecast_not_guaranteed','only_next_reset_changes_compared'])assert.ok(est.conditions.includes(c),c);
 // Multi-cycle figures are totals over the same horizon, labelled as sustained-usage scenarios.
 const three=estimate('900',undefined,{},3).est;
 assert.equal(three.base?.saving,'60');assert.ok(three.conditions.includes('sustained_usage_scenario'));assert.equal(three.months,3);
 const six=estimate('900',undefined,{},6).est;assert.equal(six.base?.saving,'120');
});

test('no cheaper calculable alternative: staying put is reported as a zero difference, never as a saving',()=>{
 // 1,500 credits exceed Pro's allowance; Pro's extras cannot be priced, so only Pro+ and larger plans are calculable.
 const {est}=estimate('1500');
 assert.equal(est.tier,'modelled');assert.equal(est.outcome,'no_cheaper');
 assert.equal(est.base?.saving,'0');assert.equal(est.base?.best?.plan,'pro_plus');assert.equal(est.base?.best?.keep,true);
 // Pro could not be priced, so the claim is "lowest calculable", with the overall-cheapest caveat.
 assert.ok((est.base?.unpriced??0)>0);assert.ok(est.conditions.includes('overall_cheapest_unknown'));
 // Equal cost must prefer the current plan, so a tie is never presented as a saving.
 const tied=fresh();tied.plans.find(p=>p.id==='pro')!.fee='40';
 const tie=estimateSavings(optimize('900',profile({currentPlan:'pro_plus'}),1,tied),ctx(),{kind:'conditional_comparison',reasons:[]},1);
 assert.equal(tie.outcome,'no_cheaper');assert.equal(tie.base?.best?.plan,'pro_plus');assert.equal(tie.base?.saving,'0');
});

test('unconfirmed current plan: the estimate lists every assumption and never reads as confirmed',()=>{
 const {h,f}=forecastEvidence();
 const obs={limit:'1000',usage:'1',asOf:f.asOf,resetAt:f.resetAt};
 const built=advisorProfile(obs,noAnswers,planHint('1000',reviewedCatalog));
 const horizons=calculateCosts({mode:'personalized',profile:built.profile!,monthlyCredits:'0',beforeReset:undefined,demandMode:'forecast'},f,h,'2030-01-04T00:00:00Z',fresh());
 assert.ok(horizons[0].result);
 const advice=horizons.map(x=>classifyAdvice(x.result,built.context));
 const est=estimateSavings(horizons[0].result,built.context,advice[0],1);
 assert.equal(est.tier,'modelled');
 for(const c of ['plan_is_hint','billing_assumed_consumer','add_ons_assumed_none'])assert.ok(est.conditions.includes(c),c);
 const html=presentAdvisor({hint:planHint('1000',reviewedCatalog),context:built.context,horizons,advice,singleAccount:true,limit:'1000'});
 assert.ok(html.includes('Modelled estimate'));assert.ok(html.includes('(assumed from your 1,000-credit limit)'));assert.ok(!html.includes('>Confirmed<'));assert.ok(!html.includes('Confirmed by you'));
 assert.match(html,/inferred from your reported 1000-credit limit, not confirmed/);
 assert.match(html,/personal \(consumer\) billing/);assert.match(html,/no purchased add-on credits/);
 // The plan is confirmed or changed with the two buttons next to it; the old duplicated instructions are gone.
 assert.match(html,/<button id="advisor-confirm" type="button" class="plan-button primary" data-hint="pro" hidden>Confirm<\/button> <button id="advisor-change-open" type="button" class="plan-button" hidden>Change<\/button>/);
 for(const gone of ['Not your plan?','Change your plan answers below','Change your plan or answers','status bar','light-bulb','Open Cost Advisor','Likely plan'])assert.ok(!html.includes(gone),gone);
 // The muted line says the estimate assumes the plan, billing and add-on state.
 assert.match(html,/<p class="muted small">Estimate from list prices and your usage forecast, before tax\. It assumes you are on Pro\. Not a guarantee\./);
 // A tiny forecast fits the Free plan; that switch carries its own caveat.
 assert.equal(est.base?.best?.plan,'free');assert.ok(est.conditions.includes('free_plan_terms_unverified'));
 assert.match(html,/Free plan terms for your account were not verified/);
 assert.match(html,/<p class="verdict"><strong>Switch to Free at your next reset: about \$0 a month instead of \$20\.<\/strong><\/p>/);
 assert.match(html,/Moving to Free means cancelling the paid plan; Free terms for your account were not verified\./);
});

test('confirmed plan and billing details are shown as confirmed; the figure stays modelled while engine conditions remain',()=>{
 const e=estimate('900');
 const html=present(e);
 assert.equal(e.est.tier,'modelled');
 assert.ok(html.includes('<span class="badge">Confirmed</span>'));assert.ok(html.includes('Your plan:'));assert.ok(!html.includes('assumed from'));assert.ok(!html.includes('id="advisor-confirm"'));
 assert.match(html,/you are on Pro\+ \(confirmed by you\)/);
 assert.ok(!html.includes('personal (consumer) billing'));assert.ok(!html.includes('no purchased add-on credits'));
 // One decision sentence, the saving, one explanation and one muted line; costs round up, savings round down.
 assert.match(html,/<p class="verdict"><strong>Switch to Pro at your next reset: about \$20 a month instead of \$40\.<\/strong><\/p>/);
 assert.match(html,/<p class="figure"><strong>Save about \$20 a month under your current forecast<\/strong><\/p>/);
 assert.match(html,/<p class="small">Pro includes 1,000 credits, enough for your forecast of about 900\.<\/p>/);
 assert.match(html,/<p class="muted small">Estimate from list prices and your usage forecast, before tax\. It depends on usage; see the details\. Not a guarantee\.<\/p>/);
 assert.match(html,/Over the next full billing cycle \(from 2030-01-01 UTC, 1 month\): Pro\+ \$40, Pro \$20\./);
 for(const gone of ['Change your plan or answers','Not your plan?','status bar','Open Cost Advisor','Used for the estimate'])assert.ok(!html.includes(gone),gone);
});

test('supported tier needs the engine to agree: only an unconditional engine verdict upgrades a modelled figure',()=>{
 const e=estimate('900');
 const clean:CostOptimization={...e.result,status:'available',reasons:[],recommendation:{strategyId:'pro_next_reset_as_needed',demandIds:['low','base','high'],kind:'supported_comparison'},savingsRange:{minimum:{currency:'USD',amount:'20'},maximum:{currency:'USD',amount:'20'}}};
 const advice=classifyAdvice(clean,ctx());assert.equal(advice.kind,'potential_savings');
 const supported=estimateSavings(clean,ctx(),advice,1);assert.equal(supported.tier,'supported');assert.equal(supported.outcome,'saving');
 const html=presentAdvisor({hint:planHint('2000',reviewedCatalog),context:ctx(),horizons:[{months:1,result:clean,reasons:[]}],advice:[advice],singleAccount:true,limit:'2000'});
 assert.ok(html.includes('<strong>Supported estimate.</strong>'));assert.ok(!html.includes('Modelled estimate'));
 // Any open assumption drops it back to modelled even on the same engine result.
 const hinted=ctx({planSource:'hint',assumptions:['plan_is_hint']});
 assert.equal(estimateSavings(clean,hinted,classifyAdvice(clean,hinted),1).tier,'modelled');
});

test('unknown or existing add-on credits never become confirmed zero and never produce a figure',()=>{
 const {h,f}=forecastEvidence();
 const base={limit:'1000',usage:'1',asOf:f.asOf,resetAt:f.resetAt};
 const run=(answers:AdvisorAnswers)=>{
  const built=advisorProfile(base,answers,planHint('1000',reviewedCatalog));
  const horizons=calculateCosts({mode:'personalized',profile:built.profile!,monthlyCredits:'0',beforeReset:undefined,demandMode:'forecast'},f,h,'2030-01-04T00:00:00Z',fresh());
  return {built,horizons,est:horizons.map(x=>estimateSavings(x.result,built.context,classifyAdvice(x.result,built.context),x.months))};
 };
 // Add-ons present, with or without a balance: the plan remainder cannot be separated from the reported limit.
 for(const addOnCredits of [null,'250']){
  const r=run({...noAnswers,plan:'pro',billing:'consumer_prepaid',addOns:'some',addOnCredits});
  assert.ok(r.est.every(e=>e.tier==='insufficient'&&e.outcome==='none'),String(addOnCredits));
  const html=presentAdvisor({hint:planHint('1000',reviewedCatalog),context:r.built.context,horizons:r.horizons,advice:r.horizons.map(x=>classifyAdvice(x.result,r.built.context)),singleAccount:true,limit:'1000'});
  assert.ok(!/USD \d/.test(html.replace(/Bundled list prices[^<]*/,'').split('Full cost comparison')[0]),'no figure before the details');
  assert.match(html,/You have add-on credits/);assert.ok(!html.includes('Modelled estimate'));
 }
 // Enterprise inputs unconfirmed: add-ons stay unknown, so a consumer list-price estimate is not offered.
 const e=run({plan:'pro',billing:'enterprise_postpaid',addOns:null,addOnCredits:null});
 assert.ok(e.est.every(x=>x.tier==='insufficient'));
 // A hand-built context that is inconsistent with the numbers is refused as well.
 const result=optimize('900');
 assert.equal(estimateSavings(result,ctx({addOns:'unknown'}),classifyAdvice(result,ctx({addOns:'unknown'})),1).tier,'insufficient');
 for(const code of ['usage_exceeds_reported_limit','limit_differs_from_plan_credits'])
  assert.equal(estimateSavings(result,ctx({assumptions:[code]}),{kind:'conditional_comparison',reasons:[]},1).tier,'insufficient',code);
 // Explicitly no add-ons: the estimate exists and says so only when it was an assumption.
 const none=run({...noAnswers,plan:'pro',billing:'consumer_prepaid',addOns:'none'});
 assert.ok(none.est.every(x=>x.tier==='modelled'));assert.ok(none.est.every(x=>!x.conditions.includes('add_ons_assumed_none')));
});

test('missing competitor costs and eligibility restrictions limit what is claimed',()=>{
 // Current plan cannot be priced (extras unknown) while a larger plan can: costs only, no difference.
 const costsOnly=estimate('1500',profile({currentPlan:'pro'}),{plan:'pro'});
 assert.equal(costsOnly.est.tier,'comparison_only');assert.equal(costsOnly.est.outcome,'costs_only');
 assert.equal(costsOnly.est.base?.saving,null);assert.equal(costsOnly.est.base?.baseline,null);assert.equal(costsOnly.est.baselinePlan,null);
 assert.ok(costsOnly.est.conditions.includes('baseline_cost_unavailable'));
 const html=present(costsOnly,{plan:'pro'});
 assert.match(html,/<strong>Cost comparison only\.<\/strong>/);assert.ok(!html.includes('class="figure"'));
 assert.match(html,/<p class="verdict"><strong>The lowest cost that could be priced is [^<]+ at about \$\d+ a month\. The cost of staying on Pro could not be calculated, so no saving is shown\.<\/strong><\/p>/);
 assert.match(html,/The cost of staying on your current plan could not be calculated, so no difference is shown/);
 assert.ok(!/modelled potential saving|less per billing/i.test(html));
 // Plans the account may not choose are never offered, so they can never be the "cheaper" plan.
 const restricted=estimate('600',profile({currentPlan:'pro_plus',allowedPlans:['pro_plus','pro_max','power']}));
 assert.equal(restricted.est.outcome,'no_cheaper');assert.ok(restricted.est.base!.priced.every(p=>p.plan!=='pro'&&p.plan!=='free'));
 // Enterprise cannot choose Free.
 const ent=estimateSavings(optimize('30',profile({currentPlan:'pro',billingSystem:'enterprise_postpaid',allowedPlans:['pro','pro_plus','pro_max','power']})),ctx({plan:'pro'}),{kind:'conditional_comparison',reasons:[]},1);
 assert.ok(ent.base===null||ent.base.priced.every(p=>p.plan!=='free'));
 // A balance that is stale or inconsistent with its anchor makes the figure unusable instead of "mostly right".
 const stale=optimizeCosts({...build('900',profile({currentPlan:'pro_plus',resetAt:'2030-02-01T00:00:00Z'})),now:'2030-01-02T12:00:00Z'});
 assert.ok(stale.scenarios.some(s=>s.reasons.includes('inventory_stale')));
 assert.equal(estimateSavings(stale,ctx(),{kind:'conditional_comparison',reasons:[]},1).tier,'insufficient');
});

test('demand sensitivity: when the preferred plan changes the range and the reason are shown',()=>{
 // 900 credits fits Pro; 125% (1,125) does not, so Pro+ is the only calculable option at the high level.
 const e=estimate('900');
 assert.equal(e.est.preferredChanges,true);
 assert.deepEqual(e.est.levels.map(l=>l.best?.plan),['pro','pro','pro_plus']);
 assert.deepEqual(e.est.levels.map(l=>l.saving),['20','20','0']);
 assert.deepEqual(e.est.range,{minimum:'0',maximum:'20'});
 assert.ok(e.est.conditions.includes('sensitivity_changes_preferred_plan'));
 const html=present(e);
 assert.match(html,/The \$20 applies to your forecast \(100%\) only\. At 125% the lowest calculable option is Pro\+ \(difference \$0\)\./);
 assert.match(html,/Costs at 125% of forecast usage could not be fully calculated \(1 option unpriced\), so the calculated range of \$0 to \$20 is not a complete bound\./);
 assert.match(html,/125% of forecast usage:<\/strong> lowest calculable Pro\+ \$40; current plan Pro\+ \$40; no cheaper option \(difference \$0\); 1 option could not be priced, so this is not a complete comparison/);
 // A stable preference has no such caveat.
 const stable=estimate('300');
 assert.equal(stable.est.preferredChanges,false);assert.ok(!stable.est.conditions.includes('sensitivity_changes_preferred_plan'));
});

test('no numerical estimate is justified without calculable costs',()=>{
 const result=optimize('900');
 const advice={kind:'insufficient_information' as const,reasons:[]};
 assert.deepEqual(estimateSavings(null,ctx(),advice,1),insufficientEstimate(1));
 assert.equal(estimateSavings({...result,status:'unavailable',scenarios:[]},ctx(),advice,1).tier,'insufficient');
 // Invented rules (hypothetical catalog) are never turned into a figure for the user.
 const hypothetical=optimizeCosts(request('900',1,profile({currentPlan:'pro_plus'})));
 assert.ok(hypothetical.scenarios.some(s=>s.reasons.includes('hypothetical_catalog')));
 assert.equal(estimateSavings(hypothetical,ctx(),advice,1).tier,'insufficient');
 // Unknown current plan: the engine prices nothing.
 const unknown=optimizeCosts(build('900',profile({currentPlan:null})));
 assert.equal(estimateSavings(unknown,ctx({plan:null,planSource:'unknown'}),advice,1).tier,'insufficient');
 // Malformed results never throw.
 assert.equal(estimateSavings({scenarios:[{}]} as any,ctx(),advice,1).tier,'insufficient');
 assert.equal(estimateSavings({...result,scenarios:'x'} as any,ctx(),advice,1).tier,'insufficient');
 const html=presentAdvisor({hint:planHint('2000',reviewedCatalog),context:ctx(),horizons:[{months:1,result:unknown,reasons:[]}],advice:[advice],singleAccount:true,limit:'2000'});
 assert.match(html,/Not enough confirmed information to compare plans yet\. No savings are claimed\./);
 assert.ok(!html.includes('Modelled estimate'));assert.ok(!/class="figure"/.test(html));
});

test('wording keeps modelled differences apart from realised savings and invoices and never promises',()=>{
 const html=present(estimate('900'));
 assert.match(html,/not a guarantee, not a saving you have realised and not an invoice/);
 assert.match(html,/list prices before tax, no promotions/);
 assert.match(html,/Amounts are bundled list prices in USD before tax\. Promotions are excluded\. They are not invoices\./);
 assert.ok(!/\b(will save|you save|guaranteed saving|guaranteed to|cheapest plan overall|globally cheapest)\b/i.test(html));
 assert.ok(!html.includes('<script'));assert.ok(!html.includes('command:'));assert.ok(!/buy now|purchase now/i.test(html));
 // Horizons, sensitivity and calculations stay under ONE collapsed disclosure; "Conditions that apply" is a collapsed disclosure inside it.
 assert.equal(html.split('<summary>Details and assumptions</summary>').length-1,1);
 assert.match(html,/<details class="advisor-details"><summary>Details and assumptions<\/summary>/);assert.ok(!/<details[^>]* open/.test(html.slice(html.indexOf('id="cost-advisor"'))));
 assert.ok(html.indexOf('<summary>Conditions that apply</summary>')>html.indexOf('<summary>Details and assumptions</summary>'));
 assert.match(html,/<details class="small"><summary>Conditions that apply<\/summary>/);
 for(const summary of ['1, 3 and 6 billing cycles','Sensitivity — 75% / 100% / 125% of forecast usage','Full cost comparison and calculations'])assert.ok(html.includes(`<summary>${summary}</summary>`),summary);
 assert.ok(html.indexOf('class="estimate')<html.indexOf('<details>'));
});

test('horizon lines carry their tier, billing period and currency',()=>{
 const {h,f}=forecastEvidence();
 const built=advisorProfile({limit:'1000',usage:'1',asOf:f.asOf,resetAt:f.resetAt},{...noAnswers,plan:'pro',billing:'consumer_prepaid',addOns:'none'},planHint('1000',reviewedCatalog));
 const horizons=calculateCosts({mode:'personalized',profile:built.profile!,monthlyCredits:'0',beforeReset:undefined,demandMode:'forecast'},f,h,'2030-01-04T00:00:00Z',fresh());
 const html=presentAdvisor({hint:planHint('1000',reviewedCatalog),context:built.context,horizons,advice:horizons.map(x=>classifyAdvice(x.result,built.context)),singleAccount:true,limit:'1000'});
 for(const n of ['1 full billing cycle','3 full billing cycles','6 full billing cycles'])assert.ok(html.includes(`<strong>${n} (`),n);
 assert.match(html,/\(from 2030-02-01 UTC\): Modelled estimate/);assert.match(html,/\$0/);
});

test('formatUsd rounds savings down and costs up',()=>{
 assert.equal(formatUsd('20'),'20');assert.equal(formatUsd('20.5'),'20.50');assert.equal(formatUsd('20.509','down'),'20.50');
 assert.equal(formatUsd('20.501','up'),'20.51');assert.equal(formatUsd('20.50','up'),'20.50');assert.equal(formatUsd('0.999999','up'),'1');assert.equal(formatUsd('19.995','up'),'20');
 assert.equal(formatUsd('0'),'0');
});

test('the picker offers the inferred plan first as a one-click confirmation',async()=>{
 const seen:{title:string;ids:string[];label:string}[]=[];
 const ui={async pick(title:string,items:{id:string;label:string}[]){seen.push({title,ids:items.map(i=>i.id),label:items[0].label});return seen.length===1?items[0].id:'unsure';},async input(){return undefined;}};
 const answers=await reviewAdvisor(ui,planHint('2000',reviewedCatalog),noAnswers);
 assert.equal(answers?.plan,'pro_plus');
 assert.equal(seen[0].ids[0],'plan:pro_plus');assert.equal(seen[0].label,"Yes, I'm on Pro+");
 assert.equal(seen[0].ids.filter(id=>id==='plan:pro_plus').length,1);
 for(const id of ['plan:free','plan:pro','plan:pro_max','plan:power','unsure','reset'])assert.ok(seen[0].ids.includes(id),id);
 // Without a hint the list is unchanged in content and nothing is pre-selected.
 const none:string[]=[];
 await reviewAdvisor({async pick(_t:string,items:{id:string;label:string}[]){none.push(...items.map(i=>i.label));return undefined;},async input(){return undefined;}},planHint(null,reviewedCatalog),noAnswers);
 assert.ok(none.every(l=>!l.startsWith('Yes')));
});

test('the estimate layer is offline, storage-free and does not touch the engine',async()=>{
 const text=await readFile(new URL('../../src/cost/estimate.ts',import.meta.url),'utf8');
 for(const forbidden of ['vscode','node:fs','node:net','node:http','node:child_process','fetch(','globalState','workspaceState','process.env','optimizeCosts','simulateStrategy'])assert.ok(!text.includes(forbidden),forbidden);
 void syntheticCatalog;
});

test('a move to Free is never supported, is caveated in the card and a tiny forecast is not shown as "about 0"',()=>{
 const result=optimize('0.4',profile({currentPlan:'pro'}));
 const context=ctx({plan:'pro'});
 const clean:CostOptimization={...result,status:'available',reasons:[],recommendation:{strategyId:'free_next_reset_as_needed',demandIds:['low','base','high'],kind:'supported_comparison'},savingsRange:{minimum:{currency:'USD',amount:'20'},maximum:{currency:'USD',amount:'20'}}};
 const advice=classifyAdvice(clean,context);assert.equal(advice.kind,'potential_savings');
 const est=estimateSavings(clean,context,advice,1);
 assert.equal(est.base?.best?.plan,'free');assert.equal(est.tier,'modelled');assert.ok(est.conditions.includes('free_plan_terms_unverified'));
 const html=presentAdvisor({hint:planHint('1000',reviewedCatalog),context,horizons:[{months:1,result:clean,reasons:[]}],advice:[advice],singleAccount:true,limit:'1000'});
 assert.ok(!html.includes('Supported estimate'));assert.match(html,/Moving to Free means cancelling the paid plan/);assert.match(html,/Free includes 50 credits, enough for your forecast of under 1 credit\./);assert.ok(!/about 0\b/.test(html));
});

test('an unconfirmed plan qualifies the figure itself and puts the confirmation next to it',()=>{
 const e=estimate('900');
 const html=present(e,{planSource:'hint',assumptions:['plan_is_hint']});
 assert.match(html,/It assumes you are on Pro\+\./);
 assert.match(html,/<strong>Pro\+<\/strong> <span>\(assumed from your 2,000-credit limit\)<\/span> <button id="advisor-confirm"[^>]*data-hint="pro_plus" hidden>Confirm<\/button> <button id="advisor-change-open"[^>]* hidden>Change<\/button>/);
 // The old duplicated instructions are gone; the buttons are the one way to confirm or change.
 for(const gone of ['Not your plan?','Change your plan answers below','Change your plan or answers','Likely plan','Unconfirmed'])assert.ok(!html.includes(gone),gone);
 assert.ok(!html.includes('aria-label="Savings estimate"'));
 // Without any plan: a plain statement and one button.
 const unknown=presentAdvisor({hint:planHint(null,reviewedCatalog),context:ctx({planSource:'unknown',plan:null}),horizons:[],advice:[],singleAccount:true,limit:null});
 assert.match(unknown,/<strong>Plan unknown<\/strong> <button id="advisor-change-open"[^>]* hidden>Choose plan<\/button>/);assert.ok(!unknown.includes('advisor-confirm'));
});

test('review findings: Free at any demand level is caveated, opening lots and cheaper immediate upgrades are not hidden',()=>{
 // Low level picks Free while base does not: the caveat still applies.
 const low=estimate('60');
 assert.equal(low.est.base?.best?.plan,'pro');assert.equal(low.est.levels[0].best?.plan,'free');assert.ok(low.est.conditions.includes('free_plan_terms_unverified'));
 // Known opening purchased lots make figures not comparable, so nothing is produced.
 const lots=optimize('900',profile({currentPlan:'pro_plus',purchased:{kind:'known',value:[{remainingCredits:'400',expiresAt:'2031-01-01T00:00:00Z',expiryPrecision:'instant'}]}}),1,(()=>{const c=fresh();c.consumer.purchaseStepCredits='1';c.consumer.moneyRounding='exact';return c;})());
 assert.equal(estimateSavings(lots,ctx(),{kind:'conditional_comparison',reasons:[]},1).tier,'insufficient');
 // A calculable immediate upgrade that is cheaper than keeping is flagged instead of "no cheaper".
 const cheap=(()=>{const c=fresh();c.consumer.purchaseStepCredits='1';c.consumer.moneyRounding='exact';return c;})();
 const q=build('1500',profile({currentPlan:'pro',resetAt:'2030-02-01T00:00:00Z',planRemaining:{kind:'known',value:'100'},cycleUsageForRerating:{kind:'known',value:'900'}}),1,cheap);
 const r=optimizeCosts({...q,demands:q.demands.map(d=>({...d,beforeReset:{kind:'known' as const,value:{numerator:3000n,denominator:1n}}}))});
 const e=estimateSavings(r,ctx({plan:'pro'}),{kind:'conditional_comparison',reasons:[]},1);
 assert.equal(e.tier,'modelled');assert.equal(e.outcome,'no_cheaper');assert.ok(e.conditions.includes('mid_cycle_upgrade_cheaper'));
 const html=presentAdvisor({hint:planHint('1000',reviewedCatalog),context:ctx({plan:'pro'}),horizons:[{months:1,result:r,reasons:[]}],advice:[{kind:'conditional_comparison',reasons:[]}],singleAccount:true,limit:'1000'});
 assert.match(html,/<strong>No cheaper change at your next reset: stay on Pro\. An immediate upgrade may be cheaper, which this estimate does not price\.<\/strong>/);assert.ok(!html.includes('Stay on Pro:'));
});

test('final headline wording: a usage-dependent saving is a point estimate, never a stable or complete bound',()=>{
 const html=present(estimate('900'));
 const card=html.slice(html.indexOf('<div class="estimate'),html.indexOf('</div>',html.indexOf('<div class="estimate')));
 // Concise, qualified headline; "Up to" is never used because the unpriced level means no bound is known.
 assert.match(card,/<strong>Save about \$20 a month under your current forecast<\/strong>/);
 assert.ok(!/Up to \$/i.test(html));
 assert.match(card,/It depends on usage; see the details\./);
 assert.ok(!/ranges? from|stable range|guaranteed saving/i.test(card));
 // The reasons and limits live in the collapsed details, not in the card.
 for(const text of ['Higher usage may remove it','fits within','Assumes:','not a complete bound'])assert.ok(!card.includes(text),text);
 const details=html.slice(html.indexOf('<details class="advisor-details">'));
 for(const text of ['Higher usage may remove it: at 125% of forecast usage extra credits on smaller plans cannot be priced.','is not a complete bound','Assumes: you are on Pro+ (confirmed by you)'])assert.ok(details.includes(text),text);
 assert.ok(card.length<900,`headline card stays compact (${card.length})`);
});

test('regression: unpriced high-demand scenarios never become a "0 to 20" bound or a bare saving',()=>{
 const e=estimate('900');
 assert.equal(e.est.stable,false);assert.equal(e.est.levels[2].unpriced,1);
 const html=present(e);
 assert.ok(!/<strong>\$20<\/strong>/.test(html));
 // The calculated 0..20 appears only in the details, always marked as not complete.
 for(const m of html.matchAll(/\$0 to \$20/g)){const around=html.slice(m.index,m.index!+160);assert.match(around,/not a complete bound/);}
 // A unit-for-unit stable case keeps the plain figure: every level priced and the same preferred plan.
 const stable=estimate('300');
 assert.equal(stable.est.stable,true);
 const plain=present(stable);
 assert.match(plain,/<p class="figure"><strong>Save about \$20 a month<\/strong><\/p>/);
 assert.ok(!plain.includes('under your current forecast'));assert.ok(!plain.includes('Higher usage may remove it'));
 // A usage-dependent preference without any unpriced option is still qualified, with the other plan named.
 const free=estimate('60');
 assert.equal(free.est.stable,false);assert.match(present(free),/under your current forecast/);
});

test('unpriced low or high levels are named in the details and the headline stays qualified for 3 and 6 cycles',()=>{
 for(const months of [3,6] as const){
  const e=estimate('900',undefined,{},months);
  assert.equal(e.est.stable,false);
  const html=presentAdvisor({hint:planHint('2000',reviewedCatalog),context:ctx(),horizons:[{months,result:e.result,reasons:[]}],advice:[e.advice],singleAccount:true,limit:'2000'});
  // Multi-cycle totals are shown as a monthly average ($60 over 3 cycles, $120 over 6): both are $20 a month.
  assert.match(html,/<strong>Save about \$20 a month under your current forecast<\/strong>/);
  assert.match(html,/Switch to Pro at your next reset: about \$20 a month instead of \$40\./);
  assert.match(html,/1 option could not be priced, so this is not a complete comparison/);
 }
});

test('regression: the same cheapest plan with different savings per usage level is not stable',()=>{
 const priced=fresh();priced.consumer.purchaseStepCredits='1';priced.consumer.moneyRounding='exact';
 const result=optimize('2500',profile({currentPlan:'pro_max'}),1,priced);
 const context=ctx({plan:'pro_max'});
 const advice=classifyAdvice(result,context);
 const est=estimateSavings(result,context,advice,1);
 // Pro+ is cheapest at 75%, 100% and 125% usage, but the saving differs because the current plan's extras grow (exact decimals).
 assert.deepEqual(est.levels.map(l=>l.best?.plan),['pro_plus','pro_plus','pro_plus']);
 assert.deepEqual(est.levels.map(l=>l.unpriced),[0,0,0]);
 assert.deepEqual(est.levels.map(l=>l.saving),['60','40','15']);
 assert.equal(est.preferredChanges,false);assert.notEqual(est.range,null);
 assert.equal(est.stable,false);assert.ok(!est.conditions.includes('sensitivity_changes_preferred_plan'));
 const html=presentAdvisor({hint:planHint('5000',reviewedCatalog),context,horizons:[{months:1,result,reasons:[]}],advice:[advice],singleAccount:true,limit:'5000'});
 assert.match(html,/<p class="verdict"><strong>Switch to Pro\+ at your next reset and buy add-on credits as needed: about \$60 a month instead of \$100\.<\/strong><\/p>/);
 assert.match(html,/<strong>Save about \$40 a month under your current forecast<\/strong>/);
 assert.match(html,/You use about 2,500 credits a month\. Pro\+ includes 2,000; the other 500 cost about \$20 as add-on credits \(\$0\.04 each\)\./);
 // The differing levels are 75% (higher saving) and 125% (lower saving, but not zero): neither is "may remove it".
 assert.match(html,/It depends on usage: at 75% of forecast usage the modelled saving is \$60\./);
 assert.ok(!html.includes('Higher usage may remove it'));
 // Exact decimal comparison: a one-cent difference also breaks stability.
 const cent=fresh();cent.consumer.purchaseStepCredits='1';cent.consumer.moneyRounding='exact';cent.consumer.pricePerCredit='0.04001';
 const sensitive=estimateSavings(optimize('2500',profile({currentPlan:'pro_max'}),1,cent),context,advice,1);
 assert.equal(sensitive.stable,false);
 // Identical savings at every level (and nothing unpriced) stay stable and unqualified.
 assert.equal(estimate('300').est.stable,true);
});

test('"Higher usage may remove it" is only used when the differing scenario is the higher-usage one',()=>{
 const only=(html:string)=>html.includes('Higher usage may remove it');
 // 125% unpriced: higher usage.
 assert.ok(only(present(estimate('900'))));
 // 75% differs (Free is cheapest at low usage): never "Higher usage".
 const low=present(estimate('60'));
 assert.ok(!only(low));assert.match(low,/It depends on usage: at 75% of forecast usage the modelled saving is \$40\./);
});

test('Advisor discloses when full cycles use the longest qualified pooled-history rate',()=>{
 const result=optimize('900');
 for(const scenario of result.scenarios)scenario.assumptions.push('long_history_future_rate');
 const context=ctx(),advice=classifyAdvice(result,context);
 const est=estimateSavings(result,context,advice,1);
 assert.ok(est.conditions.includes('long_history_future_rate'));
 const html=presentAdvisor({hint:planHint('2000',reviewedCatalog),context,horizons:[{months:1,result,reasons:[]}],advice:[advice],singleAccount:true,limit:'2000'});
 assert.ok(html.includes('longest qualified pooled-history rate'));
});

// ---- Recommendation with add-on credits (bundled 2026-10-22 purchase rules, invented synthetic usage) ----
const fiveSlots=(over:Partial<BillingProfile>={}):BillingProfile=>profile({availablePackSlots:{kind:'known',value:5},...over});
const withAddOns=(credits:string,plan:'pro'|'pro_plus'|'pro_max'|'power',months:1|3|6=1,over:Partial<BillingProfile>={})=>{
 const p=fiveSlots({currentPlan:plan,...over}),result=optimize(credits,p,months,current()),context=ctx({plan}),advice=classifyAdvice(result,context);
 const est=estimateSavings(result,context,advice,months);
 const html=presentAdvisor({hint:planHint(null,reviewedCatalog),context,horizons:[{months,result,reasons:[]}],advice:[advice],singleAccount:true,limit:null});
 return {result,context,advice,est,html};
};
const headlineOf=(html:string)=>/<p class="verdict"><strong>([^<]*)<\/strong><\/p>/.exec(html)?.[1];

test('a smaller plan plus add-on credits is recommended when it is cheaper than the bigger plan',()=>{
 // 2,400 credits a month: Pro Max $100; Pro+ $40 + 400 x $0.04 = $56; Pro $20 + 1,400 x $0.04 = $76; Power $200.
 const r=withAddOns('2400','pro_max');
 assert.equal(r.est.base?.best?.plan,'pro_plus');assert.equal(r.est.base?.best?.cost,'56');assert.equal(r.est.base?.baseline,'100');assert.equal(r.est.base?.saving,'44');
 assert.equal(headlineOf(r.html),'Switch to Pro+ at your next reset and buy add-on credits as needed: about $56 a month instead of $100.');
 assert.match(r.html,/<strong>Save about \$44 a month( under your current forecast)?<\/strong>/);
 assert.match(r.html,/<p class="small">You use about 2,400 credits a month\. Pro\+ includes 2,000; the other 400 cost about \$16 as add-on credits \(\$0\.04 each\)\.<\/p>/);
 // The estimate layer exposes exactly what that sentence needs (window totals; one cycle here).
 const b=r.est.base!;
 assert.deepEqual([b.usageCredits,b.planCredits,b.addOnCredits,b.addOnBought,b.addOnCost,b.baselineAddOnCost],['2400','2000','400','400','16','0']);
 assert.ok(r.est.conditions.includes('list_prices_pre_tax'));assert.ok(r.est.conditions.includes('forecast_not_guaranteed'));assert.notEqual(r.est.tier,'supported');
 // Costs round up and savings round down in the sentence: three cycles of the same usage give the same monthly average.
 const three=withAddOns('2400','pro_max',3);assert.equal(three.est.base?.saving,'132');assert.equal(headlineOf(three.html),headlineOf(r.html));
});

test('upgrading beats add-on credits when the bigger plan is cheaper for the usage',()=>{
 // 5,000 credits a month on Pro: Pro $20 + 4,000 x $0.04 = $180; Pro+ $160; Pro Max $100.
 const r=withAddOns('5000','pro');
 assert.equal(r.est.base?.best?.plan,'pro_max');assert.equal(r.est.base?.best?.cost,'100');assert.equal(r.est.base?.baseline,'180');
 assert.equal(headlineOf(r.html),'Upgrade to Pro Max at your next reset: about $100 a month instead of $180 with add-on credits.');
 assert.match(r.html,/Pro Max includes 5,000 credits, enough for your forecast of about 5,000\./);
 assert.match(r.html,/<strong>Save about \$80 a month/);
});

test('staying is recommended only when it is the cheapest calculable option, with the add-on part stated',()=>{
 // 5,500 credits on Pro Max: $100 + 500 x $0.04 = $120; Power $200; Pro+ $40 + 3,500 x $0.04 = $180.
 const r=withAddOns('5500','pro_max');
 assert.equal(r.est.outcome,'no_cheaper');assert.equal(r.est.base?.best?.keep,true);
 assert.match(headlineOf(r.html)??'',/^Stay on Pro Max and buy add-on credits as needed: about \$\d+(\.\d\d)? a month, the cheapest option for your usage\.$/);
 assert.match(r.html,/You use about 5,500 credits a month\. Pro Max includes 5,000; the other 500 cost about \$20 as add-on credits \(\$0\.04 each\)\./);
 assert.ok(!r.html.includes('class="figure"'));
 // Small overage: the 125-credit minimum purchase is said, not a made-up $0.04 each.
 const small=withAddOns('1050','pro');
 assert.equal(headlineOf(small.html),'Stay on Pro and buy add-on credits as needed: about $25 a month, the cheapest option for your usage.');
 assert.match(small.html,/the other 50 cost about \$5 as add-on credits \(the smallest purchase is 125 credits\)\./);
 // No add-ons needed: only the plan's own allowance is described.
 const fits=withAddOns('430','pro');
 assert.match(fits.html,/<p class="small">Pro includes 1,000 credits, enough for your forecast of about 430\.<\/p>/);
});

test('the five-pack limit is respected: options that would need more packs are not priced, never silently cheapened',()=>{
 // 20,000 credits a month: Pro Max would need 15,000 add-on credits = six packs; Power 10,000 = four packs ($600).
 const r=withAddOns('20000','pro_max');
 const keep=r.result.scenarios.find(s=>s.demandId==='base'&&s.strategy.id==='pro_max_keep_as_needed')!;
 assert.notEqual(keep.future.feasible,true);assert.equal(keep.future.totalNewExpenditure,null);
 const power=r.result.scenarios.find(s=>s.demandId==='base'&&s.strategy.id==='power_next_reset_as_needed')!;
 assert.deepEqual(power.future.purchases.map(p=>p.credits),['2500','2500','2500','2500']);assert.equal(power.future.totalNewExpenditure?.amount,'600');
 // The current plan cannot be priced, so only the cost of the lowest calculable option is shown and no saving is claimed.
 assert.equal(r.est.tier,'comparison_only');assert.equal(r.est.base?.saving,null);
 assert.equal(headlineOf(r.html),'The lowest cost that could be priced is Power at about $600 a month. The cost of staying on Pro Max could not be calculated, so no saving is shown.');
 assert.ok(!r.html.includes('Stay on'));assert.ok(!r.html.includes('class="figure"'));
});

test('an assumed plan still gets the recommendation, with the muted line saying it assumes the plan',()=>{
 const p=fiveSlots({currentPlan:'pro_max'}),result=optimize('2400',p,1,current());
 const context=ctx({planSource:'hint',plan:'pro_max',billingConfirmed:false,addOns:'assumed_none',assumptions:['plan_is_hint','billing_assumed_consumer','add_ons_assumed_none']});
 const advice=classifyAdvice(result,context);
 const html=presentAdvisor({hint:planHint('5000',reviewedCatalog),context,horizons:[{months:1,result,reasons:[]}],advice:[advice],singleAccount:true,limit:'5000'});
 assert.equal(headlineOf(html),'Switch to Pro+ at your next reset and buy add-on credits as needed: about $56 a month instead of $100.');
 assert.match(html,/<span class="label">Your plan:<\/span> <strong>Pro Max<\/strong> <span>\(assumed from your 5,000-credit limit\)<\/span> <button id="advisor-confirm"/);
 assert.match(html,/<p class="muted small">Estimate from list prices and your usage forecast, before tax\. It assumes you are on Pro Max and have no purchased add-on credits\. It depends on usage; see the details\. Not a guarantee\./);
 assert.ok(!html.includes('<span class="badge">Confirmed</span>'));assert.ok(!/guaranteed (saving|to)/i.test(html));
});

test('unknown pack slots or add-ons withhold the recommendation; insufficient data never produces a figure',()=>{
 // Unknown slots: purchases cannot be priced, so nothing is claimed for the plan that needs them.
 const unknownSlots=optimize('2400',profile({currentPlan:'pro_max',availablePackSlots:{kind:'unknown'}}),1,current());
 const est=estimateSavings(unknownSlots,ctx({plan:'pro_max'}),classifyAdvice(unknownSlots,ctx({plan:'pro_max'})),1);
 assert.deepEqual(est.base?.priced.map(x=>x.plan),['pro_max','power'],'only plans that need no add-ons can be priced');assert.ok((est.base?.unpriced??0)>0);assert.ok(est.conditions.includes('overall_cheapest_unknown'));
 const unknownHtml=presentAdvisor({hint:planHint(null,reviewedCatalog),context:ctx({plan:'pro_max'}),horizons:[{months:1,result:unknownSlots,reasons:[]}],advice:[classifyAdvice(unknownSlots,ctx({plan:'pro_max'}))],singleAccount:true,limit:null});
 assert.equal(headlineOf(unknownHtml),'Stay on Pro Max: it is the cheapest option that could be priced for your usage.');
 // Existing add-ons that are not itemised: no estimate at all.
 const some=estimateSavings(optimize('2400',fiveSlots({currentPlan:'pro_max'}),1,current()),ctx({plan:'pro_max',addOns:'unknown'}),{kind:'insufficient_information',reasons:[]},1);
 assert.equal(some.tier,'insufficient');
 // Nothing to compare yet: a short honest sentence, no figure, no dollar amount.
 const html=presentAdvisor({hint:planHint(null,reviewedCatalog),context:ctx({planSource:'unknown',plan:null}),horizons:[],advice:[],singleAccount:true,limit:null});
 assert.match(html,/<p class="verdict">Bobert can't compare plans yet\. It needs a current usage forecast; keep using Kiro and this updates automatically\.<\/p>/);assert.ok(!/\$\d/.test(html.replace(/Bundled list prices[^<]*/,'')));
});

test('a leftover of under one credit from a purchase before the reset is ignored and disclosed; anything larger or unknown is not',()=>{
 const result=optimize('2400',fiveSlots({currentPlan:'pro_max'}),1,current());
 const withLeftover=(leftover:string|null,before:string|null):CostOptimization=>({...result,scenarios:result.scenarios.map(s=>({...s,bridge:{...s.bridge,openingPurchasedCredits:before},future:{...s.future,openingPurchasedCredits:leftover}}))});
 const run=(r:CostOptimization)=>estimateSavings(r,ctx({plan:'pro_max'}),{kind:'conditional_comparison',reasons:[]},1);
 const ok=run(withLeftover('0.4','0'));
 assert.equal(ok.tier,'modelled');assert.ok(ok.conditions.includes('bridge_leftover_credit_ignored'));assert.equal(ok.base?.best?.plan,'pro_plus');
 // Existing inventory (opening before the purchase is not known to be empty), one credit or more, or an unknown opening: unusable.
 for(const [leftover,before] of [['0.4','5'],['0.4',null],['1','0'],['125','0'],['300','0']] as const)assert.equal(run(withLeftover(leftover,before)).tier,'insufficient',`${leftover}/${before}`);
 assert.ok(!run(result).conditions.includes('bridge_leftover_credit_ignored'));
});

test('end to end: a real purchase before the reset leaves under one credit; the figure is produced and the leftover is disclosed',()=>{
 // 100 plan credits remain, 300.4 are needed before the reset: the simulator buys 201 whole credits and 0.6 carries into the first full cycle.
 const p=fiveSlots({currentPlan:'pro_max',confirmedAt:'2030-01-15T00:00:00Z',resetAt:'2030-02-01T00:00:00Z',planRemaining:{kind:'known',value:'100'}});
 const q=build('2400',p,1,current());
 const need={low:2504n,base:3004n,high:3504n};
 const result=optimizeCosts({...q,demands:q.demands.map(d=>({...d,beforeReset:{kind:'known' as const,value:{numerator:need[d.id],denominator:10n}}}))});
 const keep=result.scenarios.find(s=>s.demandId==='base'&&s.strategy.id==='pro_max_keep_as_needed')!;
 assert.equal(keep.bridge.newPurchasedCredits,'201');assert.equal(keep.bridge.openingPurchasedCredits,'0');assert.equal(keep.future.openingPurchasedCredits,'0.6');
 const context=ctx({plan:'pro_max'}),advice=classifyAdvice(result,context),est=estimateSavings(result,context,advice,1);
 assert.equal(est.tier,'modelled');assert.ok(est.conditions.includes('bridge_leftover_credit_ignored'));
 assert.equal(est.base?.best?.plan,'pro_plus');assert.equal(est.base?.baseline,'100');assert.equal(est.base?.best?.cost,'56');
 const html=presentAdvisor({hint:planHint(null,reviewedCatalog),context,horizons:[{months:1,result,reasons:[]}],advice:[advice],singleAccount:true,limit:null});
 assert.equal(headlineOf(html),'Switch to Pro+ at your next reset and buy add-on credits as needed: about $56 a month instead of $100.');
 assert.match(html,/A purchase needed before the next reset leaves less than one credit unused; its value \(under \$0\.04\) is not counted\./);
});

test('the pack-slot default is disclosed as a condition whenever it is used, and the add-on assumption is named in the note',()=>{
 const {h,f}=forecastEvidence();
 const obs={limit:'1000',usage:'1',asOf:f.asOf,resetAt:f.resetAt};
 for(const answers of [noAnswers,{...noAnswers,plan:'pro' as const,billing:'consumer_prepaid' as const,addOns:'none' as const}]){
  const built=advisorProfile(obs,answers,planHint('1000',reviewedCatalog));
  assert.deepEqual(built.profile!.availablePackSlots,{kind:'known',value:5});assert.ok(built.context.assumptions.includes('pack_slots_assumed_free'));
  const horizons=calculateCosts({mode:'personalized',profile:built.profile!,monthlyCredits:'0',beforeReset:undefined,demandMode:'forecast'},f,h,'2030-01-04T00:00:00Z',current());
  const html=presentAdvisor({hint:planHint('1000',reviewedCatalog),context:built.context,horizons,advice:horizons.map(x=>classifyAdvice(x.result,built.context)),singleAccount:true,limit:'1000'});
  assert.match(html,/<li>All five add-on pack slots are assumed free \(no unexpired earlier packs\)\.<\/li>/);
 }
 // With existing add-ons the slots stay unknown and nothing is disclosed as assumed.
 const some=advisorProfile(obs,{...noAnswers,plan:'pro',billing:'consumer_prepaid',addOns:'some',addOnCredits:'10'},planHint('1000',reviewedCatalog));
 assert.ok(!some.context.assumptions.includes('pack_slots_assumed_free'));
 // The muted note names "no purchased add-on credits" only when add-ons are part of the result and were not answered.
 const assumedNone=ctx({planSource:'hint',plan:'pro_max',billingConfirmed:true,addOns:'assumed_none',assumptions:['plan_is_hint','add_ons_assumed_none']});
 const note=(c:AdvisorContext,credits:string)=>{const result=optimize(credits,fiveSlots({currentPlan:'pro_max'}),1,current());return /<p class="muted small">([^<]*)<\/p><\/div>/.exec(presentAdvisor({hint:planHint('5000',reviewedCatalog),context:c,horizons:[{months:1,result,reasons:[]}],advice:[classifyAdvice(result,c)],singleAccount:true,limit:'5000'}))![1];};
 assert.match(note(assumedNone,'2400'),/It assumes you are on Pro Max and have no purchased add-on credits\./);
 assert.match(note({...assumedNone,planSource:'confirmed',assumptions:['add_ons_assumed_none']},'2400'),/It assumes you have no purchased add-on credits\./);
 assert.doesNotMatch(note(assumedNone,'900'),/add-on/); // nothing is bought, so the add-on assumption is not part of the result
 assert.doesNotMatch(note({...assumedNone,addOns:'none',assumptions:['plan_is_hint']},'2400'),/add-on/); // answered, not assumed
});

test('fractions of add-on credits read "under 1", never "0"',()=>{
 const r=withAddOns('2400','pro_max');
 const frac=structuredClone(r.result);
 for(const s of frac.scenarios)if(s.strategy.id==='pro_plus_next_reset_as_needed'){s.future.purchasedCreditsConsumed='0.4';s.future.newPurchasedCredits='125';s.future.planCreditsConsumed='2000';}
 const context=ctx({plan:'pro_max'}),advice=classifyAdvice(frac,context);
 const html=presentAdvisor({hint:planHint(null,reviewedCatalog),context,horizons:[{months:1,result:frac,reasons:[]}],advice:[advice],singleAccount:true,limit:null});
 assert.match(html,/the other under 1 cost about \$16 as add-on credits \(the smallest purchase is 125 credits\)\./);assert.ok(!/the other 0 cost/.test(html));
});

test('a 6-cycle horizon that needs one pack per cycle becomes unpriced while the 1-cycle headline stays',()=>{
 // 6,100 credits a month on Pro Max: 1,100 add-on credits = one pack a cycle; six packs cannot be open at once and a used-up pack is not known to free its slot.
 const one=withAddOns('6100','pro_max',1);
 assert.equal(headlineOf(one.html),'Stay on Pro Max and buy add-on credits as needed: about $144 a month, the cheapest option for your usage.');
 const six=withAddOns('6100','pro_max',6);
 const keep=six.result.scenarios.find(s=>s.demandId==='base'&&s.strategy.id==='pro_max_keep_as_needed')!;
 assert.ok(keep.reasons.includes('pack_slot_release_unknown'));assert.equal(keep.future.totalNewExpenditure,null);
 assert.equal(six.est.base?.baseline,null);assert.ok(!/Stay on Pro Max/.test(six.html));
 // Three cycles need three packs and are priced.
 assert.equal(withAddOns('6100','pro_max',3).est.base?.baseline,'432');
});
