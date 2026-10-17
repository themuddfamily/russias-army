import {soloFloorRuntime} from './originalSoloGameplayHarness';
import * as THREE from 'three';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {WEAPONS,WeaponState,type WeaponId} from './weapons';
import {weaponReloadDuration} from '../shared/legacyReload';

interface CombatHarness {
  elapsed:number;phase:string;playerAlive:boolean;chatOpen:boolean;archivalWinter:boolean;
  keys:Set<string>;weaponState:WeaponState;camera:THREE.PerspectiveCamera;pitch:number;yaw:number;
  recoil:number;shots:number;hits:number;nextSourceReloadPoll:number;
  raycaster:{set:ReturnType<typeof vi.fn>;intersectObjects:ReturnType<typeof vi.fn>;far:number};
  audio:{play:ReturnType<typeof vi.fn>;playOriginalSound:ReturnType<typeof vi.fn>};damage:ReturnType<typeof vi.fn>;showHitmarker:ReturnType<typeof vi.fn>;
  tryFire():void;hitscan(spec:typeof WEAPONS[WeaponId]):boolean;reload():void;
  updateSourceReloadInput():void;updateWeaponReload():void;
}
function client(map='woodlands',weapon:WeaponId='rifle'):CombatHarness {
  const game=Object.create(Game.prototype) as CombatHarness;
  const camera=new THREE.PerspectiveCamera();camera.position.set(2,1.72,3);
  const weaponState=new WeaponState(map);weaponState.select(weapon);
  const damage=vi.fn(()=> 'hurt');
  const enemy={alive:true,damage,hitMeshes:[] as THREE.Object3D[]};
  const head=new THREE.Object3D();head.userData={enemy,zone:'head'};enemy.hitMeshes.push(head);
  Object.assign(game,{mapId:map,archivalWinter:map==='winter',mode:'solo',phase:'playing',playerAlive:true,chatOpen:false,
    elapsed:10,weaponState,camera,pitch:.1,yaw:.2,recoil:0,shots:0,hits:0,keys:new Set(),controlsPreset:'legacy',
    aiming:false,arrowMovement:false,enemies:[enemy],damage,nextSourceReloadPoll:-Infinity,
    raycaster:{set:vi.fn(),far:0,intersectObjects:vi.fn(()=>[{distance:10,point:new THREE.Vector3(2,1.72,-7),object:head}])},
    distanceToWorld:vi.fn(()=>100),raycastWorld:vi.fn(()=>({distance:100,normal:{x:0,y:1,z:0}})),showHitmarker:vi.fn(),registerKill:vi.fn(),spawnImpact:vi.fn(),spawnTracer:vi.fn(),
    triggerViewModelFire:vi.fn(),spawnMuzzleParticles:vi.fn(),spawnCasing:vi.fn(),updateHud:vi.fn(),setMessage:vi.fn(),appendChat:vi.fn(),
    syncWeaponPresentation:vi.fn(),audio:{play:vi.fn(),playOriginalSound:vi.fn()},muzzleLight:{intensity:0},worldMuzzleLight:{intensity:0},
    legacyRifleRefillStartedAt:-10,autoReloadAt:Infinity});
  camera.rotation.set(game.pitch,game.yaw,0,'YXZ');return game;
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('actual Game original hitscan combat',()=>{
  it('clears an unacknowledged source shot after transport loss and allows firing after resume',()=>{
    const g=client('woodlands','pistol') as any;Object.assign(g,{mode:'online',pendingSourceShot:'lost-ack',sourceGunAuthorityLocalTime:10,sourceGunAuthorityCounter:{epoch:1000,weapon:'pistol',state:{waitgun:30,poldwaitgun:0,ready:false}},
      updateNetworkStatus:vi.fn(),releaseActiveInput:vi.fn(),clearRemotePlayers:vi.fn(),clearNetworkProjectiles:vi.fn(),network:{connected:true,clientId:'local',shoot:vi.fn(()=> 'resumed-shot')},remotePlayers:new Map()});
    g.handleNetworkState('reconnecting','connected');expect(g.pendingSourceShot).toBeUndefined();expect(g.sourceGunAuthorityLocalTime).toBe(-Infinity);expect(g.sourceGunAuthorityCounter).toBeUndefined();
    g.handleNetworkState('connected','reconnecting');g.needsAuthoritativeSpawn=false;
    for(let frame=60;frame>0;frame--)g.weaponState.stepSourceCounter(10-frame/30);g.tryFire();expect(g.network.shoot).toHaveBeenCalledOnce();expect(g.pendingSourceShot).toBe('resumed-shot');
  });
  it('sends one source shot during callback catch-up until its exact authority acknowledgement',()=>{
    const g=client('barrack','pistol') as any;g.mode='online';g.firing=true;g.elapsed=10;g.nextSourceReloadPoll=9;g.remotePlayers=new Map();g.network={connected:true,clientId:'local',shoot:vi.fn(()=> 'pending-one')};
    for(let frame=60;frame>0;frame--)g.weaponState.stepSourceCounter(9-frame/30);
    g.updateSourceReloadInput();expect(g.network.shoot).toHaveBeenCalledOnce();expect(g.pendingSourceShot).toBe('pending-one');expect(g.shots).toBe(1);
    const weapons=Object.fromEntries(Object.keys(WEAPONS).map(w=>[w,{ammo:g.weaponState.ammo[w],reserve:g.weaponState.reserve[w]}]));
    const loadout={type:'loadout',serverTime:1000,playerId:'local',equipped:'pistol',weapons,reload:null,sourceCounter:{waitgun:10,poldwaitgun:10,ready:false}};
    g.applyNetworkLoadout({...loadout,ackShotId:'older-shot'});expect(g.pendingSourceShot).toBe('pending-one');
    g.applyNetworkLoadout({...loadout,ackShotId:'pending-one'});expect(g.pendingSourceShot).toBeUndefined();
  });
  it('does not advance restored authority gun state through older callbacks while retaining body callbacks',()=>{
    const g=client('woodlands','pistol') as any;g.mode='online';g.network={clientId:'local'};g.elapsed=10;g.nextSourceReloadPoll=9.5;g.firing=false;
    const weapons=Object.fromEntries(Object.keys(WEAPONS).map(w=>[w,{ammo:g.weaponState.ammo[w],reserve:g.weaponState.reserve[w]}]));
    g.applyNetworkLoadout({type:'loadout',serverTime:1000,playerId:'local',equipped:'pistol',weapons,reload:null,sourceCounter:{waitgun:7,poldwaitgun:8,ready:false}});
    const before=g.weaponState.originalCounterState,body=vi.fn(),actors=vi.fn();g.updateSourceWeaponInput(body,actors);
    expect(body).toHaveBeenCalled();expect(actors).toHaveBeenCalledTimes(body.mock.calls.length);expect(g.weaponState.originalCounterState).toEqual(before);
    g.elapsed=10.04;g.updateSourceWeaponInput();expect(g.weaponState.originalCounterState.waitgun).toBe(6);
  });

  for(const map of ['barrack','woodlands'])for(const [weapon,damage,pitchDegrees] of [
    ['pistol',12,1],['shotgun',36,7],['rifle',6,1],['sniper',36,3],
  ] as const){
    it(`${map} ${weapon} uses source damage, a single forward query, and post-shot camera recoil`,()=>{
      const game=client(map,weapon);const random=vi.spyOn(Math,'random').mockReturnValue(.99);
      const beforeDirection=new THREE.Vector3(0,0,-1).applyQuaternion(game.camera.quaternion);
      const beforePitch=game.pitch,beforeYaw=game.yaw,ammo=game.weaponState.ammo[weapon];
      let cameraAtDamage:THREE.Quaternion|undefined;
      game.damage.mockImplementation(()=>{cameraAtDamage=game.camera.quaternion.clone();return 'hurt';});
      for(let frame=60;frame>0;frame--)game.weaponState.stepSourceCounter(10-frame/30);
      const beforeCamera=game.camera.quaternion.clone();game.tryFire();
      expect(game.damage).toHaveBeenCalledExactlyOnceWith(damage,10);
      expect(game.raycaster.intersectObjects).toHaveBeenCalledOnce();
      expect(game.raycaster.set).toHaveBeenCalledOnce();
      const direction=game.raycaster.set.mock.calls[0][1] as THREE.Vector3;
      expect(direction.distanceTo(beforeDirection)).toBeLessThan(1e-12);
      expect(cameraAtDamage!.angleTo(beforeCamera)).toBeLessThan(1e-7);
      expect(game.showHitmarker).toHaveBeenCalledExactlyOnceWith(false,false);
      expect(game.pitch).toBeCloseTo(beforePitch+pitchDegrees*Math.PI/180,12);
      expect(game.yaw).toBeCloseTo(beforeYaw+.5*Math.PI/180,12);
      expect(game.camera.quaternion.angleTo(new THREE.Quaternion().setFromEuler(new THREE.Euler(game.pitch,game.yaw,0,'YXZ')))).toBeLessThan(1e-7);
      expect(game.recoil).toBe(0);expect(game.shots).toBe(1);expect(game.hits).toBe(1);
      expect(game.weaponState.ammo[weapon]).toBe(ammo-1);expect(random).toHaveBeenCalled();
    });
  }
  it('preserves Winter head damage and the authored eight pellet path',()=>{
    vi.spyOn(Math,'random').mockReturnValue(.99);const game=client('winter','shotgun');game.tryFire();
    expect(game.raycaster.intersectObjects).toHaveBeenCalledTimes(8);
    expect(game.damage).toHaveBeenCalledTimes(8);expect(game.damage).toHaveBeenCalledWith(WEAPONS.shotgun.damage*WEAPONS.shotgun.headMultiplier,10);
    expect(game.pitch).toBe(.1);expect(game.yaw).toBe(.2);expect(game.recoil).toBe(WEAPONS.shotgun.recoil);
  });
});

describe('actual Game held source reload polling',()=>{
  it.each(['barrack','woodlands'])('%s caps held R to 30 Hz, refreshes its lock and permits firing after release',map=>{
    const game=client(map);game.weaponState.ammo.rifle=12;game.keys.add('KeyR');
    const reload=vi.spyOn(game,'reload');game.updateSourceReloadInput();
    expect(reload).toHaveBeenCalledOnce();expect(game.weaponState.ammo.rifle).toBe(28);
    const reserve=game.weaponState.reserve.rifle;
    for(let index=1;index<100;index++){game.elapsed=10+index/3000;game.updateSourceReloadInput();}
    expect(reload).toHaveBeenCalledOnce();
    for(let index=1;index<=30;index++){game.elapsed=10+index/30;game.updateSourceReloadInput();game.updateWeaponReload();game.tryFire();}
    expect(reload).toHaveBeenCalledTimes(31);expect(game.shots).toBe(0);
    expect(game.weaponState.reserve.rifle).toBe(reserve);
    const deadline=11+weaponReloadDuration(map,'rifle',WEAPONS.rifle.reloadTime);
    expect(game.weaponState.reloadEnd).toBeCloseTo(deadline);
    game.keys.delete('KeyR');game.elapsed=deadline-.001;game.updateSourceReloadInput();game.updateWeaponReload();game.tryFire();expect(game.shots).toBe(0);
    game.elapsed=deadline;game.updateSourceReloadInput();game.updateWeaponReload();game.tryFire();expect(game.shots).toBe(1);
    expect(reload).toHaveBeenCalledTimes(31);
  });
  it.each(['chat','paused','dead','winter','released'])('isolates %s input without scheduling a source reload',state=>{
    const game=client(state==='winter'?'winter':'woodlands');game.keys.add('KeyR');
    if(state==='chat')game.chatOpen=true;if(state==='paused')game.phase='paused';if(state==='dead')game.playerAlive=false;if(state==='released')game.keys.clear();
    const reload=vi.spyOn(game,'reload');game.updateSourceReloadInput();game.elapsed+=1;game.updateSourceReloadInput();
    expect(reload).not.toHaveBeenCalled();if(['paused','dead','winter'].includes(state))expect(game.nextSourceReloadPoll).toBe(-Infinity);else expect(game.nextSourceReloadPoll).toBeGreaterThan(11);expect(game.weaponState.reloading).toBe(false);
  });
});


describe('actual Game source combat sample routing',()=>{
  for(const map of ['barrack','woodlands'])for(const [weapon,name,channel,reloadName] of [
    ['pistol','gunfire',6,'repistol'],['shotgun','spas12wav',6,'repistol'],['rifle','gunfire',6,'reak47'],
    ['sniper','resniper',6,'reak47'],['launcher','grenade1',7,'rerg6'],['rpg','offrock',7,'rerg6'],
  ] as const){
    it(`${map} ${weapon} plays its recovered launch and reload samples on the source channels`,()=>{
      const g=client(map,weapon) as any;g.launchExplosive=vi.fn();
      for(let frame=90;frame>0;frame--)g.weaponState.stepSourceCounter(10-frame/30);
      g.tryFire();
      const shot=g.audio.playOriginalSound.mock.calls.find((call:any[])=>call[0]===name);
      expect(shot).toBeDefined();expect(shot[4]).toBe(channel);
      if(channel===7)expect(shot[1]).toBe(g.camera.position);else expect(shot[1]).toBeUndefined();
      if(weapon==='rpg')expect(g.audio.playOriginalSound.mock.calls[0][0]).toBe('rerg6');
      if(weapon==='shotgun')expect(g.audio.playOriginalSound.mock.calls.filter((call:any[])=>call[0]==='hurt')).toHaveLength(2);
      expect(g.audio.play).not.toHaveBeenCalled();
      g.audio.playOriginalSound.mockClear();g.reload(true);
      expect(g.audio.playOriginalSound.mock.calls[0][0]).toBe(reloadName);expect(g.audio.playOriginalSound.mock.calls[0][4]).toBe(6);
      g.audio.playOriginalSound.mockClear();g.elapsed=g.weaponState.reloadEnd;g.updateWeaponReload();
      expect(g.audio.playOriginalSound).not.toHaveBeenCalled();expect(g.audio.play).not.toHaveBeenCalled();
    });
  }
  it('keeps Winter generated firing and hit audio',()=>{
    const g=client('winter','rifle');g.tryFire();
    expect(g.audio.play).toHaveBeenCalledWith('shot');expect(g.audio.play).toHaveBeenCalledWith('hit',.8);
    expect(g.audio.playOriginalSound).not.toHaveBeenCalled();
  });
});


describe('source remote hurt messages and sound order',()=>{
  for(const attackerId of ['local','third'])for(const kind of ['hitscan','explosion'])it(`${attackerId} ${kind} remote damage plays hurt once per adapted event and deduplicates`,()=>{
    const g=client('woodlands','shotgun') as any;const group=new THREE.Group();group.position.set(4,0,5);
    Object.assign(g,{mode:'online',network:{clientId:'local'},remotePlayers:new Map([['victim',{group,flinch:vi.fn()}]]),networkEffectCounts:{damageEvents:0},handledNetworkDamageEvents:new Set(),creditedExplosiveShots:new Set()});
    const source={kind,weapon:kind==='hitscan'?'shotgun':'launcher',shotId:'shot',projectileId:'projectile',zone:'body',position:{x:3,y:1,z:5}};
    const event={type:'damaged',serverTime:1000,data:{attackerId,targetId:'victim',damage:5,health:95,lethal:false,source}};
    g.handleNetworkEvent(event);g.handleNetworkEvent(event);
    expect(g.audio.playOriginalSound).toHaveBeenCalledTimes(attackerId==='local'&&kind==='hitscan'?2:1);
    expect(g.audio.playOriginalSound.mock.calls[0][0]).toBe('hurt');expect(g.audio.playOriginalSound.mock.calls[0][1]).toEqual({x:4,y:1.72,z:5});
    expect(g.audio.play).not.toHaveBeenCalled();expect(g.networkEffectCounts.damageEvents).toBe(1);
  });
  it('resolves AK hurt before its channel-six gunfire, while pistol fires before hurt',()=>{
    for(const weapon of ['rifle','pistol'] as const){const g=client('woodlands',weapon);for(let f=90;f>0;f--)g.weaponState.stepSourceCounter(10-f/30);g.tryFire();expect(g.audio.playOriginalSound.mock.calls.map(call=>call[0])).toEqual(weapon==='rifle'?['hurt','gunfire']:['gunfire','hurt']);}
  });
});


describe('source online pickup sound',()=>{
  it.each(['barrack','woodlands'])('%s plays the current reload and reports the collected weapon',map=>{
    const g=client(map,'rifle') as any;Object.assign(g,{mode:'online',network:{clientId:'local'},pendingCollections:new Set(['drop']),originalWeaponPresentation:{reload:vi.fn()}});
    g.handleNetworkEvent({type:'collected',serverTime:1000,data:{playerId:'local',itemId:'drop',kind:'weapon',weapon:'pistol',score:5}});
    expect(g.audio.playOriginalSound.mock.calls[0][0]).toBe('reak47');expect(g.audio.playOriginalSound.mock.calls[0][4]).toBe(6);expect(g.audio.play).not.toHaveBeenCalled();expect(g.score).toBe(5);
    expect(g.appendChat).toHaveBeenCalledExactlyOnceWith('','Ammo for the pistol.','feedback');
    expect(g.audio.playOriginalSound.mock.invocationCallOrder[0]).toBeLessThan(g.appendChat.mock.invocationCallOrder[0]);
  });
});

describe('actual Game source RPG atomic shot and empty gate',()=>{
  for(const map of ['barrack','woodlands'])for(const mode of ['solo','online']){
    it(`${map} ${mode} uses cached empty bullets and repeats reload side effects without firing`,()=>{
      const g=client(map,'rpg') as any;g.mode=mode;g.firing=true;
      g.network={connected:true,reload:vi.fn(()=>true),shoot:vi.fn(()=> 'unexpected')};
      g.originalWeaponPresentation={reload:vi.fn()};g.applyOriginalScopeProjection=vi.fn();g.weaponState.ammo.rpg=0;g.weaponState.reserve.rpg=12;
      g.weaponState.applyOriginalCounter({waitgun:map==='barrack'?10:1,poldwaitgun:0,ready:false},10);
      g.updateSourceReloadInput();
      expect(g.weaponState.ammo.rpg).toBe(1);expect(g.weaponState.reserve.rpg).toBe(11);
      expect(g.weaponState.originalCounterState).toEqual(map==='barrack'?{waitgun:11,poldwaitgun:31,ready:false}:{waitgun:30,poldwaitgun:0,ready:false});
      expect(g.originalWeaponPresentation.reload).toHaveBeenCalledTimes(2);
      expect(g.audio.playOriginalSound.mock.calls.map((call:any[])=>call[0])).toEqual(['rerg6','rerg6']);
      expect(g.shots).toBe(0);expect(g.network.shoot).not.toHaveBeenCalled();expect(g.network.reload).not.toHaveBeenCalled();
    });
  }
  for(const map of ['barrack','woodlands']){
    it(`${map} sends a single atomic RPG shoot and restores all predicted weapon state if queuing fails`,()=>{
      const g=client(map,'rpg') as any;Object.assign(g,{mode:'online',originalWeaponPresentation:{reload:vi.fn()},network:{connected:true,reload:vi.fn(),shoot:vi.fn(()=>undefined)},predictNetworkProjectile:vi.fn()});
      g.weaponState.ammo.rpg=3;g.weaponState.reserve.rpg=4;
      const counter={waitgun:map==='barrack'?73:0,poldwaitgun:map==='barrack'?63:17,ready:true};
      g.weaponState.applyOriginalCounter(counter,10);const lastShot=g.weaponState.lastShot;
      g.tryFire();expect(g.network.shoot).toHaveBeenCalledOnce();expect(g.network.reload).not.toHaveBeenCalled();
      expect(g.audio.playOriginalSound.mock.calls.map((call:any[])=>call[0])).toEqual(['rerg6','offrock']);
      expect(g.originalWeaponPresentation.reload).toHaveBeenCalledOnce();
      expect(g.weaponState.ammo.rpg).toBe(3);expect(g.weaponState.reserve.rpg).toBe(4);
      expect(g.weaponState.originalCounterState).toEqual(counter);expect(g.weaponState.reloading).toBe(false);expect(g.weaponState.reloadEnd).toBe(0);expect(g.weaponState.lastShot).toBe(lastShot);
      g.network.shoot.mockReturnValue('accepted');g.tryFire();expect(g.pendingSourceShot).toBe('accepted');
      expect(g.weaponState.ammo.rpg).toBe(2);expect(g.weaponState.reserve.rpg).toBe(6);
      expect(g.weaponState.originalCounterState).toEqual(map==='barrack'?{waitgun:63,poldwaitgun:83,ready:false}:{waitgun:10,poldwaitgun:17,ready:false});
      g.tryFire();expect(g.network.shoot).toHaveBeenCalledTimes(2);
    });
  }
});

describe('source exhausted RPG fallback at held empty gate',()=>{
  it.each(['barrack','woodlands'])('%s sends the second reload for the newly selected fallback gun',map=>{
    const g=client(map,'rpg') as any;Object.assign(g,{mode:'online',firing:true,network:{connected:true,reload:vi.fn(()=>true),shoot:vi.fn()},originalWeaponPresentation:{reload:vi.fn()},applyOriginalScopeProjection:vi.fn()});
    g.weaponState.ammo.rpg=0;g.weaponState.reserve.rpg=0;g.weaponState.ammo.pistol=2;g.weaponState.reserve.pistol=54;
    g.weaponState.applyOriginalCounter({waitgun:map==='barrack'?10:1,poldwaitgun:0,ready:false},10);
    g.updateSourceReloadInput();expect(g.weaponState.current).toBe('pistol');
    expect(g.weaponState.ammo.pistol).toBe(8);expect(g.weaponState.reserve.pistol).toBe(48);
    expect(g.network.reload).toHaveBeenCalledExactlyOnceWith('pistol',true);expect(g.network.shoot).not.toHaveBeenCalled();
    expect(g.audio.playOriginalSound.mock.calls.map((call:any[])=>call[0])).toEqual(['repistol']);
  });
});

describe('authority-first source RPG auto reload sound',()=>{
  for(const map of ['barrack','woodlands'])for(const predicted of [false,true]){
    it(`${map} replays authority-first reload once, local prediction ${predicted}`,()=>{
      const g=client(map,'rpg') as any;Object.assign(g,{mode:'online',network:{clientId:'local'},originalWeaponPresentation:{reload:vi.fn()}});
      g.weaponState.ammo.rpg=predicted?1:0;g.weaponState.reloading=true;
      const weapons=Object.fromEntries(Object.keys(WEAPONS).map(w=>[w,{ammo:g.weaponState.ammo[w],reserve:g.weaponState.reserve[w]}]));weapons.rpg={ammo:1,reserve:11};
      const loadout={type:'loadout',playerId:'local',serverTime:1000,equipped:'rpg',weapons,reload:{weapon:'rpg',completesAt:2000},sourceCounter:{waitgun:30,poldwaitgun:0,ready:false},sourceAutoReloadTime:1000};
      g.applyNetworkLoadout(loadout);
      expect(g.audio.playOriginalSound.mock.calls.map((call:any[])=>call[0])).toEqual(predicted?[]:['rerg6']);
      expect(g.originalWeaponPresentation.reload).toHaveBeenCalledTimes(predicted?0:1);
      // Replayed epochs cannot restart audio even after later local depletion.
      g.weaponState.ammo.rpg=0;g.applyNetworkLoadout(loadout);
      expect(g.audio.playOriginalSound).toHaveBeenCalledTimes(predicted?0:1);
    });
  }
  it('leaves pickup/manual refill audio to their existing handlers',()=>{
    const g=client('woodlands','rpg') as any;Object.assign(g,{mode:'online',network:{clientId:'local'},originalWeaponPresentation:{reload:vi.fn()}});g.weaponState.ammo.rpg=0;
    const weapons=Object.fromEntries(Object.keys(WEAPONS).map(w=>[w,{ammo:g.weaponState.ammo[w],reserve:g.weaponState.reserve[w]}]));weapons.rpg={ammo:1,reserve:11};
    g.applyNetworkLoadout({type:'loadout',playerId:'local',serverTime:1000,equipped:'rpg',weapons,reload:{weapon:'rpg',completesAt:2000},sourceCounter:{waitgun:30,poldwaitgun:0,ready:false}});
    expect(g.audio.playOriginalSound).not.toHaveBeenCalled();
  });
});

describe('source RPG constructor observes the preserved intermediate state',()=>{
  for(const map of ['barrack','woodlands'])for(const mode of ['solo','online'])it(`${map} ${mode} launches before the final saved-bullet overwrite`,()=>{
    const g=client(map,'rpg') as any;g.mode=mode;g.originalWeaponPresentation={reload:vi.fn()};
    g.weaponState.ammo.rpg=3;g.weaponState.reserve.rpg=4;
    g.weaponState.applyOriginalCounter({waitgun:map==='barrack'?73:0,poldwaitgun:map==='barrack'?63:17,ready:true},10);
    let observed:any;const spawn=()=>{observed={ammo:g.weaponState.ammo.rpg,reserve:g.weaponState.reserve.rpg,counter:g.weaponState.originalCounterState};return 'shot';};
    g.launchExplosive=vi.fn(spawn);g.network={connected:true,shoot:vi.fn(spawn)};g.predictNetworkProjectile=vi.fn();
    g.tryFire();expect(observed).toEqual({ammo:1,reserve:6,counter:map==='barrack'?{waitgun:63,poldwaitgun:83,ready:false}:{waitgun:30,poldwaitgun:17,ready:false}});
    expect(g.weaponState.ammo.rpg).toBe(2);expect(g.weaponState.originalCounterState).toEqual(map==='barrack'?{waitgun:63,poldwaitgun:83,ready:false}:{waitgun:10,poldwaitgun:17,ready:false});
    expect(g.audio.playOriginalSound.mock.calls.map((call:any[])=>call[0])).toEqual(['rerg6','offrock']);
  });
});

describe('source explosive launch before camera recoil',()=>{
  for(const map of ['barrack','woodlands'])for(const weapon of ['launcher','rpg'] as const){
    it(`${map} ${weapon} launches on its pre-recoil camera then adds source one-degree pitch and discrete yaw`,()=>{
      vi.spyOn(Math,'random').mockReturnValue(.99);const g=client(map,weapon) as any;
      for(let frame=90;frame>0;frame--)g.weaponState.stepSourceCounter(10-frame/30);
      const before=g.camera.quaternion.clone(),pitch=g.pitch,yaw=g.yaw;let launchCamera:THREE.Quaternion|undefined;
      g.launchExplosive=vi.fn(()=>{launchCamera=g.camera.quaternion.clone();});g.tryFire();
      expect(g.launchExplosive).toHaveBeenCalledExactlyOnceWith(weapon);expect(launchCamera!.angleTo(before)).toBeLessThan(1e-7);
      expect(g.pitch).toBeCloseTo(pitch+Math.PI/180,12);expect(g.yaw).toBeCloseTo(yaw+.5*Math.PI/180,12);
      expect(g.camera.quaternion.angleTo(new THREE.Quaternion().setFromEuler(new THREE.Euler(g.pitch,g.yaw,0,'YXZ')))).toBeLessThan(1e-7);
      expect(g.recoil).toBe(0);
    });
  }
  it('keeps failed source network launches from changing the camera',()=>{
    const g=client('woodlands','rpg') as any;g.mode='online';g.network={connected:true,shoot:vi.fn(()=>undefined)};
    g.weaponState.applyOriginalCounter({waitgun:0,poldwaitgun:0,ready:true},10);const pitch=g.pitch,yaw=g.yaw,camera=g.camera.quaternion.clone();
    g.tryFire();expect(g.pitch).toBe(pitch);expect(g.yaw).toBe(yaw);expect(g.camera.quaternion.angleTo(camera)).toBeLessThan(1e-7);
  });
});

describe('delayed authority RPG automatic refill notification',()=>{
  it('plays the marked refill after its lock completed without restarting reload pose or deadline',()=>{
    const g=client('woodlands','rpg') as any;Object.assign(g,{mode:'online',network:{clientId:'local'},originalWeaponPresentation:{reload:vi.fn()}});g.weaponState.ammo.rpg=0;
    const weapons=Object.fromEntries(Object.keys(WEAPONS).map(w=>[w,{ammo:g.weaponState.ammo[w],reserve:g.weaponState.reserve[w]}]));weapons.rpg={ammo:1,reserve:11};
    const loadout={type:'loadout',playerId:'local',serverTime:2000,equipped:'rpg',weapons,reload:null,sourceCounter:{waitgun:0,poldwaitgun:0,ready:true},sourceAutoReloadTime:1000};
    g.applyNetworkLoadout(loadout);expect(g.audio.playOriginalSound.mock.calls.map((call:any[])=>call[0])).toEqual(['rerg6']);
    expect(g.originalWeaponPresentation.reload).not.toHaveBeenCalled();expect(g.weaponState.reloading).toBe(false);expect(g.weaponState.reloadEnd).toBe(0);
    g.weaponState.ammo.rpg=0;g.applyNetworkLoadout(loadout);expect(g.audio.playOriginalSound).toHaveBeenCalledOnce();
  });
});

describe('source online gun readiness uses the actual authority callback epoch',()=>{
  for(const map of ['barrack','woodlands'])it(`${map} blocks a phase-early ready client until exactly the authority-derived callback gate`,()=>{
    const g=client(map,'rpg') as any;g.mode='online';g.network={connected:true,clientId:'local',estimatedServerTimeMs:1000,shoot:vi.fn(()=> 'legal')};g.predictNetworkProjectile=vi.fn();
    const state=map==='barrack'?{waitgun:10,poldwaitgun:30,ready:false}:{waitgun:30,poldwaitgun:0,ready:false};
    g.sourceGunAuthorityCounter={epoch:1000,weapon:'rpg',state};
    // Rendering/body callbacks reached their local gate one callback early.
    g.weaponState.applyOriginalCounter({waitgun:map==='barrack'?41:0,poldwaitgun:map==='barrack'?30:0,ready:true},10);
    const deadline=1000+(map==='barrack'?31:30)*1000/30;
    g.network.estimatedServerTimeMs=deadline-1000/30;g.tryFire();expect(g.network.shoot).not.toHaveBeenCalled();expect(g.weaponState.ammo.rpg).toBe(1);
    g.network.estimatedServerTimeMs=deadline;g.tryFire();expect(g.network.shoot).toHaveBeenCalledOnce();expect(g.pendingSourceShot).toBe('legal');
  });
  it('recomputes the shared counter gate for a selected source gun instead of retaining its former long wait',()=>{
    const g=client('barrack','sniper') as any;g.mode='online';g.network={connected:true,clientId:'local',estimatedServerTimeMs:1000+29*1000/30,shoot:vi.fn(()=> 'pistol')};g.remotePlayers=new Map();
    g.sourceGunAuthorityCounter={epoch:1000,weapon:'sniper',state:{waitgun:10,poldwaitgun:30,ready:false}};
    g.weaponState.select('pistol');g.weaponState.applyOriginalCounter({waitgun:39,poldwaitgun:30,ready:true},10);
    g.tryFire();expect(g.network.shoot).toHaveBeenCalledOnce();expect(g.pendingSourceShot).toBe('pistol');
  });
  it('anchors restored local counters at the completed gun callback rather than loadout delivery time',()=>{
    vi.spyOn(performance,'now').mockReturnValue(10000);const g=client('woodlands','rpg') as any;g.mode='online';g.network={clientId:'local',estimatedServerTimeMs:2200};
    const weapons=Object.fromEntries(Object.keys(WEAPONS).map(w=>[w,{ammo:g.weaponState.ammo[w],reserve:g.weaponState.reserve[w]}]));
    g.applyNetworkLoadout({type:'loadout',playerId:'local',serverTime:2100,sourceCounterTime:2000,equipped:'rpg',weapons,reload:null,sourceCounter:{waitgun:10,poldwaitgun:0,ready:false}});
    expect(g.sourceGunAuthorityLocalTime).toBeCloseTo(9.8);expect(g.sourceGunAuthorityCounter).toEqual({epoch:2000,weapon:'rpg',state:{waitgun:10,poldwaitgun:0,ready:false}});
  });
});


describe('source ControlDown fire polling',()=>{
  for(const map of ['barrack','woodlands'])for(const control of ['ControlLeft','ControlRight'])it(`${map} ${control} fires without mouseDown, stops on release and is gated during talk`,()=>{
    const g=client(map,'pistol');g.keys.add(control);
    for(let index=1;index<=90;index++){g.elapsed=10+index/30;g.updateSourceReloadInput();}
    expect(g.shots).toBeGreaterThan(1);const shots=g.shots;g.keys.delete(control);
    for(let index=91;index<=120;index++){g.elapsed=10+index/30;g.updateSourceReloadInput();}
    expect(g.shots).toBe(shots);g.keys.add(control);g.chatOpen=true;
    for(let index=121;index<=150;index++){g.elapsed=10+index/30;g.updateSourceReloadInput();}
    expect(g.shots).toBe(shots);g.chatOpen=false;
    for(let index=151;index<=180;index++){g.elapsed=10+index/30;g.updateSourceReloadInput();}
    expect(g.shots).toBeGreaterThan(shots);
  });
  it('keeps Winter outside the recovered ControlDown callback',()=>{
    const g=client('winter','pistol');g.keys.add('ControlLeft');g.updateSourceReloadInput();expect(g.shots).toBe(0);
  });
});


describe('source held left mouse resumes through actual talk and gun callbacks',()=>{
  for(const map of ['barrack','woodlands'])for(const close of ['Enter','Tab'])for(const scenario of ['held-before','held-during','released-during'])it(`${map} ${close} ${scenario}`,()=>{
    const g=client(map,'pistol') as any;
    const canvas={},element={value:'',textContent:'',focus:vi.fn(),blur:vi.fn(),classList:{add:vi.fn(),remove:vi.fn()}};
    vi.stubGlobal('document',{pointerLockElement:canvas,getElementById:()=>element});
    // Gun-only callbacks retain the existing stubbed ray target seam; no body
    // callback, private target health or GI publication is claimed here.
    Object.assign(g,{arena:{runtime:soloFloorRuntime(map)},soloCorpses:new Map(),
      soloRayTargets:vi.fn(()=>({meshes:g.enemies.flatMap((enemy:any)=>enemy.hitMeshes),corpseMeshes:new Set()})),
      damageSoloEnemy:(enemy:any,amount:number)=>enemy.damage(amount,g.elapsed),
      renderer:{domElement:canvas},requestPointerCapture:vi.fn(),localCallsign:'Mouse test'});
    const press=()=>g.mouseDown({button:0,preventDefault:vi.fn()});
    g.firing=false;if(scenario==='held-before')press();g.openChat();
    if(scenario!=='held-before')press();if(scenario==='released-during')g.firing=false; // Same flag deletion as global mouseup; DOM delivery is checked in browser.
    const ammo=g.weaponState.ammo.pistol;
    for(let frame=0;frame<30;frame++){g.elapsed=10+frame/30;g.updateSourceReloadInput();}
    expect(g.shots).toBe(0);expect(g.weaponState.ammo.pistol).toBe(ammo);
    if(close==='Enter')g.sendChat();else g.keyDown({code:'Tab',ctrlKey:false,metaKey:false,altKey:false,repeat:false,preventDefault:vi.fn(),stopImmediatePropagation:vi.fn()});
    expect(g.chatOpen).toBe(false);
    for(let frame=30;frame<60;frame++){g.elapsed=10+frame/30;g.updateSourceReloadInput();}
    if(scenario==='released-during'){expect(g.shots).toBe(0);expect(g.weaponState.ammo.pistol).toBe(ammo);}
    else{expect(g.shots).toBeGreaterThan(0);expect(g.weaponState.ammo.pistol).toBeLessThan(ammo);}
  });
  it.each(['barrack','woodlands'])('%s preserves held fire without bypassing unarmed or reload readiness',map=>{
    const g=client(map,'pistol') as any;g.firing=true;g.weaponState.unarmed=true;
    for(let frame=0;frame<30;frame++){g.elapsed=10+frame/30;g.updateSourceReloadInput();}
    expect(g.shots).toBe(0);g.weaponState.unarmed=false;g.weaponState.ammo.pistol=1;g.weaponState.startReload(g.elapsed);
    const ammo=g.weaponState.ammo.pistol;g.elapsed+=1/30;g.updateSourceReloadInput();expect(g.shots).toBe(0);expect(g.weaponState.ammo.pistol).toBe(ammo);
  });
});


describe('source gun waits for the acknowledged talk-ending input',()=>{
  it.each(['barrack','woodlands'])('%s ignores older or still-typing loadouts, then waits for the first enabled authority callback',map=>{
    vi.spyOn(performance,'now').mockReturnValue(10000);
    const g=client(map,'pistol') as any,canvas={},element={value:'',textContent:'',blur:vi.fn(),classList:{add:vi.fn()}};
    vi.stubGlobal('document',{pointerLockElement:canvas,getElementById:()=>element});
    Object.assign(g,{mode:'online',chatOpen:true,arena:{runtime:{}},renderer:{domElement:canvas},requestPointerCapture:vi.fn(),publishNetworkTransform:vi.fn(),remotePlayers:new Map(),
      network:{connected:true,clientId:'local',estimatedServerTimeMs:2010,lastSentTransformSequence:21,flushTransform:vi.fn(()=>true),shoot:vi.fn(()=> 'resumed')}});
    g.weaponState.setOriginalTyping(true);g.sourceGunAuthorityCounter={epoch:1000,weapon:'pistol',state:{waitgun:map==='barrack'?11:-30,poldwaitgun:0,ready:true}};
    g.closeChat();expect(g.sourceGunAwaitingInputSequence).toBe(21);
    g.weaponState.applyOriginalCounter({waitgun:map==='barrack'?11:-60,poldwaitgun:0,ready:true},10);
    g.tryFire();expect(g.network.shoot).not.toHaveBeenCalled();
    const weapons=Object.fromEntries(Object.keys(WEAPONS).map(w=>[w,{ammo:g.weaponState.ammo[w],reserve:g.weaponState.reserve[w]}]));
    const loadout={type:'loadout',playerId:'local',serverTime:2010,sourceCounterTime:2000,equipped:'pistol',weapons,reload:null,sourceCounter:{waitgun:map==='barrack'?11:-60,poldwaitgun:0,ready:false}};
    g.applyNetworkLoadout({...loadout,sourceTransformSequence:20,sourceTyping:false});expect(g.sourceGunAwaitingInputSequence).toBe(21);
    g.applyNetworkLoadout({...loadout,sourceTransformSequence:21,sourceTyping:true});expect(g.sourceGunAwaitingInputSequence).toBe(21);
    g.applyNetworkLoadout({...loadout,sourceTransformSequence:21,sourceTyping:false});expect(g.sourceGunAwaitingInputSequence).toBeUndefined();
    // Even a numerically ready local counter cannot bypass the first non-typing authority callback.
    g.weaponState.applyOriginalCounter({...loadout.sourceCounter,ready:true},10);
    g.tryFire();expect(g.network.shoot).not.toHaveBeenCalled();
    g.network.estimatedServerTimeMs=2000+1000/30;g.tryFire();expect(g.network.shoot).toHaveBeenCalledOnce();expect(g.pendingSourceShot).toBe('resumed');
  });
  it('clears a pending input acknowledgment on transport recovery',()=>{
    const g=client('woodlands','pistol') as any;Object.assign(g,{mode:'online',sourceGunAwaitingInputSequence:21,updateNetworkStatus:vi.fn(),releaseActiveInput:vi.fn(),clearRemotePlayers:vi.fn(),clearNetworkProjectiles:vi.fn(),remotePlayers:new Map()});
    g.handleNetworkState('reconnecting','connected');expect(g.sourceGunAwaitingInputSequence).toBeUndefined();
  });
});
