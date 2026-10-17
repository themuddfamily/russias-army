import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {mkdir,writeFile} from 'node:fs/promises';
import {installOriginalAudioProbe} from './original-audio-probe';
test.setTimeout(120_000);
test.use({viewport:{width:1280,height:576}});
type State={doors:{name:string;openedAt:number|null;phase:string;elapsedSeconds:number}[];local:{x:number;y:number;z:number;alive:boolean};originalScene:{colliding:boolean};connection:string};
type Review=Window&{__RA_MULTIPLAYER_DEBUG__:{snapshot():State;setView(x:number,z:number,yaw:number,pitch?:number):void;setLook(yaw:number,pitch?:number):void}};
const state=(p:Page)=>p.evaluate(()=>(window as unknown as Review).__RA_MULTIPLAYER_DEBUG__.snapshot());
const out='artifacts/fidelity-review/2026-09-30/current';
async function start(page:Page,mode:'solo'|'online',quality:string,room?:string){
  await page.addInitScript(installOriginalAudioProbe);
  await page.addInitScript(()=>{
    let locked:Element|null=null;
    Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});
    Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});
    Object.defineProperty(Document.prototype,'exitPointerLock',{configurable:true,value(){locked=null;document.dispatchEvent(new Event('pointerlockchange'));}});
  });
  await page.goto(`/?map=barrack&quality=${quality}&e2e=1`);
  await expect(page.locator('#loading')).toHaveCount(0,{timeout:45_000});
  await page.locator(`#mode-${mode}`).click();await page.locator('#deploy').click();
  if(room){await page.locator('#room-code').fill(room);await page.locator('#join-room').click();await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');}
  await page.locator('#game canvas').click();
}
for(const quality of ['low','high'])test(`Barrack ${quality} original door opens from actual solo approach`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await start(page,'solo',quality);
  await page.evaluate(()=>(window as unknown as Review).__RA_MULTIPLAYER_DEBUG__.setView(3.8,-33.95,-Math.PI/2));
  expect((await state(page)).doors.find(d=>d.name==='door open 28')?.phase).toBe('closed');
  await mkdir(out,{recursive:true});await page.screenshot({path:`${out}/barrack-door-${quality}-closed.png`});
  await page.keyboard.down('KeyW');
  try{await expect.poll(async()=>(await state(page)).local.x,{timeout:12_000}).toBeGreaterThan(5.65);}finally{await page.keyboard.up('KeyW');}
  await expect.poll(async()=>(await state(page)).doors.find(d=>d.name==='door open 28')?.phase).toBe('open');
  const after=await state(page);expect(after.originalScene.colliding).toBe(false);expect(after.local.alive).toBe(true);expect(errors).toEqual([]);
  const audio=await page.evaluate(()=>(()=>{const audio=(window as any).__RA_ORIGINAL_AUDIO__;return {decodedDuration:audio.decoded.door?.duration??0,starts:audio.events.filter((e:any)=>e.kind==='start'&&e.name==='door').length};})());
  expect(audio.decodedDuration).toBeCloseTo(.864,3);expect(audio.starts).toBe(1);
  await page.screenshot({path:`${out}/barrack-door-${quality}-open.png`});
  await writeFile(`${out}/barrack-door-${quality}.json`,JSON.stringify({verified:true,after,audio,errors},null,2));
});
test('Barrack online source proximity opens shared door and persists for late join',async({page,context},testInfo)=>{
  const room=`DOOR${Date.now().toString(36).toUpperCase()}`,peer=await context.newPage();
  const errors:unknown[]=[];
  for(const p of [page,peer])p.on('websocket',s=>s.on('framereceived',({payload})=>{try{const m=JSON.parse(String(payload));if(m.type==='error')errors.push(m);}catch{}}));
  await start(page,'online','low',room);await start(peer,'online','low',room);
  const evidence=JSON.parse(await readFile('docs/research-evidence/2026-09-30/DEFAULT_BARRACK_DOOR_ROUTE.json','utf8')) as {door:string;waypoints:{x:number;z:number}[]};
  const door=evidence.door,before=await state(page);expect(before.doors.find(d=>d.name===door)?.openedAt).toBeNull();
  await page.keyboard.down('KeyW');
  try{await page.evaluate(async route=>{
    const debug=(window as unknown as Review).__RA_MULTIPLAYER_DEBUG__;
    let index=1;const began=performance.now();
    while(index<route.length){
      const p=debug.snapshot().local,t=route[index];
      if(Math.hypot(p.x-t.x,p.z-t.z)<.3){index++;continue;}
      if(performance.now()-began>60_000)throw new Error(JSON.stringify({index,p,target:t,doors:debug.snapshot().doors}));
      debug.setLook(Math.atan2(p.x-t.x,p.z-t.z));
      await new Promise<void>(r=>requestAnimationFrame(()=>r()));
    }
  },evidence.waypoints);
  await expect.poll(async()=>(await state(page)).doors.find(d=>d.name===door)?.openedAt,{timeout:12_000}).not.toBeNull();
  }finally{await page.keyboard.up('KeyW');await testInfo.attach('source-door-route',{body:JSON.stringify({evidence,current:await state(page),errors},null,2),contentType:'application/json'});}
  await expect.poll(async()=>(await state(peer)).doors.find(d=>d.name===door)?.phase).toBe('open');
  const a=await state(page),b=await state(peer);
  expect(a.doors.find(d=>d.name===door)?.openedAt).toBe(b.doors.find(d=>d.name===door)?.openedAt);
  await peer.close();const late=await context.newPage();await start(late,'online','low',room);
  const c=await state(late);expect(c.doors.find(d=>d.name===door)).toMatchObject({openedAt:a.doors.find(d=>d.name===door)!.openedAt,phase:'open'});
  expect(errors).toEqual([]);await mkdir(out,{recursive:true});await writeFile(`${out}/barrack-doors-online.json`,JSON.stringify({verified:true,before,a,b,late:c,errors},null,2));await late.close();
});
