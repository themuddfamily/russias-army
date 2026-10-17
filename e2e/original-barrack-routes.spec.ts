import {test,expect,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {installOriginalAudioProbe} from './original-audio-probe';
test.setTimeout(120_000);
test.use({viewport:{width:1280,height:576}});
type State={doors:{name:string;openedAt:number|null;phase:string;elapsedSeconds:number}[];local:{x:number;y:number;z:number;alive:boolean};originalScene:{colliding:boolean};connection:string;movement:{grounded:boolean}};
type Review=Window&{__RA_MULTIPLAYER_DEBUG__:{snapshot():State;setView(x:number,z:number,yaw:number,pitch?:number):void;setLook(yaw:number,pitch?:number):void;setRegisteredReferenceView(view:{station:string;position:number[];target:number[];up:number[];aspect:number;points:number[][];showWeapon?:boolean}):unknown}};
const state=(p:Page)=>p.evaluate(()=>(window as unknown as Review).__RA_MULTIPLAYER_DEBUG__.snapshot());
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
test('Barrack recorded source ramp faces1/28 reaches the upper extension',async({page},testInfo)=>{
  test.setTimeout(60_000);
  const out=testInfo.outputPath('route-evidence');
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await start(page,'solo','low');
  await page.evaluate(()=>{const d=(window as unknown as Review).__RA_MULTIPLAYER_DEBUG__;d.setView(33.75053530157638,74.58027011743222,-1.5686401891617936);});
  await mkdir(out,{recursive:true});
  const before=await state(page);
  // The underlying ramp is below intersecting terrain: use Game's grounded start.
  expect(before.local.y).toBeGreaterThan(2);
  await page.screenshot({path:`${out}/ramp-1-28-before.png`});
  const samples:State[]=[];await page.keyboard.down('KeyW');
  try{await expect.poll(async()=>{const s=await state(page);samples.push(s);return s.local.x;},{timeout:15_000}).toBeGreaterThan(48.04105965819403);}
  finally{await page.keyboard.up('KeyW');const after=await state(page);await page.screenshot({path:`${out}/ramp-1-28-after.png`});
    await writeFile(`${out}/ramp-1-28.json`,JSON.stringify({scope:'Actual Game solo keyboard ramp traversal; source geometry candidate, no continuous historical footage registration',target:{x:48.04105965819403,z:74.54945773232193},before,after,samples},null,2));
    await testInfo.attach('actual-ramp-traversal',{body:JSON.stringify({before,after,samples}),contentType:'application/json'});}
  const final=await state(page);
  expect(final.local.y).toBeGreaterThan(6.2);
  expect(final.local.alive).toBe(true);
  expect(final.originalScene.colliding).toBe(false);
  expect(errors).toEqual([]);
});


test('Barrack door29 opens on a supported hinge-side keyboard approach',async({page},testInfo)=>{
  test.setTimeout(60_000);
  const out=testInfo.outputPath('door29-evidence');
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await start(page,'solo','low');
  // Source panel-derived lane, extended backwards to begin outside proximity.
  const near={x:4.240488095349329,z:-31.196555837520325};
  const far={x:5.93392409812181,z:-31.19683841709104};
  const length=Math.hypot(far.x-near.x,far.z-near.z);
  const from={x:near.x-.75*(far.x-near.x)/length,z:near.z-.75*(far.z-near.z)/length};
  const yaw=Math.atan2(near.x-far.x,near.z-far.z);
  await page.evaluate(({from,yaw})=>(window as unknown as Review).__RA_MULTIPLAYER_DEBUG__.setView(from.x,from.z,yaw),{from,yaw});
  const before=await state(page);
  expect(before.doors.find(d=>d.name==='door open 29')?.openedAt).toBeNull();
  await mkdir(out,{recursive:true});await page.screenshot({path:`${out}/door29-before.png`});
  const samples:State[]=[];await page.keyboard.down('KeyW');
  try{await expect.poll(async()=>{const s=await state(page);samples.push(s);return s.local.x;},{timeout:15_000}).toBeGreaterThan(far.x);}
  finally{await page.keyboard.up('KeyW');const after=await state(page);
    await page.screenshot({path:`${out}/door29-after.png`});
    await writeFile(`${out}/door29.json`,JSON.stringify({scope:'Actual solo supported approach to a second recovered panel; no historical route registration',from,far,yaw,before,after,samples,errors},null,2));}
  const after=await state(page);
  expect(after.doors.find(d=>d.name==='door open 29')?.openedAt).not.toBeNull();
  expect(after.local.alive).toBe(true);expect(after.originalScene.colliding).toBe(false);expect(errors).toEqual([]);
});

test('Barrack spawn5 continuous ramp and door5 route',async({page},testInfo)=>{
 test.setTimeout(120_000);
 await page.addInitScript(()=>{Math.random=()=>.99;});
 await start(page,'solo','low');
 const before=await state(page);expect(before.local.x).toBeCloseTo(-3.9054117647058826,1);expect(before.local.z).toBeCloseTo(55.60658823529412,1);
 const out=testInfo.outputPath('connected-evidence');await mkdir(out,{recursive:true});await page.screenshot({path:`${out}/before.png`});
 const waypoints=[[-4.037931181066177,63.44768566176471],[-17.217797794117647,63.44768566176471],[-19,63.5],[-19,66],[-8,66],[-8,75.5],[-1.316875,75.5],[-1.316875631010273,74.26773140722996],[-1.3168759265061984,72.57769172419226]];
 let result:unknown=null;await page.keyboard.down('KeyW');
 try{result=await page.evaluate(async route=>{
  const d=(window as unknown as Review).__RA_MULTIPLAYER_DEBUG__,samples:unknown[]=[],segments:unknown[]=[];let index=0;const began=performance.now();
  while(index<route.length){const s=d.snapshot(),t=route[index],distance=Math.hypot(s.local.x-t[0],s.local.z-t[1]);samples.push({elapsed:performance.now()-began,index,distance,state:s});
   if(!s.local.alive||performance.now()-began>60_000||samples.length>5000)return{status:s.local.alive?'did_not_complete':'player_died',index,segments,samples};
   if(distance<.28){segments.push({index,state:s});index++;continue;}
   d.setLook(Math.atan2(s.local.x-t[0],s.local.z-t[1]),0);await new Promise<void>(r=>requestAnimationFrame(()=>r()));
  }return{status:'completed',index,segments,samples};
 },waypoints);}
 finally{await page.keyboard.up('KeyW');const after=await state(page);await page.screenshot({path:`${out}/after.png`});await writeFile(`${out}/result.json`,JSON.stringify({scope:'Actual Game continuous control route from naturally selected spawn5; no position override; authored solo bots and dynamic barrels remain active',before,after,waypoints,result},null,2));}
 expect((result as {status:string}).status).toBe('completed');
 expect((result as {segments:unknown[]}).segments).toHaveLength(9);
 expect((result as {samples:{state:State}[]}).samples.filter(sample=>sample.state.originalScene.colliding)).toEqual([]);
 expect((await state(page)).local.alive).toBe(true);
 expect((await state(page)).doors.find(d=>d.name==='door open 5')?.openedAt).not.toBeNull();
});

test('Barrack room80 central window sill permits ordinary keyboard exit',async({page},testInfo)=>{
 test.setTimeout(60_000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await start(page,'solo','low');
 // Explicit one-time source-supported room placement. The floor-only setView
 // helper would put this fixture beneath the room floor. This existing camera
 // hook supplies the full eye position; it is not a historical-camera fit.
 await page.evaluate(()=>{
  const d=(window as unknown as Review).__RA_MULTIPLAYER_DEBUG__;
  const eye=[50.7,10.74582918772978+1.72,64.24];
  d.setRegisteredReferenceView({station:'interior',position:eye,target:[eye[0]-10,eye[1],eye[2]],up:[0,1,0],aspect:1280/576,points:[],showWeapon:true});
  document.getElementById('resume')!.click();
 });
 const before=await state(page);
 expect(before.local.x).toBeCloseTo(50.7,1);expect(before.local.z).toBeCloseTo(64.24,1);
 expect(before.local.y).toBeGreaterThan(10.7);expect(before.local.y).toBeLessThan(10.9);
 expect(before.originalScene.colliding).toBe(false);
 const out=testInfo.outputPath('window-sill-evidence');await mkdir(out,{recursive:true});
 await page.screenshot({path:`${out}/before.png`});
 const samples:State[]=[];await page.keyboard.down('KeyW');
 try{await expect.poll(async()=>{const s=await state(page);samples.push(s);return s.local.x;},{timeout:15_000,intervals:[20]}).toBeLessThan(48.6);}
 finally{await page.keyboard.up('KeyW');}
 await expect.poll(async()=>(await state(page)).local.y,{timeout:5000,intervals:[20]}).toBeLessThan(10.4);
 const after=await state(page);await page.screenshot({path:`${out}/after.png`});
 await writeFile(`${out}/result.json`,JSON.stringify({scope:'Actual Game ordinary-keyboard exit across source room80/window-sill118; one initial supported-room fixture, no subsequent placement or jump; no historical camera/native physics/spawn connectivity claim',before,after,samples,errors},null,2));
 expect(after.local.alive).toBe(true);expect(after.originalScene.colliding).toBe(false);
 expect(samples.some(s=>s.originalScene.colliding)).toBe(false);expect(errors).toEqual([]);
});

test('Barrack spawn3 walks through ramp55 and the room80 window',async({page},testInfo)=>{
 test.setTimeout(60_000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{Math.random=()=>.6;});
 await start(page,'solo','low');
 const before=await state(page);
 expect(before.local.x).toBeCloseTo(77.15026989080883,1);
 expect(before.local.z).toBeCloseTo(34.116705882352946,1);
 expect(before.originalScene.colliding).toBe(false);
 const out=testInfo.outputPath('spawn3-south-evidence');await mkdir(out,{recursive:true});
 await page.screenshot({path:`${out}/before.png`});
 let result:{status:string;segments:number;samples:{local:State['local'];colliding:boolean;distance:number;elapsed:number;segment:number}[]}|null=null;
 let supportedAfterRelease:State|null=null;
 const settlingSamples:State[]=[];
 await page.keyboard.down('KeyW');
 try{result=await page.evaluate(async()=>{
  const d=(window as unknown as Review).__RA_MULTIPLAYER_DEBUG__,samples:{local:State['local'];colliding:boolean;distance:number;elapsed:number;segment:number}[]=[];
  const waypoints=[[77.12,68],[74,71],[71,71.8],[68,71.8],[48.4,71.88648],[35.1,71.88649],[34.3,64.24],[47.7,64.24],[50.7,64.24]];
  let segment=0;
  const began=performance.now();
  while(true){
   const s=d.snapshot(),target=waypoints[segment],distance=Math.hypot(s.local.x-target[0],s.local.z-target[1]),elapsed=performance.now()-began;
   samples.push({local:s.local,colliding:s.originalScene.colliding,distance,elapsed,segment});
   if(distance<.28){segment++;if(segment===waypoints.length)return{status:'completed',segments:segment,samples};
    if(segment===6){
     // Release through Game's ordinary key handler before turning north.
     // Eight animation frames are browser scheduling, not eight physics callbacks.
     window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW',key:'w',bubbles:true}));
     for(let frame=0;frame<8;frame++)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
     window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',key:'w',bubbles:true}));
    }
    continue;}

   if(!s.local.alive||elapsed>30_000||samples.length>5000)return{status:s.local.alive?'did_not_complete':'player_died',segments:segment,samples};
   d.setLook(Math.atan2(s.local.x-target[0],s.local.z-target[1]),0);
   await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
  }
 });}
 finally{await page.keyboard.up('KeyW');
  try{await expect.poll(async()=>{const s=await state(page);settlingSamples.push(s);if(s.movement.grounded&&s.local.alive&&!s.originalScene.colliding&&s.local.y>10.73&&s.local.y<10.80&&s.local.x>50.23){supportedAfterRelease=s;return true;}return false;},{timeout:2000}).toBe(true);}
  finally{const after=await state(page);await page.screenshot({path:`${out}/after.png`});
   await writeFile(`${out}/result.json`,JSON.stringify({scope:'Actual Game continuous keyboard-only spawn3 corridor, ramp55/57 ascent, upper platform and room80 window entry; ordinary key release for eight animation frames before north turn; supported room-floor release observed, no placement or jump; authored solo entities active; no native-route claim',before,after,result,supportedAfterRelease,settlingSamples,errors},null,2));}}
 expect(result?.status).toBe('completed');expect(result?.segments).toBe(9);expect(result?.samples.some(s=>s.colliding)).toBe(false);
 const after=await state(page);expect(after.local.alive).toBe(true);expect(after.originalScene.colliding).toBe(false);
 expect(after.movement.grounded).toBe(true);expect(after.local.x).toBeGreaterThan(50.23);expect(after.local.x).toBeLessThan(53.5);expect(after.local.z).toBeCloseTo(64.24,0);expect(after.local.y).toBeGreaterThan(10.73);expect(after.local.y).toBeLessThan(10.80);
 expect(errors).toEqual([]);
});
