import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {registerOriginalMapRuntime} from './originalMapRuntime';
import {OriginalDoorWorld,type OriginalDoorTracks} from './originalDoorWorld';
import {OriginalSoloObserverWorlds,type OriginalSoloEvent} from './originalSoloObserverWorld';
import {createOriginalBlast} from './originalExplosives';
import {originalPlayerEye} from './originalPlayerPhysics';

function setup(){
 const runtime=registerOriginalMapRuntime('barrack',JSON.parse(readFileSync('public/assets/original-scenes/barrack/scene.json','utf8')));
 const tracks=JSON.parse(readFileSync('public/assets/original-scenes/barrack/doors.json','utf8')) as OriginalDoorTracks;
 const doors=new OriginalDoorWorld(runtime.data,runtime.scale,tracks),events:OriginalSoloEvent[]=[];
 const worlds=new OriginalSoloObserverWorlds(runtime,{templateDoors:doors,onEvent:event=>events.push(event)});
 const human=worlds.register({id:'human',name:'Human',eye:{x:1000,y:1000,z:1000},doors},1),bot=worlds.register({id:'bot',name:'Bot',eye:{x:2000,y:1000,z:1000}},1);
 const name=tracks.doors[0].name;
 const callback=(time:number)=>{worlds.physics(time,{skipIds:new Set(worlds.worlds.keys())});for(const world of worlds.worlds.values())worlds.goody(world.id);worlds.completeGoody(time);worlds.actors(time);};
 return {worlds,human,bot,name,callback,events};
}

describe('solo suspension and retained actor dispatch',()=>{
 it('accepts the Game callback endpoint tolerance while rejecting a materially backwards pause',()=>{
  const s=setup();s.callback(1.4);
  expect(()=>s.worlds.freeze(1.4-1e-5)).toThrow();
  expect(()=>s.worlds.freeze(1.4-5e-10)).not.toThrow();
  s.worlds.resume(11.4);s.callback(11.4+1/30);expect(s.human.updatedAt).toBe(11.4+1/30);s.worlds.clear();
 });
 it('rebases a partially animated bound human door without consuming pause time or changing collision snapshots',()=>{
  const s=setup();s.human.doors!.open(s.name,1);s.callback(1.4);
  const matrix=s.human.doors!.getModelMatrix(s.name),identity=s.human.doors!.movementSnapshotIdentity;
  const phase=s.human.doors!.getStates().find(d=>d.name===s.name)!;
  const beforeMirror=s.human.mirror.freeze();
  s.worlds.freeze(1.4);s.callback(100);s.worlds.resume(101.4);
  for(const [index,value] of s.human.doors!.getModelMatrix(s.name)!.entries())expect(value).toBeCloseTo(matrix![index],9);
  expect(s.human.doors!.movementSnapshotIdentity).toBe(identity);
  expect(s.human.doors!.getStates().find(d=>d.name===s.name)).toMatchObject({openedAt:101,phase:'opening'});
  expect(s.human.doors!.getStates().find(d=>d.name===s.name)!.elapsedSeconds).toBeCloseTo(phase.elapsedSeconds,12);
  expect(s.bot.doors!.getStates().find(d=>d.name===s.name)!.openedAt).toBeNull();
  expect(s.human.mirror.freeze()).toEqual(beforeMirror);
  s.callback(101.4+1/30);
  expect(s.human.doors!.getStates().find(d=>d.name===s.name)!.elapsedSeconds).toBeCloseTo(.4+1/30,12);
  expect(s.human.doors!.getModelMatrix(s.name)).not.toEqual(matrix);
  s.worlds.clear();
 });
 it('accumulates repeated pause rebases and rejects a backwards resume without partial changes',()=>{
  const s=setup();s.human.doors!.open(s.name,1);s.callback(1.4);s.worlds.freeze(1.4);
  const before=s.human.doors!.getStates();expect(()=>s.worlds.resume(1.3)).toThrow();expect(s.human.doors!.getStates()).toEqual(before);
  s.worlds.resume(11.4);s.callback(11.5);s.worlds.freeze(11.5);s.worlds.resume(31.5);
  expect(s.human.doors!.getStates().find(d=>d.name===s.name)!.openedAt).toBe(31);
  expect(s.human.doors!.getStates().find(d=>d.name===s.name)!.elapsedSeconds).toBeCloseTo(.5,12);
  // Repeated resume has no new suspended interval to consume.
  s.worlds.resume(100);expect(s.human.doors!.updatedAtSeconds).toBe(31.5);
  s.worlds.clear();
 });
 it('retains newest-first blast dispatch and cancels later actors after a lethal private hurt',()=>{
  const s=setup();s.human.health.canonical=1;s.human.health.flick=2;
  const launch=(ownerId:string)=>{const r=s.worlds.launch({ownerId,weapon:'launcher',eye:originalPlayerEye(s.human.body),direction:{x:0,y:1,z:0}},1);if(!r.ok)throw Error('Expected launch');return r.launch;};
  const older=launch('human'),newer=launch('bot');
  const oldBlast=createOriginalBlast(originalPlayerEye(s.human.body),older.ownerId,'launcher'),fatal=createOriginalBlast(originalPlayerEye(s.human.body),newer.ownerId,'launcher');
  s.human.projectiles.delete(older.id);s.human.projectiles.delete(newer.id);
  s.human.blasts.set(older.id,{launch:older,state:oldBlast});s.human.blasts.set(newer.id,{launch:newer,state:fatal});
  s.callback(1+1/30);
  const death=s.events.find(event=>event.kind==='dead');expect(death).toMatchObject({recipientId:'human',ownerId:'bot',ownerName:'Bot'});
  expect(fatal.remainingCallbacks).toBe(15);expect(oldBlast.remainingCallbacks).toBe(16);expect(s.worlds.worlds.has('human')).toBe(false);
  expect(s.bot.projectiles.size).toBe(2);s.worlds.clear();
 });
});
