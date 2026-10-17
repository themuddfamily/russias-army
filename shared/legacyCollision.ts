import { getLegacyMap, legacyGroundHeightAt, legacyRampHeightAt, LEGACY_WOODLAND_MAX_TERRAIN_HEIGHT, type LegacyMapId } from './legacyMaps';
import type { ArenaRaycastOptions, ArenaRayHit, ArenaVectorLike } from './arenaCollision';

/** Sloped access ramps are filled to ground; level roof bridges remain open. */
export function playerIntersectsLegacyRampSolid(map: LegacyMapId, feet: ArenaVectorLike, radius: number, height: number, footClearance = .06): boolean {
  for (const ramp of getLegacyMap(map).ramps) {
    if (ramp.start === ramp.end) continue;
    const along = ramp.axis === 'x' ? feet.x - ramp.x : feet.z - ramp.z;
    const across = ramp.axis === 'x' ? feet.z - ramp.z : feet.x - ramp.x;
    if (Math.abs(across) >= ramp.width / 2 + radius || Math.abs(along) >= ramp.length / 2 + radius) continue;
    const base = Math.min(ramp.start, ramp.end);
    if (feet.y + height <= base) continue;
    // A grounded player stands at the centre sample of a slope. Sampling the
    // uphill edge of their footprint would incorrectly collide during ascent.
    const centerAlong = Math.max(-ramp.length / 2, Math.min(ramp.length / 2, along));
    const top = ramp.start + (ramp.end-ramp.start) * (centerAlong/ramp.length+.5);
    if (feet.y + footClearance < top - 1e-8) return true;
  }
  return false;
}

/** Map-specific solids and terrain shared by authoritative combat queries. */
export function raycastLegacyMap(map: LegacyMapId, origin: ArenaVectorLike, direction: ArenaVectorLike, maxDistance = 300, options: ArenaRaycastOptions = {}): ArenaRayHit | null {
  const magnitude = Math.hypot(direction.x, direction.y, direction.z);
  if (!magnitude || !Number.isFinite(magnitude) || ![origin.x,origin.y,origin.z].every(Number.isFinite) || Number.isNaN(maxDistance) || maxDistance < 0) return null;
  const d = { x: direction.x/magnitude, y: direction.y/magnitude, z: direction.z/magnitude };
  const configuredMinimum = options.minDistance ?? 0;
  const minimum = Number.isFinite(configuredMinimum) ? Math.max(0, configuredMinimum) : 0;
  let limit = Math.min(maxDistance, 1000);
  let best: ArenaRayHit | null = null;
  const record = (id: string, distance: number, normal: ArenaVectorLike, surface: 'ground'|'collider') => {
    if (distance < minimum || distance > limit) return;
    limit=distance;
    best={id,surface,distance,point:{x:origin.x+d.x*distance,y:origin.y+d.y*distance,z:origin.z+d.z*distance},normal};
  };
  const manifest=getLegacyMap(map);
  for(const collider of manifest.colliders){
    const coordinates=[origin.x,origin.y,origin.z],components=[d.x,d.y,d.z];
    const inside=coordinates.every((v,i)=>v>=collider.min[i]-1e-10&&v<=collider.max[i]+1e-10);
    let boundary=false,inward=false,outward=false;
    for(let i=0;i<3;i++){
      if(Math.abs(coordinates[i]-collider.min[i])<=1e-10){boundary=true;if(components[i]>1e-10)inward=true;if(components[i]<-1e-10)outward=true;}
      if(Math.abs(coordinates[i]-collider.max[i])<=1e-10){boundary=true;if(components[i]<-1e-10)inward=true;if(components[i]>1e-10)outward=true;}
    }
    if(inside&&boundary&&(outward||!inward))continue;
    let near=-Infinity,far=Infinity,normal={x:0,y:0,z:0};
    let misses=false;
    for(const [axis,key] of (['x','y','z'] as const).entries()){
      if(Math.abs(d[key])<1e-10){if(origin[key]<collider.min[axis]||origin[key]>collider.max[axis]){misses=true;break;}continue;}
      let a=(collider.min[axis]-origin[key])/d[key],b=(collider.max[axis]-origin[key])/d[key];
      const sign=a>b?1:-1;if(a>b)[a,b]=[b,a];
      if(a>near){near=a;normal={x:0,y:0,z:0};normal[key]=sign;}far=Math.min(far,b);
      if(near>far){misses=true;break;}
    }
    if(!misses && far>Math.max(minimum,0)+1e-8)record(collider.id,Math.max(near,minimum),normal,'collider');
  }
  // Ramps and bridges are finite sloped surfaces, not vertical blocking boxes.
  for(const ramp of manifest.ramps){
    const slope=(ramp.end-ramp.start)/ramp.length;
    const center=(ramp.start+ramp.end)/2;
    const axis=ramp.axis;
    if(ramp.start!==ramp.end){
      const across=axis==='x'?'z':'x';
      const planes: {normal:{x:number;y:number;z:number}; offset:number}[]=[];
      for(const [key,half] of [[axis,ramp.length/2],[across,ramp.width/2]] as const){
        for(const sign of [-1,1]){const normal={x:0,y:0,z:0};normal[key]=sign;planes.push({normal,offset:sign*ramp[key]+half});}
      }
      planes.push({normal:{x:0,y:-1,z:0},offset:-Math.min(ramp.start,ramp.end)});
      const topNormal={x:0,y:1,z:0};topNormal[axis]=-slope;
      planes.push({normal:topNormal,offset:center-slope*ramp[axis]});
      let near=-Infinity,far=Infinity,normal={x:0,y:0,z:0},inside=true,boundary=false,outward=false,inward=false,misses=false;
      for(const plane of planes){
        const n=plane.normal,signed=n.x*origin.x+n.y*origin.y+n.z*origin.z-plane.offset;
        const denominator=n.x*d.x+n.y*d.y+n.z*d.z;
        if(signed>1e-10)inside=false;
        if(Math.abs(signed)<=1e-10){boundary=true;if(denominator>1e-10)outward=true;if(denominator< -1e-10)inward=true;}
        if(Math.abs(denominator)<1e-10){if(signed>1e-10){misses=true;break;}continue;}
        const distance=-signed/denominator;
        if(denominator<0){if(distance>near){near=distance;const scale=Math.hypot(n.x,n.y,n.z);normal={x:n.x/scale,y:n.y/scale,z:n.z/scale};}}
        else far=Math.min(far,distance);
        if(near>far){misses=true;break;}
      }
      if(!(inside&&boundary&&(outward||!inward))&&!misses&&far>Math.max(minimum,0)+1e-8)record(ramp.id,Math.max(near,minimum),normal,'collider');
      continue;
    }
    const denominator=d.y-slope*d[axis];
    if(Math.abs(denominator)<1e-10)continue;
    const distance=(center+slope*(origin[axis]-ramp[axis])-origin.y)/denominator;
    if (Math.abs(distance)<1e-8 && denominator>=0) continue;
    const x=origin.x+d.x*distance,z=origin.z+d.z*distance;
    if(legacyRampHeightAt(ramp,x,z)===undefined)continue;
    const scale=Math.hypot(1,slope);
    record(ramp.id,distance,{x:axis==='x'?-slope/scale:0,y:1/scale,z:axis==='z'?-slope/scale:0},'collider');
  }
  if(options.includeGround!==false){
    // Barrack is exactly planar: do not spend heightfield samples on every shot.
    if(map==='barrack'){
      const distance=Math.abs(d.y)>1e-10 ? -origin.y/d.y : Infinity;
      const x=origin.x+d.x*distance,z=origin.z+d.z*distance;
      if ((origin.y!==0 || d.y<0) && Math.abs(x)<=manifest.bounds && Math.abs(z)<=manifest.bounds) record('terrain',distance,{x:0,y:1,z:0},'ground');
    } else {
      // Bound marching to the playable terrain footprint and its analytic upper
      // bound, including the authored exposed bank behind the stone outbuilding.
      let start=minimum,end=limit;
      for(const key of ['x','z'] as const){
        if(Math.abs(d[key])<1e-10){if(Math.abs(origin[key])>manifest.bounds)end=-1;continue;}
        const a=(-manifest.bounds-origin[key])/d[key],b=(manifest.bounds-origin[key])/d[key];
        start=Math.max(start,Math.min(a,b));end=Math.min(end,Math.max(a,b));
      }
      const maximumTerrainHeight=LEGACY_WOODLAND_MAX_TERRAIN_HEIGHT;
      if(Math.abs(d.y)<1e-10){if(origin.y>maximumTerrainHeight)end=-1;}
      else if(d.y<0)start=Math.max(start,(maximumTerrainHeight-origin.y)/d.y);
      else end=Math.min(end,(maximumTerrainHeight-origin.y)/d.y);
      const clearance=(distance:number)=>origin.y+d.y*distance-legacyGroundHeightAt(map,origin.x+d.x*distance,origin.z+d.z*distance);
      const recordGround=(distance:number)=>{
        const x=origin.x+d.x*distance,z=origin.z+d.z*distance,epsilon=.02;
        const nx=(legacyGroundHeightAt(map,x-epsilon,z)-legacyGroundHeightAt(map,x+epsilon,z))/(2*epsilon);
        const nz=(legacyGroundHeightAt(map,x,z-epsilon)-legacyGroundHeightAt(map,x,z+epsilon))/(2*epsilon);
        const norm=Math.hypot(nx,1,nz);
        record('terrain',distance,{x:nx/norm,y:1/norm,z:nz/norm},'ground');
      };
      // Dense bounded sampling plus bisection resolves the low-frequency surface.
      if(start<=end){
        const step=.15;let previous=start,prevHeight=clearance(previous);
        if(prevHeight < -1e-6 || (Math.abs(prevHeight)<1e-6 && clearance(previous+.001)<prevHeight))recordGround(previous);
        else for(let distance=Math.min(previous+step,end);previous<end;distance=Math.min(distance+step,end)){
          const height=clearance(distance);
          if(height<=0&&prevHeight>0){let low=previous,high=distance;for(let i=0;i<15;i++){const middle=(low+high)/2;if(clearance(middle)>0)low=middle;else high=middle;}recordGround(high);break;}
          previous=distance;prevHeight=height;
        }
      }
    }
  }
  return best;
}

export function hasLegacyLineOfSight(map: LegacyMapId, from: ArenaVectorLike, to: ArenaVectorLike, options: ArenaRaycastOptions = {}): boolean {
  if (![from.x,from.y,from.z,to.x,to.y,to.z].every(Number.isFinite)) return false;
  const delta={x:to.x-from.x,y:to.y-from.y,z:to.z-from.z};const distance=Math.hypot(delta.x,delta.y,delta.z);
  return distance<1e-8||raycastLegacyMap(map,from,delta,Math.max(0,distance-1e-5),{...options,minDistance:options.minDistance??1e-5})===null;
}
