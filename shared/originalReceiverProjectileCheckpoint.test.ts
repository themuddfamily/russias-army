import {describe,expect,it} from 'vitest';
import {copyReceiverProjectileWorldCheckpoint,type ReceiverProjectileCheckpointCopyOptions} from './originalReceiverProjectileCheckpoint';
import type {ReceiverProjectileWorldCheckpoint,ReceiverProjectileWorldModel} from './originalReceiverProjectileWorld';
const options:ReceiverProjectileCheckpointCopyOptions={maxModels:5,maxActors:2,maxTextChars:2048,rocketMaterialHandle:'rpg-material'};
const matrix=()=>[1,0,0,0,0,1,0,0,0,0,1,0,4,5,6,1];
function model(handle:string,resource:'rg6grenade'|'rpgrocket',inWorld:boolean):ReceiverProjectileWorldModel{return {handle,resource,inWorld,materialHandle:resource==='rpgrocket'?'rpg-material':'grenade-material',worldMatrix:matrix(),groupAncestry:[]};}
function seed():ReceiverProjectileWorldCheckpoint{return {prefix:{kind:'callback',sceneGeneration:3,callback:1},template:model('grenade','rg6grenade',false),catalog:[{handle:'g-live',weapon:'launcher'},{handle:'g-pool',weapon:'launcher'},{handle:'r-live',weapon:'rpg'},{handle:'r-pool',weapon:'rpg'}],models:[model('g-live','rg6grenade',true),model('g-pool','rg6grenade',false),model('r-live','rpgrocket',true),model('r-pool','rpgrocket',false)],actors:[{launchId:'launch-g',handle:'g-live',weapon:'launcher'},{launchId:'launch-r',handle:'r-live',weapon:'rpg'}],fifo:{launcher:['g-pool'],rpg:['r-pool']}};}
describe('bounded committed projectile checkpoint copy',()=>{
 it('detaches and freezes all retained models, template, catalog, FIFO and actor bindings',()=>{
  const raw=seed(),copy=copyReceiverProjectileWorldCheckpoint(raw,options);expect(copy).toEqual(raw);expect(copy).not.toBe(raw);expect(copy.template).not.toBe(raw.template);expect(copy.models[0].worldMatrix).not.toBe(raw.models[0].worldMatrix);
  (raw.models[0].worldMatrix as number[])[12]=100;(raw.fifo.launcher as string[])[0]='changed';expect(copy.models[0].worldMatrix[12]).toBe(4);expect(copy.fifo.launcher).toEqual(['g-pool']);
  for(const value of [copy,copy.prefix,copy.template,copy.template.worldMatrix,copy.template.groupAncestry,copy.catalog,copy.catalog[0],copy.models,copy.models[0],copy.models[0].worldMatrix,copy.models[0].groupAncestry,copy.actors,copy.actors[0],copy.fifo,copy.fifo.launcher,copy.fifo.rpg])expect(Object.isFrozen(value)).toBe(true);
 });
 it('captures known containers and limits once while ignoring unrelated getters and custom iterators',()=>{
  const raw=seed(),models=raw.models;let reads=0,limitReads=0;
  Object.defineProperty(raw,'models',{get(){reads++;return models;}});Object.defineProperty(raw,'unknown',{get(){throw Error('unknown checkpoint read');}});Object.defineProperty(models[0],'unknown',{get(){throw Error('unknown model read');}});
  Object.defineProperty(models,Symbol.iterator,{value(){throw Error('custom iterator invoked');}});
  const limits={...options,get maxModels(){limitReads++;return 5;}};const copy=copyReceiverProjectileWorldCheckpoint(raw,limits);expect(copy.models).toHaveLength(4);expect(reads).toBe(1);expect(limitReads).toBe(1);
 });
 it('preserves receipt prefixes and the actual material alias without inferring a canonical material',()=>{
  const raw={...seed(),prefix:{kind:'receipt' as const,sceneGeneration:3,callback:1,tick:9}};expect(copyReceiverProjectileWorldCheckpoint(raw,options).prefix).toEqual(raw.prefix);
  const foreign={...raw,models:raw.models.map(m=>m.resource==='rpgrocket'?{...m,materialHandle:'observed-other'}:m)};expect(copyReceiverProjectileWorldCheckpoint(foreign,{maxModels:5,maxActors:2,maxTextChars:2048}).models[2].materialHandle).toBe('observed-other');expect(()=>copyReceiverProjectileWorldCheckpoint(foreign,options)).toThrow('rocket material');
 });
 it.each([null,{launchId:'building',handle:'g-live',weapon:'launcher'}])('rejects present unfinished construction %s',constructing=>{
  expect(()=>copyReceiverProjectileWorldCheckpoint({...seed(),constructing} as unknown as ReceiverProjectileWorldCheckpoint,options)).toThrow('Unfinished');
 });
 it('preflights all array counts before indexed model or actor reads',()=>{
  const raw=seed();Object.defineProperty(raw.models,0,{get(){throw Error('forbidden model read');}});
  expect(()=>copyReceiverProjectileWorldCheckpoint(raw,{...options,maxActors:1})).toThrow('budget');expect(()=>copyReceiverProjectileWorldCheckpoint(raw,{...options,maxModels:4})).toThrow('budget');
 });
 it.each([{maxModels:0},{maxActors:0},{maxModels:10001},{maxActors:10001},{maxTextChars:65537},{maxTextChars:0},{rocketMaterialHandle:''}])('rejects invalid limits %s',patch=>{
  expect(()=>copyReceiverProjectileWorldCheckpoint(seed(),{...options,...patch})).toThrow();
 });
 it('enforces aggregate known-field text including ancestry and the declared material',()=>{
  expect(()=>copyReceiverProjectileWorldCheckpoint(seed(),{...options,maxTextChars:25})).toThrow('text');
  const raw=seed();const bad={...raw,models:raw.models.map((m,i)=>i?m:{...m,groupAncestry:['x'.repeat(2048)]})};expect(()=>copyReceiverProjectileWorldCheckpoint(bad,options)).toThrow('text');
 });
 it('rejects sparse/nonfinite/nonaffine matrices and malformed fields',()=>{
  for(const worldMatrix of [new Array<number>(16),matrix().map((n,i)=>i===5?NaN:n),matrix().map((n,i)=>i===3?1:n)]){
   const raw=seed();expect(()=>copyReceiverProjectileWorldCheckpoint({...raw,template:{...raw.template,worldMatrix}},options)).toThrow('model capture');
  }
  const raw=seed();expect(()=>copyReceiverProjectileWorldCheckpoint({...raw,template:{...raw.template,inWorld:true}},options)).toThrow('catalog mismatch');expect(()=>copyReceiverProjectileWorldCheckpoint({...raw,models:raw.models.map((m,i)=>i?m:{...m,handle:' bad '})},options)).toThrow('text');
 });
 it('rejects duplicate/reserved catalog names and resource/catalog mismatch',()=>{
  const raw=seed();for(const handle of ['pistol','GRENADE','G-POOL'])expect(()=>copyReceiverProjectileWorldCheckpoint({...raw,catalog:raw.catalog.map((c,i)=>i?c:{...c,handle})},options)).toThrow('catalog');
  expect(()=>copyReceiverProjectileWorldCheckpoint({...raw,models:raw.models.map((m,i)=>i?m:{...m,resource:'rpgrocket'})},options)).toThrow('catalog mismatch');
 });
 it('requires one complete nonoverlapping ownership role for each retained model',()=>{
  const raw=seed();expect(()=>copyReceiverProjectileWorldCheckpoint({...raw,fifo:{...raw.fifo,launcher:[]}},options)).toThrow('ownership role');expect(()=>copyReceiverProjectileWorldCheckpoint({...raw,fifo:{...raw.fifo,launcher:['g-live']}},options)).toThrow('FIFO');
  expect(()=>copyReceiverProjectileWorldCheckpoint({...raw,actors:[raw.actors[0],{...raw.actors[1],launchId:raw.actors[0].launchId}]},options)).toThrow('actor binding');expect(()=>copyReceiverProjectileWorldCheckpoint({...raw,models:raw.models.slice(1)},options)).toThrow('retained');
 });
 it('rejects duplicate/self/cyclic ancestry across retained owned models',()=>{
  const raw=seed();for(const groupAncestry of [['g-live'],['scene','SCENE']])expect(()=>copyReceiverProjectileWorldCheckpoint({...raw,models:raw.models.map((m,i)=>i?m:{...m,groupAncestry})},options)).toThrow('ancestry');
  const models=raw.models.map((m,i)=>i<2?{...m,groupAncestry:[i===0?'g-pool':'g-live']}:m);expect(()=>copyReceiverProjectileWorldCheckpoint({...raw,models},options)).toThrow('Cyclic');
 });
});
