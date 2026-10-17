import * as THREE from 'three';
import {describe,it,expect} from 'vitest';
import {createOriginalProjectile,createOriginalBlast} from '../shared/originalExplosives';
import type {OriginalSoloLaunch,OriginalSoloProjectile} from '../shared/originalSoloObserverWorld';
import type {OriginalSoloAdmittedBang} from '../shared/originalSoloCurrentSceneProducer';
import type {ReceiverProjectileWorldCheckpoint,ReceiverProjectileWorldModel} from '../shared/originalReceiverProjectileWorld';
import {captureOriginalSoloProjectileReceiptProgram as capture} from './originalSoloProjectileProgram';
const options={renderToWorld:new THREE.Matrix4().elements,maxActors:32,maxCommands:64,maxTextChars:8192};
function row(id='launch-1',weapon:'launcher'|'rpg'='launcher'):OriginalSoloProjectile {
 const eye={x:1,y:2,z:3},direction={x:0,y:0,z:-1},rotation={x:0,y:0,z:0};
 const launch:OriginalSoloLaunch={id,sequence:1,ownerId:'owner',ownerLife:1,ownerName:'name',weapon,eye,direction,...(weapon==='rpg'?{sourceRotation:rotation}:{}),birthCallback:0,time:0};
 return {launch,state:createOriginalProjectile(weapon,eye,direction,'owner',weapon==='rpg'?rotation:undefined)};
}
function checkpoint(rows:readonly OriginalSoloProjectile[]):ReceiverProjectileWorldCheckpoint {
 const models:ReceiverProjectileWorldModel[]=rows.map((p,i)=>({handle:`model-${i}`,resource:p.launch.weapon==='rpg'?'rpgrocket':'rg6grenade',worldMatrix:new THREE.Matrix4().elements,inWorld:true,groupAncestry:[],materialHandle:p.launch.weapon==='rpg'?'rpg-shader':'rg6-shader'}));
 return {prefix:{kind:'receipt',sceneGeneration:1,callback:0,tick:0},template:{handle:'grenade',resource:'rg6grenade',worldMatrix:new THREE.Matrix4().elements,inWorld:false,materialHandle:'rg6-shader',groupAncestry:[]},models,catalog:rows.map((p,i)=>({handle:models[i].handle,weapon:p.launch.weapon})),actors:rows.map((p,i)=>({launchId:p.launch.id,handle:models[i].handle,weapon:p.launch.weapon})),fifo:{launcher:[],rpg:[]}};
}
function bang(p:OriginalSoloProjectile):OriginalSoloAdmittedBang {
 const blast={launch:p.launch,state:createOriginalBlast(p.state.position,p.state.shooterId,p.state.weapon)};
 return {terminalProjectilePose:{id:p.launch.id,weapon:p.state.weapon,position:{...p.state.position},direction:{...p.state.direction},...(p.state.sourceRotation?{sourceRotation:p.state.sourceRotation}:{}),...(p.state.angular?{orientation:{...p.state.angular.orientation}}:{})},blast,effectId:`bang-${p.launch.id}`,birthPrefix:{kind:'receipt',sceneGeneration:1,callback:0,tick:1},event:{kind:'bang',id:`bang-${p.launch.id}`,position:p.state.position,type:p.launch.weapon==='rpg'?'rocket':'grenade',attackerName:'name'}};
}
describe('continuing projectile receipt capture',()=>{
 it('captures continuing angular WORLD poses in committed actor order with detached state',()=>{
  const a=row(),b=row('launch-2','rpg'),previous=checkpoint([a,b]);a.state.position.x=7;
  const commands=capture(previous,[b,a],[],options);expect(commands.map(c=>'launchId' in c?c.launchId:null)).toEqual(['launch-1','launch-2']);
  expect(commands[0].kind).toBe('projectile-pose');if(commands[0].kind!=='projectile-pose')throw Error();const pose=commands[0].model.worldMatrix;expect(pose[12]).toBe(7);a.state.position.x=90;expect(pose[12]).toBe(7);expect(Object.isFrozen(commands)).toBe(true);expect(previous.models[0].worldMatrix[12]).toBe(0);
 });
 it('retains admitted retirement identity and supplied bang order without synthesizing missing bodies',()=>{
  const a=row(),b=row('launch-2'),first=bang(b),second=bang(a),commands=capture(checkpoint([a,b]),[],[first,second],options);
  expect(commands.filter(c=>c.kind!=='projectile-pose')).toEqual([{kind:'admitted-projectile-retire',launchId:'launch-2',blast:first.blast},{kind:'admitted-projectile-retire',launchId:'launch-1',blast:second.blast}]);expect((commands[1] as {blast:unknown}).blast).toBe(first.blast);
 });
 it('requires exact terminal pose for owned retirement and captures its final position before bang',()=>{
  const a=row(),previous=checkpoint([a]);a.state.position.x=22;const admitted=bang(a),commands=capture(previous,[],[admitted],options);
  expect(commands.map(c=>c.kind)).toEqual(['projectile-pose','admitted-projectile-retire']);if(commands[0].kind!=='projectile-pose')throw Error();expect(commands[0].model.worldMatrix[12]).toBe(22);
  expect(()=>capture(previous,[],[{...admitted,terminalProjectilePose:undefined}],options)).toThrow(/terminal/);expect(()=>capture(previous,[],[admitted],{...options,maxCommands:1})).toThrow(/command budget/);
 });
 it('preserves an admitted bang without a private projectile owner as an ordinary admitted marker',()=>{
  const a=row(),admitted=bang(a);expect(capture(checkpoint([]),[],[admitted],options)).toEqual([{kind:'admitted-bang',blast:admitted.blast}]);
 });
 it('rejects disappearing actors, unknown or repeated physical ownership and live retirement',()=>{
  const a=row(),previous=checkpoint([a]);expect(()=>capture(previous,[],[],options)).toThrow(/Missing physical/);expect(()=>capture(previous,[row('foreign')],[],options)).toThrow(/Unowned/);expect(()=>capture(previous,[a,a],[],options)).toThrow(/repeated/);expect(()=>capture(previous,[a],[bang(a)],options)).toThrow(/live/);
 });
 it('rejects duplicate retirement, wrong family and absent retained model',()=>{
  const a=row(),previous=checkpoint([a]),admitted=bang(a);expect(()=>capture(previous,[],[admitted,admitted],options)).toThrow(/Repeated/);
  expect(()=>capture(previous,[],[bang(row('launch-1','rpg'))],options)).toThrow(/family/);expect(()=>capture({...previous,models:[]},[a],[],options)).toThrow(/Missing committed/);
 });
 it('checks command and actor caps before reading physical state',()=>{
  const a=row(),previous=checkpoint([a,a]);const unread={get launch(){throw Error('must not decode');}} as unknown as OriginalSoloProjectile;
  expect(()=>capture(previous,[unread,unread],[],{...options,maxCommands:1})).toThrow(/command budget/);expect(()=>capture(previous,[],[],{...options,maxActors:1})).toThrow(/actor budget/);
 });
 it('rejects text overflow, unsupported bounds and malformed input arrays',()=>{
  const a=row(),previous=checkpoint([a]);expect(()=>capture(previous,[a],[],{...options,maxTextChars:3})).toThrow(/text budget/);expect(()=>capture(previous,[a],[],{...options,maxTextChars:65537})).toThrow(/bounds/);expect(()=>capture(previous,null as unknown as OriginalSoloProjectile[],[],options)).toThrow(/actor budget/);
 });
});
