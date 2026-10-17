/** Test-only complete runtime for the existing planar-floor gameplay cases.
 * The two real triangles supply all geometry/query interfaces. The historical
 * analytic sweep seam is intentional: these cases audit callback/control
 * behavior, not imported map triangle contact registration. No solver is mocked.
 * There are explicitly no imported barrels, doors, or soldier rigs in this fixture.
 */
import {createOriginalSceneGeometry,type OriginalSceneData} from '../shared/originalSceneGeometry';
import type {OriginalMapRuntime} from '../shared/originalMapRuntime';
import {ORIGINAL_MAP_SCALE,ORIGINAL_PLAYER_RADIUS,ORIGINAL_PLAYER_BODY_HEIGHT,ORIGINAL_PLAYER_EYE_HEIGHT} from '../shared/originalMapProfile';
import {createOriginalPlayerBody,ORIGINAL_PLAYER_DERIVATIVE_FACTOR} from '../shared/originalPlayerPhysics';
import type {Vec3} from '../shared/protocol';

export function soloFloorRuntime(map:string):OriginalMapRuntime {
 const data:OriginalSceneData={meshes:[{resource:'test-floor',part:0,
  positions:[[-10000,-10000,0],[10000,-10000,0],[10000,10000,0],[-10000,10000,0]],
  faces:[[0,1,2],[0,2,3]],normals:[],tex_coords:[]}],nodes:[{name:'floor',parent:'',resource:'test-floor',
  matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],visibility:1,shader:''}]};
 const triangles=createOriginalSceneGeometry(data,{scale:ORIGINAL_MAP_SCALE});
 const floor=(from:Vec3,to:Vec3,radius:number)=>to.y<radius?{position:{x:to.x,y:radius,z:to.z},normal:{x:0,y:1,z:0},fraction:Math.max(0,(from.y-radius)/(from.y-to.y))}:null;
 const geometry=new Proxy(triangles,{get(target,key){
  if(key==='sweepSphere')return floor;
  if(key==='sweepConvex')return (from:Vec3,to:Vec3,shape:{vertices:readonly Vec3[]})=>floor(from,to,-Math.min(...shape.vertices.map(p=>p.y)));
  // Existing analytic floor fixtures expose swept contacts, not stationary
  // triangle patches. Preserve that declared query boundary explicitly.
  if(key==='contactsSphere'||key==='contactsConvex')return ()=>[];
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
 return {map:map==='b'||map==='barrack'?'barrack':'woodlands',data,geometry,spawnPoints:[{x:0,y:ORIGINAL_PLAYER_EYE_HEIGHT,z:0}],scale:ORIGINAL_MAP_SCALE,
  profile:{radius:ORIGINAL_PLAYER_RADIUS,bodyHeight:ORIGINAL_PLAYER_BODY_HEIGHT,eyeHeight:ORIGINAL_PLAYER_EYE_HEIGHT,scale:ORIGINAL_MAP_SCALE,bounds:triangles.groundBounds!}};
}

/** Called only beside an intentional test checkpoint edit. Ordinary frames
 * never reconcile the physical body against presentation camera or velocity. */
export function checkpointSoloBody(game:any):void {
 if(game.mode!=='solo'||game.archivalWinter||!game.playerAlive)return;
 game.ensureSoloWorlds();const world=game.soloWorlds.worlds.get('player');
 const factor=ORIGINAL_PLAYER_DERIVATIVE_FACTOR;
 const checkpoint=createOriginalPlayerBody('player',game.camera.position,{x:game.velocity.x/factor,y:game.velocity.y/factor,z:game.velocity.z/factor});
 Object.assign(world.body,checkpoint);
}

export function soloBodyActorCallback(game:any,time:number):void {
 game.elapsed=time;
 if(game.mode==='solo'&&!game.archivalWinter)game.beginSoloCallback();
 game.updateOriginalPlayerCallback();
 if(game.mode==='solo'&&!game.archivalWinter)game.completeSoloGoody();
 game.updateOriginalExplosives(true);
}
