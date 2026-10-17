import {expect,test} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const flightEvidence=new WeakMap<object,unknown>();
const artifactDirectory=process.env.RA_FIDELITY_ARTIFACT_DIR??'artifacts/fidelity-review/2026-10-01/current';
const captureSourceViewTiming=process.env.RA_SOURCE_VIEW_TIMINGS==='1';
test.afterEach(async({page},info)=>{
 if(info.status===info.expectedStatus)return;
 const state=await page.evaluate(()=>{const w=window as any;return {current:w.__RA_MULTIPLAYER_DEBUG__?.snapshot(),samples:w.__SOURCE_EXPLOSIVE_SAMPLES__,shotRelease:w.__SOURCE_SHOT_RELEASE__,sourceViewTimings:w.__RA_MULTIPLAYER_DEBUG__?.readSourceViewTimings()};}).catch(()=>null);
 const out=artifactDirectory;await mkdir(out,{recursive:true});
 await writeFile(`${out}/source-angular-${info.title.replace(/[^a-zA-Z0-9]+/g,'-')}-failure.json`,JSON.stringify({state,packets:flightEvidence.get(page),errors:info.errors},null,2));
});
function verifyAngularFlight(projectiles:any[]){
 expect(projectiles.length).toBeGreaterThan(0);
 for(const p of projectiles){
  expect(Object.values(p.orientation).every(Number.isFinite)).toBe(true);
  expect(Object.values(p.angularVelocity).every(Number.isFinite)).toBe(true);
  expect(Math.hypot(p.orientation.x,p.orientation.y,p.orientation.z,p.orientation.w)).toBeCloseTo(1,6);
 }
 expect(projectiles.some(p=>Math.hypot(p.angularVelocity.x,p.angularVelocity.y,p.angularVelocity.z)>1e-5)).toBe(true);
 expect(projectiles.some(p=>Math.hypot(p.orientation.x,p.orientation.y,p.orientation.z)>1e-5)).toBe(true);
}
for(const map of ['barrack','woodlands'] as const)test(`${map} authoritative RG6 bounces until source fuse and keeps a persistent blast`,async({page})=>{
 const errors:string[]=[],serverErrors:unknown[]=[],spawned:any[]=[],explosions:any[]=[],contacts:any[]=[],snapshots:any[]=[],damaged:any[]=[];
 flightEvidence.set(page,{errors,serverErrors,spawned,explosions,contacts,snapshots,damaged});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('websocket',socket=>socket.on('framereceived',frame=>{
  const m=JSON.parse(String(frame.payload));if(m.type==='error')serverErrors.push(m);
  if(m.type==='snapshot')snapshots.push(m.snapshot);
  if(m.type==='event'){
   if(m.event.type==='projectile_spawned')spawned.push(m.event);
   if(m.event.type==='explosion')explosions.push(m.event);
   if(m.event.type==='projectile_contact')contacts.push(m.event);
   if(m.event.type==='rg6_boost')errors.push('Authored detonation boost received');
   if(m.event.type==='damaged')damaged.push(m.event);
  }
 }));
 await page.addInitScript(()=>{let locked:Element|null=null;Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});});
 // Release through the ordinary mouseup handler in the browser message task.
 // A runner-side poll can arrive after the next source fire callback.
 await page.addInitScript(()=>{
  const w=window as any,NativeSocket=window.WebSocket;
  const release=w.__SOURCE_SHOT_RELEASE__={armed:false,clientId:null,projectileId:null,receivedAt:null,releases:0};
  window.WebSocket=class extends NativeSocket{
   constructor(url:string|URL,protocols?:string|string[]){
    super(url,protocols);
    this.addEventListener('message',event=>{
     if(typeof event.data!=='string')return;
     const message=JSON.parse(event.data);
     if(message.type==='welcome')release.clientId=message.clientId;
     const projectile=message.type==='event'&&message.event.type==='projectile_spawned'?message.event.data.projectile:null;
     if(release.armed&&release.clientId&&projectile?.attackerId===release.clientId&&projectile.weapon==='launcher'){
      release.armed=false;release.projectileId=projectile.projectileId;release.receivedAt=performance.now();release.releases++;
      window.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}));
     }
    });
   }
  };
 });
 await page.goto(`/?map=${map}&e2e=1&quality=low`);await expect(page.locator('#loading')).toHaveCount(0,{timeout:30000});
 if(captureSourceViewTiming)await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.enableSourceViewTimings());
 await page.locator('#mode-online').click();await page.locator('#deploy').click();await page.locator('#room-code').fill('FUSE'+Date.now().toString(36).toUpperCase());await page.locator('#join-room').click();
 await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected',{timeout:10000});
 await page.locator('#game canvas').click();
 await page.evaluate(()=>{const d=(window as any).__RA_MULTIPLAYER_DEBUG__,p=d.snapshot().local;d.setView(p.x,p.z,0,-1.5);});
 await page.waitForTimeout(800);
 await page.evaluate(()=>(window as any).__SOURCE_SHOT_RELEASE__.armed=true);
 await page.mouse.down();try{await expect.poll(()=>spawned.length,{timeout:5000}).toBe(1);}finally{await page.mouse.up();}
 const spawn=spawned[0];expect(spawn.data.projectile.remainingCallbacks).toBe(60);
 const shotRelease=await page.evaluate(()=>(window as any).__SOURCE_SHOT_RELEASE__);
 expect(shotRelease.releases).toBe(1);expect(shotRelease.projectileId).toBe(spawn.data.projectile.projectileId);expect(shotRelease.armed).toBe(false);
 await page.waitForTimeout(200);expect(explosions).toHaveLength(0);
 await expect.poll(()=>explosions.length,{timeout:5000}).toBe(1);
 // A shot arrives between world callbacks. Prove the exact remaining actor
 // count against a completed physics epoch, rather than reset the world clock
 // at shot receipt. Epoch doubles accumulate a few microseconds per callback.
 const flight=snapshots.find(s=>Number.isFinite(s.sourcePhysicsTime)&&s.projectiles.some((p:any)=>p.projectileId===spawn.data.projectile.projectileId));
 expect(flight).toBeDefined();const flying=flight.projectiles.find((p:any)=>p.projectileId===spawn.data.projectile.projectileId);
 expect(explosions[0].serverTime-flight.sourcePhysicsTime).toBeCloseTo((flying.remainingCallbacks-1)*1000/30,1);
 expect(explosions[0].serverTime-spawn.serverTime).toBeGreaterThanOrEqual(58*1000/30-.05);
 expect(explosions[0].serverTime-spawn.serverTime).toBeLessThanOrEqual(59*1000/30+.05);
 expect(explosions[0].data.remainingCallbacks).toBe(16);
 await expect.poll(()=>snapshots.some(s=>s.blasts?.some((b:any)=>b.projectileId===spawn.data.projectile.projectileId)),{timeout:1000}).toBe(true);
 await page.waitForTimeout(700);
 expect(snapshots.at(-1).blasts).toEqual([]);expect(snapshots.at(-1).projectiles).toEqual([]);
 expect(spawned).toHaveLength(1);expect(explosions).toHaveLength(1);
 verifyAngularFlight(snapshots.flatMap(s=>s.projectiles));
 expect(damaged).toHaveLength(16);expect(damaged.every(e=>e.data.damage===5)).toBe(true);expect(errors).toEqual([]);expect(serverErrors).toEqual([]);
 const out=artifactDirectory;await mkdir(out,{recursive:true});await writeFile(`${out}/${map}-source-angular-explosives.json`,JSON.stringify({spawned,explosions,contacts,damaged,snapshots,errors,serverErrors,shotRelease},null,2));
});

for(const map of ['barrack','woodlands'] as const)test(`${map} solo RG6 survives contact until its fuse and retains blast state`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{let locked:Element|null=null;Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});});
 await page.goto(`/?map=${map}&e2e=1&quality=low`);await expect(page.locator('#loading')).toHaveCount(0,{timeout:30000});await page.locator('#deploy').click();await page.locator('#game canvas').click();
 await page.evaluate(()=>{const d=(window as any).__RA_MULTIPLAYER_DEBUG__,p=d.snapshot().local;d.setView(p.x,p.z,0,-1.5);});await page.waitForTimeout(600);
 const before=await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());
 await page.evaluate(()=>{const w=window as any;w.__SOURCE_EXPLOSIVE_SAMPLES__=[];const sample=()=>{if(w.__SOURCE_EXPLOSIVE_STOP__)return;const s=w.__RA_MULTIPLAYER_DEBUG__.snapshot();w.__SOURCE_EXPLOSIVE_SAMPLES__.push({at:performance.now(),health:s.local.health,local:s.local,movement:s.movement,doors:s.doors,barrels:s.originalBarrels.bodies,sourceLocalTime:s.sourceGunTiming.localTime,...s.originalExplosives});requestAnimationFrame(sample);};requestAnimationFrame(sample);});
 await page.mouse.down();try{await expect.poll(async()=>await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot().loadout.ammo.launcher),{timeout:5000}).toBe(5);}finally{await page.mouse.up();}
 const early=await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());expect(early.originalExplosives.projectiles).toHaveLength(1);expect(early.originalExplosives.blasts).toHaveLength(0);
 await page.waitForTimeout(200);const contact=await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());expect(contact.originalExplosives.projectiles).toHaveLength(1);expect(contact.originalExplosives.contactCount).toBeGreaterThan(0);
 await expect.poll(async()=>await page.evaluate(()=>(window as any).__SOURCE_EXPLOSIVE_SAMPLES__.some((s:any)=>s.blasts.length===1)),{timeout:5000}).toBe(true);
 const blast=await page.evaluate(()=>(window as any).__SOURCE_EXPLOSIVE_SAMPLES__.find((s:any)=>s.blasts.length===1));expect(blast.projectiles).toHaveLength(0);
 await page.waitForTimeout(700);const after=await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());expect(after.originalExplosives.blasts).toHaveLength(0);expect(after.loadout.ammo.launcher).toBe(5);expect(errors).toEqual([]);
 const samples=await page.evaluate(()=>{const w=window as any;w.__SOURCE_EXPLOSIVE_STOP__=true;return w.__SOURCE_EXPLOSIVE_SAMPLES__;});
 const out=artifactDirectory;await mkdir(out,{recursive:true});await page.screenshot({path:`${out}/${map}-source-angular-explosives-solo.png`});await writeFile(`${out}/${map}-source-angular-explosives-solo.json`,JSON.stringify({before,early,contact,blast,after,samples,errors},null,2));
 verifyAngularFlight(samples.flatMap((s:any)=>s.projectiles));
});
