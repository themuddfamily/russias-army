import type {OriginalSoloObserver,OriginalSoloEvent} from './originalSoloObserverWorld';
import {copyReceiverWeaponReportPayload,type ReceiverWeaponReportPayload} from './originalReceiverWeaponReportWorld';
import {originalAsciiNamesEqual} from './originalNameComparison';
import {applyOriginalPlayerDamage,createOriginalPlayerHealth,type OriginalPlayerHealthState} from './originalPlayerHealth';

export interface SoloWeaponReportDamageInput {readonly sender:OriginalSoloObserver;readonly report:ReceiverWeaponReportPayload;readonly time:number}
export interface SoloWeaponReportDamagePlan {
 readonly world:OriginalSoloObserver;readonly health:Readonly<OriginalPlayerHealthState>;readonly dead:boolean;
 readonly events:readonly Extract<OriginalSoloEvent,{kind:'damaged'|'dead'}>[];
}
/** Declared in-process remote-goody adapter, not MUS authority or symbol-key
 * equivalence. All validation and arithmetic finish without mutating worlds.
 * Baddy replica hurt audio and shots/misses are deliberately separate. */
export function planOriginalSoloWeaponReportDamage(reports:readonly SoloWeaponReportDamageInput[],targets:readonly OriginalSoloObserver[]):readonly SoloWeaponReportDamagePlan[] {
 if(!Array.isArray(reports)||!Array.isArray(targets))throw Error('Invalid Solo weapon damage arrays');
 const reportCount=reports.length,targetCount=targets.length;
 if(!Number.isSafeInteger(reportCount)||reportCount>256||!Number.isSafeInteger(targetCount)||targetCount>8)throw Error('Solo weapon damage count budget exceeded');
 let text=0,rows=0;
 const identities=new Map<OriginalSoloObserver,{world:OriginalSoloObserver;id:string;name:string;life:number;alive:boolean}>();
 const identity=(world:OriginalSoloObserver)=>{
  const previous=identities.get(world);if(previous)return previous;
  if(!world)throw Error('Missing Solo weapon damage world');
  const id=world.id,name=world.name,life=world.lifeGeneration,alive=world.alive;
  if(typeof id!=='string'||!id||typeof name!=='string'||!Number.isSafeInteger(life)||life<1||typeof alive!=='boolean')throw Error('Invalid Solo weapon damage identity');
  text+=id.length+name.length;if(text>65536)throw Error('Solo weapon damage text budget exceeded');
  const captured={world,id,name,life,alive};identities.set(world,captured);return captured;
 };
 const seen=new Set<OriginalSoloObserver>();
 const capturedTargets=[];
 for(let index=0;index<targetCount;index++){
  const target=identity(targets[index]);if(seen.has(target.world))throw Error('Duplicate Solo weapon damage target');seen.add(target.world);
  const rawHealth=target.world.health,canonical=rawHealth?.canonical,flick=rawHealth?.flick;
  if(!Number.isFinite(canonical)||(flick!==2&&flick!==-2))throw Error('Invalid Solo weapon damage health');
  capturedTargets.push({...target,health:createOriginalPlayerHealth(canonical,flick),dead:false,events:[] as Extract<OriginalSoloEvent,{kind:'damaged'|'dead'}>[]});
 }
 const capturedReports=[];
 for(let index=0;index<reportCount;index++){
  const input:SoloWeaponReportDamageInput=reports[index];if(!input)throw Error('Missing Solo weapon damage report');
  const rawSender=input.sender,rawReport=input.report,time=input.time,sender=identity(rawSender);
  if(!Number.isFinite(time)||!rawReport)throw Error('Invalid Solo weapon damage report');
  // Capture payload fields once; copier owns indexed validation and freezing.
  const shots=rawReport.shots,hurts=rawReport.hurts;
  const count=hurts===undefined?0:hurts.length;
  if(!Number.isSafeInteger(count)||count<0||rows+count>256)throw Error('Solo weapon damage hurt budget exceeded');
  const report=copyReceiverWeaponReportPayload({shots,hurts},Math.max(1,256-rows),65536);
  rows+=report.hurts?.length??0;if(rows>256)throw Error('Solo weapon damage hurt budget exceeded');
  for(const hurt of report.hurts??[]){text+=hurt.name.length;if(text>65536)throw Error('Solo weapon damage text budget exceeded');}
  capturedReports.push({sender,report,time});
 }
 for(const {sender,report,time} of capturedReports)for(const target of capturedTargets){
  if(!target.alive||target.dead||target.world===sender.world||originalAsciiNamesEqual(sender.name,target.name))continue;
  const hurt=report.hurts?.find(row=>row.name===target.name);if(!hurt)continue;
  const result=applyOriginalPlayerDamage(target.health,hurt.amount);target.dead=result.dead;
  const metadata={recipientId:target.id,lifeGeneration:target.life,time,ownerId:sender.id,ownerName:sender.name,damage:hurt.amount,health:result.health};
  target.events.push(Object.freeze({kind:'damaged' as const,...metadata}));
  if(result.dead)target.events.push(Object.freeze({kind:'dead' as const,...metadata}));
 }
 return Object.freeze(capturedTargets.filter(target=>target.events.length).map(target=>Object.freeze({world:target.world,health:Object.freeze(target.health),dead:target.dead,events:Object.freeze(target.events)})));
}
