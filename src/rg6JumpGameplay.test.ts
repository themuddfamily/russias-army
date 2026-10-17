import * as THREE from 'three';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {WeaponState,WEAPONS} from './weapons';
import {getLegacyMap,legacySupportHeightAt} from '../shared/legacyMaps';
import type {NetworkGameEvent} from './network';

interface Harness {
  camera:THREE.PerspectiveCamera;velocity:THREE.Vector3;keys:Set<string>;grounded:boolean;
  health:number;armor:number;playerAlive:boolean;phase:string;mode:string;chatOpen:boolean;archivalWinter:boolean;
  invulnerableUntil:number;elapsed:number;projectiles:unknown[];handledNetworkRG6Boosts:Set<string>;
  launchExplosive(id:'launcher'|'rpg'):void;updateProjectiles(delta:number):void;updateMovement(delta:number):void;advanceGameplayFrame(delta:number):void;
  arena:{colliders:THREE.Box3[]};
  explode(point:THREE.Vector3,radius:number,damage:number,owner:'player',eligible?:boolean):void;
  handleNetworkEvent(event:NetworkGameEvent):void;fireNetworkExplosive(id:'launcher'|'rpg',spec:typeof WEAPONS.launcher):boolean;
}
function client():Harness {
  const game=Object.create(Game.prototype) as Harness;
  const camera=new THREE.PerspectiveCamera();camera.position.set(0,1.72,40);camera.rotation.x=-1.55;
  Object.assign(game,{
    camera,mapId:'barrack',archivalWinter:false,scene:new THREE.Scene(),velocity:new THREE.Vector3(0,5.2,0),
    keys:new Set(['KeyW','Space']),arrowMovement:false,grounded:false,phase:'playing',mode:'solo',playerAlive:true,
    health:100,armor:0,elapsed:10,invulnerableUntil:0,damageOpacity:0,chatOpen:false,
    controlsPreset:'legacy',rightMouseAiming:false,yaw:0,pitch:-1.55,aiming:false,recoil:0,bob:0,stepDistance:0,
    weaponSwayX:0,weaponSwayY:0,weaponState:new WeaponState(),weaponMetadata:new Map(),enemies:[],projectiles:[],originalBlasts:[],originalProjectileAccumulator:0,originalProjectileContactCount:0,
    audio:{play(){},playOriginalHurt(){}},spawnExplosion(){},showDamageDirection(){},updateHud(){},
    killPlayer(){game.health=0;game.playerAlive=false;game.velocity.set(0,0,0);},
    projectileRocketGeometry:new THREE.BufferGeometry(),projectileShellGeometry:new THREE.BufferGeometry(),projectileShellMaterial:new THREE.MeshBasicMaterial(),
    handledNetworkRG6Boosts:new Set(),network:{clientId:'local'},
    arena:{map:'barrack',colliders:getLegacyMap('barrack').colliders.map(c=>new THREE.Box3(new THREE.Vector3().fromArray(c.min),new THREE.Vector3().fromArray(c.max))),
      groundHeightAt:()=>0,supportHeightAt:(x:number,z:number,max:number)=>legacySupportHeightAt('barrack',x,z,max)},
  });
  return game;
}
describe('Source contact impulses through actual client gameplay',()=>{
  afterEach(()=>vi.restoreAllMocks());
  it('integrates an authoritative impulse only after its midframe receipt, including known source age',()=>{
    const now=vi.spyOn(performance,'now');const epoch=vi.spyOn(Date,'now');
    const event:NetworkGameEvent={type:'projectile_contact',serverTime:100000,data:{playerId:'local',projectileId:'midframe',velocity:{x:0,y:13.2,z:0}}};
    for(const offset of [undefined,40,120]){
      const slow=client(),reference=client();slow.mode='online';reference.mode='online';slow.velocity.y=0;reference.velocity.y=13.2;
      Object.assign(slow,{network:{clientId:'local',estimatedServerTimeMs:offset===undefined?undefined:99980+offset}});
      now.mockReturnValue(30);epoch.mockReturnValue(99980);slow.handleNetworkEvent(event);
      now.mockReturnValue(50);slow.advanceGameplayFrame(.05);
      let referenceTime=offset===undefined?.02:(offset-20)/1000+.02;
      while(referenceTime>1e-8){const step=Math.min(1/60,referenceTime);reference.advanceGameplayFrame(step);referenceTime-=step;}
      expect(slow.camera.position.y).toBeCloseTo(reference.camera.position.y,3);expect(slow.velocity.y).toBeCloseTo(reference.velocity.y,6);
    }
  });
  it('keeps active online movement and midframe boosts aligned through 300 and 400 ms frames',()=>{
    const now=vi.spyOn(performance,'now');
    for(const frameDelta of [.3,.4]){
      const slow=client(),normal=client();slow.mode='online';normal.mode='online';slow.velocity.y=13.2;normal.velocity.y=13.2;
      for(let frame=0;frame<Math.round(1.2/frameDelta);frame++)slow.advanceGameplayFrame(frameDelta);
      for(let frame=0;frame<72;frame++)normal.advanceGameplayFrame(1/60);
      expect(slow.camera.position.y).toBeCloseTo(normal.camera.position.y,6);expect(slow.velocity.y).toBeCloseTo(normal.velocity.y,6);
      const boosted=client(),reference=client();boosted.mode='online';reference.mode='online';reference.velocity.y=13.2;
      Object.assign(boosted,{network:{clientId:'local',estimatedServerTimeMs:100100}});
      now.mockReturnValue(30);boosted.handleNetworkEvent({type:'projectile_contact',serverTime:100000,data:{playerId:'local',projectileId:'slow-frame',velocity:{x:0,y:13.2,z:0}}});
      now.mockReturnValue(frameDelta*1000);boosted.advanceGameplayFrame(frameDelta);
      let remaining=frameDelta-.03+.1;
      while(remaining>1e-8){const step=Math.min(1/60,remaining);reference.advanceGameplayFrame(step);remaining-=step;}
      expect(boosted.camera.position.y).toBeCloseTo(reference.camera.position.y,3);expect(boosted.velocity.y).toBeCloseTo(reference.velocity.y,6);
      boosted.arena.colliders.push(new THREE.Box3(new THREE.Vector3(-5,boosted.camera.position.y+.25,-50),new THREE.Vector3(5,boosted.camera.position.y+1,50)));
      const before=boosted.camera.position.y;boosted.advanceGameplayFrame(frameDelta);expect(boosted.camera.position.y).toBeLessThan(before+.25);
    }
  });
  it('uses monotonic source age through epoch rollback and bounds delayed replay compensation',()=>{
    const now=vi.spyOn(performance,'now').mockReturnValue(100);vi.spyOn(Date,'now').mockReturnValue(99100);
    const event:NetworkGameEvent={type:'projectile_contact',serverTime:100000,data:{playerId:'local',projectileId:'clock-rollback',velocity:{x:0,y:13.2,z:0}}};
    for(const serverEstimate of [100100,100900]){
      const game=client(),reference=client();game.mode='online';reference.mode='online';
      Object.assign(game,{network:{clientId:'local',estimatedServerTimeMs:serverEstimate}});
      game.handleNetworkEvent(event);now.mockReturnValue(120);game.advanceGameplayFrame(.02);
      reference.velocity.y=13.2;reference.advanceGameplayFrame(serverEstimate===100100?.12:.27);
      expect(game.camera.position.y).toBeCloseTo(reference.camera.position.y,3);expect(game.velocity.y).toBeCloseTo(reference.velocity.y,6);
      const before=game.velocity.y;game.handleNetworkEvent(event);expect(game.velocity.y).toBe(before);
      now.mockReturnValue(100);
    }
  });
  it('sends source straight aim without authored jump intent or predictive contact impulses',()=>{
    const game=client();game.mode='online';const shoot=vi.fn((_input:unknown)=> 'shot');Object.assign(game,{network:{shoot},predictNetworkProjectile(){}});
    game.fireNetworkExplosive('launcher',WEAPONS.launcher);
    expect(shoot.mock.calls[0]?.[0]).toMatchObject({weapon:'launcher'});expect(shoot.mock.calls[0]?.[0]).not.toHaveProperty('rg6Jump');
    expect(game.velocity.y).toBe(5.2);
    game.explode(new THREE.Vector3(0,.1,40),4.3,105,'player',true);
    expect(game.velocity.y).toBe(5.2);
  });
  it('applies an owning authoritative contact once, ignoring remote, dead and nonplaying events',()=>{
    const game=client();game.mode='online';
    const event=(playerId:string,projectileId:string):NetworkGameEvent=>({type:'projectile_contact',serverTime:100,data:{playerId,projectileId,velocity:{x:0,y:13.2,z:0}}});
    game.handleNetworkEvent(event('remote','remote-shot'));expect(game.velocity.y).toBe(5.2);
    game.handleNetworkEvent(event('local','shot'));expect(game.velocity.y).toBe(13.2);expect(game.grounded).toBe(false);
    game.velocity.y=10;game.handleNetworkEvent(event('local','shot'));expect(game.velocity.y).toBe(10);
    game.playerAlive=false;game.handleNetworkEvent(event('local','dead-shot'));expect(game.velocity.y).toBe(10);
    game.playerAlive=true;game.phase='paused';game.handleNetworkEvent(event('local','paused-shot'));expect(game.velocity.y).toBe(10);
  });
});
