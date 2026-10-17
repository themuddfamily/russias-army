import {describe,it,expect} from 'vitest';
import {planOriginalSoloWeaponReportDamage,type SoloWeaponReportDamageInput} from './originalSoloWeaponReportDamage';
import type {OriginalSoloObserver} from './originalSoloObserverWorld';
const world=(id:string,name=id,canonical=100,flick:2|-2=2,alive=true)=>({id,name,lifeGeneration:1,alive,health:{canonical,flick}} as OriginalSoloObserver);
const input=(sender:OriginalSoloObserver,name:string,amount:number,time=1):SoloWeaponReportDamageInput=>({sender,time,report:{hurts:[{name,amount}]}});

describe('bounded remote-goody report damage planning',()=>{
 it('plans detached health and ordered immutable metadata without mutating any live state',()=>{
  const sender=world('a','Alpha'),target=world('b','Bravo');
  const plans=planOriginalSoloWeaponReportDamage([input(sender,'Bravo',18,2)],[sender,target]);
  expect(plans).toHaveLength(1);expect(plans[0].world).toBe(target);expect(plans[0].health).toEqual({canonical:82,flick:2});expect(target.health.canonical).toBe(100);
  expect(plans[0].events).toEqual([{kind:'damaged',recipientId:'b',lifeGeneration:1,time:2,ownerId:'a',ownerName:'Alpha',damage:18,health:82}]);
  expect(Object.isFrozen(plans)).toBe(true);expect(Object.isFrozen(plans[0].health)).toBe(true);expect(Object.isFrozen(plans[0].events[0])).toBe(true);
 });
 it.each([2,-2] as const)('uses the signed strict death threshold with flick %s',flick=>{
  const sender=world('a'),target=world('b','b',2*flick+10,flick);
  const amount=target.health.canonical+2*flick;
  const plans=planOriginalSoloWeaponReportDamage([input(sender,'b',amount),input(sender,'b',1,2),input(sender,'b',99,3)],[target]);
  expect(plans[0].health.canonical).toBe(-2*flick-1);expect(plans[0].dead).toBe(true);
  expect(plans[0].events.map(event=>event.kind)).toEqual(['damaged','damaged','dead']);expect(target.alive).toBe(true);
 });
 it('accumulates multiple senders in report order and stops subsequent damage after death',()=>{
  const a=world('a'),c=world('c'),b=world('b','b',10,-2);
  const plans=planOriginalSoloWeaponReportDamage([input(a,'b',6),input(c,'b',1,2),input(a,'b',20,3)],[b]);
  expect(plans[0].health.canonical).toBe(3);expect(plans[0].events.map(event=>event.ownerId)).toEqual(['a','c','c']);
 });
 it('excludes own echo and ASCII-equivalent sender names while matching every distinct remote target exactly',()=>{
  const sender=world('sender','ALPHA'),alias=world('alias','alpha'),one=world('one','Bravo'),two=world('two','Bravo'),caseDifferent=world('three','bravo');
  const plans=planOriginalSoloWeaponReportDamage([{sender,time:1,report:{hurts:[{name:'ALPHA',amount:99},{name:'alpha',amount:99},{name:'Bravo',amount:12}]}}],[sender,alias,one,two,caseDifferent]);
  expect(plans.map(plan=>plan.world.id)).toEqual(['one','two']);expect(plans.map(plan=>plan.health.canonical)).toEqual([88,88]);
 });
 it('ignores shots, absent names and already-dead targets',()=>{
  const sender=world('a'),dead=world('dead','dead',20,2,false);
  expect(planOriginalSoloWeaponReportDamage([{sender,time:1,report:{shots:10}},input(sender,'unknown',6),input(sender,'dead',6)],[dead,world('b')])).toEqual([]);
 });
 it('validates a later invalid report before returning any earlier health changes',()=>{
  const sender=world('a'),target=world('b');
  expect(()=>planOriginalSoloWeaponReportDamage([input(sender,'b',18),input(sender,'b',-1)],[target])).toThrow();expect(target.health.canonical).toBe(100);
  expect(()=>planOriginalSoloWeaponReportDamage([input(sender,'b',1,NaN)],[target])).toThrow();
  expect(()=>planOriginalSoloWeaponReportDamage([],[target,target])).toThrow(/duplicate/i);
  expect(()=>planOriginalSoloWeaponReportDamage([],[world('bad','bad',NaN)])).toThrow(/health/i);
 });
 it('rejects aggregate report, target, hurt-row and text budgets before planning',()=>{
  const sender=world('a'),target=world('b'),row=input(sender,'b',1);
  expect(()=>planOriginalSoloWeaponReportDamage(Array(257).fill(row),[target])).toThrow(/count/i);
  expect(()=>planOriginalSoloWeaponReportDamage([] ,Array.from({length:9},(_,i)=>world(String(i))))).toThrow(/count/i);
  const hurts=Array.from({length:129},(_,i)=>({name:String(i),amount:1}));
  expect(()=>planOriginalSoloWeaponReportDamage([{sender,time:1,report:{hurts}},{sender,time:2,report:{hurts}}],[target])).toThrow(/hurt/i);
  expect(()=>planOriginalSoloWeaponReportDamage([input(sender,'x'.repeat(65536),1)],[target])).toThrow(/text/i);expect(target.health.canonical).toBe(100);
 });
});
