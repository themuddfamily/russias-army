import * as THREE from 'three';
import { SoldierModel } from './soldierModel';
import {OriginalSoldier,type OriginalSoldierResources} from './originalSoldier';
import type { SoldierMaterialLibrary } from './soldierMaterials';
import type { WeaponId } from './weapons';
import {createOriginalRemoteMovement,receiveOriginalRemoteMovement,stepOriginalRemoteMovement,type OriginalRemoteMovement} from '../shared/originalRemoteMovement';
import {advanceOriginalRemoteSoldierPhase} from '../shared/originalRemoteSoldierPhase';
import {createOriginalRemoteShots,receiveOriginalRemoteShots,stepOriginalRemoteShots} from '../shared/originalRemoteShots';

export const ONLINE_HIT_VOLUMES={
  body:{y:.98,radius:.44},
  head:{y:1.64,radius:.22},
} as const;

export interface RemoteState {
  id:string;
  name:string;
  x:number;y:number;z:number;
  yaw:number;
  pitch:number;
  health:number;
  frags:number;
  deaths:number;
  weapon:WeaponId;
  alive:boolean;
  sourceMotionTime?:number;
  sourceShots?:number;
}

/** Consumed at the beginning of one source callback, before actor movement. */
export interface RemoteConsumedShot {
  weapon:WeaponId;position:{x:number;y:number;z:number};callbackOffset:number;
}

/** Viewer-local baddies transition; position remains in the renderer's feet units. */
export interface RemoteTimeout {
  reason:'death'|'timeout';
  id:string;name:string;weapon:WeaponId;
  position:{x:number;y:number;z:number};yaw:number;
  /** One-based offset in this update's ordinary source callbacks. */
  callbackOffset:number;
}

/** Network interpolation with recovered skinned targeting, or authored Winter proxies. */
export class RemotePlayer {
  readonly group=new THREE.Group();
  readonly hitMeshes:THREE.Mesh[]=[];
  readonly id:string;
  name:string;
  health=100;frags=0;deaths=0;weapon:WeaponId='rifle';alive=true;
  private readonly targetPosition=new THREE.Vector3();
  private targetYaw=0;
  private targetPitch=0;
  private sourceMotionTime:number|undefined;
  private readonly lastPosition=new THREE.Vector3();
  private sourceMovement:OriginalRemoteMovement|undefined;
  private sourceCallbackAccumulator=0;
  private sourcePendingDeath=false;
  private readonly sourcePhaseEnabled:boolean;
  private sourceCallbackPhase=0;
  private readonly sourceShots=createOriginalRemoteShots();
  private readonly rig:SoldierModel|OriginalSoldier;
  private readonly hitMaterial=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false});

  constructor(id:string,name:string,materialLibrary?:SoldierMaterialLibrary,originalResources?:OriginalSoldierResources,sourceMovementEnabled=false,sourcePhaseEnabled=false){
    this.id=id;this.name=name;
    let seed=0;for(let index=0;index<id.length;index++)seed=(seed*31+id.charCodeAt(index))|0;
    this.rig=originalResources?new OriginalSoldier(originalResources,{name,weapon:'rifle'}):new SoldierModel({name,weapon:'rifle',team:'red',seed,showName:true,materialLibrary});this.group.add(this.rig.visual);
    this.sourcePhaseEnabled=sourcePhaseEnabled&&sourceMovementEnabled&&this.rig instanceof OriginalSoldier;
    if(this.sourcePhaseEnabled)this.sourceMotionTime=0;
    if(this.rig instanceof OriginalSoldier){
      // Game enables this only with a negotiated per-viewer authority mirror.
      // Standalone clients/previews explicitly choose their clock adapter.
      if(sourceMovementEnabled)this.sourceMovement=createOriginalRemoteMovement(this.group.position,this.group.rotation.y);
      this.rig.mesh.userData.remoteId=this.id;this.rig.mesh.userData.zone='body';this.hitMeshes.push(...this.rig.hitMeshes);
    }else{
      const body=this.hitProxy(ONLINE_HIT_VOLUMES.body.y,ONLINE_HIT_VOLUMES.body.radius,'body');
      const head=this.hitProxy(ONLINE_HIT_VOLUMES.head.y,ONLINE_HIT_VOLUMES.head.radius,'head');this.group.add(body,head);
    }
  }

  /** Native baddie stays registered until its pending death callback runs. */
  get sourceActorActive():boolean {return this.alive||this.sourcePendingDeath;}

  apply(state:RemoteState,instant=false):void {
    if(this.sourceMovement&&this.rig instanceof OriginalSoldier){
      // MUS dead changes lives, not newstuff's target, gun or skeletal phase.
      // Once removed, this object belongs to fadeaway; later packets need a
      // fresh baddie in Game's active map rather than reviving this corpse.
      if(!this.alive&&!this.sourcePendingDeath)return;
      if(!state.alive){if(this.sourcePendingDeath)return;this.health=state.health;this.frags=state.frags;this.deaths=state.deaths;this.alive=false;this.sourcePendingDeath=true;this.sourceMotionTime=undefined;return;}
    }
    if(this.sourcePhaseEnabled)receiveOriginalRemoteShots(this.sourceShots,state.sourceShots);
    if(state.name!==this.name){this.name=state.name;this.rig.setName(state.name);}
    if(state.weapon!==this.weapon){this.weapon=state.weapon;if(!this.sourcePhaseEnabled||instant)this.rig.setWeapon(state.weapon);}
    const wasAlive=this.alive;if(!this.sourcePendingDeath)this.health=state.health;this.frags=state.frags;this.deaths=state.deaths;this.alive=this.sourcePendingDeath?false:state.alive;
    this.targetPosition.set(state.x,state.y,state.z);this.targetYaw=state.yaw+Math.PI;this.targetPitch=state.pitch;
    if(wasAlive&&!state.alive)this.rig.die();else if(!wasAlive&&this.alive){this.rig.reset();this.rig.setWeapon(state.weapon);}
    if(instant){this.group.position.copy(this.targetPosition);this.group.rotation.y=this.targetYaw;this.lastPosition.copy(this.targetPosition);}
    if(this.sourceMovement){
      if(instant||(!wasAlive&&this.alive)){this.sourceMovement=createOriginalRemoteMovement(this.targetPosition,this.targetYaw);this.sourceCallbackAccumulator=0;this.group.position.copy(this.targetPosition);this.group.rotation.y=this.targetYaw;}
      else receiveOriginalRemoteMovement(this.sourceMovement,this.targetPosition,this.targetYaw);
    }
    // Source newstuff updates movement and gun, while skeletal phase belongs
    // to this actor's callbacks. Packet phase remains a standalone adapter.
    if(this.sourcePhaseEnabled)this.sourceMotionTime=this.alive?this.sourceCallbackPhase:undefined;
    else this.sourceMotionTime=typeof state.sourceMotionTime==='number'&&Number.isFinite(state.sourceMotionTime)&&state.sourceMotionTime>=0?state.sourceMotionTime:undefined;
    if(this.rig instanceof OriginalSoldier&&this.sourceMotionTime!==undefined){
      this.group.updateWorldMatrix(true,true);
      // Death keeps progressing when a finished room stops sending phases.
      // A stale packet must not rewind the local fade or resurrect its mesh.
      this.rig.setSourceMotionTime(this.sourceActorActive?this.sourceMotionTime:Math.max(this.rig.debugState().timeMs,this.sourceMotionTime));
    }
  }

  /** Advances network interpolation and selects presentation detail from the viewer distance. */
  update(delta:number,viewerPosition?:THREE.Vector3Like,sourceCallbacks?:number,onSourceShot?:(shot:RemoteConsumedShot)=>void):RemoteTimeout|undefined {
    if(sourceCallbacks!==undefined&&(!Number.isSafeInteger(sourceCallbacks)||sourceCallbacks<0))throw new Error('Invalid source remote callback count');
    this.lastPosition.copy(this.group.position);
    let speed=0;let timeout:RemoteTimeout|undefined;
    if(this.sourceMovement&&this.rig instanceof OriginalSoldier){
      // Negotiated Game passes whole steps from ONE acknowledged viewer clock.
      // The local accumulator remains for standalone source actor previews/tests.
      if(this.alive||this.sourcePendingDeath){
        if(sourceCallbacks===undefined)this.sourceCallbackAccumulator+=Math.max(0,delta);
        const callbacks=sourceCallbacks??Math.floor((this.sourceCallbackAccumulator+1e-9)*30);
        if(sourceCallbacks===undefined)this.sourceCallbackAccumulator-=callbacks/30;
        for(let callback=0;callback<callbacks;callback++){
          if(!this.alive&&!this.sourcePendingDeath){this.rig.animate(1/30,{moveSpeed:0,aimPitch:this.targetPitch,alive:false});continue;}
          if(this.sourcePhaseEnabled){
            // Native shoot precedes gun refresh, orientgun, movement and death.
            // The logical packet weapon chooses the flash, while the displayed
            // gun still supplies its preceding world transform.
            if(stepOriginalRemoteShots(this.sourceShots,this.weapon)){
              this.sourceCallbackPhase=2000;this.rig.fireForSourceWeapon(this.weapon);
              onSourceShot?.({weapon:this.weapon,position:{x:this.group.position.x,y:this.group.position.y,z:this.group.position.z},callbackOffset:callback+1});
            }
            if(this.rig.weapon!==this.weapon)this.rig.setWeapon(this.weapon);
          }
          const disconnected=stepOriginalRemoteMovement(this.sourceMovement);
          // Source advances bon before checking lives/disconnection. Pending
          // death hides the transported phase without discarding this prefix.
          if(this.sourcePhaseEnabled)this.sourceCallbackPhase=advanceOriginalRemoteSoldierPhase(this.sourceCallbackPhase,this.sourceMovement.speed);
          this.group.position.copy(this.sourceMovement.position);this.group.rotation.y=this.sourceMovement.yaw;
          speed=Math.hypot(this.sourceMovement.speed.x,this.sourceMovement.speed.y,this.sourceMovement.speed.z)*30;
          this.group.updateWorldMatrix(true,true);
          if(disconnected||this.sourcePendingDeath){
            this.alive=false;if(disconnected)this.health=-1;this.sourceMotionTime=undefined;this.sourcePendingDeath=false;
            // Source death selects3000 while fadeaway starts bon0. Game
            // removes the baddie from its active ID map and retains its corpse.
            this.rig.beginSourceFadeaway();
            timeout={reason:disconnected?'timeout':'death',id:this.id,name:this.name,weapon:this.weapon,position:{x:this.group.position.x,y:this.group.position.y,z:this.group.position.z},yaw:this.group.rotation.y,callbackOffset:callback+1};
          }else{
            if(this.sourcePhaseEnabled)this.sourceMotionTime=this.sourceCallbackPhase;
            this.rig.animate(1/30,{moveSpeed:speed,aimPitch:this.targetPitch,alive:true});
            if(this.sourceMotionTime!==undefined)this.rig.setSourceMotionTime(this.sourceMotionTime);
          }
        }
      }else if(sourceCallbacks===undefined)this.rig.animate(delta,{moveSpeed:0,aimPitch:this.targetPitch,alive:false});
      else for(let callback=0;callback<sourceCallbacks;callback++)this.rig.animate(1/30,{moveSpeed:0,aimPitch:this.targetPitch,alive:false});
    }else{
      if(this.alive)this.group.position.lerp(this.targetPosition,1-Math.exp(-delta*12));
      let difference=this.targetYaw-this.group.rotation.y;difference=Math.atan2(Math.sin(difference),Math.cos(difference));this.group.rotation.y+=difference*Math.min(1,delta*12);
      speed=this.alive?this.group.position.distanceTo(this.lastPosition)/Math.max(delta,.001):0;
    }
    if(viewerPosition){
      const dx=this.group.position.x-viewerPosition.x;
      const dy=this.group.position.y-viewerPosition.y;
      const dz=this.group.position.z-viewerPosition.z;
      this.rig.setDistanceToCamera(Math.hypot(dx,dy,dz));
    }
    this.group.updateWorldMatrix(true,true);
    if(!this.sourceMovement)this.rig.animate(delta,{moveSpeed:this.rig instanceof OriginalSoldier?speed:Math.min(6.5,speed),aimPitch:this.targetPitch,alive:this.alive});
    if(this.alive&&this.rig instanceof OriginalSoldier&&this.sourceMotionTime!==undefined)this.rig.setSourceMotionTime(this.sourceMotionTime);
    return timeout;
  }

  fire():void {if(this.sourcePhaseEnabled||!this.alive)return;this.rig.fire();if(this.sourceMovement)this.sourceMotionTime=2000;}
  flinch(strength=1,side=1):void {this.rig.flinch(strength,side);}

  debugState():{authoritative:{x:number;y:number;z:number;yaw:number};rendered:{x:number;y:number;z:number;yaw:number};visible:boolean;hitGeometry:{meshes:number;triangles:number;skinned:boolean};sourceMotionTime?:number;sourceShots?:{misses:number;aiming:number};sourceMovement?:{steps:number;speed:OriginalRemoteMovement['speed'];callbackRemainder:number};original?:ReturnType<OriginalSoldier['debugState']>} {
    return {authoritative:{x:this.targetPosition.x,y:this.targetPosition.y,z:this.targetPosition.z,yaw:this.targetYaw},rendered:{x:this.group.position.x,y:this.group.position.y,z:this.group.position.z,yaw:this.group.rotation.y},visible:this.group.visible,hitGeometry:{meshes:this.hitMeshes.length,triangles:this.hitMeshes.reduce((sum,mesh)=>sum+(mesh.geometry.index?.count??mesh.geometry.getAttribute('position').count)/3,0),skinned:this.hitMeshes.length>0&&this.hitMeshes.every(mesh=>mesh instanceof THREE.SkinnedMesh)},...(this.sourceMotionTime!==undefined?{sourceMotionTime:this.sourceMotionTime}:{}),...(this.sourcePhaseEnabled?{sourceShots:{...this.sourceShots}}:{}),...(this.sourceMovement?{sourceMovement:{steps:this.sourceMovement.steps,speed:{...this.sourceMovement.speed},callbackRemainder:this.sourceCallbackAccumulator}}:{}),...(this.rig instanceof OriginalSoldier?{original:this.rig.debugState()}:{})};
  }

  dispose():void {
    this.rig.dispose();if(!(this.rig instanceof OriginalSoldier))for(const mesh of this.hitMeshes){mesh.removeFromParent();mesh.geometry.dispose();}this.hitMaterial.dispose();this.hitMeshes.length=0;this.group.removeFromParent();
  }

  private hitProxy(y:number,radius:number,zone:'body'|'head'):THREE.Mesh {
    // Raycaster intersects invisible meshes, so hiding the proxies keeps
    // hitscan behavior while removing their transparent draw submissions.
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(radius,10,7),this.hitMaterial);mesh.position.y=y;mesh.castShadow=false;mesh.receiveShadow=false;mesh.visible=false;mesh.userData.remoteId=this.id;mesh.userData.zone=zone;this.hitMeshes.push(mesh);return mesh;
  }
}
