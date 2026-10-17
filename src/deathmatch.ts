import { Vector3 } from 'three';

export interface Standing { id:string;name:string;frags:number;deaths:number }

export function rankStandings(standings:readonly Standing[]):Standing[] {
  return [...standings].sort((a,b)=>b.frags-a.frags||a.deaths-b.deaths||a.id.localeCompare(b.id));
}

/** Returns a one-based rank for an identity, or zero when it is not present. */
export function standingPlace(standings:readonly Standing[],competitorId:string):number {
  const index=rankStandings(standings).findIndex((standing)=>standing.id===competitorId);
  return index<0?0:index+1;
}

/** Applies the authoritative counters carried by a kill event before the next snapshot. */
export function recordElimination<T extends Standing>(
  standings:readonly T[],
  killerId:string,
  victimId:string,
  killerFrags:number,
  victimDeaths:number,
):T[] {
  return standings.map((standing)=>{
    if(standing.id!==killerId&&standing.id!==victimId)return standing;
    return {
      ...standing,
      ...(standing.id===killerId?{frags:killerFrags}:{}),
      ...(standing.id===victimId?{deaths:victimDeaths}:{}),
    };
  });
}

export function winnerAtLimit(standings:readonly Standing[],limit:number):Standing|undefined {
  return rankStandings(standings).find(standing=>standing.frags>=limit);
}

export function canCollectDrop(playerFeet:Vector3,dropPosition:Vector3,horizontalRadius=1.25,verticalRadius=1):boolean {
  const dx=dropPosition.x-playerFeet.x;const dz=dropPosition.z-playerFeet.z;return Math.hypot(dx,dz)<horizontalRadius&&Math.abs(dropPosition.y-playerFeet.y)<verticalRadius;
}

export function dropExpired(now:number,expiresAt:number):boolean { return now>=expiresAt; }

/** Chooses the spawn with the greatest distance from its nearest living threat. */
export function chooseSafestSpawn(points: readonly Vector3[], threats: readonly Vector3[]): Vector3 {
  if (points.length === 0) return new Vector3();
  if (threats.length === 0) return points[Math.floor(Math.random()*points.length)].clone();
  let best=points[0];let bestScore=-1;
  for(const point of points){let nearest=Infinity;for(const threat of threats){const dx=point.x-threat.x;const dz=point.z-threat.z;nearest=Math.min(nearest,dx*dx+dz*dz);}if(nearest>bestScore){bestScore=nearest;best=point;}}
  return best.clone();
}
