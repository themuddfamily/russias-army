import {readFileSync} from 'node:fs';
import {IDBFactory} from 'fake-indexeddb';
import {describe,expect,it,vi} from 'vitest';
import {OriginalSoloObserverWorlds} from './originalSoloObserverWorld';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';
import {OriginalSoloPickupOwner} from '../src/originalSoloPickupOwner';
import {openOriginalPickupBatchStore} from '../src/originalPickupBatchStore';

let cached:OriginalMapRuntime|undefined;
const runtime=()=>cached??=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync(new URL('../public/assets/original-scenes/woodland/scene.json',import.meta.url),'utf8')));
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
async function fixture(name:string){
 const store=await openOriginalPickupBatchStore({databaseName:name,factory:new IDBFactory(),initial:{version:0,observers:[]}}),owner=new OriginalSoloPickupOwner(store,'admission'),worlds=new OriginalSoloObserverWorlds(runtime());
 return {store,owner,worlds,close:async()=>{await worlds.clearAsync();await store.close();}};
}
const registration=(id:string)=>({id,name:id,eye:{x:1000,y:1000,z:1000}});

describe('authoritative Solo life and supplied-cohort admission with real storage owners',()=>{
 it('reads the next generation without reservation and shares registration/live/capacity checks',()=>{
  const worlds=new OriginalSoloObserverWorlds(runtime());try{
   expect(worlds.nextLifeGeneration('A')).toBe(1);expect(worlds.nextLifeGeneration('A')).toBe(1);
   const a=worlds.register(registration('A'));expect(a.lifeGeneration).toBe(1);expect(()=>worlds.nextLifeGeneration('A')).toThrow(/already registered/);
   worlds.dispose('A');expect(worlds.nextLifeGeneration('A')).toBe(2);expect(worlds.register(registration('A')).lifeGeneration).toBe(2);
   expect(()=>worlds.nextLifeGeneration('')).toThrow(/identity/);
   for(const id of ['B','C','D','E','F','G','H'])worlds.register(registration(id));expect(()=>worlds.nextLifeGeneration('I')).toThrow(/capacity/);
  }finally{worlds.clear();}
 });
 it('rejects generation overflow before mutation or source registration',()=>{
  const worlds=new OriginalSoloObserverWorlds(runtime()),lives=(worlds as unknown as {lives:Map<string,number>}).lives;
  lives.set('A',Number.MAX_SAFE_INTEGER);expect(()=>worlds.nextLifeGeneration('A')).toThrow(/generation requires reset/);expect(()=>worlds.register(registration('A'))).toThrow(/generation requires reset/);expect(worlds.worlds.size).toBe(0);expect(lives.get('A')).toBe(Number.MAX_SAFE_INTEGER);worlds.clear();
 });
 it.each(['frozen','empty','missing'] as const)('aborts a real fresh owner cohort on %s skipped work without publishing',async kind=>{
  const f=await fixture(`admission-skip-${kind}`);try{
   await f.owner.registerLife('A',1);const before=await f.store.readManifest(),issued=f.owner.createCohort(),abort=vi.fn(issued.abort.bind(issued)),cohort={...issued,abort};
   if(kind==='frozen'){f.worlds.freeze();await f.worlds.completeGoodyAsync(0,cohort);}
   else if(kind==='empty'){f.worlds.physics(1/30);await f.worlds.completeGoodyAsync(1/30,cohort);}
   else await f.worlds.disposeAsync('missing',cohort);
   expect(abort).toHaveBeenCalledTimes(1);expect(f.owner.awaiting).toBe(false);expect(f.worlds.currentAwaiting).toBe(false);expect(await f.store.readManifest()).toEqual(before);
   await f.worlds.disposeAsync('missing',cohort);expect(abort).toHaveBeenCalledTimes(1);
  }finally{await f.close();}
 });
 it.each(['frozen','empty','missing'] as const)('retains %s aborted-owner cleanup failure until explicit drain retries it',async kind=>{
  const f=await fixture(`admission-skip-failure-${kind}`);try{
   await f.owner.registerLife('A',1);const before=await f.store.readManifest(),issued=f.owner.createCohort();
   const abort=vi.fn(issued.abort.bind(issued)).mockRejectedValueOnce(Error('declared owner abort failure')),cohort={...issued,abort};
   if(kind==='frozen'){f.worlds.freeze();await expect(f.worlds.completeGoodyAsync(0,cohort)).rejects.toThrow(/abort failure/);}
   else if(kind==='empty'){f.worlds.physics(1/30);await expect(f.worlds.completeGoodyAsync(1/30,cohort)).rejects.toThrow(/abort failure/);}
   else await expect(f.worlds.disposeAsync('missing',cohort)).rejects.toThrow(/abort failure/);
   expect(abort).toHaveBeenCalledTimes(1);expect(f.owner.awaiting).toBe(true);expect(f.worlds.currentAwaiting).toBe(true);expect(()=>f.worlds.nextLifeGeneration('B')).toThrow(/cleanup/);
   await expect(f.worlds.disposeAsync('missing',cohort)).rejects.toThrow(/cleanup requires draining/);expect(abort).toHaveBeenCalledTimes(1);
   await f.worlds.cancelAndDrainCurrent();expect(abort).toHaveBeenCalledTimes(2);expect(f.owner.awaiting).toBe(false);expect(f.worlds.currentAwaiting).toBe(false);expect(await f.store.readManifest()).toEqual(before);
  }finally{await f.close();}
 });
 it('fences admitted skipped work until its real owner abort finishes',async()=>{
  const f=await fixture('admission-skipped-abort-io'),entered=deferred(),release=deferred();let pending:Promise<void>|undefined;
  try{
   const issued=f.owner.createCohort(),cohort={...issued,abort:async()=>{entered.resolve();await release.promise;await issued.abort();}};
   pending=f.worlds.disposeAsync('missing',cohort);await entered.promise;
   expect(f.worlds.currentAwaiting).toBe(true);expect(f.owner.awaiting).toBe(true);expect(()=>f.worlds.nextLifeGeneration('A')).toThrow(/cleanup/);
   release.resolve();await pending;expect(f.worlds.currentAwaiting).toBe(false);expect(f.owner.awaiting).toBe(false);
  }finally{release.resolve();await pending?.catch(()=>{});await f.close();}
 });
 it('drains a fresh cohort rejected by an already-aborted public signal and fences its abort IO',async()=>{
  const f=await fixture('admission-rejected-signal'),entered=deferred(),release=deferred();let pending:Promise<void>|undefined;
  try{
   await f.owner.registerLife('A',1);const issued=f.owner.createCohort(),abort=vi.fn(async()=>{entered.resolve();await release.promise;await issued.abort();}),cohort={...issued,abort},signal=new AbortController();signal.abort(Error('declared rejected signal'));
   pending=f.worlds.disposeAsync('missing',cohort,signal.signal);const rejection=expect(pending).rejects.toThrow(/declared rejected signal/);await entered.promise;
   expect(f.owner.awaiting).toBe(true);expect(f.worlds.currentAwaiting).toBe(true);expect(()=>f.worlds.nextLifeGeneration('B')).toThrow(/cleanup/);
   release.resolve();await rejection;expect(abort).toHaveBeenCalledTimes(1);expect(f.owner.awaiting).toBe(false);expect(f.worlds.currentAwaiting).toBe(false);
  }finally{release.resolve();await pending?.catch(()=>{});await f.close();}
 });
 it('never aborts a live invocation when the same cohort is supplied again, but drains a rejected fresh owner',async()=>{
  const f=await fixture('admission-live-cohort'),entered=deferred(),release=deferred();let pending:Promise<void>|undefined;
  try{
   await f.owner.registerLife('A',1);const a=f.worlds.register(registration('A'));a.weapon='rifle';f.worlds.physics(1/30,{skipIds:new Set(['A'])});f.worlds.goody('A');
   const issued=f.owner.createCohort(),abort=vi.fn(issued.abort.bind(issued)),cohort={...issued,abort,begin:async()=>{entered.resolve();await release.promise;throw Error('declared held begin failure');}};
   pending=f.worlds.completeGoodyAsync(1/30,cohort);const rejection=expect(pending).rejects.toThrow(/held begin failure/);await entered.promise;
   await expect(f.worlds.disposeAsync('missing',cohort)).rejects.toThrow(/already owned/);expect(abort).not.toHaveBeenCalled();expect(f.owner.awaiting).toBe(true);
   const other=new OriginalSoloPickupOwner(f.store,'other'),otherIssued=other.createCohort(),otherAbort=vi.fn(otherIssued.abort.bind(otherIssued));
   await expect(f.worlds.disposeAsync('missing',{...otherIssued,abort:otherAbort})).rejects.toThrow(/awaiting completion/);
   expect(otherAbort).toHaveBeenCalledTimes(1);expect(other.awaiting).toBe(false);expect(abort).not.toHaveBeenCalled();expect(f.owner.awaiting).toBe(true);
   release.resolve();await rejection;expect(abort).toHaveBeenCalledTimes(1);expect(f.owner.awaiting).toBe(false);
  }finally{release.resolve();await pending?.catch(()=>{});await f.close();}
 });
 it('validates a supplied abort hook before skipped work and leaves malformed ownership explicit',async()=>{
  const f=await fixture('admission-invalid-abort');try{
   const issued=f.owner.createCohort();await expect(f.worlds.disposeAsync('missing',{...issued,abort:undefined} as never)).rejects.toThrow(/abort hook/);expect(f.owner.awaiting).toBe(true);await issued.abort();expect(f.owner.awaiting).toBe(false);
  }finally{await f.close();}
 });
 it('retains at most eight failed cleanup capabilities and explicitly leaves excess ownership with the caller',async()=>{
  const f=await fixture('admission-bounded-rejected-cleanups');const owners:OriginalSoloPickupOwner[]=[],aborts:{mockClear():unknown}[]=[],cohorts:ReturnType<OriginalSoloPickupOwner['createCohort']>[]=[];
  try{
   for(let index=0;index<9;index++){
    const owner=new OriginalSoloPickupOwner(f.store,`bounded-${index}`),issued=owner.createCohort(),abort=vi.fn(issued.abort.bind(issued)).mockRejectedValueOnce(Error('declared bounded abort failure'));
    owners.push(owner);aborts.push(abort);cohorts.push({...issued,abort});
    if(index<8)await expect(f.worlds.disposeAsync('missing',cohorts[index])).rejects.toThrow(/bounded abort failure|rejected cohort cleanup failed/);
    else await expect(f.worlds.disposeAsync('missing',cohorts[index])).rejects.toThrow(/capacity exceeded; caller retains supplied cohort/);
   }
   expect((f.worlds as unknown as {currentOperations:Set<unknown>}).currentOperations.size).toBe(8);expect(aborts[8]).not.toHaveBeenCalled();expect(owners.every(owner=>owner.awaiting)).toBe(true);
   await f.worlds.cancelAndDrainCurrent();expect((f.worlds as unknown as {currentOperations:Set<unknown>}).currentOperations.size).toBe(0);expect(owners.slice(0,8).every(owner=>!owner.awaiting)).toBe(true);expect(owners[8].awaiting).toBe(true);
   // The ninth owner was never accepted; its caller performs explicit cleanup.
   aborts[8].mockClear();await expect(cohorts[8].abort()).rejects.toThrow(/bounded abort failure/);await cohorts[8].abort();expect(owners[8].awaiting).toBe(false);
  }finally{await f.close();}
 });
});
