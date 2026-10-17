import * as THREE from 'three';

export type OriginalProjectileModelKind='launcher'|'rpg';
/** Separate source grenade/rocket model FIFOs. GPU resources are borrowed;
 * native named rigid-body reuse and global clone numbering are separate. */
export class OriginalProjectileModelPool {
 private readonly owned=new Map<THREE.Mesh,OriginalProjectileModelKind>();
 private readonly active=new Set<THREE.Mesh>();
 private readonly fifo=new Map<OriginalProjectileModelKind,THREE.Mesh[]>();
 private disposed=false;
 constructor(private readonly factory:(weapon:OriginalProjectileModelKind)=>THREE.Mesh,readonly maxModels=256){
  if(!Number.isSafeInteger(maxModels)||maxModels<1)throw Error('Invalid projectile model budget');
 }
 get isDisposed():boolean{return this.disposed;}
 hasLease(mesh:THREE.Mesh):boolean{return this.active.has(mesh);}
 acquire(weapon:OriginalProjectileModelKind):THREE.Mesh {
  if(this.disposed)throw Error('Projectile model pool disposed');
  if(weapon!=='launcher'&&weapon!=='rpg')throw Error('Invalid projectile model kind');
  const queue=this.fifo.get(weapon);let mesh=queue?.[0];
  if(mesh)queue!.shift();
  else{
   if(this.owned.size>=this.maxModels)throw Error('Projectile model budget requires scene reset');
   mesh=this.factory(weapon);
   if(!(mesh instanceof THREE.Mesh)||this.owned.has(mesh))throw Error('Invalid projectile model factory identity');
   this.owned.set(mesh,weapon);
  }
  this.active.add(mesh);return mesh;
 }
 release(mesh:THREE.Mesh):void {
  if(this.disposed)return;
  const weapon=this.owned.get(mesh);if(!weapon)throw Error('Foreign projectile model');
  if(!this.active.has(mesh))throw Error('Projectile model already released');
  mesh.removeFromParent();this.active.delete(mesh);
  const queue=this.fifo.get(weapon)??[];if(!this.fifo.has(weapon))this.fifo.set(weapon,queue);queue.push(mesh);
 }
 stats():Readonly<{allocated:number;active:number;pooled:number}>{
  return Object.freeze({allocated:this.owned.size,active:this.active.size,pooled:this.owned.size-this.active.size});
 }
 reset():void {
  if(this.disposed)throw Error('Projectile model pool disposed');
  if(this.active.size)throw Error('Projectile reset has active actors');
  this.owned.clear();this.fifo.clear();
 }
 dispose():void {
  if(this.disposed)return;this.disposed=true;
  for(const mesh of this.owned.keys())mesh.removeFromParent();
  this.owned.clear();this.active.clear();this.fifo.clear();
 }
}
