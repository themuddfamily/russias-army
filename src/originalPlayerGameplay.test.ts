import * as THREE from 'three';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {Game} from './game';
import {installOriginalSoloLegacyFixture} from './originalSoloLegacy.fixture';
import {WeaponState} from './weapons';
import {ORIGINAL_PLAYER_DERIVATIVE_FACTOR,ORIGINAL_PLAYER_JUMP_IMPULSE,ORIGINAL_PLAYER_MOVE_IMPULSE} from '../shared/originalPlayerPhysics';
import {ORIGINAL_PROJECTILE_RADIUS} from '../shared/originalExplosives';
import type {Vec3} from '../shared/protocol';
import {soloFloorRuntime,checkpointSoloBody} from './originalSoloGameplayHarness';
interface Client {
  camera:THREE.PerspectiveCamera;velocity:THREE.Vector3;keys:Set<string>;elapsed:number;grounded:boolean;chatOpen:boolean;
  firing:boolean;weaponState:WeaponState;phase:string;pitch:number;yaw:number;projectiles:Array<{source:{position:Vec3;remainingCallbacks:number};mesh:THREE.Mesh}>;
  handleNetworkEvent(event:unknown):void;mouseMove(event:MouseEvent):void;mouseDown(event:MouseEvent):void;reconcileOriginalPlayer(player:unknown,time:number):void;publishNetworkTransform():void;updateOriginalPlayerCallback():void;advanceGameplayFrame(delta:number):void;keyDown(event:KeyboardEvent):void;openChat():void;closeChat(capture?:boolean):void;sendChat():void;
}
function client(map:'woodlands'|'b'='woodlands'):Client {
  const game=Object.create(Game.prototype) as Client,camera=new THREE.PerspectiveCamera();camera.position.set(0,1.72,0);
  Object.assign(game,{camera,velocity:new THREE.Vector3(),keys:new Set(),elapsed:0,phase:'playing',playerAlive:true,archivalWinter:false,
    mode:'solo',mapId:map,grounded:true,chatOpen:false,firing:false,weaponState:new WeaponState(map),
    controlsPreset:'legacy',arrowMovement:true,yaw:0,pitch:0,recoil:0,aiming:false,rightMouseAiming:false,weaponSwayX:0,weaponSwayY:0,
    projectiles:[],originalBlasts:[],originalProjectileAccumulator:0,nextSourceReloadPoll:-Infinity,originalProjectileContactCount:0,
    arena:{runtime:soloFloorRuntime(map)},scene:new THREE.Scene(),audio:{play:vi.fn()},
    updateViewModelPresentation:vi.fn(),updateOriginalWeaponPresentation:vi.fn(),updateHud:vi.fn(),setMessage:vi.fn(),triggerViewModelFire:vi.fn(),spawnMuzzleParticles:vi.fn(),spawnCasing:vi.fn(),
    muzzleLight:{intensity:0},worldMuzzleLight:{intensity:0},projectileShellGeometry:new THREE.BufferGeometry(),projectileShellMaterial:new THREE.MeshBasicMaterial(),
    projectileRocketGeometry:new THREE.BufferGeometry(),spawnExplosion:vi.fn(),takeDamage:vi.fn(),enemies:[],soloCorpses:new Map(),soloBotShots:[]});
  installOriginalSoloLegacyFixture(game);return game;
}
function talkKey(code:string):KeyboardEvent {return {code,repeat:false,ctrlKey:false,altKey:false,metaKey:false,preventDefault:vi.fn(),stopImmediatePropagation:vi.fn()} as unknown as KeyboardEvent;}
function installTalkDom(game:Client){
  const input={value:'',maxLength:40,placeholder:'',focus:vi.fn(),blur:vi.fn()},form={classList:{add:vi.fn(),remove:vi.fn()}},label={textContent:''};
  vi.stubGlobal('document',{pointerLockElement:null,getElementById:(id:string)=>id==='chat-input'?input:id==='chat-form'?form:label});
  Object.assign(game,{localCallsign:'Player',appendChat:vi.fn(),requestPointerCapture:vi.fn()});
}
function frame(game:Client,at:number){game.elapsed=at;game.advanceGameplayFrame(1/30);}
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
describe('actual Game joint source player callbacks',()=>{
  it('polls held Space after world support instead of applying an edge jump',()=>{
    const game=client();game.keyDown({code:'Space',repeat:false,ctrlKey:false,altKey:false,metaKey:false} as KeyboardEvent);
    expect(game.velocity.y).toBe(0);frame(game,0);
    expect(game.velocity.y).toBeCloseTo(ORIGINAL_PLAYER_JUMP_IMPULSE*ORIGINAL_PLAYER_DERIVATIVE_FACTOR,1);
    const firstEye=game.camera.position.y;frame(game,1/30);expect(game.camera.position.y).toBeGreaterThan(firstEye);
  });
  it('repeats the source jump when held Space acquires support after landing',()=>{
    const game=client();game.keys.add('Space');frame(game,0);let jumpedAgain=false,wasDescending=false;
    for(let i=1;i<100;i++){frame(game,i/30);if(game.velocity.y<0)wasDescending=true;if(wasDescending&&game.velocity.y>7){jumpedAgain=true;break;}}
    expect(jumpedAgain).toBe(true);
  });
  it('applies grounded forward priority and drag, while airborne input preserves horizontal momentum',()=>{
    const game=client();game.keys=new Set(['KeyW','KeyS']);frame(game,0);
    expect(game.velocity.z).toBeCloseTo(-ORIGINAL_PLAYER_MOVE_IMPULSE*.75*ORIGINAL_PLAYER_DERIVATIVE_FACTOR,10);
    game.camera.position.y=10;game.velocity.set(1,0,2);game.keys=new Set(['KeyW','KeyD']);checkpointSoloBody(game);frame(game,1/30);
    expect(game.velocity.x).toBe(1);expect(game.velocity.z).toBe(2);expect(game.grounded).toBe(false);
  });
  it('chat suppresses the held jump and movement while retaining grounded horizontal drag',()=>{
    const game=client();game.chatOpen=true;game.keys=new Set(['KeyW','Space']);game.velocity.z=4;frame(game,0);
    expect(game.velocity.z).toBeGreaterThan(0);expect(game.velocity.z).toBeLessThan(3);expect(game.velocity.y).toBeLessThan(.1);
  });
  // Recovered goody.keytalk changes ptyping only; parameterized keyPressed
  // continues to represent physical keys (Director MX2004 reference, p377).
  it.each(['Tab','Enter'])('resumes W held before typing after %s closes talk without another keydown',close=>{
    const game=client();installTalkDom(game);game.keyDown(talkKey('KeyW'));game.openChat();
    frame(game,0);expect(game.velocity.z).toBe(0);expect(game.keys.has('KeyW')).toBe(true);
    if(close==='Tab')game.keyDown(talkKey(close));else game.sendChat();
    frame(game,1/30);expect(game.chatOpen).toBe(false);
    expect(game.velocity.z).toBeCloseTo(-ORIGINAL_PLAYER_MOVE_IMPULSE*.75*ORIGINAL_PLAYER_DERIVATIVE_FACTOR,10);
  });
  it('records W pressed in the focused talk form and resumes its supported movement after closing',()=>{
    const game=client();installTalkDom(game);game.openChat();game.keyDown(talkKey('KeyW'));
    frame(game,0);expect(game.velocity.z).toBe(0);game.keyDown(talkKey('Tab'));frame(game,1/30);
    expect(game.velocity.z).toBeCloseTo(-ORIGINAL_PLAYER_MOVE_IMPULSE*.75*ORIGINAL_PLAYER_DERIVATIVE_FACTOR,10);
  });
  it('does not resume a movement key released while the talk form has focus',()=>{
    const game=client();installTalkDom(game);game.keyDown(talkKey('KeyW'));game.openChat();
    // The installed global keyup listener deletes this physical code regardless
    // of talk focus; exercise that shared set state through the real callbacks.
    game.keys.delete('KeyW');game.keyDown(talkKey('Tab'));frame(game,0);
    expect(game.velocity.z).toBe(0);expect(game.camera.position.z).toBe(0);
  });
  it('resumes a held Space jump only after typing closes and support is available',()=>{
    const game=client();installTalkDom(game);game.keyDown(talkKey('Space'));game.openChat();
    frame(game,0);expect(Math.abs(game.velocity.y)).toBeLessThan(.1);expect(game.grounded).toBe(true);
    game.closeChat(false);frame(game,1/30);
    expect(game.velocity.y).toBeCloseTo(ORIGINAL_PLAYER_JUMP_IMPULSE*ORIGINAL_PLAYER_DERIVATIVE_FACTOR,1);
  });
  it('keeps a held yaw arrow across both talk transitions and callbacks',()=>{
    const game=client();installTalkDom(game);game.keyDown(talkKey('ArrowLeft'));game.openChat();
    frame(game,0);expect(game.yaw).toBeCloseTo(5*Math.PI/180,12);game.closeChat(false);frame(game,1/30);
    expect(game.yaw).toBeCloseTo(10*Math.PI/180,12);
  });
  it('gates R and number-key polling during typing, then resumes both held controls on the next callback',()=>{
    const game=client();installTalkDom(game);const reload=vi.fn(()=>true),switchWeapon=vi.fn();Object.assign(game,{reload,switchWeapon});
    game.openChat();game.keyDown(talkKey('KeyR'));game.keyDown(talkKey('Digit1'));frame(game,0);
    expect(reload).not.toHaveBeenCalled();expect(switchWeapon).not.toHaveBeenCalled();
    game.closeChat(false);frame(game,1/30);
    expect(reload).toHaveBeenCalledWith(true);expect(switchWeapon).toHaveBeenCalledWith('pistol');
  });
  it.each(['woodlands','b'] as const)('%s resumes only physically held legacy right-button movement after talk closes',map=>{
    for(const close of ['Enter','Tab'])for(const state of ['before','during','released']){
      const game=client(map);installTalkDom(game);const surface={};Object.assign(game,{renderer:{domElement:surface}});
      (document as unknown as {pointerLockElement:unknown}).pointerLockElement=surface;
      const down=()=>game.mouseDown({button:2,preventDefault:vi.fn()} as unknown as MouseEvent);
      if(state!=='during')down();game.openChat();if(state==='during')down();
      // Global mouseup uses this same physical flag regardless of talk focus.
      if(state==='released')Object.assign(game,{rightMouseAiming:false});
      frame(game,0);expect(game.velocity.z).toBe(0);expect(game.projectiles).toHaveLength(0);
      if(close==='Tab')game.keyDown(talkKey('Tab'));else game.sendChat();frame(game,1/30);
      expect(game.velocity.z).toBeCloseTo(state==='released'?0:-ORIGINAL_PLAYER_MOVE_IMPULSE*.75*ORIGINAL_PLAYER_DERIVATIVE_FACTOR,10);
      expect((game as any).aiming).toBe(false);expect((game as any).originalScopeActive??false).toBe(false);
    }
  });
  it('preserves modern right-button aiming through talk without mapping it to legacy forward movement',()=>{
    const game=client();installTalkDom(game);const surface={};Object.assign(game,{renderer:{domElement:surface},controlsPreset:'modern'});
    (document as unknown as {pointerLockElement:unknown}).pointerLockElement=surface;game.openChat();
    game.mouseDown({button:2,preventDefault:vi.fn()} as unknown as MouseEvent);frame(game,0);
    expect(game.velocity.z).toBe(0);expect((game as any).aiming).toBe(false);game.closeChat(false);frame(game,1/30);
    expect(game.velocity.z).toBe(0);expect((game as any).aiming).toBe(true);
  });
  it('does not create a legacy Dragunov scope from a held right button resumed after talk',()=>{
    const game=client();installTalkDom(game);game.weaponState.select('sniper');const surface={};Object.assign(game,{renderer:{domElement:surface}});
    (document as unknown as {pointerLockElement:unknown}).pointerLockElement=surface;game.openChat();game.mouseDown({button:2,preventDefault:vi.fn()} as unknown as MouseEvent);
    frame(game,0);game.closeChat(false);frame(game,1/30);
    expect((game as any).originalScopeState.active).toBe(false);expect(game.velocity.z).toBeLessThan(0);
    game.keys.add('ShiftLeft');frame(game,2/30);expect((game as any).originalScopeState.active).toBe(true);
  });
  it('runs player physics and eye before gun launch, and first moves the new grenade next callback',()=>{
    const game=client();game.camera.position.y=10;game.velocity.x=3;game.firing=true;frame(game,0);
    expect(game.projectiles).toHaveLength(1);const source=game.projectiles[0].source;
    expect(source.position).toEqual({x:game.camera.position.x,y:game.camera.position.y,z:game.camera.position.z});
    expect(source.position.x).toBeCloseTo(.1,10);expect(source.remainingCallbacks).toBe(60);
    const launchZ=source.position.z;game.firing=false;frame(game,1/30);expect(source.position.z).toBeLessThan(launchZ-1);expect(source.remainingCallbacks).toBe(59);
  });
  it('jointly transfers downward grenade momentum to the moving player body',()=>{
    const game=client();game.camera.position.y=10;game.pitch=-Math.PI/2;game.camera.rotation.x=game.pitch;game.firing=true;frame(game,0);
    expect(game.projectiles[0].source.position.y).toBe(game.camera.position.y);
    game.firing=false;frame(game,1/30);expect(game.velocity.y).toBeLessThan(0);expect(game.projectiles[0].source.position.y).toBeGreaterThan(ORIGINAL_PROJECTILE_RADIUS.launcher);
  });
  it('uses one clock for physics, source gun wait, and projectile actors through a rendering stall',()=>{
    const slow=client(),regular=client();slow.keys.add('KeyW');regular.keys.add('KeyW');frame(slow,0);frame(regular,0);
    slow.elapsed=.2;slow.advanceGameplayFrame(.2);for(let i=1;i<=6;i++)frame(regular,i/30);
    expect(slow.camera.position.distanceTo(regular.camera.position)).toBeLessThan(1e-10);expect(slow.velocity.distanceTo(regular.velocity)).toBeLessThan(1e-10);
    expect(slow.weaponState.originalCounterState).toEqual(regular.weaponState.originalCounterState);
  });
  it('does not advance the source world while paused',()=>{
    const game=client();game.phase='paused';game.keys.add('Space');frame(game,0);expect(game.velocity.length()).toBe(0);expect(game.camera.position.y).toBe(1.72);
  });
  it('polls the original five-degree keyboard yaw even while typing suppresses movement',()=>{
    const game=client();game.chatOpen=true;game.keys.add('ArrowLeft');frame(game,0);
    expect(game.yaw).toBeCloseTo(5*Math.PI/180,12);expect(game.camera.position.z).toBe(0);
  });
  it('applies source mouse sensitivity at the callback, clamping pitch before the mouse delta',()=>{
    const game=client(),surface={};Object.assign(game,{renderer:{domElement:surface},sensitivity:1});vi.stubGlobal('document',{pointerLockElement:surface});
    game.pitch=80*Math.PI/180;game.mouseMove({movementX:100,movementY:-20} as MouseEvent);
    expect(game.yaw).toBe(0);expect(game.pitch).toBeCloseTo(80*Math.PI/180,12);frame(game,0);
    expect(game.yaw).toBeCloseTo(-50*Math.PI/180,12);expect(game.pitch).toBeCloseTo(90*Math.PI/180,12);
    frame(game,1/30);expect(game.pitch).toBeCloseTo(85*Math.PI/180,12);
  });
  it('continues source look while typing but suppresses movement, jump and firing',()=>{
    const game=client(),surface={};Object.assign(game,{renderer:{domElement:surface},sensitivity:1,chatOpen:true});vi.stubGlobal('document',{pointerLockElement:surface});
    game.keys=new Set(['KeyW','Space']);game.mouseMove({movementX:20,movementY:-8} as MouseEvent);const preventDefault=vi.fn();game.mouseDown({button:0,preventDefault} as unknown as MouseEvent);expect(preventDefault).toHaveBeenCalledOnce();
    expect(game.yaw).toBe(0);expect(game.pitch).toBe(0);expect(game.firing).toBe(true);frame(game,0);
    expect(game.yaw).toBeCloseTo(-10*Math.PI/180,12);expect(game.pitch).toBeCloseTo(4*Math.PI/180,12);
    expect(game.camera.position.x).toBe(0);expect(game.camera.position.z).toBe(0);expect(Math.abs(game.velocity.y)).toBeLessThan(.1);expect(game.projectiles).toHaveLength(0);
  });
  it('keeps Winter mouse look blocked while typing',()=>{
    const game=client(),surface={};Object.assign(game,{renderer:{domElement:surface},sensitivity:1,chatOpen:true,archivalWinter:true});vi.stubGlobal('document',{pointerLockElement:surface});
    game.mouseMove({movementX:20,movementY:-8} as MouseEvent);expect(game.yaw).toBe(0);expect(game.pitch).toBe(0);
    expect((game as unknown as {originalMouseDelta?:{x:number;y:number}}).originalMouseDelta).toBeUndefined();
  });
  it('replays only pending player input after an authoritative epoch without firing or advancing actors',()=>{
    const game=client();frame(game,0);const counter=game.weaponState.originalCounterState;
    const input={forward:true,backward:false,right:false,left:false,jump:false,yaw:0,pitch:0,typing:false};
    const resetTransformPath=vi.fn();Object.assign(game,{mode:'online',network:{resetTransformPath},originalPlayerPrediction:[{serverTime:1040,input},{serverTime:1080,input}]});
    const projectile={source:{position:{x:8,y:9,z:10},remainingCallbacks:44},mesh:new THREE.Mesh()};game.projectiles.push(projectile);
    game.reconcileOriginalPlayer({transform:{position:{x:2,y:0,z:5},velocity:{x:0,y:0,z:0},grounded:true,sourceInput:input}},1050);
    expect(game.camera.position.x).toBe(2);expect(game.camera.position.z).toBe(5);
    expect(game.velocity.z).toBeCloseTo(-ORIGINAL_PLAYER_MOVE_IMPULSE*.75*ORIGINAL_PLAYER_DERIVATIVE_FACTOR,10);
    expect(game.weaponState.originalCounterState).toEqual(counter);expect(projectile.source).toEqual({position:{x:8,y:9,z:10},remainingCallbacks:44});
    expect(resetTransformPath).toHaveBeenCalledOnce();
  });
  it('maps the original right mouse button to forward movement in the Legacy preset',()=>{
    const game=client();Object.assign(game,{rightMouseAiming:true});frame(game,0);
    expect(game.velocity.z).toBeCloseTo(-ORIGINAL_PLAYER_MOVE_IMPULSE*.75*ORIGINAL_PLAYER_DERIVATIVE_FACTOR,10);expect(game.camera.position.z).toBe(0);
  });

  it('reanchors the joint callback clock when authority advances through a rendering stall',()=>{
    const now=vi.spyOn(performance,'now').mockReturnValue(0),game=client();frame(game,0);
    const counter=game.weaponState.originalCounterState;
    now.mockReturnValue(1000);Object.assign(game,{mode:'online',network:{estimatedServerTimeMs:10000,resetTransformPath:vi.fn()},originalPlayerPrediction:[]});
    const input={forward:false,backward:false,left:false,right:false,jump:false};
    game.reconcileOriginalPlayer({transform:{position:{x:0,y:5,z:0},velocity:{x:0,y:0,z:0},grounded:false,sourceInput:input}},10000);
    game.elapsed=1;game.advanceGameplayFrame(1);
    expect(game.camera.position.y).toBe(6.72);expect(game.velocity.length()).toBe(0);
    expect(game.weaponState.originalCounterState).toEqual(counter);
    now.mockReturnValue(1000+1000/30);game.elapsed=1+1/30;game.advanceGameplayFrame(1/30);
    expect(game.camera.position.y).toBeLessThan(6.72);expect(game.camera.position.y).toBeGreaterThan(6.7);
    expect(game.velocity.y).toBeCloseTo(-400*(1.72/85)*.05*1.5,10);
  });

  it('keeps a newborn grenade fuse at60 until its first physics callback and detonates after59 actor callbacks',()=>{
    const game=client();game.camera.position.y=20;game.firing=true;frame(game,0);game.firing=false;
    expect(game.projectiles[0].source.remainingCallbacks).toBe(60);
    for(let i=1;i<=58;i++)frame(game,i/30);
    expect(game.projectiles).toHaveLength(1);expect(game.projectiles[0].source.remainingCallbacks).toBe(2);
    frame(game,59/30);expect(game.projectiles).toHaveLength(0);
  });

  it('queues final contact velocity until its completed callback rather than applying it to stalled earlier callbacks',()=>{
    const now=vi.spyOn(performance,'now').mockReturnValue(0),game=client();game.camera.position.y=10;frame(game,0);game.velocity.set(0,0,0);
    const event={type:'projectile_contact',serverTime:1000+2000/30,data:{playerId:'local',projectileId:'contact-1',velocity:{x:2,y:12,z:3}}};
    now.mockReturnValue(100);Object.assign(game,{mode:'online',network:{clientId:'local',estimatedServerTimeMs:1100,resetTransformPath:vi.fn()},handledNetworkRG6Boosts:new Set()});
    game.handleNetworkEvent(event);game.handleNetworkEvent(event);expect(game.velocity.length()).toBe(0);
    game.elapsed=1/30;game.advanceGameplayFrame(1/30);expect(game.velocity.y).toBeCloseTo(-400*(1.72/85)*.05*1.5,10);expect(game.velocity.x).toBe(0);
    game.elapsed=2/30;game.advanceGameplayFrame(1/30);expect(game.velocity.toArray()).toEqual([2,12,3]);
    game.elapsed=3/30;game.advanceGameplayFrame(1/30);expect(game.velocity.y).toBeCloseTo(12-400*(1.72/85)*.05*1.5,10);expect(game.velocity.x).toBe(2);
  });
  it('discards queued and late contacts already represented by the authoritative physics epoch',()=>{
    const now=vi.spyOn(performance,'now').mockReturnValue(0),game=client();frame(game,0);
    const event={type:'projectile_contact',serverTime:1050,data:{playerId:'local',projectileId:'covered-contact',velocity:{x:0,y:12,z:0}}};
    now.mockReturnValue(100);Object.assign(game,{mode:'online',network:{clientId:'local',estimatedServerTimeMs:1100,resetTransformPath:vi.fn()},handledNetworkRG6Boosts:new Set()});
    game.handleNetworkEvent(event);
    const input={forward:false,backward:false,left:false,right:false,jump:false};
    game.reconcileOriginalPlayer({transform:{position:{x:0,y:5,z:0},velocity:{x:0,y:2,z:0},grounded:false,sourceInput:input}},1100);
    game.elapsed=.1+1/30;game.advanceGameplayFrame(1/30);expect(game.velocity.y).toBeCloseTo(2-400*(1.72/85)*.05*1.5,10);
    Object.assign(game,{latestNetworkSnapshot:{sourcePhysicsTime:1200}});game.handleNetworkEvent({...event,data:{...event.data,projectileId:'late-covered-contact'}});
    game.elapsed=.1+2/30;game.advanceGameplayFrame(1/30);expect(game.velocity.y).toBeLessThan(2);
  });

  it.each(['ShiftLeft','ShiftRight'])('restores optional Modern %s sprint in the actual source runtime',shift=>{
    const walk=client(),sprint=client(),legacy=client();
    Object.assign(walk,{controlsPreset:'modern'});Object.assign(sprint,{controlsPreset:'modern'});
    walk.keys.add('KeyW');sprint.keys=new Set(['KeyW',shift]);legacy.keys=new Set(['KeyW',shift]);
    frame(walk,0);frame(sprint,0);frame(legacy,0);
    expect(sprint.velocity.z/walk.velocity.z).toBeCloseTo(7.2/4.55,12);
    expect(legacy.velocity.z).toBe(walk.velocity.z);
    expect((sprint as any).originalMovementMode()).toBe('modern-sprint');
    expect((sprint as any).updateOriginalWeaponPresentation).toHaveBeenCalledExactlyOnceWith(1/30,false);
    expect((sprint as any).updateViewModelPresentation).not.toHaveBeenCalled();
  });
  it('restores Modern aimed movement and suppresses sprint before that callback controls',()=>{
    const walk=client(),aim=client();Object.assign(walk,{controlsPreset:'modern'});Object.assign(aim,{controlsPreset:'modern',rightMouseAiming:true});
    walk.keys.add('KeyW');aim.keys=new Set(['KeyW','ShiftLeft']);frame(walk,0);frame(aim,0);
    expect(aim.velocity.z/walk.velocity.z).toBeCloseTo(2.6/4.55,12);expect((aim as any).aiming).toBe(true);
    expect((aim as any).originalMovementMode()).toBe('modern-aim');
    expect((aim as any).updateOriginalWeaponPresentation).toHaveBeenCalledExactlyOnceWith(1/30,false);
    expect((aim as any).updateViewModelPresentation).not.toHaveBeenCalled();
  });
  it('uses enabled Modern arrow movement for sprint and respects saved arrow opt-out',()=>{
    const arrows=client(),letters=client(),disabled=client();
    for(const game of [arrows,letters,disabled])Object.assign(game,{controlsPreset:'modern'});
    arrows.keys=new Set(['ArrowUp','ShiftRight']);letters.keys=new Set(['KeyW','ShiftRight']);disabled.keys=new Set(['ArrowUp','ShiftRight']);Object.assign(disabled,{arrowMovement:false});
    frame(arrows,0);frame(letters,0);frame(disabled,0);
    expect(arrows.velocity.toArray()).toEqual(letters.velocity.toArray());expect(disabled.velocity.z).toBe(0);
  });
  it('keeps Modern movement options out of typing, jump impulses and airborne momentum',()=>{
    const typing=client(),sprint=client(),source=client();
    Object.assign(typing,{controlsPreset:'modern',chatOpen:true});typing.keys=new Set(['KeyW','Space','ShiftLeft']);frame(typing,0);
    expect(typing.velocity.length()).toBeLessThan(.1);
    Object.assign(sprint,{controlsPreset:'modern'});sprint.keys=new Set(['KeyW','Space','ShiftLeft']);source.keys=new Set(['KeyW','Space']);
    frame(sprint,0);frame(source,0);expect(sprint.velocity.y).toBe(source.velocity.y);
    for(const game of [sprint,source]){game.camera.position.y=10;game.velocity.set(3,0,2);checkpointSoloBody(game);frame(game,1/30);}
    expect(sprint.velocity.toArray()).toEqual(source.velocity.toArray());
  });
  it('publishes explicit Modern movement mode and records it for authoritative prediction replay',()=>{
    const game=client(),setTransform=vi.fn();Object.assign(game,{controlsPreset:'modern',mode:'online',network:{setTransform,estimatedServerTimeMs:1000,resetTransformPath:vi.fn()}});
    game.keys=new Set(['KeyW','ShiftLeft']);frame(game,0);game.publishNetworkTransform();
    expect(setTransform).toHaveBeenLastCalledWith(expect.objectContaining({movementMode:'modern-sprint',sourceInput:expect.objectContaining({forward:true})}),expect.any(Array));
    expect((game as any).originalPlayerPrediction.at(-1).movementMode).toBe('modern-sprint');
    const input={forward:true,backward:false,left:false,right:false,jump:false,yaw:0,pitch:0,typing:false};
    Object.assign(game,{originalPlayerPrediction:[{serverTime:1040,input,movementMode:'modern-sprint'}]});
    game.reconcileOriginalPlayer({transform:{position:{x:0,y:0,z:0},velocity:{x:0,y:0,z:0},grounded:true,sourceInput:input,movementMode:'modern-sprint'}},1000);
    expect(game.velocity.z).toBeCloseTo(-ORIGINAL_PLAYER_MOVE_IMPULSE*.75*ORIGINAL_PLAYER_DERIVATIVE_FACTOR*(7.2/4.55),10);
  });

  it('throws Modern G once, consumes ammo, and advances authored flight at each source callback',()=>{
    const game=client();Object.assign(game,{controlsPreset:'modern',grenades:3,shots:0,distanceToWorld:(_a:unknown,_b:unknown,d:number)=>d});
    game.keyDown({code:'KeyG',repeat:false,ctrlKey:false,altKey:false,metaKey:false} as KeyboardEvent);
    expect((game as any).grenades).toBe(2);expect(game.projectiles).toHaveLength(1);
    const grenade=game.projectiles[0] as any,start=grenade.mesh.position.clone(),initialY=grenade.velocity.y;
    expect(grenade.source).toBeUndefined();frame(game,0);
    expect(grenade.life).toBeCloseTo(2.4-1/30,12);expect(grenade.velocity.y).toBeCloseTo(initialY-9.81/30,12);
    expect(grenade.mesh.position.z).toBeLessThan(start.z);expect(grenade.mesh.position.y).toBeGreaterThan(start.y);
    game.keyDown({code:'KeyG',repeat:true,ctrlKey:false,altKey:false,metaKey:false} as KeyboardEvent);
    expect((game as any).grenades).toBe(2);expect(game.projectiles).toHaveLength(1);
  });
  it('bounces Modern hand grenades on the ground and walls instead of freezing or using source contacts',()=>{
    const game=client();Object.assign(game,{controlsPreset:'modern',grenades:3,distanceToWorld:(_a:unknown,_b:unknown,d:number)=>d});
    game.keyDown({code:'KeyG',repeat:false} as KeyboardEvent);const grenade=game.projectiles[0] as any;
    grenade.mesh.position.set(0,.13,-3);grenade.velocity.set(3,-2,4);frame(game,0);
    expect(grenade.mesh.position.y).toBe(.12);expect(grenade.velocity.y).toBeGreaterThan(0);expect(grenade.velocity.x).toBeCloseTo(3*.72,12);expect(game.projectiles).toHaveLength(1);
    grenade.mesh.position.y=4;grenade.velocity.set(3,-2,4);const old=grenade.mesh.position.clone();
    Object.assign(game,{distanceToWorld:()=>0});frame(game,1/30);
    expect(grenade.mesh.position.toArray()).toEqual(old.toArray());expect(grenade.velocity.x).toBeCloseTo(3*.62,12);expect(grenade.velocity.y).toBeGreaterThan(0);
    expect((game as any).originalBlasts).toHaveLength(0);
  });
  it('detonates expired Modern G through immediate authored damage without a source blast or jump boost',()=>{
    const game=client();Object.assign(game,{controlsPreset:'modern',grenades:3,distanceToWorld:(_a:unknown,_b:unknown,d:number)=>d,showHitmarker:vi.fn(),hits:0});
    game.keyDown({code:'KeyG',repeat:false} as KeyboardEvent);const grenade=game.projectiles[0] as any;
    grenade.life=.01;grenade.mesh.position.copy(game.camera.position);grenade.velocity.set(0,0,0);
    const enemyDamage=vi.fn().mockReturnValue('damaged'),enemy={alive:true,group:new THREE.Group(),damage:enemyDamage};enemy.group.position.copy(game.camera.position);
    // This existing authored-G test observes the target damage call and grenade
    // lifecycle. Its plain target stub has no private goody or received GI;
    // full source bot health/physics are covered by the observer Game suites.
    Object.assign(game,{enemies:[enemy],registerSoloEnemy:vi.fn(),damageSoloEnemy:(target:any,amount:number)=>target.damage(amount,(game as any).elapsed)});frame(game,0);
    expect(game.projectiles).toHaveLength(0);expect(grenade.mesh.parent).toBeNull();expect(enemyDamage).toHaveBeenCalledOnce();expect(enemyDamage.mock.calls[0][0]).toBeGreaterThan(119);
    expect((game as any).takeDamage).toHaveBeenCalledOnce();expect((game as any).takeDamage.mock.calls[0][0]).toBeGreaterThan(53);
    expect((game as any).originalBlasts).toHaveLength(0);expect(game.velocity.y).toBeLessThan(.1);
  });
  it('catches up authored G flight once per source callback across rendering stalls',()=>{
    const slow=client(),regular=client();
    for(const game of [slow,regular]){Object.assign(game,{controlsPreset:'modern',grenades:3,distanceToWorld:(_a:unknown,_b:unknown,d:number)=>d});game.keyDown({code:'KeyG',repeat:false} as KeyboardEvent);frame(game,0);}
    slow.elapsed=.2;slow.advanceGameplayFrame(.2);for(let i=1;i<=6;i++)frame(regular,i/30);
    const a=slow.projectiles[0] as any,b=regular.projectiles[0] as any;
    expect(a.life).toBe(b.life);expect(a.mesh.position.toArray()).toEqual(b.mesh.position.toArray());expect(a.velocity.toArray()).toEqual(b.velocity.toArray());
    const legacy=client();Object.assign(legacy,{grenades:3});legacy.keyDown({code:'KeyG',repeat:false} as KeyboardEvent);expect(legacy.projectiles).toHaveLength(0);expect((legacy as any).grenades).toBe(3);
  });

});
