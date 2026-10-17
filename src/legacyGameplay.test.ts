import * as THREE from 'three';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { Game } from './game';
import { getLegacyMap, legacyGroundHeightAt, legacySupportHeightAt, type LegacyMapId } from '../shared/legacyMaps';
import { WeaponState } from './weapons';

interface MovementHarness {
  camera:THREE.PerspectiveCamera;velocity:THREE.Vector3;keys:Set<string>;grounded:boolean;
  controlsPreset:'legacy'|'modern';yaw:number;aiming:boolean;weaponState:WeaponState;
  arrowMovement:boolean;chatOpen:boolean;
  updateMovement(delta:number):void;keyDown(event:KeyboardEvent):void;loadSettings():void;
}

/** Exercise the actual client movement code without allocating a WebGL context. */
function client(id:LegacyMapId,x:number,z:number,y=legacyGroundHeightAt(id,x,z)):MovementHarness {
  const plan=getLegacyMap(id),camera=new THREE.PerspectiveCamera();camera.position.set(x,y+1.72,z);
  const game=Object.create(Game.prototype) as MovementHarness;
  Object.assign(game,{
    camera,velocity:new THREE.Vector3(),keys:new Set(),grounded:true,controlsPreset:'legacy',arrowMovement:true,
    phase:'playing',playerAlive:true,sensitivity:1,
    rightMouseAiming:false,chatOpen:false,yaw:0,pitch:0,aiming:false,recoil:0,bob:0,stepDistance:0,
    weaponSwayX:0,weaponSwayY:0,weaponState:new WeaponState(),weaponMetadata:new Map(),audio:{play(){}},
    arena:{map:id,colliders:plan.colliders.map(c=>new THREE.Box3(new THREE.Vector3().fromArray(c.min),new THREE.Vector3().fromArray(c.max))),
      spawnPoints:[],pickups:[],groundHeightAt:(a:number,b:number)=>legacyGroundHeightAt(id,a,b),
      supportHeightAt:(a:number,b:number,max:number)=>legacySupportHeightAt(id,a,b,max)},
  });
  return game;
}
function advance(game:MovementHarness,seconds:number){for(let i=0;i<Math.round(seconds*60);i++)game.updateMovement(1/60);}
afterEach(()=>vi.unstubAllGlobals());

describe('legacy maps in the actual client movement',()=>{
  it('moves with Legacy forward/back arrows like W/S without changing yaw',()=>{
    for(const [arrow,wasd] of [['ArrowUp','KeyW'],['ArrowDown','KeyS']]){
      const arrows=client('barrack',0,40),letters=client('barrack',0,40);
      const preventDefault=vi.fn();
      arrows.keyDown({code:arrow,repeat:false,ctrlKey:false,altKey:false,metaKey:false,preventDefault} as unknown as KeyboardEvent);
      letters.keys.add(wasd);advance(arrows,1);advance(letters,1);
      expect(preventDefault).toHaveBeenCalledOnce();
      expect(arrows.camera.position.distanceTo(letters.camera.position)).toBeLessThan(.000001);
      expect(arrows.camera.position.distanceTo(new THREE.Vector3(0,1.72,40))).toBeGreaterThan(4);
      expect(arrows.yaw).toBe(0);
    }
  });
  it('steers with Legacy lateral arrows while A/D still strafe, and retains Modern lateral aliases',()=>{
    for(const [arrow,wasd,direction] of [['ArrowLeft','KeyA',1],['ArrowRight','KeyD',-1]] as const){
      const legacy=client('barrack',0,40);legacy.keys.add(arrow);advance(legacy,1);
      expect(legacy.yaw).toBeCloseTo(direction*150*Math.PI/180);expect(legacy.camera.position.x).toBe(0);expect(legacy.camera.position.z).toBe(40);
      expect(legacy.camera.rotation.y).toBeCloseTo(legacy.yaw);
      const letters=client('barrack',0,40);letters.keys.add(wasd);advance(letters,1);
      expect(Math.abs(letters.camera.position.x)).toBeGreaterThan(4);expect(letters.yaw).toBe(0);
      const modern=client('barrack',0,40);modern.controlsPreset='modern';modern.keys.add(arrow);advance(modern,1);
      expect(modern.camera.position.distanceTo(letters.camera.position)).toBeLessThan(.000001);expect(modern.yaw).toBe(0);
      const disabled=client('barrack',0,40);disabled.arrowMovement=false;disabled.keys.add(arrow);advance(disabled,1);expect(disabled.yaw).toBe(0);
    }
    const both=client('barrack',0,40);both.keys=new Set(['ArrowLeft','ArrowRight']);advance(both,1);expect(both.yaw).toBeCloseTo(150*Math.PI/180);
  });
  it('keeps explicit saved arrow preferences and enables arrows when the preference is absent',()=>{
    for(const saved of [null,{}, {arrows:false},{arrows:true}]){
      const elements=new Map(['controls-preset','sensitivity','arrow-movement'].map(id=>[id,{value:'',checked:false}]));
      vi.stubGlobal('localStorage',{getItem:()=>saved===null?null:JSON.stringify(saved)});
      vi.stubGlobal('document',{getElementById:(id:string)=>elements.get(id),body:{classList:{toggle:vi.fn()}}});
      const game=client('barrack',0,40);game.loadSettings();
      const enabled=saved===null||!('arrows' in saved)||saved.arrows;
      expect(game.arrowMovement).toBe(enabled);expect(elements.get('arrow-movement')!.checked).toBe(enabled);
      game.keys.add('ArrowUp');advance(game,1);
      if(enabled)expect(40-game.camera.position.z).toBeGreaterThan(4);
      else expect(game.camera.position.z).toBe(40);
    }
  });
  it('ignores held arrow movement while chat is open',()=>{
    const game=client('barrack',0,40);game.chatOpen=true;game.keys=new Set(['ArrowUp','ArrowLeft']);advance(game,1);
    expect(game.camera.position.z).toBe(40);expect(game.yaw).toBe(0);
  });
  it('sprints with Modern Shift plus enabled arrows at the same speed as WASD',()=>{
    const arrows=client('barrack',0,40),letters=client('barrack',0,40);
    arrows.controlsPreset=letters.controlsPreset='modern';
    arrows.keys=new Set(['ArrowUp','ShiftLeft']);letters.keys=new Set(['KeyW','ShiftLeft']);
    advance(arrows,1);advance(letters,1);
    expect(arrows.camera.position.distanceTo(letters.camera.position)).toBeLessThan(.000001);
    expect(40-arrows.camera.position.z).toBeGreaterThan(6);
    const legacy=client('barrack',0,40);legacy.keys=new Set(['ArrowUp','ShiftLeft']);advance(legacy,1);
    expect(40-legacy.camera.position.z).toBeGreaterThan(4);expect(40-legacy.camera.position.z).toBeLessThan(5);
    const disabled=client('barrack',0,40);disabled.controlsPreset='modern';disabled.arrowMovement=false;
    disabled.keys=new Set(['ArrowUp','ShiftLeft']);advance(disabled,1);expect(disabled.camera.position.z).toBe(40);
    const cancelled=client('barrack',0,40);cancelled.controlsPreset='modern';
    cancelled.keys=new Set(['ArrowUp','KeyS','ShiftLeft']);advance(cancelled,1);expect(cancelled.camera.position.z).toBe(40);
  });
  it('walks from the lowered yard into the left stone bay, stops at the rear wall and returns outside',()=>{
    const building=getLegacyMap('woodlands').buildings.find(b=>b.id==='outbuilding')!;
    const game=client('woodlands',building.x+(building.bayOffsetX??0),-15);game.keys.add('KeyW');
    for(let i=0;i<240;i++){
      game.updateMovement(1/60);
      // Small descending steps use the client's existing eight-centimetre grounding tolerance.
      expect(Math.abs(game.camera.position.y-1.72-legacyGroundHeightAt('woodlands',game.camera.position.x,game.camera.position.z))).toBeLessThan(.08);
      if(game.camera.position.z>=building.z-building.depth/2&&game.camera.position.z<=building.z+building.depth/2){
        expect(game.camera.position.y-1.72).toBeCloseTo(building.base,3);
      }
      expect(game.camera.position.y-1.72).toBeLessThan(building.base+.3);
      expect(game.grounded).toBe(true);
    }
    expect(game.camera.position.z).toBeGreaterThan(building.z-building.depth/2);
    expect(game.camera.position.z).toBeLessThan(building.z);
    game.keys=new Set(['KeyS']);advance(game,3);
    expect(game.camera.position.z).toBeGreaterThan(building.z+building.depth/2+1);
  });
  it('climbs the exposed bank and lands on its ground after descending the steep face',()=>{
    const game=client('woodlands',41,-36);game.keys.add('KeyW');
    advance(game,2.1);
    expect(game.camera.position.z).toBeLessThan(-44);
    expect(game.camera.position.y-1.72).toBeGreaterThan(16);
    expect(Math.abs(game.camera.position.y-1.72-legacyGroundHeightAt('woodlands',game.camera.position.x,game.camera.position.z))).toBeLessThan(.08);
    game.keys.clear();advance(game,.4);
    expect(game.camera.position.y-1.72).toBeCloseTo(legacyGroundHeightAt('woodlands',game.camera.position.x,game.camera.position.z),3);
    expect(game.grounded).toBe(true);
    game.keys=new Set(['KeyS']);
    for(let i=0;i<126;i++){
      game.updateMovement(1/60);
      expect(game.camera.position.y-1.72).toBeGreaterThanOrEqual(legacyGroundHeightAt('woodlands',game.camera.position.x,game.camera.position.z)-.001);
    }
    expect(game.camera.position.z).toBeGreaterThan(-37);
    expect(game.grounded).toBe(false);
    game.keys.clear();advance(game,2);
    expect(game.camera.position.y-1.72).toBeCloseTo(legacyGroundHeightAt('woodlands',game.camera.position.x,game.camera.position.z),3);
    expect(game.camera.position.y-1.72).toBeLessThan(3);
    expect(game.grounded).toBe(true);
  });
  it('enters the offset stone bay while its unequal closed doors remain solid',()=>{
    const building=getLegacyMap('woodlands').buildings.find(b=>b.id==='outbuilding')!;
    const open=client('woodlands',building.x+(building.bayOffsetX??0),building.z+building.depth/2+2);open.keys.add('KeyW');advance(open,3);
    expect(open.camera.position.z).toBeLessThan(building.z);expect(open.camera.position.z).toBeGreaterThan(building.z-building.depth/2);
    for(const offset of [1.5,7.5]){
      const closed=client('woodlands',building.x+offset,building.z+building.depth/2+2);closed.keys.add('KeyW');advance(closed,2);
      expect(closed.camera.position.z).toBeGreaterThan(building.z+building.depth/2);
    }
  });
  it('keeps the shed yard gate traversable and timber fence sides collidable',()=>{
    const gate=client('woodlands',-31,36);gate.keys.add('KeyW');advance(gate,4);
    expect(gate.camera.position.z).toBeLessThan(20);
    const side=client('woodlands',-39,26);side.keys.add('KeyD');advance(side,1);
    expect(side.camera.position.x).toBeLessThan(-37.3);
  });
  it('walks from Barrack grass up the full west ramp and onto its roof',()=>{
    const game=client('barrack',-19,24);game.keys.add('KeyW');advance(game,7);
    expect(game.camera.position.z).toBeLessThan(-5);
    expect(game.camera.position.y-1.72).toBeCloseTo(5.24,2);
    expect(game.grounded).toBe(true);
  });
  it('walks back down the ramp without hovering at roof height',()=>{
    const game=client('barrack',-19,-1,5.24);game.keys.add('KeyS');advance(game,6);
    expect(game.camera.position.z).toBeGreaterThan(24);
    expect(game.camera.position.y-1.72).toBeCloseTo(0,2);
  });
  it('reaches the east and south roofs by their authored ramps',()=>{
    const east=client('barrack',16,-44);east.keys.add('KeyS');advance(east,8);
    expect(east.camera.position.z).toBeGreaterThan(-14);expect(east.camera.position.y-1.72).toBeCloseTo(5.24,2);
    const south=client('barrack',46,22);south.keys.add('KeyA');advance(south,6);
    expect(south.camera.position.x).toBeLessThan(23);expect(south.camera.position.y-1.72).toBeCloseTo(5.24,2);
  });
  it('crosses both elevated bridge connections without falling to ground',()=>{
    const cross=client('barrack',-10,-10,5.24);cross.keys.add('KeyD');advance(cross,4);
    expect(cross.camera.position.x).toBeGreaterThan(6);expect(cross.camera.position.y-1.72).toBeCloseTo(5.24,2);
    const south=client('barrack',17,-5,5.24);south.keys.add('KeyS');advance(south,5.5);
    expect(south.camera.position.z).toBeGreaterThan(18);expect(south.camera.position.y-1.72).toBeCloseTo(5.24,2);
  });
  it('blocks ground-level entry through a concrete ramp side',()=>{
    const game=client('barrack',-14,10);game.keys.add('KeyA');advance(game,2);
    expect(game.camera.position.x).toBeGreaterThan(-16.2);
    expect(game.camera.position.y-1.72).toBeCloseTo(0,2);
  });
  it('lets a ground-level player walk under the open roof bridge',()=>{
    const game=client('barrack',-1.5,-16);game.keys.add('KeyS');advance(game,3);
    expect(game.camera.position.z).toBeGreaterThan(-4);
    expect(game.camera.position.y-1.72).toBeCloseTo(0,2);
  });
  it('supports a Barrack interior on its floor rather than teleporting onto the roof',()=>{
    const game=client('barrack',-19,-10);advance(game,2);
    expect(game.camera.position.y).toBeCloseTo(1.72,3);
  });
  it('follows Woodland hills at ground level while walking a clear central route',()=>{
    const game=client('woodlands',0,35);game.keys.add('KeyW');advance(game,12);
    expect(game.camera.position.z).toBeLessThan(-15);
    expect(game.camera.position.y-1.72).toBeCloseTo(legacyGroundHeightAt('woodlands',game.camera.position.x,game.camera.position.z),1);
  });
  it('stops at a cottage wall and keeps the player above its terrain',()=>{
    const game=client('woodlands',-8,-15);game.yaw=-Math.PI/2;game.keys.add('KeyS');advance(game,3);
    expect(game.camera.position.x).toBeGreaterThan(-11.2);
    expect(game.camera.position.y-1.72).toBeGreaterThanOrEqual(legacyGroundHeightAt('woodlands',game.camera.position.x,game.camera.position.z)-.05);
  });
  it('keeps ordinary Legacy walking speed when Shift is held with a rifle',()=>{
    const game=client('barrack',0,40);game.weaponState.select('rifle');game.keys=new Set(['KeyW','ShiftLeft']);advance(game,1);
    expect(game.aiming).toBe(false);expect(40-game.camera.position.z).toBeGreaterThan(4);expect(40-game.camera.position.z).toBeLessThan(5);
  });
  it('legacy Shift aims and cannot sprint along the same ground route',()=>{
    const game=client('barrack',0,40);game.weaponState.select('sniper');game.keys=new Set(['KeyW','ShiftRight']);advance(game,1);
    expect(game.aiming).toBe(true);expect(40-game.camera.position.z).toBeLessThan(3);
    const modern=client('barrack',0,40);modern.controlsPreset='modern';modern.keys=new Set(['KeyW','ShiftRight']);advance(modern,1);
    expect(modern.aiming).toBe(false);expect(40-modern.camera.position.z).toBeGreaterThan(6);
  });
});
