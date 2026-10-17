import type {ReceiverModelBackend,ReceiverModelEntry} from './originalReceiverModelWorld';
import type {OriginalRemotePosition} from './originalRemoteMovement';
import {sameReceiverScenePrefix,type ReceiverScenePrefix} from './originalReceiverPrefix';
import {createOriginalReceiverSceneRay,type OriginalReceiverRayCoverage,type OriginalReceiverRayModel,type OriginalReceiverSceneLayer,type OriginalReceiverSceneRay} from './originalReceiverSceneRay';
import {validateOriginalReceiverActorRegistrySnapshot,type ReceiverActorRegistrySnapshot} from './originalReceiverActorRegistry';

const layersByKind:Record<ReceiverModelEntry['kind'],readonly OriginalReceiverSceneLayer[]>={
  gi:['live-gi','pending-death-gi','corpse'],gun:['held-gun','dropped-gun'],
  'local-weapon':['local-weapon'],fixed:['fixed'],door:['door'],barrel:['barrel'],projectile:['projectile'],sky:['sky'],transient:['transient'],
};

export interface OriginalReceiverGeometryBackendOptions {
  readonly sceneGeneration:number;
  /** Resolve geometry from this exact ledger pose and callback. This must be
   * pure: a failed acceptance cannot rewind renderer animation or external RNG.
   * Returning current server geometry for an earlier callback is incorrect. */
  readonly resolveModel:(model:Readonly<ReceiverModelEntry>,callback:number,prefix?:ReceiverScenePrefix,registry?:ReceiverActorRegistrySnapshot)=>OriginalReceiverRayModel;
  /** Coverage is independent evidence, not inferred from whatever the resolver
   * happened to return. Missing source classes must remain unresolved. */
  readonly coverageAt:(callback:number,prefix?:ReceiverScenePrefix,registry?:ReceiverActorRegistrySnapshot)=>OriginalReceiverRayCoverage&{readonly actorRegistry?:ReceiverActorRegistrySnapshot};
  readonly budget:{readonly maxModels:number;readonly maxTriangles:number;readonly maxVertices:number};
  readonly provenance:string;
}

/** Compose the lifecycle ledger with the complete triangle-query contract.
 * This is an injection boundary, not production inventory reconstruction.
 * It retains no callback snapshots; geometry is consumed by one bounded ray.
 */
export type OriginalReceiverGeometryQuery=(
 models:readonly Readonly<ReceiverModelEntry>[],callback:number,sceneGeneration:number,
 prefix?:ReceiverScenePrefix,registry?:ReceiverActorRegistrySnapshot,
)=>OriginalReceiverSceneRay;

/** Resolve the exact complete staged ledger into one bounded immutable ray
 * snapshot. General bullet and downward queries share all identity, coverage,
 * layer and budget validation. No caller may substitute a world-only subset. */
export function createOriginalReceiverGeometryQuery(options:OriginalReceiverGeometryBackendOptions):OriginalReceiverGeometryQuery {
  if(!Number.isSafeInteger(options.sceneGeneration)||options.sceneGeneration<0||!options.provenance
    ||Object.values(options.budget).length!==3
    ||!Object.values(options.budget).every(n=>Number.isSafeInteger(n)&&n>0))throw Error('Invalid receiver geometry backend options');
  const generation=options.sceneGeneration,budget=Object.freeze({...options.budget});
  const resolve=options.resolveModel,coverageAt=options.coverageAt;
  return (models,callback,sceneGeneration,prefix,registry)=>{
      if(!Number.isSafeInteger(callback)||callback<0||models.length>budget.maxModels)throw Error('Invalid receiver geometry query boundary');
      if(sceneGeneration!==generation)throw Error('Receiver geometry generation mismatch');
      if(prefix&&(prefix.sceneGeneration!==generation||prefix.callback!==callback))throw Error('Receiver geometry prefix mismatch');
      if(registry){
        // The standard helper already bounded/froze catalogs and references.
        // Exact entry identity catches changed poses within the same prefix.
        validateOriginalReceiverActorRegistrySnapshot(registry,{maxModels:budget.maxModels});
        if(registry.sceneGeneration!==generation||registry.callback!==callback||!!registry.prefix!==!!prefix||prefix&&!sameReceiverScenePrefix(prefix,registry.prefix!))throw Error('Receiver geometry actor registry prefix mismatch');
        const owned=new Map(registry.models.map(model=>[model.handle,model]));let count=0;
        for(const model of models)if(model.kind==='gi'||model.kind==='gun'){if(owned.get(model.handle)!==model)throw Error('Receiver geometry actor registry model mismatch');count++;}
        if(count!==owned.size)throw Error('Receiver geometry actor registry subset mismatch');
      }
      const coverage=coverageAt(callback,prefix,registry);
      if(registry&&coverage.actorRegistry!==registry)throw Error('Receiver geometry actor registry identity mismatch');
      if(coverage.sceneGeneration!==generation||coverage.callback!==callback)throw Error('Receiver geometry prefix mismatch');
      if(prefix&&(!coverage.prefix||!sameReceiverScenePrefix(prefix,coverage.prefix)))throw Error('Receiver geometry receipt prefix mismatch');
      // Reject a stale inventory before resolving/allocating mesh geometry.
      const expected=new Set(coverage.expectedHandles),seen=new Set<string>();
      if(expected.size!==coverage.expectedHandles.length||expected.size!==models.length)throw Error('Receiver geometry ledger mismatch');
      if(coverage.unresolved.length)throw Error('Incomplete receiver scene coverage');
      const resolved:OriginalReceiverRayModel[]=[];
      let vertices=0,triangles=0;
      for(const model of models){
        if(seen.has(model.handle)||!expected.has(model.handle))throw Error('Receiver geometry ledger mismatch');
        seen.add(model.handle);
        const mesh=resolve(model,callback,prefix,registry);
        if(mesh.handle!==model.handle||mesh.inWorld!==model.inWorld||mesh.geometryProvenance!==model.geometryProvenance)throw Error('Receiver geometry model identity mismatch');
        if(!layersByKind[model.kind].includes(mesh.layer))throw Error('Receiver geometry model layer mismatch');
        // Parent membership belongs to the lifecycle ledger. A resolver cannot
        // silently remove guns from nonbullet queries or admit them to bullets.
        if((model.group==='gsmokes')!==mesh.groupAncestry.some(group=>['gsmokes','smokes'].includes(group.toLowerCase())))throw Error('Receiver geometry group mismatch');
        vertices+=mesh.positions.length;triangles+=mesh.faces.length;
        if(!Number.isSafeInteger(vertices)||vertices>budget.maxVertices||!Number.isSafeInteger(triangles)||triangles>budget.maxTriangles)throw Error('Receiver geometry budget exceeded');
        resolved.push(mesh);
      }
      return createOriginalReceiverSceneRay(resolved,coverage,budget);
  };
}

export function createOriginalReceiverGeometryBackend(
  lifecycle:Omit<ReceiverModelBackend,'nearestDetailedDownward'>,
  options:OriginalReceiverGeometryBackendOptions,
):ReceiverModelBackend {
  const query=createOriginalReceiverGeometryQuery(options),provenance=options.provenance;
  return Object.freeze({
    // Explicit forwarding preserves prototype methods and their receiver.
    cloneGI:lifecycle.cloneGI.bind(lifecycle),sphere:lifecycle.sphere.bind(lifecycle),
    heldGunPose:lifecycle.heldGunPose.bind(lifecycle),cloneGun:lifecycle.cloneGun.bind(lifecycle),
    reparentGunMembership:lifecycle.reparentGunMembership.bind(lifecycle),dropYaw:lifecycle.dropYaw.bind(lifecycle),
    nearestDetailedDownward(origin:Readonly<OriginalRemotePosition>,models:readonly Readonly<ReceiverModelEntry>[],callback:number,sceneGeneration:number,prefix?:ReceiverScenePrefix,registry?:ReceiverActorRegistrySnapshot){
      const hit=query(models,callback,sceneGeneration,prefix,registry).nearestDetailedDownward(origin);
      return Object.freeze({hit:hit?Object.freeze({position:Object.freeze({...hit.point}),handle:hit.handle,geometryProvenance:hit.geometryProvenance}):null,
        coverage:Object.freeze({complete:true,missing:Object.freeze([]),provenance})});
    },
  });
}
