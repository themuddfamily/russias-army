import type {ReceiverLoadoutCheckpoint} from '../shared/originalReceiverLoadoutWorld';
import {sameReceiverScenePrefix,validateReceiverScenePrefix,type ReceiverScenePrefix} from '../shared/originalReceiverPrefix';
import {copyReceiverGunPhaseCheckpoint,type ReceiverGunPhaseCheckpoint} from '../shared/originalReceiverGunPhase';
import {OriginalWeaponCounter,originalRpgShot,type OriginalWeaponCounterState,type OriginalWeaponCounterStep} from '../shared/originalWeaponCounter';
import { weaponReloadTarget } from '../shared/weaponReloadTarget';
import { getLegacySpawnLoadout } from '../shared/legacyLoadout';
import { usesImmediateReload,weaponReloadDuration } from '../shared/legacyReload';
import {originalReloadTransfer,originalWeaponAvailable,originalFirstUsableWeapon} from '../shared/originalPickupRules';

export type WeaponId = 'pistol' | 'shotgun' | 'rifle' | 'launcher' | 'rpg' | 'sniper';

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  magazine: number;
  reserve: number;
  damage: number;
  headMultiplier: number;
  fireRate: number;
  reloadTime: number;
  spread: number;
  recoil: number;
  automatic: boolean;
  range: number;
  color: number;
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  pistol: {
    id: 'pistol', name: 'TT-33 TOKAREV', magazine: 8, reserve: 64, damage: 38,
    headMultiplier: 2.3, fireRate: 0.22, reloadTime: 1.35, spread: 0.012,
    recoil: 0.022, automatic: false, range: 85, color: 0x222625,
  },
  shotgun: {
    id: 'shotgun', name: 'SPAS-12', magazine: 8, reserve: 40, damage: 16,
    headMultiplier: 1.45, fireRate: 0.82, reloadTime: 2.1, spread: 0.055,
    recoil: 0.065, automatic: false, range: 42, color: 0x2c302e,
  },
  rifle: {
    id: 'rifle', name: 'AK-47', magazine: 30, reserve: 150, damage: 34,
    headMultiplier: 2.2, fireRate: 0.095, reloadTime: 1.75, spread: 0.009,
    recoil: 0.018, automatic: true, range: 150, color: 0x242827,
  },
  sniper: {
    id: 'sniper', name: 'SVD DRAGUNOV', magazine: 10, reserve: 40, damage: 92,
    headMultiplier: 1.7, fireRate: 0.72, reloadTime: 2.25, spread: 0.001,
    recoil: 0.052, automatic: false, range: 300, color: 0x3b3024,
  },
  launcher: {
    id: 'launcher', name: 'RG-6', magazine: 6, reserve: 18, damage: 105,
    headMultiplier: 1, fireRate: 0.55, reloadTime: 2.7, spread: 0.008,
    recoil: 0.045, automatic: false, range: 80, color: 0x354039,
  },
  rpg: {
    id: 'rpg', name: 'RPG-7', magazine: 1, reserve: 5, damage: 150,
    headMultiplier: 1, fireRate: 1.1, reloadTime: 2.8, spread: 0.004,
    recoil: 0.07, automatic: false, range: 100, color: 0x40513a,
  },
};

export class WeaponState {
  map: string | undefined;
  readonly ammo: Record<WeaponId, number> = { pistol: 8, shotgun: 8, rifle: 30, launcher: 6, rpg: 1, sniper: 10 };
  readonly reserve: Record<WeaponId, number> = { pistol: 64, shotgun: 40, rifle: 150, launcher: 18, rpg: 5, sniper: 40 };
  current: WeaponId = 'rifle';
  lastShot = -10;
  reloadEnd = 0;
  reloading = false;
  /** Source VOID selection; current retains only a transport/presentation cache. */
  unarmed = false;
  private reloadTransfersAtCompletion = false;
  private sourceCounter?:OriginalWeaponCounter;
  private sourceCounterTime?:number;
  private sourceReady=false;
  private sourceInputEnabled=true;
  private committedOriginalLoadout?:ReceiverLoadoutCheckpoint;
  private committedOriginalGunPhase?:ReceiverGunPhaseCheckpoint;
  /** A checkpoint has no saved Barrack gate result. Do not create one by
   * elapsed-time catchup before the next explicitly admitted callback. */
  private sourceAwaitingExplicitCallback=false;

  get originalLoadoutCheckpoint():ReceiverLoadoutCheckpoint|undefined {return this.committedOriginalLoadout;}
  /** Saved pre-selection/pre-pickup gate is observation, never fire permission. */
  get originalGunPhaseCheckpoint():ReceiverGunPhaseCheckpoint|undefined {return this.committedOriginalGunPhase;}
  adoptOriginalGunPhase(checkpoint:ReceiverGunPhaseCheckpoint):void {
    const copied=copyReceiverGunPhaseCheckpoint(checkpoint),loadout=this.committedOriginalLoadout;
    if(!loadout||loadout.prefix.kind!=='callback'||!sameReceiverScenePrefix(copied.prefix,loadout.prefix))throw Error('Foreign or stale committed original gun phase');
    this.committedOriginalGunPhase=copied;
  }
  /** Adopt an actual committed owner capture, not a pickup/reload simulation.
   * Ownership/refill/score metadata remains the last committed checkpoint;
   * existing presentation flags and lastShot are not reconstructed from it. */
  adoptOriginalLoadout(checkpoint:ReceiverLoadoutCheckpoint,now:number):void {
    if(!checkpoint||!Number.isFinite(now))throw Error('Invalid committed original loadout');
    const rawPrefix=checkpoint.prefix,map=checkpoint.map,selected=checkpoint.selected,refillTarget=checkpoint.refillTarget,score=checkpoint.score,goldScore=checkpoint.goldScore,rawCounter=checkpoint.counter,rawOwned=checkpoint.owned,rawAmmo=checkpoint.ammo,rawReserve=checkpoint.reserve;
    if(!rawPrefix||!rawCounter||!rawOwned||!rawAmmo||!rawReserve)throw Error('Invalid committed original loadout');
    const kind=rawPrefix.kind,sceneGeneration=rawPrefix.sceneGeneration,callback=rawPrefix.callback;
    if(kind!=='callback'&&kind!=='receipt')throw Error('Invalid committed original loadout prefix');
    const prefix:ReceiverScenePrefix=kind==='receipt'?{kind,sceneGeneration,callback,tick:rawPrefix.tick}:{kind,sceneGeneration,callback};
    validateReceiverScenePrefix(prefix);
    const waitgun=rawCounter.waitgun,poldwaitgun=rawCounter.poldwaitgun,slots=['pistol','shotgun','rifle','launcher','rpg','sniper'] as const;
    if(!['barrack','woodlands'].includes(map)||map!==this.map||selected!==null&&!slots.includes(selected)||!Number.isSafeInteger(refillTarget)||refillTarget<1||!Number.isSafeInteger(score)||!Number.isFinite(goldScore)||![waitgun,poldwaitgun].every(Number.isSafeInteger))throw Error('Invalid committed original loadout');
    const owned={} as Record<WeaponId,boolean>,ammo={} as Record<WeaponId,number>,reserve={} as Record<WeaponId,number>;
    for(const weapon of slots){
      const has=rawOwned[weapon],chamber=rawAmmo[weapon],stock=rawReserve[weapon];
      if(typeof has!=='boolean'||![chamber,stock].every(value=>Number.isSafeInteger(value)&&value>=0)||!has&&stock!==0)throw Error('Invalid committed original loadout counts');
      owned[weapon]=has;ammo[weapon]=chamber;reserve[weapon]=stock;
    }
    const counter=Object.freeze({waitgun,poldwaitgun});
    const sourceCounter=new OriginalWeaponCounter(map);sourceCounter.restore(counter);
    const next:ReceiverLoadoutCheckpoint=Object.freeze({prefix:Object.freeze(prefix),map,selected,refillTarget,counter,score,goldScore,owned:Object.freeze(owned),ammo:Object.freeze(ammo),reserve:Object.freeze(reserve)});
    // All validation/allocation precedes writes to this presentation consumer.
    for(const weapon of slots){this.ammo[weapon]=ammo[weapon];this.reserve[weapon]=reserve[weapon];}
    if(selected!==null)this.current=selected;
    this.unarmed=selected===null;this.sourceCounter=sourceCounter;this.sourceCounterTime=now;
    this.sourceReady=false;this.sourceAwaitingExplicitCallback=true;this.committedOriginalLoadout=next;this.committedOriginalGunPhase=undefined;
  }

  private originalCounter():OriginalWeaponCounter|undefined {
    if(!usesImmediateReload(this.map))return undefined;
    if(this.sourceCounter?.map!==this.map){this.sourceCounter=new OriginalWeaponCounter(this.map as 'barrack'|'woodlands');this.sourceCounterTime=undefined;this.sourceReady=false;}
    return this.sourceCounter;
  }
  get originalCounterState(): (OriginalWeaponCounterState&{ready:boolean})|undefined {
    const counter=this.originalCounter();return counter?{...counter.state,ready:this.sourceReady}:undefined;
  }
  applyOriginalCounter(state:OriginalWeaponCounterState&{ready:boolean},now:number):void {
    if(this.committedOriginalLoadout)return;
    const counter=this.originalCounter();if(!counter)return;counter.restore(state);this.sourceReady=state.ready;this.sourceCounterTime=now;this.sourceAwaitingExplicitCallback=false;
  }
  setOriginalTyping(typing:boolean):void {if(this.committedOriginalLoadout)return;this.sourceInputEnabled=!typing;if(typing)this.sourceReady=false;}
  stepSourceCounter(now:number,options:OriginalWeaponCounterStep={}):boolean {
    if(this.committedOriginalLoadout)return false;
    const counter=this.originalCounter();if(!counter)return false;
    this.sourceAwaitingExplicitCallback=false;
    if(options.inputEnabled!==undefined)this.sourceInputEnabled=options.inputEnabled;
    this.sourceReady=counter.step(this.unarmed?null:this.current,{...options,inputEnabled:this.sourceInputEnabled});this.sourceCounterTime=now;
    if(this.reloading)this.reloadEnd=now+(this.sourceReady?0:counter.callbacksUntilReady(this.current)/30);
    return this.sourceReady;
  }
  private advanceSourceCounter(now:number):void {
    if(!this.originalCounter()||this.sourceAwaitingExplicitCallback)return;
    if(this.sourceCounterTime===undefined){this.stepSourceCounter(now);return;}
    const frames=Math.max(0,Math.floor((now-this.sourceCounterTime)*30+1e-7));
    for(let index=0;index<frames;index++)this.stepSourceCounter(this.sourceCounterTime!+1/30);
  }
  shiftSourceClock(seconds:number):void {if(this.committedOriginalLoadout)return;if(this.sourceCounterTime!==undefined)this.sourceCounterTime+=seconds;}
  private refreshSourceReloadDeadline():void {
    const counter=this.originalCounter();if(counter&&this.reloading&&this.sourceCounterTime!==undefined)this.reloadEnd=this.sourceCounterTime+counter.callbacksUntilReady(this.current)/30;
  }

  constructor(map?:string) {
    this.map=map;
    this.reset();
  }

  reset(): void {
    this.ammo.pistol = 8; this.ammo.shotgun = 8;
    this.ammo.rifle = 30; this.ammo.sniper = 10; this.ammo.rpg = 1;
    this.ammo.launcher = 6;
    this.reserve.pistol = 64; this.reserve.shotgun = 40;
    this.reserve.rifle = 150; this.reserve.sniper = 40; this.reserve.rpg = 5;
    this.reserve.launcher = 18;
    this.current = 'rifle'; this.lastShot = -10; this.reloadEnd = 0; this.reloading = false;
    this.reloadTransfersAtCompletion=false;this.unarmed=false;this.sourceCounter=undefined;this.sourceCounterTime=undefined;this.sourceReady=false;this.sourceInputEnabled=true;this.sourceAwaitingExplicitCallback=false;this.committedOriginalLoadout=undefined;this.committedOriginalGunPhase=undefined;
    const legacy=getLegacySpawnLoadout(this.map);
    if(legacy){Object.assign(this.ammo,legacy.ammo);Object.assign(this.reserve,legacy.reserve);this.current=legacy.equipped;}
  }

  select(id: WeaponId): boolean {
    if(this.committedOriginalLoadout)return false;
    const source=usesImmediateReload(this.map);
    if ((!source&&this.reloading)||(source&&!originalWeaponAvailable(this.ammo,this.reserve,id)))return false;
    if(this.current!==id&&source)this.sourceReady=false;
    this.current=id;this.unarmed=false;this.refreshSourceReloadDeadline();return true;
  }

  addReserve(id:WeaponId,rounds:number):number {
    if(this.committedOriginalLoadout)return 0;
    const accepted=Math.max(0,Math.floor(rounds));if(accepted===0)return 0;this.reserve[id]+=accepted;return accepted;
  }

  canFire(now: number): boolean {
    if(this.committedOriginalLoadout)return false;
    const spec = WEAPONS[this.current];
    if(this.originalCounter()){this.advanceSourceCounter(now);return !this.unarmed&&this.sourceReady&&this.ammo[this.current]>0;}
    return !this.unarmed && !this.reloading && this.ammo[this.current] > 0 && now - this.lastShot + 1e-9 >= spec.fireRate;
  }

  fire(now: number,onRpgSpawn?:()=>void): boolean {
    if(this.committedOriginalLoadout)return false;
    if (!this.canFire(now)) return false;
    const counter=this.originalCounter();
    if(counter&&this.current==='rpg'){
      const shot=originalRpgShot(counter,this.ammo.rpg,this.reserve.rpg,1,loaded=>{
        this.ammo.rpg=loaded.ammo;this.reserve.rpg=loaded.reserve;
        this.reloading=true;this.reloadTransfersAtCompletion=false;this.sourceReady=false;
        this.refreshSourceReloadDeadline();onRpgSpawn?.();
      });
      this.ammo.rpg=shot.ammo;this.reserve.rpg=shot.reserve;
      this.reloading=shot.canReload;this.reloadTransfersAtCompletion=false;
    }else{
      this.ammo[this.current]--;
      counter?.shot(this.current);
    }
    this.lastShot = now;
    if(counter){this.sourceReady=false;this.refreshSourceReloadDeadline();}
    return true;
  }

  startReload(now: number,sourceCallback=false): boolean {
    if(this.committedOriginalLoadout)return false;
    const id = this.current;
    const spec = WEAPONS[id];
    if(usesImmediateReload(this.map)){
      const transfer=originalReloadTransfer(this.ammo[id],this.reserve[id],weaponReloadTarget(this.map,id,spec.magazine));
      if(!transfer.canReload){
        const fallback=originalFirstUsableWeapon(this.ammo,this.reserve);
        this.unarmed=fallback===undefined;
        if(fallback)this.current=fallback;
        return false;
      }
      this.ammo[id]=transfer.ammo;this.reserve[id]=transfer.reserve;
      this.reloading=true;this.reloadTransfersAtCompletion=false;
      const counter=this.originalCounter()!;
      if(sourceCallback)this.stepSourceCounter(now,{reload:true});
      else{this.advanceSourceCounter(now);counter.reload();this.sourceReady=false;}
      this.refreshSourceReloadDeadline();return true;
    }
    if (this.reloading || this.ammo[id] >= weaponReloadTarget(this.map, id, spec.magazine) || this.reserve[id] <= 0) return false;
    this.reloading = true;
    this.reloadEnd = now + weaponReloadDuration(this.map,id,spec.reloadTime);
    this.reloadTransfersAtCompletion=!usesImmediateReload(this.map);
    if(!this.reloadTransfersAtCompletion)this.transferReloadRounds(id);
    return true;
  }

  update(now: number): boolean {
    if(this.committedOriginalLoadout)return false;
    if(this.originalCounter()){this.advanceSourceCounter(now);if(!this.reloading||!this.sourceReady)return false;this.reloading=false;return true;}
    if (!this.reloading || now < this.reloadEnd) return false;
    if(this.reloadTransfersAtCompletion)this.transferReloadRounds(this.current);
    this.reloadTransfersAtCompletion=false;
    this.reloading = false;
    return true;
  }

  private transferReloadRounds(id:WeaponId):void {
    const needed = Math.max(0, weaponReloadTarget(this.map, id, WEAPONS[id].magazine) - this.ammo[id]);
    const moved = Math.min(needed, this.reserve[id]);
    this.ammo[id] += moved;
    this.reserve[id] -= moved;
  }
}
