import {expect,test} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

test.setTimeout(90_000);
for(const map of ['barrack','woodlands'])test(`${map} real online GI uses triangles and authority skeletal phase`,async({browser})=>{
 const contexts:any[]=[],errors:string[]=[],serverErrors:any[]=[],snapshots:any[]=[],shots:any[]=[],outgoing:any[]=[];
 const room='GIPOSE'+Date.now().toString(36).toUpperCase();
 async function join(name:string){
  const context=await browser.newContext({viewport:{width:1280,height:576}});contexts.push(context);const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('websocket',s=>{s.on('framesent',f=>outgoing.push({name,at:Date.now(),message:JSON.parse(String(f.payload))}));s.on('framereceived',f=>{const m=JSON.parse(String(f.payload));if(m.type==='error')serverErrors.push({name,at:Date.now(),message:m});if(name==='VIEWER'&&m.type==='snapshot')snapshots.push(m.snapshot);if(m.type==='event'&&m.event.type==='shot')shots.push(m.event);});});
  await page.addInitScript(()=>{let locked:Element|null=null;Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});});
  await page.goto(`/?map=${map}&e2e=1&quality=low`);await expect(page.locator('#loading')).toHaveCount(0,{timeout:30000});
  await page.locator('#mode-online').click();await page.locator('#callsign').fill(name);await page.locator('#deploy').click();await page.locator('#room-code').fill(room);await page.locator('#join-room').click();await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');if(!await page.evaluate(()=>!!document.pointerLockElement))await page.locator('#game canvas').click();await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(true);return page;
 }
 try{
  const actor=await join('ACTOR'),viewer=await join('VIEWER');const read=(page:any)=>page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());
  const initial=await read(actor),id=initial.clientId;
  await expect.poll(async()=>(await read(viewer)).remotes.length).toBe(1);
  const remote=async()=>(await read(viewer)).remotes.find((p:any)=>p.id===id);
  await expect.poll(async()=>(await remote()).hitGeometry).toEqual({meshes:1,triangles:832,skinned:true});
  await actor.keyboard.down('KeyW');await actor.waitForTimeout(900);await actor.keyboard.up('KeyW');
  await expect.poll(()=>snapshots.some(s=>s.players.some((p:any)=>p.id===id&&p.sourceMotionTime>50))).toBe(true);
  await expect.poll(async()=>{const r=await remote();return Math.abs(r.original.timeMs-r.sourceMotionTime);}).toBeLessThan(.000001);
  const moving=await read(viewer);expect(moving.remotes[0].original.vertices).toBe(742);
  await actor.keyboard.down('Digit1');await actor.waitForTimeout(150);await actor.keyboard.up('Digit1');await actor.waitForTimeout(300);await actor.mouse.down();await actor.waitForTimeout(60);await actor.mouse.up();
  await expect.poll(()=>shots.some(s=>s.data.playerId===id&&s.data.shot.weapon==='pistol')).toBe(true);
  await expect.poll(()=>snapshots.some(s=>s.players.some((p:any)=>p.id===id&&p.sourceMotionTime>=1000))).toBe(true);
  await expect.poll(async()=>{const r=await remote();return Math.abs(r.original.timeMs-r.sourceMotionTime);}).toBeLessThan(.000001);
  const afterShot=await read(viewer);expect(afterShot.remotes[0].hitGeometry).toEqual({meshes:1,triangles:832,skinned:true});
  const out='artifacts/fidelity-review/2026-10-01/current';await mkdir(out,{recursive:true});await viewer.screenshot({path:`${out}/${map}-source-gi-authority.png`});
  await writeFile(`${out}/${map}-source-gi-authority.json`,JSON.stringify({initial,moving,afterShot,snapshots,shots,outgoing,errors,serverErrors},null,2));
  expect(errors).toEqual([]);expect(serverErrors).toEqual([]);
 }finally{for(const context of contexts)await context.close();}
});
