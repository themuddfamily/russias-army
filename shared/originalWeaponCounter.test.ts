import {describe,expect,it} from 'vitest';
import {OriginalWeaponCounter,ORIGINAL_WEAPON_WAIT,originalRpgShot} from './originalWeaponCounter';
import type {WeaponId} from './protocol';
const slots=Object.keys(ORIGINAL_WEAPON_WAIT) as WeaponId[];
function untilReady(counter:OriginalWeaponCounter,weapon:WeaponId):number {
  for(let index=1;index<=128;index++)if(counter.step(weapon))return index;
  throw new Error('Never ready');
}
describe('original actor weapon counters',()=>{
  it.each(['barrack','woodlands'] as const)('%s reproduces initialization and first selected shot',map=>{
    const counter=new OriginalWeaponCounter(map,'launcher');
    expect(counter.state).toEqual({waitgun:map==='barrack'?10:0,poldwaitgun:0});
    expect(counter.step('launcher')).toBe(true);
    expect(counter.state).toEqual({waitgun:map==='barrack'?11:-1,poldwaitgun:0});
  });
  for(const map of ['barrack','woodlands'] as const)for(const weapon of slots){
    it(`${map} ${weapon} repeats at the exact source callback interval`,()=>{
      const counter=new OriginalWeaponCounter(map,weapon);
      expect(counter.step(weapon)).toBe(true);counter.shot(weapon);
      expect(untilReady(counter,weapon)).toBe(ORIGINAL_WEAPON_WAIT[weapon]+(map==='barrack'?1:0));
    });
    it(`${map} ${weapon} held R continuously resets the lock before the fire gate`,()=>{
      const counter=new OriginalWeaponCounter(map,weapon);
      for(let index=0;index<90;index++)expect(counter.step(weapon,{reload:true})).toBe(false);
      const before=counter.state;const expected=map==='woodlands'?30:20+ORIGINAL_WEAPON_WAIT[weapon];
      expect(counter.callbacksUntilReady(weapon)).toBe(expected);expect(counter.state).toEqual(before);
      expect(untilReady(counter,weapon)).toBe(expected);
    });
  }
  it('Barrack evaluates readiness using the difference from before its increment',()=>{
    const counter=new OriginalWeaponCounter('barrack','rifle');counter.step('rifle');counter.shot('rifle');
    expect(counter.step('rifle')).toBe(false);expect(counter.state.waitgun).toBe(1);
    expect(counter.step('rifle')).toBe(false);expect(counter.state.waitgun).toBe(2);
    expect(counter.step('rifle')).toBe(true);expect(counter.state.waitgun).toBe(3);
  });
  it('Barrack resets an idle difference strictly above twice the newly selected wait',()=>{
    const counter=new OriginalWeaponCounter('barrack','sniper');
    expect(counter.step('sniper')).toBe(true);expect(counter.state.waitgun).toBe(51);
    expect(counter.step('rifle')).toBe(false);expect(counter.state).toEqual({waitgun:51,poldwaitgun:51});
    expect(untilReady(counter,'rifle')).toBe(3);
    const equality=new OriginalWeaponCounter('barrack','pistol');
    expect(equality.step('launcher')).toBe(false); // delta 8 <= wait 10: increment to 9.
    expect(equality.step('launcher')).toBe(false); // increment to 10.
    expect(equality.step('rpg')).toBe(true); // exact wait 10, increment to 11.
    // A difference above wait but below/equal twice wait stays ready without increment.
    expect(equality.step('pistol')).toBe(true);expect(equality.state).toEqual({waitgun:11,poldwaitgun:0});
    const twice=new OriginalWeaponCounter('barrack','shotgun');
    expect(twice.step('shotgun')).toBe(true);expect(twice.state.waitgun).toBe(16);
    expect(twice.step('pistol')).toBe(true);expect(twice.state).toEqual({waitgun:16,poldwaitgun:0});
  });
  it('selection keeps the shared Barrack reload counter but changes the readiness threshold',()=>{
    const counter=new OriginalWeaponCounter('barrack','sniper');counter.step('sniper',{reload:true});
    expect(counter.callbacksUntilReady('sniper')).toBe(70);
    expect(counter.callbacksUntilReady('rifle')).toBe(22);
    expect(counter.callbacksUntilReady('pistol')).toBe(28);
    expect(untilReady(counter,'rifle')).toBe(22);
  });
  it('Woodland selection preserves the previous gun shot wait rather than imposing a new one',()=>{
    const counter=new OriginalWeaponCounter('woodlands','sniper');counter.step('sniper');counter.shot('sniper');
    expect(untilReady(counter,'rifle')).toBe(50);counter.shot('rifle');expect(untilReady(counter,'sniper')).toBe(2);
  });
  it('VOID/chat callbacks freeze Barrack, while Woodland still decrements before input guards',()=>{
    const barrack=new OriginalWeaponCounter('barrack');const woodland=new OriginalWeaponCounter('woodlands');
    for(const counter of [barrack,woodland]){
      expect(counter.step(null,{reload:true})).toBe(false);
      expect(counter.step('rifle',{inputEnabled:false,reload:true})).toBe(false);
    }
    expect(barrack.state).toEqual({waitgun:10,poldwaitgun:0});expect(woodland.state).toEqual({waitgun:-2,poldwaitgun:0});
  });
  it.each(['barrack','woodlands'] as const)('%s loaded RPG reload occurs before spawn and saved bullets overwrite last',map=>{
    const counter=new OriginalWeaponCounter(map,'rpg');expect(counter.step('rpg')).toBe(true);
    let atSpawn:unknown;
    const result=originalRpgShot(counter,1,12,1,loaded=>{atSpawn={...loaded,counter:counter.state};});
    expect(atSpawn).toEqual({ammo:1,reserve:12,counter:map==='barrack'?{waitgun:0,poldwaitgun:20}:{waitgun:30,poldwaitgun:0}});
    expect(result).toEqual({ammo:0,reserve:12,canReload:true});
    expect(counter.state).toEqual(map==='barrack'?{waitgun:0,poldwaitgun:20}:{waitgun:10,poldwaitgun:0});
    expect(untilReady(counter,'rpg')).toBe(map==='barrack'?31:10);
  });
  it.each(['barrack','woodlands'] as const)('%s loaded RPG zero-reserve reload still sets the source lock',map=>{
    const counter=new OriginalWeaponCounter(map,'rpg');counter.step('rpg');
    expect(originalRpgShot(counter,1,0)).toEqual({ammo:0,reserve:0,canReload:true});
    expect(untilReady(counter,'rpg')).toBe(map==='barrack'?31:10);
  });
  it.each(['barrack','woodlands'] as const)('%s saved chamber overwrite discards any pre-spawn refill',map=>{
    const counter=new OriginalWeaponCounter(map,'rpg');counter.step('rpg');
    let temporary:unknown;
    expect(originalRpgShot(counter,1,5,3,loaded=>{temporary=loaded;})).toEqual({ammo:0,reserve:3,canReload:true});
    expect(temporary).toEqual({ammo:3,reserve:3});
  });
  it('does not enter the loaded-shot counter branch for an empty RPG',()=>{
    const counter=new OriginalWeaponCounter('barrack','rpg');const before=counter.state;
    expect(()=>originalRpgShot(counter,0,12)).toThrow('requires a loaded chamber');expect(counter.state).toEqual(before);
  });
  it.each(['barrack','woodlands'] as const)('%s held RPG has an empty reload callback between loaded shot gates',map=>{
    const counter=new OriginalWeaponCounter(map,'rpg');counter.step('rpg');
    const first=originalRpgShot(counter,1,12);
    const emptyGate=untilReady(counter,'rpg');
    // Source gun saves zero bullets before automatic reload. Held fire then
    // takes the saved-empty branch and reloads a second time; it cannot shoot
    // the new round during this same ready callback.
    expect(first.ammo).toBe(0);counter.reload();const firstReload=counter.state;
    counter.reload();expect(counter.state).toEqual(firstReload);
    expect(counter.step('rpg')).toBe(false);
    const nextLoadedGate=1+untilReady(counter,'rpg');
    expect(emptyGate).toBe(map==='barrack'?31:10);
    expect(nextLoadedGate).toBe(map==='barrack'?31:30);
    expect(emptyGate+nextLoadedGate).toBe(map==='barrack'?62:40);
    expect(originalRpgShot(counter,1,11)).toEqual({ammo:0,reserve:11,canReload:true});
  });
  it('forks and readiness previews leave the live state untouched and bound unavailable previews',()=>{
    const counter=new OriginalWeaponCounter('woodlands');counter.reload();const before=counter.state;
    expect(counter.framesUntilReady(null)).toBe(Infinity);expect(counter.framesUntilReady('rifle',29)).toBe(Infinity);
    expect(counter.framesUntilReady('rifle',30)).toBe(30);const fork=counter.fork();fork.shot('rifle');
    expect(fork.framesUntilReady('rifle')).toBe(2);expect(counter.state).toEqual(before);
  });
  it.each(['barrack','woodlands'] as const)('%s restores signed snapshots without changing subsequent callback behavior',map=>{
    const original=new OriginalWeaponCounter(map,'rifle');original.step('rifle',{reload:true});
    for(let frame=0;frame<4;frame++)original.step('rifle');
    const restored=new OriginalWeaponCounter(map,'sniper');restored.restore(original.state);
    expect(restored.state).toEqual(original.state);
    for(let frame=0;frame<60;frame++){
      expect(restored.step('pistol')).toBe(original.step('pistol'));expect(restored.state).toEqual(original.state);
    }
    restored.restore({waitgun:-100,poldwaitgun:-20});expect(restored.state).toEqual({waitgun:-100,poldwaitgun:-20});
  });
  it.each([NaN,Infinity,-Infinity,1.5,Number.MAX_SAFE_INTEGER+1,Number.MIN_SAFE_INTEGER-1])('rejects invalid snapshot value %s atomically',value=>{
    const counter=new OriginalWeaponCounter('barrack');const before=counter.state;
    expect(()=>counter.restore({waitgun:value,poldwaitgun:0})).toThrow('Invalid original weapon counter state');
    expect(counter.state).toEqual(before);
    expect(()=>counter.restore({waitgun:0,poldwaitgun:value})).toThrow('Invalid original weapon counter state');
    expect(counter.state).toEqual(before);
  });
});
