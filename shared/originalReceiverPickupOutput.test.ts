import {describe,expect,it} from 'vitest';
import {copyReceiverPickupOutputChunk,type ReceiverPickupOutputChunk} from './originalReceiverPickupOutput';
import {copyReceiverModelTransitions,type ReceiverModelTransitionCopyOptions} from './originalReceiverModelTransitions';
import type {ReceiverModelTransition} from './originalReceiverModelWorld';
import type {ReceiverCurrentLoadoutPublication} from './originalReceiverCurrentEnvironment';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';

const callback:ReceiverScenePrefix={kind:'callback',sceneGeneration:4,callback:1};
const receipt:ReceiverScenePrefix={kind:'receipt',sceneGeneration:4,callback:0,tick:3};
const options:ReceiverModelTransitionCopyOptions={sceneGeneration:4,minCallback:0,maxCallback:1,receiptTick:3,maxEntries:256,maxTextChars:65536};
function transition(ordinal=99):ReceiverModelTransition{return {kind:'pickup-collected',ordinal,prefix:{...callback},pickup:{id:1,handle:'gun:rifle',weapon:'rifle',position:{x:1,y:2,z:3}}};}
type MutableChunk={prefix:ReceiverScenePrefix;sequence:number;firstOrdinal:number;transitions:ReceiverModelTransition[];loadoutIntents:ReceiverCurrentLoadoutPublication[]};
function chunk():MutableChunk{return {prefix:{...callback},sequence:7,firstOrdinal:99,transitions:[transition()],loadoutIntents:[{prefix:{...callback},intent:{kind:'feedback',message:'Ammo for ak47.'}},{prefix:{...callback},intent:{kind:'reload-sound',weapon:'rifle',sound:'reak47',channel:6}}]};}
const copy=(raw:ReceiverPickupOutputChunk,changes:Partial<ReceiverModelTransitionCopyOptions>={})=>copyReceiverPickupOutputChunk(raw,{...options,...changes});

describe('detached bounded pickup output chunks and global journal ordinals',()=>{
 it('retains global ordinals and prior receipt prefixes without reordering data',()=>{
  const raw=chunk();raw.transitions=[{kind:'birth',ordinal:99,prefix:{...receipt},actorId:'actor',giHandle:'gi',gunHandle:'gun',reused:false},transition(100)];
  raw.loadoutIntents=[{prefix:{...receipt},intent:{kind:'feedback',message:'receipt-first'}},...raw.loadoutIntents];
  const result=copy(raw);expect(result.transitions.map(value=>value.ordinal)).toEqual([99,100]);expect(result.transitions[0].prefix).toEqual(receipt);
  expect(result.loadoutIntents.map(value=>value.intent.kind)).toEqual(['feedback','feedback','reload-sound']);expect(result.loadoutIntents[0].prefix).toEqual(receipt);
 });

 it('deeply freezes the copied known fields and detaches mutable source values',()=>{
  const raw=chunk(),result=copy(raw),source=raw.transitions[0];
  expect(result).not.toBe(raw);expect(Object.isFrozen(result)).toBe(true);expect(Object.isFrozen(result.prefix)).toBe(true);expect(Object.isFrozen(result.transitions)).toBe(true);
  expect(Object.isFrozen(result.transitions[0])).toBe(true);expect(Object.isFrozen(result.loadoutIntents)).toBe(true);expect(Object.isFrozen(result.loadoutIntents[0].intent)).toBe(true);
  if(source.kind!=='pickup-collected'||result.transitions[0].kind!=='pickup-collected')throw Error('Invalid test fixture');
  expect(Object.isFrozen(result.transitions[0].pickup.position)).toBe(true);(source.pickup.position as {x:number}).x=900;
  expect(result.transitions[0].pickup.position.x).toBe(1);
 });

 it('rejects callback feedback followed by prior receipt feedback within a chunk',()=>{
  const raw=chunk(),prior:ReceiverCurrentLoadoutPublication={prefix:{...receipt},intent:{kind:'feedback',message:'receipt'}},current:ReceiverCurrentLoadoutPublication={prefix:{...callback},intent:{kind:'feedback',message:'callback'}};
  expect(()=>copy({...raw,loadoutIntents:[current,prior]})).toThrow(/replayed.*prefix/);
  expect(copy({...raw,loadoutIntents:[prior,current]}).loadoutIntents).toEqual([prior,current]);
 });

 it('captures changing getters once and ignores extras and source serialization hooks',()=>{
  const reads=new Map<string,number>(),read=<T>(key:string,value:T)=>{reads.set(key,(reads.get(key)??0)+1);return value;};
  const p={get kind(){return read('prefix-kind','callback' as const);},get sceneGeneration(){return read('generation',4);},get callback(){return read('callback',1);},get extra(){throw Error('Unknown prefix field');}};
  const feedback={get kind(){return read('intent-kind','feedback' as const);},get message(){return read('message','copied once');},toJSON(){throw Error('Source intent serialization');}};
  const raw={get prefix(){return read('prefix',p);},get sequence(){return read('sequence',7);},get firstOrdinal(){return read('ordinal',99);},get transitions(){return read('transitions',[transition()]);},get loadoutIntents(){return read('intents',[{prefix:{...callback},intent:feedback}]);},get extra(){throw Error('Unknown chunk field');},toJSON(){throw Error('Source chunk serialization');}};
  const result=copy(raw);expect([...reads.values()].every(count=>count===1)).toBe(true);expect(result.firstOrdinal).toBe(99);expect(result.loadoutIntents[0].intent).toEqual({kind:'feedback',message:'copied once'});
  expect(Object.keys(result)).toEqual(['prefix','sequence','firstOrdinal','transitions','loadoutIntents']);expect('extra' in result.prefix).toBe(false);
 });

 it('preserves default ordinal-one model copier behavior while accepting an explicit offset',()=>{
  expect(copyReceiverModelTransitions([transition(1)],options)[0].ordinal).toBe(1);expect(()=>copyReceiverModelTransitions([transition(99)],options)).toThrow(/ordinal/);
  expect(copyReceiverModelTransitions([transition(99)],{...options,firstOrdinal:99})[0].ordinal).toBe(99);
 });

 it.each([0,-1,1.5,Infinity,Number.MAX_SAFE_INTEGER+1])('rejects invalid sequence or initial ordinal %s',value=>{
  const raw=chunk();expect(()=>copy({...raw,sequence:value})).toThrow(/counter/);expect(()=>copy({...raw,firstOrdinal:value})).toThrow(/counter/);
  expect(()=>copyReceiverModelTransitions([],{...options,firstOrdinal:value})).toThrow();
 });

 it('rejects discontinuous or overflowing ordinal ranges',()=>{
  const raw=chunk();expect(()=>copy({...raw,transitions:[transition(99),transition(101)]})).toThrow(/ordinal/);
  const last=Number.MAX_SAFE_INTEGER;expect(copy({...raw,firstOrdinal:last,transitions:[transition(last)]}).firstOrdinal).toBe(last);
  expect(()=>copy({...raw,firstOrdinal:last,transitions:[transition(last),transition(last)]})).toThrow(/budget/);
 });

 it('validates callback and receipt envelope clocks independently',()=>{
  const raw=chunk();expect(()=>copy({...raw,prefix:{...callback,callback:0}})).toThrow(/envelope/);expect(()=>copy({...raw,prefix:{...callback,sceneGeneration:5}})).toThrow(/envelope/);
  const death={...raw,prefix:{...receipt},transitions:[],loadoutIntents:[{prefix:{...receipt},intent:{kind:'feedback' as const,message:'receipt'}}]};
  expect(copy(death,{maxCallback:0}).prefix).toEqual(receipt);expect(()=>copy({...death,prefix:{...receipt,tick:4}},{maxCallback:0})).toThrow(/envelope/);
 });

 it('rejects foreign, stale, or noncurrent publication prefixes',()=>{
  const raw=chunk(),feedback={kind:'feedback' as const,message:'message'};
  for(const p of [{...callback,callback:0},{...callback,callback:2},{...callback,sceneGeneration:5},{...receipt,tick:4}])expect(()=>copy({...raw,loadoutIntents:[{prefix:p,intent:feedback}]})).toThrow(/prefix/);
  expect(()=>copy({...raw,transitions:[{...transition(),prefix:{...receipt,tick:4}}]})).toThrow(/prefix/);
  expect(()=>copy({...raw,loadoutIntents:[{prefix:{...callback,callback:1},intent:feedback}]},{maxCallback:2})).toThrow(/envelope/);
 });

 it('requires exact source reload sound and channel for every weapon',()=>{
  const raw=chunk(),soundByWeapon={pistol:'repistol',shotgun:'repistol',rifle:'reak47',sniper:'reak47',launcher:'rerg6',rpg:'rerg6'} as const;
  for(const weapon of Object.keys(soundByWeapon) as (keyof typeof soundByWeapon)[]){
   const value:ReceiverCurrentLoadoutPublication={prefix:{...callback},intent:{kind:'reload-sound',weapon,sound:soundByWeapon[weapon],channel:6}};
   expect(copy({...raw,loadoutIntents:[value]}).loadoutIntents[0]).toEqual(value);
   expect(()=>copy({...raw,loadoutIntents:[{...value,intent:{...value.intent,channel:5}} as unknown as ReceiverCurrentLoadoutPublication]})).toThrow(/sound/);
   expect(()=>copy({...raw,loadoutIntents:[{prefix:callback,intent:{kind:'reload-sound',weapon,sound:'unknown',channel:6}} as unknown as ReceiverCurrentLoadoutPublication]})).toThrow(/sound/);
  }
 });

 it('rejects unsupported intents, oversized families and combined serialized data',()=>{
  const raw=chunk();expect(()=>copy({...raw,loadoutIntents:[{prefix:callback,intent:{kind:'whichgun',weapon:'rifle'}} as unknown as ReceiverCurrentLoadoutPublication]})).toThrow(/kind/);
  expect(()=>copy({...raw,loadoutIntents:new Array(257)})).toThrow(/count/);
  expect(()=>copy({...raw,transitions:Array.from({length:257},(_,index)=>transition(99+index))})).toThrow(/budget/);
  const known={...raw,transitions:[],loadoutIntents:[{prefix:callback,intent:{kind:'feedback' as const,message:'\\'.repeat(100)}}]};
  expect(()=>copy(known,{maxTextChars:150})).toThrow(/serialized/);
 });
});
