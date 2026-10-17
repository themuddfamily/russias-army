import * as THREE from 'three';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {WeaponState,type WeaponId} from './weapons';
interface InputHarness {
  elapsed:number;phase:string;chatOpen:boolean;firing:boolean;keys:Set<string>;weaponState:WeaponState;
  events:string[];shots:number;updateSourceWeaponInput():void;reload(sourceCallback?:boolean):void;switchWeapon(id:WeaponId):void;
  shiftDeadlines(seconds:number):void;
  syncWeaponPresentation:ReturnType<typeof vi.fn>;
}
function client(map='woodlands'):InputHarness {
  const game=Object.create(Game.prototype) as InputHarness,events:string[]=[];
  Object.assign(game,{mapId:map,archivalWinter:map==='winter',mode:'solo',phase:'playing',playerAlive:true,chatOpen:false,
    elapsed:0,weaponState:new WeaponState(map),keys:new Set(),firing:false,aiming:false,rightMouseAiming:false,
    controlsPreset:'legacy',arrowMovement:false,camera:new THREE.PerspectiveCamera(),pitch:0,yaw:0,recoil:0,shots:0,
    events,nextSourceReloadPoll:-Infinity,
    triggerViewModelFire:vi.fn((weapon:WeaponId)=>events.push(`fire:${weapon}`)),
    syncWeaponPresentation:vi.fn((weapon:WeaponId)=>events.push(`equip:${weapon}`)),
    spawnMuzzleParticles:vi.fn(),spawnCasing:vi.fn(),hitscan:vi.fn(()=>true),launchExplosive:vi.fn(),
    muzzleLight:{intensity:0},worldMuzzleLight:{intensity:0},audio:{play:vi.fn()},updateHud:vi.fn(),setMessage:vi.fn(),
    legacyRifleRefillStartedAt:-10,autoReloadAt:Infinity,startTime:0,arena:{pickups:[]},weaponDrops:[],enemies:[]});return game;
}
function callback(game:InputHarness,frame:number):void {game.elapsed=frame/30;game.updateSourceWeaponInput();}
afterEach(()=>vi.restoreAllMocks());
describe('actual Game source callback weapon ordering',()=>{
  it.each(['barrack','woodlands'])('%s fires the old selection before the lowest held numeric slot',map=>{
    const game=client(map);game.firing=true;game.keys.add('Digit6');game.keys.add('Digit1');callback(game,0);
    expect(game.events).toEqual(['fire:launcher','equip:pistol']);expect(game.weaponState.ammo.launcher).toBe(5);
    expect(game.weaponState.ammo.pistol).toBe(8);expect(game.weaponState.current).toBe('pistol');
  });
  it.each(['barrack','woodlands'])('%s repeats the source load pose for a held usable numeric slot',map=>{
    const game=client(map);game.keys.add('Digit1');for(let frame=0;frame<4;frame++)callback(game,frame);
    expect(game.syncWeaponPresentation).toHaveBeenCalledTimes(4);
    expect(game.events).toEqual(Array(4).fill('equip:pistol'));expect(game.weaponState.ammo.pistol).toBe(8);
    expect(game.weaponState.reserve.pistol).toBe(54);
  });
  it.each(['barrack','woodlands'])('%s accepts a switch during reload without transferring ammunition or resetting its counters',map=>{
    const game=client(map);game.reload();const before=game.weaponState.originalCounterState!;
    const ammo={...game.weaponState.ammo},reserve={...game.weaponState.reserve};game.switchWeapon('pistol');
    expect(game.weaponState.current).toBe('pistol');expect(game.weaponState.reloading).toBe(true);
    expect(game.weaponState.ammo).toEqual(ammo);expect(game.weaponState.reserve).toEqual(reserve);
    const after=game.weaponState.originalCounterState!;
    expect({waitgun:after.waitgun,poldwaitgun:after.poldwaitgun}).toEqual({waitgun:before.waitgun,poldwaitgun:before.poldwaitgun});
    expect(game.events).toEqual(['equip:pistol']);
  });
  it.each(['barrack','woodlands'])('%s ignores unavailable held slots without changing the current selection',map=>{
    const game=client(map);game.weaponState.ammo.pistol=0;game.weaponState.reserve.pistol=0;game.keys.add('Digit1');callback(game,0);
    expect(game.weaponState.current).toBe('launcher');expect(game.syncWeaponPresentation).not.toHaveBeenCalled();
  });
  it.each(['barrack','woodlands'])('%s respects the original cross-weapon gate after the first RG6 shot',map=>{
    const game=client(map);game.firing=true;game.keys.add('Digit3');callback(game,0);
    expect(game.events[0]).toBe('fire:launcher');expect(game.weaponState.current).toBe('rifle');
    const nextShot=map==='barrack'?3:10;
    for(let frame=1;frame<nextShot;frame++){callback(game,frame);expect(game.shots).toBe(1);}
    callback(game,nextShot);expect(game.shots).toBe(2);expect(game.events).toContain('fire:rifle');
  });
  it.each(['barrack','woodlands'])('%s still advances the source chat counter but suppresses fire/reload/selection',map=>{
    const game=client(map);game.chatOpen=true;game.firing=true;game.keys.add('KeyR');game.keys.add('Digit1');
    callback(game,0);callback(game,1);expect(game.events).toEqual([]);expect(game.weaponState.reloading).toBe(false);
    expect(game.weaponState.current).toBe('launcher');expect(game.weaponState.originalCounterState?.waitgun).toBe(map==='barrack'?10:-2);
  });
  it.each(['barrack','woodlands'])('%s reloads an empty selected RPG at its ready gate without a fire input',map=>{
    const game=client(map);game.weaponState.select('rpg');game.weaponState.ammo.rpg=0;
    const reserve=game.weaponState.reserve.rpg;callback(game,0);
    expect(game.weaponState.ammo.rpg).toBe(1);expect(game.weaponState.reserve.rpg).toBe(reserve-1);
    expect(game.weaponState.reloading).toBe(true);expect(game.shots).toBe(0);
  });
  it.each(['barrack','woodlands'])('%s polls held reload once per movie callback and waits after its release',map=>{
    const game=client(map);game.weaponState.select('rifle');game.weaponState.ammo.rifle=12;
    game.keys.add('KeyR');game.firing=true;const reload=vi.spyOn(game,'reload');callback(game,0);
    expect(game.weaponState.ammo.rifle).toBe(28);const reserve=game.weaponState.reserve.rifle;
    for(let index=1;index<20;index++){game.elapsed=index/1000;game.updateSourceWeaponInput();}
    expect(reload).toHaveBeenCalledOnce();
    for(let frame=1;frame<=30;frame++)callback(game,frame);
    expect(reload).toHaveBeenCalledTimes(31);expect(game.shots).toBe(0);expect(game.weaponState.reserve.rifle).toBe(reserve);
    game.keys.clear();const releaseWait=map==='barrack'?22:30;
    for(let frame=1;frame<releaseWait;frame++){callback(game,30+frame);expect(game.shots).toBe(0);}
    callback(game,30+releaseWait);expect(game.shots).toBe(1);expect(reload).toHaveBeenCalledTimes(31);
  });
  it('replays numeric polling at the nominal callback rate through a slow rendering frame',()=>{
    const game=client();game.keys.add('Digit1');callback(game,0);callback(game,6);
    expect(game.syncWeaponPresentation).toHaveBeenCalledTimes(7);expect(game.elapsed).toBe(.2);
  });
  it.each(['barrack','woodlands'])('%s retains typing state for an external pickup reload before the next input callback',map=>{
    const game=client(map);game.weaponState.select('rifle');game.weaponState.ammo.rifle=12;
    callback(game,0);const before=game.weaponState.originalCounterState!;
    game.chatOpen=true;game.weaponState.setOriginalTyping(true);game.elapsed=1/60;
    game.weaponState.addReserve('rifle',50);game.reload();
    const afterReload=game.weaponState.originalCounterState!;
    expect(afterReload.waitgun).toBe(map==='barrack'?before.waitgun:30);
    expect(afterReload.poldwaitgun).toBe(map==='barrack'?before.waitgun+20:0);
    expect(game.weaponState.ammo.rifle).toBe(28);const ammo=game.weaponState.ammo.rifle,reserve=game.weaponState.reserve.rifle;
    // Calls from systems outside the input callback must remember chat state.
    expect(game.weaponState.canFire(1/30)).toBe(false);expect(game.weaponState.update(2/30)).toBe(false);
    expect(game.weaponState.canFire(3/30)).toBe(false);
    const duringTyping=game.weaponState.originalCounterState!;
    expect(duringTyping.waitgun).toBe(map==='barrack'?before.waitgun:27);
    expect(duringTyping.poldwaitgun).toBe(afterReload.poldwaitgun);expect(duringTyping.ready).toBe(false);
    expect(game.shots).toBe(0);expect(game.weaponState.ammo.rifle).toBe(ammo);expect(game.weaponState.reserve.rifle).toBe(reserve);
    game.chatOpen=false;game.weaponState.setOriginalTyping(false);
    expect(game.weaponState.canFire(4/30)).toBe(false);
    expect(game.weaponState.originalCounterState!.waitgun).toBe(map==='barrack'?before.waitgun+1:26);
  });
  it.each(['barrack','woodlands'])('%s shifts both callback clocks over a paused second without consuming the shot wait',map=>{
    const game=client(map);game.firing=true;callback(game,0);expect(game.shots).toBe(1);
    const before=game.weaponState.originalCounterState!;game.phase='paused';game.shiftDeadlines(1);
    game.elapsed=1;game.updateSourceWeaponInput();expect(game.weaponState.originalCounterState).toEqual(before);
    game.phase='playing';game.updateSourceWeaponInput();expect(game.weaponState.originalCounterState).toEqual(before);expect(game.shots).toBe(1);
    game.elapsed=1+1/30;game.updateSourceWeaponInput();
    expect(game.weaponState.originalCounterState!.waitgun).toBe(map==='barrack'?before.waitgun+1:before.waitgun-1);
    expect(game.shots).toBe(1);
  });
  it.each(['paused','winter'])('does not run source callbacks while %s',mode=>{
    const game=client(mode==='winter'?'winter':'woodlands');if(mode==='paused')game.phase='paused';
    game.firing=true;game.keys.add('KeyR');game.keys.add('Digit1');callback(game,0);callback(game,1);
    expect(game.events).toEqual([]);expect(game.weaponState.reloading).toBe(false);
  });
});
