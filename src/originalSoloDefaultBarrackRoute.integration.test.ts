// Retained legacy inline CPU characterization; excludes normal paged default startup.
import * as THREE from 'three';
import {expect,it,vi} from 'vitest';
import {startup} from './originalSoloDefaultStartup.fixture';
import {SoldierMaterialLibrary} from './soldierMaterials';
import {originalSpawnIndex} from '../shared/originalSpawnRules';
import * as physics from '../shared/originalPlayerPhysics';

// Unchanged spawn5 route and waypoint tolerance from original-barrack-routes.
const waypoints=[[-4.037931181066177,63.44768566176471],[-17.217797794117647,63.44768566176471],[-19,63.5],[-19,66],[-8,66],[-8,75.5],[-1.316875,75.5],[-1.316875631010273,74.26773140722996],[-1.3168759265061984,72.57769172419226]] as const;
const frameDelta=1/30,delta=Math.min(.033,frameDelta);

/** Actual CPU legacy inline frame/Enemy pipeline and loaded scene; borrowed resource
 * constructors and DOM/audio sinks come from startup. No full Game constructor,
 * renderer, browser/native timing or historical route registration claim. */
it('walks the unchanged Barrack spawn5 ramp and door5 route through the legacy inline CPU Game dispatcher',()=>{
 // Same deterministic random fixture as the retained browser route. It also
 // affects authored AI/chance decisions; this is not a stochastic route proof.
 const random=vi.spyOn(Math,'random').mockReturnValue(.99),f=startup('barrack'),game=f.game;
 const materials=new SoldierMaterialLibrary({tier:'low'}),runtime=game.arena.runtime;
 const dom=new Map<string,{style:{setProperty:ReturnType<typeof vi.fn>};classList:{toggle:ReturnType<typeof vi.fn>}}>();
 const trace:{callback:number;waypoint:number;x:number;y:number;z:number;colliding:boolean;incomplete:number;remaining:number;iterations:number}[]=[];
 let currentCallback=-1,queries=0,incomplete=0,remaining=0,iterations=0,totalSolverCalls=0,totalIncomplete=0;
 let firstIncomplete:{callback:number;observer:string;kind:string;requested:number;advanced:number;remaining:number;substeps:{index:number;kind:string;remaining:number;iterations:number}[]}|undefined;
 const firstIncompleteByObserver=new Map<string,NonNullable<typeof firstIncomplete>>();
 const originalStep=physics.stepOriginalPhysicsWorld;
 // Observe the production solver's actual return rather than substituting a
 // solve or inferring time consumption from the resulting player position.
 const solver=vi.spyOn(physics,'stepOriginalPhysicsWorld').mockImplementation((...args)=>{
  const result=originalStep(...args);queries++;totalSolverCalls++;
  iterations=Math.max(iterations,...result.substeps.map(s=>s.iterations));remaining+=result.remainingTime;
  if(result.kind!=='complete'){
   incomplete++;totalIncomplete++;
   const observer=args[0][0]?.id??'empty',observation={callback:currentCallback,observer,kind:result.kind,
    requested:result.requestedTime,advanced:result.advancedTime,remaining:result.remainingTime,
    substeps:result.substeps.map(s=>({index:s.index,kind:s.kind,remaining:s.remainingTime,iterations:s.iterations}))};
   firstIncomplete??=observation;
   if(!firstIncompleteByObserver.has(observer)&&firstIncompleteByObserver.size<8)firstIncompleteByObserver.set(observer,observation);
  }
  return result;
 });
 let waypoint=0,failure:string|undefined;
 try{
  // Restore the complete recovered spawn list; keep all authored enemies and
  // dynamic barrel bodies. This is initial spawn selection, before registration.
  game.arena.spawnPoints=runtime.spawnPoints.map((p:{x:number;y:number;z:number})=>new THREE.Vector3(p.x,p.y,p.z));
  game.arena.colliders=[];game.arena.pickups=[];
  const spawnIndex=originalSpawnIndex(game.arena.spawnPoints.length,Math.random()),spawn=game.arena.spawnPoints[spawnIndex];
  expect(spawnIndex).toBe(5);expect(game.soloWorlds).toBeUndefined();
  game.camera.position.set(spawn.x,spawn.y+runtime.profile.eyeHeight,spawn.z);game.applyOriginalSpawnOrientation(spawnIndex);
  expect(game.camera.position.x).toBeCloseTo(-3.9054117647058826,1);expect(game.camera.position.z).toBeCloseTo(55.60658823529412,1);
  Object.assign(game,{soldierMaterialLibrary:materials,viewProjection:new THREE.Group(),recoil:0,weaponSwayX:0,weaponSwayY:0,
   grounded:false,arrowMovement:false,rightMouseAiming:false,sensitivity:1,originalMouseDelta:{x:0,y:0},
   originalPlayerContacts:[],originalProjectileAccumulator:0,nextSourceReloadPoll:-Infinity,
   originalScopeActive:false,originalScopeFov:50,kills:0,deaths:0,shots:0,hits:0,
   snowTracks:{resetActor:vi.fn()},
   el:(name:string)=>{let node=dom.get(name);if(!node){node={style:{setProperty:vi.fn()},classList:{toggle:vi.fn()}};dom.set(name,node);}return node;}});
  game.spawnEnemies();expect(game.enemies).toHaveLength(game.arena.spawnPoints.length-1);
  game.keys.add('KeyW');
  for(currentCallback=0;currentCallback<600&&waypoint<waypoints.length&&game.playerAlive;currentCallback++){
   // Steering changes only look/input. No subsequent placement, manual door
   // opening, skipped observer, geometry substitution or solver cap change.
   while(waypoint<waypoints.length&&Math.hypot(game.camera.position.x-waypoints[waypoint][0],game.camera.position.z-waypoints[waypoint][1])<.28)waypoint++;
   if(waypoint===waypoints.length)break;
   const target=waypoints[waypoint];game.yaw=Math.atan2(game.camera.position.x-target[0],game.camera.position.z-target[1]);game.pitch=0;
   game.camera.rotation.set(0,game.yaw,0,'YXZ');game.camera.updateMatrixWorld(true);
   game.elapsed=(currentCallback+1)/30;queries=0;incomplete=0;remaining=0;iterations=0;
   game.advanceGameplayFrame(frameDelta);
   // Preserve animate's post-dispatch pickup/Enemy phase and actual decisions,
   // shots and respawn registrations, rather than driving observer controls.
   if(game.playerAlive)game.collectPickups();
   for(const enemy of game.enemies){
    if(game.phase!=='playing')break;
    const context=game.soloEnemyDecisionContext(enemy);
    if(enemy.alive){
     const combat=game.chooseCombatTarget(enemy);
     enemy.update(delta,game.elapsed,combat.enemy?combat.position.clone().add(new THREE.Vector3(0,1.25,0)):combat.position,
      game.arena,(origin:THREE.Vector3,damage:number)=>game.combatantShoot(enemy,combat.enemy,origin,damage),game.camera.position,context);
    }else{
     enemy.update(delta,game.elapsed,game.camera.position,game.arena,()=>undefined,game.camera.position,context);
     if(game.elapsed-enemy.deathTime>=1.3){enemy.respawn(game.safestEnemySpawn(),game.elapsed,true);game.registerSoloEnemy(enemy);game.snowTracks.resetActor(`bot:${enemy.id}`);}
    }
   }
   const worlds=game.soloWorlds,player=worlds?.worlds.get('player');
   expect(queries).toBeGreaterThan(0);expect(worlds.callbackPhase).toBe('idle');
   const feet={x:game.camera.position.x,y:game.camera.position.y-runtime.profile.eyeHeight,z:game.camera.position.z};
   const colliding=worlds.playerIntersects('player',feet);
   trace.push({callback:currentCallback,waypoint,x:feet.x,y:feet.y,z:feet.z,colliding,incomplete,remaining,iterations});
   expect(player.callback).toBe(currentCallback+1);
   // Drop spy argument/result references every callback; retain only the compact
   // trace and first incomplete clock, never observer/model checkpoints.
   solver.mockClear();
  }
  while(waypoint<waypoints.length&&Math.hypot(game.camera.position.x-waypoints[waypoint][0],game.camera.position.z-waypoints[waypoint][1])<.28)waypoint++;
  const summary={scope:'CPU legacy inline Game frame and authored Enemy phase; selected recovered spawn5; deterministic .99 random; no renderer/native claim',
   callbacks:trace.length,reachedWaypoints:waypoint,totalSolverCalls,totalIncomplete,firstIncomplete,
   final:trace.at(-1),door5:game.soloWorlds?.worlds.get('player')?.doors.getStates().find((d:{name:string})=>d.name==='door open 5')};
  expect(waypoint,JSON.stringify(summary)).toBe(waypoints.length);expect(trace.length).toBeLessThanOrEqual(600);
  expect(game.playerAlive).toBe(true);expect(trace.every(row=>!row.colliding)).toBe(true);
  expect(summary.door5?.openedAt).not.toBeNull();expect(summary.door5).toBeDefined();
  expect(totalIncomplete,JSON.stringify(summary)).toBe(0);
 }catch(error){
  failure=error instanceof Error?error.message:String(error);throw error;
 }finally{
  console.info('legacy inline Barrack route observation',JSON.stringify({scope:'CPU loaded legacy inline factory/frame/Enemy pipeline; deterministic .99 source spawn5; no renderer/native claim',
   callback:currentCallback,callbacks:trace.length,reachedWaypoints:waypoint,totalSolverCalls,totalIncomplete,firstIncomplete,
   firstIncompleteByObserver:[...firstIncompleteByObserver.values()],firstHumanIncomplete:firstIncompleteByObserver.get('player'),
   final:trace.at(-1),trace,failure,door5:game.soloWorlds?.worlds.get('player')?.doors.getStates().find((d:{name:string})=>d.name==='door open 5')}));
  game.keys.clear();solver.mockRestore();random.mockRestore();
  try{game.clearEnemies();}finally{materials.dispose();f.dispose();}
 }
},120_000);
