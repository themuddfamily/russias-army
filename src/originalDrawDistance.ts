interface Point {x:number;y:number;z:number}
interface DrawBounds {center:Point;radius:number}

/** Finite renderer policy covering the loaded static scene and sky from any eye.
 * Native yon is not copied into the browser's depth projection.
 */
export function originalDrawDistance(bounds:DrawBounds,eye:Point,minimum=260):number {
  if(![bounds.center.x,bounds.center.y,bounds.center.z,bounds.radius,eye.x,eye.y,eye.z,minimum].every(Number.isFinite)
    ||bounds.radius<=0||minimum<=0)throw Error('Invalid original draw bounds');
  const far=Math.ceil(Math.max(minimum,Math.hypot(eye.x-bounds.center.x,eye.y-bounds.center.y,eye.z-bounds.center.z)+bounds.radius+1));
  if(!Number.isFinite(far))throw Error('Original draw distance overflow');
  return far;
}
