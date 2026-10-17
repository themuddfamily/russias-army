import * as THREE from 'three';

const resources=new Set(['mfak47','mfpistol','mfspas12','mfdragunov']);
/** One resource generation's weapon-specific FIFO. Adapter identities are
 * retained; native global clone suffixes and actor scheduling are separate. */
export class OriginalMuzzleModelPool {
 private readonly owned=new Map<THREE.Mesh,string>();
 private readonly active=new Set<THREE.Mesh>();
 private readonly fifo=new Map<string,THREE.Mesh[]>();
 private disposed=false;
 constructor(private readonly factory:(resource:string)=>THREE.Mesh,readonly maxModels=256){
  if(!Number.isSafeInteger(maxModels)||maxModels<1)throw Error('Invalid muzzle model budget');
 }
 get isDisposed():boolean{return this.disposed;}
 acquire(resource:string):THREE.Mesh {
  if(this.disposed)throw Error('Muzzle model pool disposed');
  if(!resources.has(resource))throw Error('Invalid muzzle resource');
  const queue=this.fifo.get(resource);let mesh=queue?.[0];
  if(mesh)queue!.shift();
  else{
   if(this.owned.size>=this.maxModels)throw Error('Muzzle model budget requires scene reset');
   mesh=this.factory(resource);
   if(!(mesh instanceof THREE.Mesh)||this.owned.has(mesh))throw Error('Invalid muzzle model factory identity');
   this.owned.set(mesh,resource);
  }
  this.active.add(mesh);return mesh;
 }
 release(mesh:THREE.Mesh):void {
  // Resource teardown can precede clearing a detached actor bundle.
  if(this.disposed)return;
  const resource=this.owned.get(mesh);if(!resource)throw Error('Foreign muzzle model');
  if(!this.active.has(mesh))throw Error('Muzzle model already released');
  mesh.removeFromParent();this.active.delete(mesh);
  const queue=this.fifo.get(resource)??[];if(!this.fifo.has(resource))this.fifo.set(resource,queue);queue.push(mesh);
 }
 stats():Readonly<{allocated:number;active:number;pooled:number}>{
  return Object.freeze({allocated:this.owned.size,active:this.active.size,pooled:this.owned.size-this.active.size});
 }
 /** Full scene reset only, after every live actor lease is released. */
 reset():void {
  if(this.disposed)throw Error('Muzzle model pool disposed');
  if(this.active.size)throw Error('Muzzle reset has active actors');
  this.owned.clear();this.fifo.clear();
 }
 dispose():void {
  if(this.disposed)return;this.disposed=true;
  for(const mesh of this.owned.keys())mesh.removeFromParent();
  this.owned.clear();this.active.clear();this.fifo.clear();
 }
}
