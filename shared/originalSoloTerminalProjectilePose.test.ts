import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';
import {OriginalSoloObserverWorlds,type OriginalSoloObserver,type OriginalSoloBlast,type OriginalSoloDetonationAdmission} from './originalSoloObserverWorld';

const runtimes=new Map<'barrack'|'woodlands',OriginalMapRuntime>();
function runtime(map:'barrack'|'woodlands'):OriginalMapRuntime {
 let value=runtimes.get(map);
 if(!value){value=registerOriginalMapRuntime(map,JSON.parse(readFileSync(new URL(`../public/assets/original-scenes/${map==='barrack'?'barrack':'woodland'}/scene.json`,import.meta.url),'utf8')));runtimes.set(map,value);}
 return value;
}
// The public CURRENT context delegates detonationFor to this exact coordinator
// boundary. Access it here without substituting a private scene or fake issuer.
function admission(worlds:OriginalSoloObserverWorlds,owner:OriginalSoloObserver,blast:OriginalSoloBlast):OriginalSoloDetonationAdmission|undefined {
 return (worlds as unknown as {detonationFor:(owner:OriginalSoloObserver,blast:OriginalSoloBlast)=>OriginalSoloDetonationAdmission|undefined}).detonationFor(owner,blast);
}
describe('actual coordinator terminal projectile pose admission',()=>{
 for(const map of ['barrack','woodlands'] as const)for(const weapon of ['launcher','rpg'] as const){
  it(`${map} ${weapon} captures final angular pose before removing the physical actor`,()=>{
   const worlds=new OriginalSoloObserverWorlds(runtime(map));
   try{
    const owner=worlds.register({id:'owner',name:'Owner',eye:{x:1000,y:1000,z:1000}});
    const rotation={x:0,y:0,z:0},direction={x:0,y:0,z:-1};
    const launched=worlds.launch({ownerId:owner.id,weapon,eye:{x:100,y:100,z:100},direction,...(weapon==='rpg'?{sourceRotation:rotation}:{})},0);
    if(!launched.ok)throw Error(launched.reason);
    const projectile=owner.projectiles.get(launched.launch.id)!;
    worlds.physics(1/30,{skipIds:new Set([owner.id])});worlds.goody(owner.id);worlds.completeGoody(1/30);
    // A forced terminal fuse and skipped external solver isolate capture from
    // native Havok/contact/fuse timing, which this test does not establish.
    projectile.state.position={x:111,y:222,z:333};
    projectile.state.remainingCallbacks=1;
    projectile.state.angular!.orientation={x:.2,y:-.4,z:.1,w:Math.sqrt(.79)};
    const expectedPosition={...projectile.state.position},expectedOrientation={...projectile.state.angular!.orientation};
    worlds.actors(1/30);
    expect(owner.projectiles.has(launched.launch.id)).toBe(false);
    const blast=owner.blasts.get(launched.launch.id)!;
    const captured=admission(worlds,owner,blast)!;
    const pose=captured.terminalProjectilePose!;
    expect(captured.physicalCallback).toBe(1);
    expect(pose).toEqual({id:launched.launch.id,weapon,position:expectedPosition,direction,...(weapon==='rpg'?{sourceRotation:rotation}:{}),orientation:expectedOrientation});
    expect(pose.position).not.toBe(projectile.state.position);
    expect(pose.direction).not.toBe(projectile.state.direction);
    expect(pose.orientation).not.toBe(projectile.state.angular!.orientation);
    for(const value of [captured,pose,pose.position,pose.direction,pose.orientation,...(pose.sourceRotation?[pose.sourceRotation]:[])])expect(Object.isFrozen(value)).toBe(true);
    projectile.state.position.x=999;projectile.state.direction.x=1;projectile.state.angular!.orientation.x=9;
    projectile.state.sourceRotation={x:45,y:0,z:90};blast.state.position.y=999;
    expect(pose.position).toEqual(expectedPosition);expect(pose.direction).toEqual(direction);expect(pose.orientation).toEqual(expectedOrientation);
    expect(pose.sourceRotation).toEqual(weapon==='rpg'?rotation:undefined);
    expect(admission(worlds,owner,blast)!.terminalProjectilePose).toBe(pose);
    const replacement={launch:blast.launch,state:{...blast.state,position:{...blast.state.position}}};
    expect(admission(worlds,owner,replacement)).toBeUndefined();
    owner.blasts.delete(blast.launch.id);expect(admission(worlds,owner,blast)).toBeUndefined();
   }finally{worlds.clear();}
  });
 }
});
