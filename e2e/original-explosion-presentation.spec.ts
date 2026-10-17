import {expect,test} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';
test.setTimeout(120000);
test.use({viewport:{width:1280,height:576}});
for(const map of ['barrack','woodlands'] as const)test(`${map} recovered grenade and rocket blast atlas frames render and retire`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`/?map=${map}&e2e=1&quality=${map==='woodlands'?'high':'low'}`);await expect(page.locator('#loading')).toHaveCount(0,{timeout:30000});await page.locator('#deploy').click();await page.evaluate(()=>document.dispatchEvent(new Event('pointerlockerror')));await expect(page.locator('#pause')).toBeVisible();await page.locator('#pause').evaluate(el=>{el.style.display='none';});
 await page.evaluate(()=>{const d=(window as any).__RA_MULTIPLAYER_DEBUG__;d.setLook(d.snapshot().local.yaw,.6);});
 const out='artifacts/fidelity-review/2026-09-30/current';await mkdir(out,{recursive:true});const captures:any[]=[];
 for(const kind of ['grenade','rocket'] as const){
  for(const frame of [0,4,15]){
   await page.evaluate(({kind,frame})=>(window as any).__RA_MULTIPLAYER_DEBUG__.setOriginalExplosionPresentation(kind,frame,8),{kind,frame});
   await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));
   const s=await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot()),b=s.originalExplosionVisuals[0];
   expect(s.originalExplosionVisuals).toHaveLength(1);expect(b.kind).toBe(kind);expect(b.frame).toBe(frame);expect(b.remainingCallbacks).toBe(16-frame);expect(b.opacity).toBe(.5);expect(b.scale).toBe(kind==='grenade'?7:8);expect(b.size[0]).toBeCloseTo(50*ORIGINAL_MAP_SCALE);
   await page.screenshot({path:`${out}/${map}-source-${kind}-atlas-${frame}.png`});captures.push(b);
  }
  await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.advanceEffects(1/30));
  expect(await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot().originalExplosionVisuals.length)).toBe(0);
 }
 expect(errors).toEqual([]);await writeFile(`${out}/${map}-source-explosion-presentation.json`,JSON.stringify({map,captures,errors},null,2));
});

test('late join restores the active blast atlas age through the real room server',async({page,context})=>{
 const receiver=await context.newPage(),errors:string[]=[],serverErrors:unknown[]=[],events:any[]=[],received:any[]=[];
 await receiver.addInitScript(()=>{
  const w=window as any,NativeSocket=window.WebSocket;w.__BLAST_MESSAGE_STATES__=[];
  window.WebSocket=class extends NativeSocket{constructor(url:string|URL,protocols?:string|string[]){super(url,protocols);this.addEventListener('message',event=>{const message=JSON.parse(String(event.data));if(message.type==='snapshot'&&message.snapshot.blasts?.length)queueMicrotask(()=>{w.__BLAST_MESSAGE_STATES__.push({at:performance.now(),snapshot:message.snapshot,client:w.__RA_MULTIPLAYER_DEBUG__?.snapshot()});});});}};
 });
 for(const p of [page,receiver]){p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>{let locked:Element|null=null;Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});});}
 const room='ATLAS'+Date.now().toString(36).toUpperCase();
 let detonationResolve!:(value:any)=>void;const detonation=new Promise<any>(r=>{detonationResolve=r;});
 page.on('websocket',socket=>socket.on('framereceived',frame=>{const m=JSON.parse(String(frame.payload));if(m.type==='error')serverErrors.push(m);if(m.type==='event'){events.push(m.event);if(m.event.type==='explosion')detonationResolve(m.event);}}));
 receiver.on('websocket',socket=>socket.on('framereceived',frame=>{const m=JSON.parse(String(frame.payload));if(m.type==='error')serverErrors.push(m);if(m.type==='snapshot')received.push(m.snapshot);}));
 for(const p of [page,receiver]){await p.goto('/?map=barrack&e2e=1&quality=low');await expect(p.locator('#loading')).toHaveCount(0,{timeout:30000});await p.locator('#mode-online').click();await p.locator('#deploy').click();await p.locator('#room-code').fill(room);}
 await receiver.evaluate(()=>{const w=window as any;w.__ATLAS_RESTORE_SAMPLES__=[];const sample=()=>{if(w.__ATLAS_RESTORE_STOP__)return;const v=w.__RA_MULTIPLAYER_DEBUG__.snapshot().originalExplosionVisuals;if(v.length)w.__ATLAS_RESTORE_SAMPLES__.push({at:performance.now(),visuals:v});requestAnimationFrame(sample);};requestAnimationFrame(sample);});
 await page.locator('#join-room').click();await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');await page.locator('#game canvas').click();await page.evaluate(()=>{const d=(window as any).__RA_MULTIPLAYER_DEBUG__,s=d.snapshot().local;d.setView(s.x,s.z,0,-1.5);});await page.waitForTimeout(600);
 // Dispatch the already prepared join button immediately: mouse actionability
 // waits for rendered layout frames and can consume this 16-callback window.
 const joining=detonation.then(async()=>{await receiver.locator('#join-room').evaluate(button=>(button as HTMLButtonElement).click());});
 await page.mouse.down();try{await expect.poll(()=>events.some(e=>e.type==='projectile_spawned'),{timeout:5000}).toBe(true);}finally{await page.mouse.up();}
 await joining;await expect(receiver.locator('#network-status')).toHaveAttribute('data-state','connected');
 const first=received.find(s=>s.blasts?.length);expect(first).toBeDefined();
 const restore=first.blasts[0];expect(restore.remainingCallbacks).toBeGreaterThan(0);expect(restore.remainingCallbacks).toBeLessThan(16);
 let renderError:unknown;
 try{await expect.poll(()=>receiver.evaluate(id=>(window as any).__ATLAS_RESTORE_SAMPLES__.some((sample:any)=>sample.visuals.some((visual:any)=>visual.id===id)),restore.projectileId),{timeout:2000,intervals:[20]}).toBe(true);}catch(error){renderError=error;}
 const samples=await receiver.evaluate(()=>(window as any).__ATLAS_RESTORE_SAMPLES__);
 const diagnostic=await receiver.evaluate(()=>({messageStates:(window as any).__BLAST_MESSAGE_STATES__,client:(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot()}));
 const diagnosticOut='artifacts/fidelity-review/2026-10-01/current';await mkdir(diagnosticOut,{recursive:true});await writeFile(`${diagnosticOut}/barrack-source-blast-late-join-diagnostic.json`,JSON.stringify({restore,samples,received,events,errors,serverErrors,diagnostic,renderError:renderError?String(renderError):null},null,2));
 if(renderError)throw renderError;
 const visual=samples.flatMap((s:any)=>s.visuals).find((b:any)=>b.id===restore.projectileId);expect(visual).toBeDefined();expect(visual.kind).toBe('grenade');expect(visual.frame).toBeGreaterThan(0);expect(visual.opacity).toBe(.5);
 await receiver.waitForTimeout(700);expect(await receiver.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot().originalExplosionVisuals.length)).toBe(0);
 expect(errors).toEqual([]);expect(serverErrors).toEqual([]);await receiver.evaluate(()=>(window as any).__ATLAS_RESTORE_STOP__=true);const out='artifacts/fidelity-review/2026-09-30/current';await mkdir(out,{recursive:true});await writeFile(`${out}/barrack-source-blast-late-join.json`,JSON.stringify({restore,visual,samples,received,events,errors,serverErrors},null,2));await receiver.close();
});
