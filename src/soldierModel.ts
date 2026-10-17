import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createSoldierAnatomyGeometrySet, type SoldierAnatomyGeometrySet } from './soldierAnatomyGeometry';
import { SoldierMaterialLibrary, type SoldierMaterialTier, type SoldierPresentation } from './soldierMaterials';
import type { WeaponId } from './weapons';

/** Team palettes are intentionally cosmetic; gameplay teams remain caller-owned. */
export type SoldierTeam = 'red' | 'blue' | 'neutral';

/** Rendering tiers only affect presentation; animation state and muzzle anchors stay intact. */
export type SoldierDetailLevel = 'full' | 'reduced' | 'silhouette';

export interface SoldierLodDistances {
  reduced: number;
  silhouette: number;
  hysteresis: number;
}

export const DEFAULT_SOLDIER_LOD_DISTANCES: Readonly<SoldierLodDistances> = Object.freeze({
  reduced: 22,
  silhouette: 48,
  hysteresis: 3,
});

export interface SoldierModelOptions {
  presentation?: SoldierPresentation;
  name?: string;
  weapon?: WeaponId;
  team?: SoldierTeam;
  accentColor?: THREE.ColorRepresentation;
  uniformColor?: THREE.ColorRepresentation;
  skinColor?: THREE.ColorRepresentation;
  /** A stable value gives bots a little visual variety without changing their silhouette. */
  seed?: number;
  scale?: number;
  castShadow?: boolean;
  showName?: boolean;
  /** Optional distance-tier tuning. Omitted values use the shared defaults. */
  lodDistances?: Partial<SoldierLodDistances>;
  /** Borrowed game-wide material library. Omit for a self-contained model. */
  materialLibrary?: SoldierMaterialLibrary;
  /** Used only when the model creates its own material library. */
  materialTier?: SoldierMaterialTier;
}

/**
 * A presentation-only pose consumed by both locally simulated bots and remote players.
 * `aimYaw` is a local upper-body offset, not the actor's world heading.
 */
export interface SoldierAnimationState {
  moveSpeed?: number;
  strafeSpeed?: number;
  aimYaw?: number;
  aimPitch?: number;
  crouch?: number;
  alive?: boolean;
  /** Edge-triggered. For sustained fire, alternate false/true or call triggerFire(). */
  firing?: boolean;
  /** A pulse in the 0..1 range. Event-driven callers can use triggerFlinch(). */
  flinch?: number;
}

export interface SoldierGripPointDebugState {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SoldierGripSideDebugState {
  readonly shoulder: SoldierGripPointDebugState;
  readonly elbow: SoldierGripPointDebugState;
  readonly hand: SoldierGripPointDebugState;
  readonly grip: SoldierGripPointDebugState;
  /** World-space distance between the glove anchor and its authored weapon grip. */
  readonly error: number;
}

export interface SoldierGripDebugState {
  readonly weapon: WeaponId;
  readonly left: SoldierGripSideDebugState;
  readonly right: SoldierGripSideDebugState;
}

interface LimbRig {
  upper: THREE.Group;
  lower: THREE.Group;
  foot?: THREE.Group;
}

interface ArmRig extends LimbRig {
  /** Presentation-only wrist marker at the centre of the glove. */
  hand: THREE.Object3D;
  upperLength: number;
  lowerLength: number;
}

interface WeaponRig {
  group: THREE.Group;
  muzzle: THREE.Object3D;
  flash: THREE.Group;
  leftHand: THREE.Vector3;
  rightHand: THREE.Vector3;
}

interface SoldierSurface {
  material: THREE.MeshStandardMaterial;
  tint: THREE.Color;
}

type SoldierLodRole = 'auto' | 'core' | 'full-only';

interface SoldierMeshOptions {
  lod?: SoldierLodRole;
  name?: string;
}

const DEFAULT_STATE: Required<Omit<SoldierAnimationState, 'firing' | 'flinch'>> = {
  moveSpeed: 0,
  strafeSpeed: 0,
  aimYaw: 0,
  aimPitch: 0,
  crouch: 0,
  alive: true,
};

const TEAM_ACCENTS: Record<SoldierTeam, number> = {
  red: 0xb63c35,
  blue: 0x3e82b9,
  neutral: 0x82905d,
};

const ALL_WEAPONS: WeaponId[] = ['pistol', 'shotgun', 'rifle', 'launcher', 'rpg', 'sniper'];
const FORWARD = new THREE.Vector3(0, 0, 1);
const ARM_DOWN = new THREE.Vector3(0, -1, 0);

/**
 * Detailed, procedural infantry presentation rig. It contains no gameplay hitboxes:
 * callers should keep their existing server/bot proxies as a separate concern.
 */
export class SoldierModel {
  /** Feet-level scene root. Move and turn this object from gameplay code. */
  readonly group = new THREE.Group();
  readonly presentation: SoldierPresentation;
  /** Alias intended for adapters that distinguish presentation from hit proxies. */
  readonly visual = this.group;

  private readonly bodyRoot = new THREE.Group();
  private readonly detailedRoot = new THREE.Group();
  private readonly silhouetteRoot = new THREE.Group();
  private readonly upperBody = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly weaponMount = new THREE.Group();
  private readonly leftArm: ArmRig;
  private readonly rightArm: ArmRig;
  private readonly leftLeg: LimbRig;
  private readonly rightLeg: LimbRig;
  private readonly weapons = new Map<WeaponId, WeaponRig>();
  private readonly silhouetteWeapons = new Map<WeaponId, THREE.Mesh>();
  private readonly reducedDetails: THREE.Mesh[] = [];
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materialLibrary: SoldierMaterialLibrary;
  private readonly ownsMaterialLibrary: boolean;
  private readonly castShadow: boolean;
  private readonly lodReducedDistance: number;
  private readonly lodSilhouetteDistance: number;
  private readonly lodHysteresis: number;
  private label?: THREE.Sprite;
  private state = { ...DEFAULT_STATE };
  private currentWeapon: WeaponId;
  private walkCycle = 0;
  private idleCycle = 0;
  private firePulse = 0;
  private flinchPulse = 0;
  private flinchSide = 1;
  private deathProgress = 0;
  private wasFiring = false;
  private disposed = false;
  private currentDetailLevel: SoldierDetailLevel = 'full';
  private armPoseInitialized = false;
  // Shared IK scratch space keeps the per-frame arm solve allocation-free.
  private readonly ikTarget = new THREE.Vector3();
  private readonly ikShoulder = new THREE.Vector3();
  private readonly ikAimDirection = new THREE.Vector3();
  private readonly ikPole = new THREE.Vector3();
  private readonly ikPlaneDirection = new THREE.Vector3();
  private readonly ikElbow = new THREE.Vector3();
  private readonly ikUpperDirection = new THREE.Vector3();
  private readonly ikLowerDirection = new THREE.Vector3();
  private readonly ikLocalDirection = new THREE.Vector3();
  private readonly ikActualElbow = new THREE.Vector3();
  private readonly ikRestLowerDirection = new THREE.Vector3();
  private readonly ikUpperTarget = new THREE.Quaternion();
  private readonly ikLowerTarget = new THREE.Quaternion();
  private readonly ikInverseUpper = new THREE.Quaternion();

  constructor(options: SoldierModelOptions = {}) {
    this.presentation = options.presentation ?? options.materialLibrary?.presentation ?? 'modern';
    this.ownsMaterialLibrary = options.materialLibrary === undefined;
    this.materialLibrary = options.materialLibrary ?? new SoldierMaterialLibrary({
      tier: options.materialTier ?? 'high',
      presentation: this.presentation,
      seed: 'russias-army-shared-soldier',
    });
    this.castShadow = options.castShadow ?? true;
    const reducedDistance = options.lodDistances?.reduced ?? DEFAULT_SOLDIER_LOD_DISTANCES.reduced;
    const silhouetteDistance = options.lodDistances?.silhouette ?? DEFAULT_SOLDIER_LOD_DISTANCES.silhouette;
    this.lodReducedDistance = Math.max(0, reducedDistance);
    this.lodSilhouetteDistance = Math.max(this.lodReducedDistance, silhouetteDistance);
    this.lodHysteresis = Math.max(0, options.lodDistances?.hysteresis ?? DEFAULT_SOLDIER_LOD_DISTANCES.hysteresis);
    this.currentWeapon = options.weapon ?? 'rifle';
    const seed = options.seed ?? 0;
    const variation = Math.sin(seed * 91.73) * 0.035;
    const team = options.team ?? 'neutral';
    const teamUniforms: Record<SoldierTeam, number> = { red: 0x5d604d, blue: 0x4e5d5d, neutral: 0x53604f };
    const uniformColor = new THREE.Color(options.uniformColor ?? (this.presentation === 'legacy' ? 0xf0efdf : teamUniforms[team])).offsetHSL(variation, variation * .25, variation);
    const accentColor = new THREE.Color(options.accentColor ?? TEAM_ACCENTS[team]);
    const skinColor = new THREE.Color(options.skinColor ?? 0xc59679).offsetHSL(variation * .25, 0, variation * .45);
    const palette = this.materialLibrary.materials;
    const uniform = this.surface(palette.fabric, uniformColor);
    const uniformDark = this.surface(palette.fabric, uniformColor.clone().multiplyScalar(this.presentation === 'legacy' ? .94 : .68));
    // Keep the carrier and load-bearing kit distinct under the overcast fill.
    // The former values collapsed both into the same near-black mass at combat
    // distance, hiding the chest, shoulder and pouch silhouette.
    const vest = this.surface(palette.armor, this.presentation === 'legacy' ? 0x252e26 : 0x414c47);
    const webbing = this.surface(palette.webbing, this.presentation === 'legacy' ? 0x4e5943 : 0x555c4b);
    const rubber = this.surface(palette.rubber, 0x171d1c);
    const metal = this.surface(palette.metal, this.materialLibrary.tier === 'low' ? 0x4a5654 : 0x303a38);
    const polymer = this.surface(palette.polymer, 0x333b38);
    const wood = this.surface(palette.wood, 0x704e32);
    const skin = this.surface(palette.skin, skinColor);
    const accent = this.surface(palette.armor, accentColor);
    const lens = this.surface(palette.lens, 0x315a60);
    this.group.name = 'soldier-presentation';
    this.group.userData.presentationOnly = true;
    this.detailedRoot.name = 'soldier-detailed';
    this.group.scale.setScalar(options.scale ?? 1);
    this.group.add(this.bodyRoot);
    this.bodyRoot.add(this.detailedRoot, this.silhouetteRoot);
    this.detailedRoot.add(this.upperBody);
    this.upperBody.position.y = 1.01;
    this.upperBody.add(this.torso);

    const anatomy = createSoldierAnatomyGeometrySet();
    this.buildTorso(anatomy, uniform, uniformDark, vest, webbing, rubber, accent);
    const helmetSurface = this.presentation === 'legacy' ? this.surface(palette.armor, 0xadb493) : vest;
    this.buildHead(skin, uniformDark, helmetSurface, rubber, lens, accent);
    this.leftLeg = this.buildLeg(-.16, anatomy, uniform, uniformDark, vest, rubber);
    this.rightLeg = this.buildLeg(.16, anatomy, uniform, uniformDark, vest, rubber);
    // The sharp Woodland reference exposes tan hands beside the vest.
    // Reuse face skin in Legacy; retain the same grip geometry and Modern gloves.
    const handSurface = this.presentation === 'legacy' ? skin : rubber;
    this.leftArm = this.buildArm(-.24, anatomy, uniform, uniformDark, vest, handSurface);
    this.rightArm = this.buildArm(.24, anatomy, uniform, uniformDark, vest, handSurface);
    this.detailedRoot.add(this.leftLeg.upper, this.rightLeg.upper);
    this.upperBody.add(this.leftArm.upper, this.rightArm.upper);

    // Seat long guns below the face and slightly into the firing shoulder. The
    // analytic hand solve consumes this transform, so grips remain planted.
    this.weaponMount.position.set(.025, .22, .1);
    this.upperBody.add(this.weaponMount);
    this.buildWeapons(metal, polymer, wood, rubber, lens);
    this.buildSilhouette(
      this.surface(palette.silhouetteFabric, uniformColor.clone().multiplyScalar(this.presentation === 'legacy' ? .84 : .62)),
      this.surface(palette.silhouetteFabric, uniformColor.clone().multiplyScalar(this.presentation === 'legacy' ? .77 : .46)),
      this.surface(palette.silhouetteArmor, 0x28302d),
      this.surface(palette.silhouetteMetal, 0x343e3c),
    );
    this.setWeapon(this.currentWeapon);

    if ((options.showName ?? Boolean(options.name)) && options.name) this.setName(options.name);
    this.group.traverse((object) => {
      object.userData.presentationOnly = true;
      if (object instanceof THREE.Mesh) {
        object.castShadow = this.castShadow;
        object.receiveShadow = true;
      }
    });
    if (this.presentation === 'legacy') {
      // These conspicuous modern embellishments are not resolved in the source.
      // Keep the supported helmet/vest/boots, without inventing hidden kit.
      const omitted = ['team-patch-left', 'team-patch-right', 'helmet-band',
        'goggle-frame', 'goggle-left', 'goggle-right', 'headset-left', 'headset-right',
        'headset-mic', 'thigh-pad', 'knee-pad', 'elbow-pad', 'shoulder-pad',
        'assault-pack', 'pack-pocket'];
      const extras: THREE.Object3D[] = [];
      this.detailedRoot.traverse(object => { if (omitted.includes(object.name)) extras.push(object); });
      for (const object of extras) object.removeFromParent();
      this.group.userData.referenceKitUnresolved = true;
    }
    this.collectReducedDetails();
    this.silhouetteRoot.traverse((object) => {
      object.userData.soldierLod = 'silhouette';
      if (object instanceof THREE.Mesh) {
        object.castShadow = false;
        object.receiveShadow = false;
      }
    });
    this.applyDetailLevel();
  }

  get weapon(): WeaponId {
    return this.currentWeapon;
  }

  get alive(): boolean {
    return this.state.alive;
  }

  get detailLevel(): SoldierDetailLevel {
    return this.currentDetailLevel;
  }

  /** Active weapon muzzle, useful for tracers and muzzle-origin audio. */
  get muzzle(): THREE.Object3D {
    return this.weapons.get(this.currentWeapon)?.muzzle ?? this.weaponMount;
  }

  /** Switches the visible held model and adjusts both hands to the new grip. */
  setWeapon(id: WeaponId): void {
    this.currentWeapon = id;
    for (const [weaponId, rig] of this.weapons) rig.group.visible = weaponId === id;
    for (const [weaponId, mesh] of this.silhouetteWeapons) mesh.visible = weaponId === id;
    // Snap once to the newly authored grips, then smoothly follow aim/recoil.
    this.armPoseInitialized = false;
  }

  /** Forces a presentation tier. Repeated calls with the same tier are free. */
  setDetailLevel(level: SoldierDetailLevel): void {
    if (level === this.currentDetailLevel) return;
    this.currentDetailLevel = level;
    this.applyDetailLevel();
  }

  /**
   * Selects a tier from camera distance with hysteresis. This performs no allocations
   * and is intended to be called for every visible soldier each render frame.
   */
  setDistanceToCamera(distance: number): SoldierDetailLevel {
    const safeDistance = Number.isFinite(distance) ? Math.max(0, distance) : this.lodSilhouetteDistance;
    const margin = this.lodHysteresis;
    let next = this.currentDetailLevel;
    if (next === 'full') {
      if (safeDistance >= this.lodSilhouetteDistance) next = 'silhouette';
      else if (safeDistance >= this.lodReducedDistance) next = 'reduced';
    } else if (next === 'reduced') {
      if (safeDistance >= this.lodSilhouetteDistance) next = 'silhouette';
      else if (safeDistance < Math.max(0, this.lodReducedDistance - margin)) next = 'full';
    } else if (safeDistance < Math.max(0, this.lodSilhouetteDistance - margin)) {
      next = safeDistance < Math.max(0, this.lodReducedDistance - margin) ? 'full' : 'reduced';
    }
    this.setDetailLevel(next);
    return this.currentDetailLevel;
  }

  /** Replaces or removes the optional billboard label. */
  setName(name?: string): void {
    if (this.label) {
      this.group.remove(this.label);
      this.label.material.map?.dispose();
      this.label.material.dispose();
      this.label = undefined;
    }
    if (!name || typeof document === 'undefined') return;
    this.label = this.createLabel(name);
    this.label.position.set(0, 2.01, 0);
    this.label.visible = this.currentDetailLevel === 'full' && this.state.alive;
    this.group.add(this.label);
  }

  /** Merges a pose without requiring gameplay code to retain animation internals. */
  setAnimationState(next: SoldierAnimationState): void {
    if (next.moveSpeed !== undefined) this.state.moveSpeed = Math.max(0, next.moveSpeed);
    if (next.strafeSpeed !== undefined) this.state.strafeSpeed = next.strafeSpeed;
    if (next.aimYaw !== undefined) this.state.aimYaw = next.aimYaw;
    if (next.aimPitch !== undefined) this.state.aimPitch = next.aimPitch;
    if (next.crouch !== undefined) this.state.crouch = THREE.MathUtils.clamp(next.crouch, 0, 1);
    if (next.alive !== undefined) this.setAlive(next.alive);
    if (next.firing && !this.wasFiring) this.triggerFire();
    this.wasFiring = next.firing ?? false;
    if (next.flinch !== undefined && next.flinch > 0) this.triggerFlinch(next.flinch);
  }

  /** Starts a weapon recoil and muzzle-flash event. */
  triggerFire(strength = 1): void {
    if (!this.state.alive) return;
    this.firePulse = Math.max(this.firePulse, THREE.MathUtils.clamp(strength, .15, 1.5));
  }

  /** Concise event alias for gameplay adapters. */
  fire(strength = 1): void {
    this.triggerFire(strength);
  }

  /** Starts a directional upper-body reaction without changing health or hit state. */
  triggerFlinch(strength = 1, side = 1): void {
    if (!this.state.alive) return;
    this.flinchPulse = Math.max(this.flinchPulse, THREE.MathUtils.clamp(strength, .1, 1.5));
    this.flinchSide = side < 0 ? -1 : 1;
  }

  /** Concise event alias for gameplay adapters. */
  flinch(strength = 1, side = 1): void {
    this.triggerFlinch(strength, side);
  }

  /** Changes life state. Pass immediate=true for spawn/reset setup without blending. */
  setAlive(alive: boolean, immediate = false): void {
    this.state.alive = alive;
    if (alive) {
      this.group.visible = true;
      if (immediate) this.deathProgress = 0;
    } else {
      this.state.moveSpeed = 0;
      this.state.strafeSpeed = 0;
      if (immediate) this.deathProgress = 1;
    }
    if (immediate) this.applyDeathPose();
  }

  die(immediate = false): void {
    this.setAlive(false, immediate);
  }

  /** Restores a clean spawn pose while retaining the selected weapon and cosmetics. */
  reset(): void {
    this.state = { ...DEFAULT_STATE };
    this.walkCycle = 0;
    this.idleCycle = 0;
    this.firePulse = 0;
    this.flinchPulse = 0;
    this.deathProgress = 0;
    this.wasFiring = false;
    this.armPoseInitialized = false;
    this.bodyRoot.position.set(0, 0, 0);
    this.bodyRoot.rotation.set(0, 0, 0);
    this.upperBody.position.set(0, 1.01, 0);
    this.upperBody.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    this.weaponMount.position.set(.025, .22, .1);
    this.weaponMount.rotation.set(0, 0, 0);
    this.leftLeg.upper.rotation.set(0, 0, 0);
    this.rightLeg.upper.rotation.set(0, 0, 0);
    this.leftLeg.lower.rotation.set(0, 0, 0);
    this.rightLeg.lower.rotation.set(0, 0, 0);
    this.leftLeg.foot?.rotation.set(0, 0, 0);
    this.rightLeg.foot?.rotation.set(0, 0, 0);
    this.leftArm.upper.rotation.set(-1.13, 0, .16);
    this.rightArm.upper.rotation.set(-1.2, 0, -.16);
    this.leftArm.lower.rotation.set(-.53, 0, .04);
    this.rightArm.lower.rotation.set(-.42, 0, -.04);
    this.poseArms(0, 0, 0, 0, 1);
    for (const rig of this.weapons.values()) rig.flash.visible = false;
    if (this.label) this.label.visible = this.currentDetailLevel === 'full';
    this.group.visible = true;
    this.applyDeathPose();
  }

  /** Advances locomotion, aim, recoil, flinch, idle breathing, and the death blend. */
  update(delta: number, next?: SoldierAnimationState): void {
    if (this.disposed) return;
    if (next) this.setAnimationState(next);
    const dt = Math.min(Math.max(delta, 0), .1);
    this.idleCycle += dt * 1.75;
    const speed = Math.min(this.state.moveSpeed, 6.5);
    this.walkCycle += dt * THREE.MathUtils.lerp(4.2, 8.8, Math.min(1, speed / 4));
    this.firePulse = Math.max(0, this.firePulse - dt * 9.5);
    this.flinchPulse = Math.max(0, this.flinchPulse - dt * 5.8);
    const deathTarget = this.state.alive ? 0 : 1;
    this.deathProgress = THREE.MathUtils.damp(this.deathProgress, deathTarget, this.state.alive ? 11 : 4.8, dt);

    // The far representation follows bodyRoot, including its blended death pose. Hidden
    // articulated joints need no locomotion work until the actor returns to a nearer tier.
    if (this.currentDetailLevel === 'silhouette') {
      for (const rig of this.weapons.values()) rig.flash.visible = false;
      this.applyDeathPose();
      return;
    }

    const movementWeight = Math.min(1, speed / 2.8);
    const stride = Math.sin(this.walkCycle) * (.12 + speed * .075) * movementWeight;
    const lift = Math.max(0, Math.sin(this.walkCycle)) * .24 * movementWeight;
    const oppositeLift = Math.max(0, -Math.sin(this.walkCycle)) * .24 * movementWeight;
    const strafeLean = THREE.MathUtils.clamp(this.state.strafeSpeed / 5, -.12, .12);
    const breathe = Math.sin(this.idleCycle) * .012 * (1 - movementWeight * .7);
    const crouch = this.state.crouch;

    this.leftLeg.upper.rotation.x = THREE.MathUtils.damp(this.leftLeg.upper.rotation.x, stride, 12, dt);
    this.rightLeg.upper.rotation.x = THREE.MathUtils.damp(this.rightLeg.upper.rotation.x, -stride, 12, dt);
    this.leftLeg.lower.rotation.x = THREE.MathUtils.damp(this.leftLeg.lower.rotation.x, lift, 14, dt);
    this.rightLeg.lower.rotation.x = THREE.MathUtils.damp(this.rightLeg.lower.rotation.x, oppositeLift, 14, dt);
    if (this.leftLeg.foot) this.leftLeg.foot.rotation.x = -this.leftLeg.lower.rotation.x * .35;
    if (this.rightLeg.foot) this.rightLeg.foot.rotation.x = -this.rightLeg.lower.rotation.x * .35;

    const upperYaw = THREE.MathUtils.clamp(this.state.aimYaw, -.85, .85);
    const upperPitch = THREE.MathUtils.clamp(this.state.aimPitch, -.75, .75);
    this.upperBody.rotation.y = THREE.MathUtils.damp(this.upperBody.rotation.y, upperYaw, 10, dt);
    this.upperBody.rotation.x = THREE.MathUtils.damp(this.upperBody.rotation.x, upperPitch * .28 - crouch * .08, 11, dt);
    this.upperBody.rotation.z = strafeLean + this.flinchSide * this.flinchPulse * .095;
    this.upperBody.position.y = 1.01 - crouch * .3 + Math.abs(Math.sin(this.walkCycle)) * .016 * movementWeight + breathe;
    this.torso.rotation.x = breathe * .4 + this.flinchPulse * .07;
    this.head.rotation.x = THREE.MathUtils.damp(this.head.rotation.x, upperPitch * .42 - breathe, 13, dt);
    this.head.rotation.y = THREE.MathUtils.damp(this.head.rotation.y, upperYaw * .12, 11, dt);

    const recoil = this.firePulse * this.firePulse;
    this.weaponMount.rotation.x = upperPitch * .72 - recoil * .075;
    this.weaponMount.position.z = .1 - recoil * .09;
    this.poseArms(stride, movementWeight, recoil, upperPitch, dt);

    const activeWeapon = this.weapons.get(this.currentWeapon);
    if (activeWeapon) {
      activeWeapon.flash.visible = this.currentDetailLevel === 'full' && this.firePulse > .32;
      const flashScale = .55 + this.firePulse * .8;
      activeWeapon.flash.scale.setScalar(flashScale);
      activeWeapon.flash.rotation.z += dt * 19;
    }
    for (const [id, rig] of this.weapons) if (id !== this.currentWeapon) rig.flash.visible = false;
    this.applyDeathPose();
  }

  /** Naming-friendly alias for render-loop integrations. */
  animate(delta: number, next?: SoldierAnimationState): void {
    this.update(delta, next);
  }

  getMuzzleWorldPosition(target = new THREE.Vector3()): THREE.Vector3 {
    return this.weapons.get(this.currentWeapon)?.muzzle.getWorldPosition(target) ?? this.group.getWorldPosition(target);
  }

  getMuzzleWorldDirection(target = new THREE.Vector3()): THREE.Vector3 {
    const muzzle = this.weapons.get(this.currentWeapon)?.muzzle;
    if (!muzzle) return target.copy(FORWARD).applyQuaternion(this.group.getWorldQuaternion(new THREE.Quaternion()));
    return target.copy(FORWARD).applyQuaternion(muzzle.getWorldQuaternion(new THREE.Quaternion())).normalize();
  }

  /**
   * Presentation diagnostic for pose regressions. Returned values are snapshots;
   * the allocation-free animation path does not retain them.
   */
  getGripDebugState(): SoldierGripDebugState {
    const rig = this.weapons.get(this.currentWeapon);
    if (!rig) throw new Error(`Missing held weapon rig for ${this.currentWeapon}.`);
    this.group.updateMatrixWorld(true);
    return {
      weapon: this.currentWeapon,
      left: this.gripSideDebugState(this.leftArm, rig.group, rig.leftHand),
      right: this.gripSideDebugState(this.rightArm, rig.group, rig.rightHand),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.label) {
      this.label.material.map?.dispose();
      this.label.material.dispose();
    }
    for (const geometry of this.geometries) geometry.dispose();
    if (this.ownsMaterialLibrary) this.materialLibrary.dispose();
    this.group.removeFromParent();
    this.group.clear();
  }

  private buildTorso(
    anatomy: SoldierAnatomyGeometrySet,
    uniform: SoldierSurface,
    uniformDark: SoldierSurface,
    vest: SoldierSurface,
    webbing: SoldierSurface,
    rubber: SoldierSurface,
    accent: SoldierSurface,
  ): void {
    this.mesh(this.torso, anatomy.torso, uniform, [0, 0, 0], undefined, undefined, { lod: 'core', name: 'torso-shell' });
    // A pelvis bridge closes the mannequin-like gap between the battle belt
    // and independent hip joints while remaining outside upper-body aim twist.
    this.mesh(this.detailedRoot, anatomy.pelvis, uniformDark, [0, .935, 0], [1.05, 1.06, 1.03], undefined, { lod: 'core', name: 'pelvis-shell' });
    this.mesh(this.torso, new RoundedBoxGeometry(.59, .48, .24, 1, .045), vest, [0, .3, this.presentation === 'legacy' ? .17 : .045], undefined, undefined, { lod: 'core', name: 'plate-carrier' });
    this.mesh(this.torso, new RoundedBoxGeometry(.54, .085, .32, 1, .025), rubber, [0, .015, 0], undefined, undefined, { lod: 'core', name: 'battle-belt' });
    this.mesh(this.torso, new RoundedBoxGeometry(.43, .46, .16, 1, .045), webbing, [0, .32, -.205], undefined, undefined, { lod: 'core', name: 'assault-pack' });
    this.mesh(this.torso, new RoundedBoxGeometry(.31, .15, .09, 1, .025), webbing, [0, .16, -.315], undefined, [-.08, 0, 0], { name: 'pack-pocket' });
    this.mesh(this.torso, new RoundedBoxGeometry(.075, .55, .042, 1, .018), webbing, [-.205, .32, .175], undefined, [0, 0, -.11], { name: 'shoulder-strap-left' });
    this.mesh(this.torso, new RoundedBoxGeometry(.075, .55, .042, 1, .018), webbing, [.205, .32, .175], undefined, [0, 0, .11], { name: 'shoulder-strap-right' });
    for (const x of [-.19, 0, .19]) {
      const height = x === 0 ? .23 : .19;
      const pouch = this.mesh(this.torso, new RoundedBoxGeometry(.15, height, .105, 1, .022), webbing, [x, .145, .205], undefined, x === .19 ? [0, 0, -.04] : undefined, { name: `mag-pouch-${x}` });
      this.mesh(pouch, new RoundedBoxGeometry(.12, .033, .014, 1, .006), rubber, [0, height * .28, .057]);
    }
    this.mesh(this.torso, new RoundedBoxGeometry(.115, .135, .026, 1, .01), accent, [-.312, .42, .005], undefined, [0, Math.PI / 2, 0], { lod: 'core', name: 'team-patch-left' });
    this.mesh(this.torso, new RoundedBoxGeometry(.115, .135, .026, 1, .01), accent, [.312, .42, .005], undefined, [0, Math.PI / 2, 0], { lod: 'core', name: 'team-patch-right' });
    this.mesh(this.torso, new THREE.CylinderGeometry(.045, .045, .11, 8), rubber, [.27, .07, .2], undefined, [Math.PI / 2, 0, 0]);
  }

  private buildHead(
    skin: SoldierSurface,
    uniformDark: SoldierSurface,
    vest: SoldierSurface,
    rubber: SoldierSurface,
    lens: SoldierSurface,
    accent: SoldierSurface,
  ): void {
    this.head.position.set(0, .52, 0);
    this.upperBody.add(this.head);
    this.mesh(this.head, new THREE.CapsuleGeometry(.128, .105, 5, 12), skin, [0, .12, .005], [.94, 1, .91], undefined, { lod: 'core', name: 'face' });
    // The overlapping capsule carries the jaw into the torso instead of leaving
    // a cylindrical peg visible between the collar and face at close range.
    this.mesh(this.head, new THREE.CapsuleGeometry(.086, .035, 4, 10), uniformDark, [0, -.025, 0], [.88, 1, .82], undefined, { lod: 'core', name: 'neck' });
    const helmet = this.mesh(
      this.head,
      new THREE.SphereGeometry(.16, 18, 10, 0, Math.PI * 2, 0, Math.PI * .61),
      vest,
      [0, .17, -.008],
      [.94, .82, 1],
      undefined,
      { lod: 'core', name: 'helmet-shell' },
    );
    this.mesh(helmet, new RoundedBoxGeometry(.29, .038, .105, 1, .014), rubber, [0, -.02, .035], undefined, undefined, { lod: 'core', name: 'helmet-rim' });
    this.mesh(helmet, new RoundedBoxGeometry(.105, .043, .025, 1, .009), accent, [0, .055, .14], undefined, undefined, { lod: 'core', name: 'helmet-band' });
    this.mesh(this.head, new RoundedBoxGeometry(.165, .055, .022, 1, .012), rubber, [0, .135, .121], undefined, undefined, { name: 'goggle-frame' });
    this.mesh(this.head, new RoundedBoxGeometry(.064, .03, .016, 1, .007), lens, [-.048, .135, .135], undefined, undefined, { name: 'goggle-left' });
    this.mesh(this.head, new RoundedBoxGeometry(.064, .03, .016, 1, .007), lens, [.048, .135, .135], undefined, undefined, { name: 'goggle-right' });
    this.mesh(this.head, new RoundedBoxGeometry(.026, .05, .028, 1, .008), skin, [0, .085, .142], undefined, [Math.PI * .12, 0, 0]);
    this.mesh(this.head, new RoundedBoxGeometry(.07, .02, .014, 1, .006), uniformDark, [0, .035, .126]);
    this.mesh(this.head, new THREE.CylinderGeometry(.052, .052, .035, 10), rubber, [-.17, .145, 0], undefined, [0, 0, Math.PI / 2], { name: 'headset-left' });
    this.mesh(this.head, new THREE.CylinderGeometry(.052, .052, .045, 10), rubber, [.17, .145, 0], undefined, [0, 0, Math.PI / 2], { name: 'headset-right' });
    this.mesh(this.head, new THREE.CylinderGeometry(.014, .014, .16, 6), rubber, [.18, .055, .015], undefined, [0, 0, -.25], { name: 'headset-mic' });
  }

  private buildLeg(x: number, anatomy: SoldierAnatomyGeometrySet, uniform: SoldierSurface, uniformDark: SoldierSurface, vest: SoldierSurface, rubber: SoldierSurface): LimbRig {
    const upper = new THREE.Group();
    upper.position.set(x, .98, 0);
    const thigh = this.mesh(upper, anatomy.thigh, uniform, [0, 0, 0], undefined, undefined, { lod: 'core', name: 'thigh' });
    this.mesh(thigh, new RoundedBoxGeometry(.185, .115, .068, 1, .025), vest, [0, -.08, .095], undefined, [-.08, 0, 0], { name: 'thigh-pad' });
    const lower = new THREE.Group();
    lower.position.y = -.46;
    upper.add(lower);
    this.mesh(lower, anatomy.calf, uniformDark, [0, 0, 0], undefined, undefined, { lod: 'core', name: 'calf' });
    // This deeper wrap overlaps both articulated shells, masking the small
    // necessary pivot clearance without changing any animation or hit proxy.
    this.mesh(lower, new RoundedBoxGeometry(.17, .14, .1, 1, .014), vest, [0, -.005, .045], undefined, [.08, 0, 0], { name: 'knee-pad' });
    const foot = new THREE.Group();
    foot.position.y = -.39;
    lower.add(foot);
    const outwardYaw = Math.sign(x) * .08;
    this.mesh(foot, new RoundedBoxGeometry(.18, .165, .34, 1, .018), rubber, [0, -.04, .075], undefined, [-.035, outwardYaw, 0], { lod: 'core', name: 'boot' });
    this.mesh(foot, new RoundedBoxGeometry(.19, .035, .35, 1, .006), uniformDark, [0, -.11, .075], undefined, [0, outwardYaw, 0], { lod: 'core', name: 'boot-sole' });
    return { upper, lower, foot };
  }

  private buildArm(
    x: number,
    anatomy: SoldierAnatomyGeometrySet,
    uniform: SoldierSurface,
    uniformDark: SoldierSurface,
    vest: SoldierSurface,
    handSurface: SoldierSurface,
  ): ArmRig {
    const side = x < 0 ? 'left' : 'right';
    const sideSign = x < 0 ? -1 : 1;
    const upper = new THREE.Group();
    upper.name = `${side}-arm-upper`;
    upper.position.set(x, .58, 0);
    this.mesh(upper, new THREE.SphereGeometry(.105, 10, 7), vest, [sideSign * .012, -.025, -.006], [1.18, .72, 1], undefined, { lod: 'core', name: 'shoulder-pad' });
    this.mesh(upper, anatomy.upperArm, uniform, [0, 0, 0], undefined, undefined, { lod: 'core', name: 'upper-arm' });
    const lower = new THREE.Group();
    lower.name = `${side}-arm-lower`;
    lower.position.y = -.4;
    upper.add(lower);
    this.mesh(lower, anatomy.forearm, uniformDark, [0, 0, 0], undefined, undefined, { lod: 'core', name: 'forearm' });
    this.mesh(lower, new RoundedBoxGeometry(.145, .1, .095, 1, .026), vest, [0, -.03, .015], undefined, [-.08, 0, 0], { name: 'elbow-pad' });
    // Preserve the historical mesh name for rig/debug consumers in both styles.
    this.mesh(lower, new RoundedBoxGeometry(.125, .12, .165, 1, .016), handSurface, [0, -.36, .022], undefined, [-.14, 0, sideSign * .08], { lod: 'core', name: 'glove' });
    this.mesh(lower, new RoundedBoxGeometry(.14, .08, .115, 1, .013), uniformDark, [0, -.302, .012], undefined, [-.05, 0, sideSign * .04], { name: 'glove-cuff' });
    const hand = new THREE.Object3D();
    hand.name = `${side}-grip-hand`;
    hand.position.set(0, -.375, .012);
    hand.userData.presentationOnly = true;
    lower.add(hand);
    return {
      upper,
      lower,
      hand,
      upperLength: lower.position.length(),
      lowerLength: hand.position.length(),
    };
  }

  private buildWeapons(
    metal: SoldierSurface,
    polymer: SoldierSurface,
    wood: SoldierSurface,
    rubber: SoldierSurface,
    lens: SoldierSurface,
  ): void {
    for (const id of ALL_WEAPONS) {
      const group = new THREE.Group();
      group.name = `held-${id}`;
      this.weaponMount.add(group);
      const muzzle = new THREE.Object3D();
      let muzzleZ = .8;
      let leftHand = new THREE.Vector3(-.03, -.02, .33);
      let rightHand = new THREE.Vector3(.11, -.08, .03);

      if (id === 'pistol') {
        this.mesh(group, new RoundedBoxGeometry(.13, .12, .37, 1, .018), metal, [.13, 0, .2], undefined, undefined, { lod: 'core', name: 'held-pistol-slide' });
        this.mesh(group, new RoundedBoxGeometry(.11, .23, .13, 1, .02), polymer, [.13, -.14, .07], undefined, [-.22, 0, 0], { lod: 'core', name: 'held-pistol-grip' });
        this.mesh(group, new RoundedBoxGeometry(.055, .035, .12, 1, .009), rubber, [.13, .075, .22], undefined, undefined, { lod: 'full-only' });
        this.mesh(group, new THREE.CylinderGeometry(.025, .025, .32, 8), metal, [.13, .005, .21], undefined, [Math.PI / 2, 0, 0], { lod: 'core', name: 'held-pistol-barrel' });
        muzzleZ = .405;
        leftHand = new THREE.Vector3(.02, -.13, .12);
        rightHand = new THREE.Vector3(.13, -.16, .08);
      } else if (id === 'rifle') {
        this.mesh(group, new RoundedBoxGeometry(.18, .17, .48, 1, .022), metal, [.08, 0, .2], undefined, undefined, { lod: 'core', name: 'held-rifle-receiver' });
        this.mesh(group, new RoundedBoxGeometry(.16, .15, .38, 1, .026), polymer, [.08, -.005, .62], undefined, undefined, { lod: 'core', name: 'held-rifle-handguard' });
        this.mesh(group, new THREE.CylinderGeometry(.026, .021, .6, 10), metal, [.08, .035, .98], undefined, [Math.PI / 2, 0, 0], { lod: 'core' });
        this.mesh(group, new RoundedBoxGeometry(.17, .14, .42, 1, .022), polymer, [.08, .015, -.25], undefined, [.15, 0, 0], { lod: 'core', name: 'held-rifle-stock' });
        this.mesh(group, new RoundedBoxGeometry(.12, .28, .17, 1, .025), polymer, [.08, -.18, .2], undefined, [-.25, 0, 0], { lod: 'core', name: 'held-rifle-magazine' });
        this.mesh(group, new RoundedBoxGeometry(.04, .1, .05, 1, .009), metal, [.08, .13, .18], undefined, undefined, { lod: 'full-only' });
        muzzleZ = 1.29;
        leftHand.set(-.035, -.045, .48);
        rightHand.set(.11, -.13, .02);
      } else if (id === 'shotgun') {
        this.mesh(group, new RoundedBoxGeometry(.18, .19, .42, 1, .025), metal, [.08, 0, .12], undefined, undefined, { lod: 'core', name: 'held-shotgun-receiver' });
        this.mesh(group, new THREE.CylinderGeometry(.029, .027, .9, 10), metal, [.08, .055, .78], undefined, [Math.PI / 2, 0, 0], { lod: 'core' });
        this.mesh(group, new THREE.CylinderGeometry(.035, .035, .7, 10), metal, [.08, -.035, .68], undefined, [Math.PI / 2, 0, 0], { lod: 'core' });
        this.mesh(group, new RoundedBoxGeometry(.18, .14, .3, 1, .032), polymer, [.08, -.035, .56], undefined, undefined, { lod: 'core', name: 'held-shotgun-pump' });
        this.mesh(group, new RoundedBoxGeometry(.17, .17, .5, 1, .022), polymer, [.08, .005, -.32], undefined, [.09, 0, 0], { lod: 'core', name: 'held-shotgun-stock' });
        muzzleZ = 1.24;
        leftHand.set(-.04, -.08, .52);
        rightHand.set(.105, -.12, .06);
      } else if (id === 'sniper') {
        this.mesh(group, new RoundedBoxGeometry(.18, .18, .55, 1, .024), metal, [.08, 0, .19], undefined, undefined, { lod: 'core', name: 'held-sniper-receiver' });
        this.mesh(group, new RoundedBoxGeometry(.16, .16, .48, 1, .03), wood, [.08, -.005, .69], undefined, undefined, { lod: 'core', name: 'held-sniper-handguard' });
        this.mesh(group, new THREE.CylinderGeometry(.025, .021, .84, 10), metal, [.08, .035, 1.18], undefined, [Math.PI / 2, 0, 0], { lod: 'core' });
        this.mesh(group, new RoundedBoxGeometry(.2, .18, .53, 1, .024), wood, [.08, .005, -.36], undefined, [.08, 0, 0], { lod: 'core', name: 'held-sniper-stock' });
        this.mesh(group, new RoundedBoxGeometry(.12, .25, .16, 1, .022), metal, [.08, -.18, .16], undefined, [-.15, 0, 0], { lod: 'core', name: 'held-sniper-magazine' });
        this.mesh(group, new THREE.CylinderGeometry(.04, .04, .48, 10), lens, [.08, .16, .22], undefined, [Math.PI / 2, 0, 0], { lod: 'core', name: 'held-sniper-optic' });
        this.mesh(group, new THREE.CylinderGeometry(.055, .055, .065, 10), rubber, [.08, .16, -.045], undefined, [Math.PI / 2, 0, 0]);
        muzzleZ = 1.62;
        leftHand.set(-.035, -.04, .51);
        rightHand.set(.105, -.125, .015);
      } else if (id === 'launcher') {
        this.mesh(group, new RoundedBoxGeometry(.19, .2, .48, 1, .028), polymer, [.08, 0, .15], undefined, undefined, { lod: 'core', name: 'held-launcher-frame' });
        this.mesh(group, new THREE.CylinderGeometry(.16, .16, .37, 12), metal, [.08, -.08, .36], undefined, [Math.PI / 2, 0, 0], { lod: 'core', name: 'held-launcher-drum' });
        for (let chamber = 0; chamber < 6; chamber++) {
          const angle = chamber / 6 * Math.PI * 2;
          this.mesh(group, new THREE.CylinderGeometry(.034, .034, .52, 7), metal, [.08 + Math.cos(angle) * .105, -.08 + Math.sin(angle) * .105, .53], undefined, [Math.PI / 2, 0, 0], { lod: 'full-only' });
        }
        this.mesh(group, new RoundedBoxGeometry(.17, .17, .38, 1, .022), polymer, [.08, .01, -.28], undefined, [.31, 0, 0], { lod: 'core', name: 'held-launcher-stock' });
        this.mesh(group, new RoundedBoxGeometry(.12, .28, .14, 1, .024), rubber, [.08, -.2, .03], undefined, [-.2, 0, 0], { lod: 'core' });
        muzzleZ = .8;
        leftHand.set(-.04, -.11, .48);
        rightHand.set(.11, -.15, .03);
      } else {
        this.mesh(group, new THREE.CylinderGeometry(.075, .075, 1.48, 12), metal, [.04, .02, .38], undefined, [Math.PI / 2, 0, 0], { lod: 'core', name: 'held-rpg-tube' });
        this.mesh(group, new THREE.CylinderGeometry(.14, .1, .28, 12), polymer, [.04, .02, 1.18], undefined, [Math.PI / 2, 0, 0], { lod: 'core' });
        this.mesh(group, new THREE.ConeGeometry(.13, .42, 12), polymer, [.04, .02, 1.52], undefined, [Math.PI / 2, 0, 0], { lod: 'core', name: 'held-rpg-warhead' });
        this.mesh(group, new THREE.CylinderGeometry(.14, .08, .25, 10), metal, [.04, .02, -.44], undefined, [Math.PI / 2, 0, 0], { lod: 'core', name: 'held-rpg-venturi' });
        this.mesh(group, new RoundedBoxGeometry(.12, .28, .13, 1, .022), rubber, [.04, -.19, .05], undefined, [-.15, 0, 0], { lod: 'core' });
        this.mesh(group, new RoundedBoxGeometry(.055, .16, .13, 1, .015), lens, [.04, .13, .28], undefined, undefined, { lod: 'core', name: 'held-rpg-optic' });
        muzzleZ = 1.76;
        leftHand.set(-.04, -.04, .55);
        rightHand.set(.08, -.14, .06);
      }

      // Presentation-only stance offsets seat each weapon family at the
      // shoulder/chest without changing any gameplay origin or hit proxy.
      if (id === 'pistol') group.position.set(0, .28, .12);
      else if (id === 'rpg') group.position.set(0, .2, -.05);
      else if (id === 'rifle' || id === 'shotgun' || id === 'sniper') group.position.y = .11;
      else group.position.y = .09;

      muzzle.position.set(id === 'pistol' ? .13 : id === 'rpg' ? .04 : .08, id === 'rpg' ? .02 : .035, muzzleZ);
      muzzle.name = `muzzle-${id}`;
      group.add(muzzle);
      const flash = this.createMuzzleFlash();
      muzzle.add(flash);
      this.weapons.set(id, { group, muzzle, flash, leftHand, rightHand });
    }
  }

  /** A seven-draw combat-readable stand-in for actors beyond the articulated range. */
  private buildSilhouette(
    uniform: SoldierSurface,
    uniformDark: SoldierSurface,
    vest: SoldierSurface,
    metal: SoldierSurface,
  ): void {
    this.silhouetteRoot.name = 'soldier-silhouette';
    this.mesh(this.silhouetteRoot, new THREE.CapsuleGeometry(.265, .43, 2, 5), vest, [0, 1.3, 0], [1.08, 1, .82]);
    this.mesh(this.silhouetteRoot, new THREE.SphereGeometry(.15, 7, 5), uniformDark, [0, 1.72, 0], [1, 1, .94]);
    this.mesh(this.silhouetteRoot, new THREE.CapsuleGeometry(.11, .58, 2, 5), uniform, [-.15, .48, 0]);
    this.mesh(this.silhouetteRoot, new THREE.CapsuleGeometry(.11, .58, 2, 5), uniform, [.15, .48, 0]);
    this.mesh(this.silhouetteRoot, new THREE.CapsuleGeometry(.075, .45, 2, 5), uniformDark, [-.3, 1.25, .03], undefined, [0, 0, -.08]);
    this.mesh(this.silhouetteRoot, new THREE.CapsuleGeometry(.075, .45, 2, 5), uniformDark, [.3, 1.25, .03], undefined, [0, 0, .08]);

    const dimensions: Record<WeaponId, [number, number, number, number]> = {
      pistol: [.12, .13, .4, .37],
      shotgun: [.14, .14, 1.35, .72],
      rifle: [.16, .16, 1.25, .67],
      launcher: [.24, .23, .9, .5],
      rpg: [.18, .18, 1.7, .87],
      sniper: [.14, .14, 1.62, .85],
    };
    for (const id of ALL_WEAPONS) {
      const [width, height, depth, z] = dimensions[id];
      const weapon = this.mesh(this.silhouetteRoot, new THREE.BoxGeometry(width, height, depth), metal, [.08, 1.25, z]);
      weapon.name = `silhouette-${id}`;
      this.silhouetteWeapons.set(id, weapon);
    }
  }

  private collectReducedDetails(): void {
    this.detailedRoot.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const role = object.userData.soldierLod as SoldierLodRole | undefined;
      if (role === 'core') {
        object.castShadow = this.castShadow;
        return;
      }
      if (role === 'full-only') {
        object.castShadow = false;
        this.reducedDetails.push(object);
        return;
      }
      const geometry = object.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const bounds = geometry.boundingBox;
      if (!bounds) return;
      const x = bounds.max.x - bounds.min.x;
      const y = bounds.max.y - bounds.min.y;
      const z = bounds.max.z - bounds.min.z;
      if (Math.max(x, y, z) <= .38 && x * y * z <= .007) {
        object.userData.soldierLod = 'small-detail';
        object.castShadow = false;
        this.reducedDetails.push(object);
      } else {
        object.userData.soldierLod = 'core';
      }
    });
  }

  private applyDetailLevel(): void {
    const full = this.currentDetailLevel === 'full';
    const silhouette = this.currentDetailLevel === 'silhouette';
    this.detailedRoot.visible = !silhouette;
    this.silhouetteRoot.visible = silhouette;
    for (const mesh of this.reducedDetails) mesh.visible = full;
    if (this.label) this.label.visible = full && this.state.alive && this.deathProgress < .15;
    if (!full) for (const rig of this.weapons.values()) rig.flash.visible = false;
  }

  private createMuzzleFlash(): THREE.Group {
    const flash = new THREE.Group();
    flash.visible = false;
    const palette = this.materialLibrary.materials;
    this.mesh(flash, new THREE.OctahedronGeometry(.075, 0), this.surface(palette.flashCore, 0xffffff), [0, 0, .055]);
    this.mesh(flash, new THREE.ConeGeometry(.09, .25, 5), this.surface(palette.flashFlare, 0xffffff), [0, 0, .16], undefined, [Math.PI / 2, 0, 0]);
    return flash;
  }

  private poseArms(stride: number, movementWeight: number, recoil: number, aimPitch: number, dt: number): void {
    const rig = this.weapons.get(this.currentWeapon);
    if (!rig) return;
    const snap = !this.armPoseInitialized;
    const response = 1 - Math.exp(-(15 + recoil * 4) * Math.max(0, dt));
    const motion = THREE.MathUtils.clamp(movementWeight, 0, 1);
    // Small pole movement keeps elbows alive while both hands stay planted on the weapon.
    const strideOffset = stride * (1 - motion * .35);
    this.solveArmGrip(this.leftArm, rig, rig.leftHand, -1, strideOffset, motion, aimPitch, response, snap);
    this.solveArmGrip(this.rightArm, rig, rig.rightHand, 1, -strideOffset, motion, aimPitch, response, snap);
    this.armPoseInitialized = true;
  }

  /** Analytic shoulder/elbow/wrist solve in upper-body local space. */
  private solveArmGrip(
    arm: ArmRig,
    rig: WeaponRig,
    grip: THREE.Vector3,
    side: -1 | 1,
    strideOffset: number,
    movementWeight: number,
    aimPitch: number,
    response: number,
    snap: boolean,
  ): void {
    // Weapon groups are direct children of weaponMount. Applying both local
    // transforms yields the grip target in the same space as the shoulder.
    this.ikTarget.copy(grip).multiply(rig.group.scale).applyQuaternion(rig.group.quaternion).add(rig.group.position);
    this.ikTarget.multiply(this.weaponMount.scale).applyQuaternion(this.weaponMount.quaternion).add(this.weaponMount.position);
    this.ikShoulder.copy(arm.upper.position);
    this.ikAimDirection.copy(this.ikTarget).sub(this.ikShoulder);
    const rawDistance = this.ikAimDirection.length();
    if (rawDistance <= 1e-6) return;
    this.ikAimDirection.multiplyScalar(1 / rawDistance);

    const minimumReach = Math.abs(arm.upperLength - arm.lowerLength) + 1e-5;
    const maximumReach = arm.upperLength + arm.lowerLength - 1e-5;
    const reach = THREE.MathUtils.clamp(rawDistance, minimumReach, maximumReach);
    const along = (arm.upperLength * arm.upperLength - arm.lowerLength * arm.lowerLength + reach * reach) / (2 * reach);
    const height = Math.sqrt(Math.max(0, arm.upperLength * arm.upperLength - along * along));

    const pistol = this.currentWeapon === 'pistol';
    const heavy = this.currentWeapon === 'rpg' || this.currentWeapon === 'launcher';
    // A planted support elbow tucks under the handguard while the firing elbow
    // stays clear of the torso. The asymmetric pole gives both hands a readable
    // silhouette without returning to the old wide, mannequin-like arm arc.
    const outward = pistol
      ? (side < 0 ? .29 : .34)
      : heavy
        ? (side < 0 ? .36 : .46)
        : (side < 0 ? .31 : .41);
    this.ikPole.set(
      side * outward,
      -.52 - movementWeight * .08,
      (pistol ? .34 : heavy ? .06 : .18) + strideOffset * .08 - aimPitch * .04,
    ).normalize();
    this.ikPlaneDirection.copy(this.ikPole)
      .addScaledVector(this.ikAimDirection, -this.ikPole.dot(this.ikAimDirection));
    if (this.ikPlaneDirection.lengthSq() <= 1e-8) {
      this.ikPlaneDirection.set(side, 0, 0)
        .addScaledVector(this.ikAimDirection, -side * this.ikAimDirection.x);
    }
    if (this.ikPlaneDirection.lengthSq() <= 1e-8) this.ikPlaneDirection.set(0, -1, 0);
    this.ikPlaneDirection.normalize();
    this.ikElbow.copy(this.ikShoulder)
      .addScaledVector(this.ikAimDirection, along)
      .addScaledVector(this.ikPlaneDirection, height);

    this.ikUpperDirection.copy(this.ikElbow).sub(this.ikShoulder).normalize();
    this.ikUpperTarget.setFromUnitVectors(ARM_DOWN, this.ikUpperDirection);
    if (snap) arm.upper.quaternion.copy(this.ikUpperTarget);
    else arm.upper.quaternion.slerp(this.ikUpperTarget, THREE.MathUtils.clamp(response, 0, 1));

    // Aim the forearm from the elbow's actual smoothed position. This prevents
    // a one-frame wrist arc when aim or recoil moves the target abruptly.
    this.ikActualElbow.copy(arm.lower.position).applyQuaternion(arm.upper.quaternion).add(this.ikShoulder);
    this.ikLowerDirection.copy(this.ikTarget).sub(this.ikActualElbow);
    if (this.ikLowerDirection.lengthSq() <= 1e-8) return;
    this.ikLowerDirection.normalize();
    this.ikInverseUpper.copy(arm.upper.quaternion).invert();
    this.ikLocalDirection.copy(this.ikLowerDirection).applyQuaternion(this.ikInverseUpper).normalize();
    this.ikRestLowerDirection.copy(arm.hand.position).normalize();
    this.ikLowerTarget.setFromUnitVectors(this.ikRestLowerDirection, this.ikLocalDirection);
    if (snap) arm.lower.quaternion.copy(this.ikLowerTarget);
    else arm.lower.quaternion.slerp(this.ikLowerTarget, THREE.MathUtils.clamp(response, 0, 1));
  }

  private gripSideDebugState(
    arm: ArmRig,
    weaponGroup: THREE.Group,
    gripLocal: THREE.Vector3,
  ): SoldierGripSideDebugState {
    const shoulder = arm.upper.getWorldPosition(new THREE.Vector3());
    const elbow = arm.lower.getWorldPosition(new THREE.Vector3());
    const hand = arm.hand.getWorldPosition(new THREE.Vector3());
    const grip = weaponGroup.localToWorld(gripLocal.clone());
    return {
      shoulder: this.debugPoint(shoulder),
      elbow: this.debugPoint(elbow),
      hand: this.debugPoint(hand),
      grip: this.debugPoint(grip),
      error: hand.distanceTo(grip),
    };
  }

  private debugPoint(point: THREE.Vector3): SoldierGripPointDebugState {
    return { x: point.x, y: point.y, z: point.z };
  }

  private applyDeathPose(): void {
    const t = THREE.MathUtils.smoothstep(this.deathProgress, 0, 1);
    this.bodyRoot.rotation.z = -1.37 * t;
    this.bodyRoot.rotation.x = -.16 * t;
    this.bodyRoot.position.set(.18 * t, .14 * t, 0);
    this.leftArm.upper.rotation.x = THREE.MathUtils.lerp(this.leftArm.upper.rotation.x, .32, t);
    this.rightArm.upper.rotation.x = THREE.MathUtils.lerp(this.rightArm.upper.rotation.x, -.18, t);
    this.leftLeg.upper.rotation.z = -.12 * t;
    this.rightLeg.upper.rotation.z = .18 * t;
    if (this.label) this.label.visible = this.currentDetailLevel === 'full' && this.state.alive && t < .15;
  }

  private surface(material: THREE.MeshStandardMaterial, tint: THREE.ColorRepresentation): SoldierSurface {
    return { material, tint: new THREE.Color(tint) };
  }

  private mesh(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    surface: SoldierSurface,
    position: [number, number, number] = [0, 0, 0],
    scale?: [number, number, number],
    rotation?: [number, number, number],
    options: SoldierMeshOptions = {},
  ): THREE.Mesh {
    this.geometries.add(geometry);
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let index = 0; index < count; index++) {
      colors[index * 3] = surface.tint.r;
      colors[index * 3 + 1] = surface.tint.g;
      colors[index * 3 + 2] = surface.tint.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geometry, surface.material);
    mesh.position.set(...position);
    if (scale) mesh.scale.set(...scale);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = this.castShadow;
    mesh.receiveShadow = true;
    mesh.userData.presentationOnly = true;
    mesh.userData.soldierLod = options.lod ?? 'auto';
    mesh.userData.soldierSurface = surface.material.userData.soldierSurface;
    if (options.name) mesh.name = options.name;
    parent.add(mesh);
    return mesh;
  }

  private createLabel(name: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 72;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is required for soldier name labels');
    context.fillStyle = 'rgba(5, 10, 11, .76)';
    context.beginPath();
    context.roundRect(10, 8, 364, 54, 10);
    context.fill();
    context.fillStyle = '#e5eee8';
    context.font = '600 28px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(name.slice(0, 16).toUpperCase(), 192, 35, 338);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true, depthWrite: false, sizeAttenuation: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.45, .27, 1);
    sprite.renderOrder = 20;
    sprite.userData.presentationOnly = true;
    return sprite;
  }
}

export function createSoldierModel(options: SoldierModelOptions = {}): SoldierModel {
  return new SoldierModel(options);
}
