import {expect,test} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

test.setTimeout(60_000);
test.use({viewport:{width:1280,height:576}});
for(const map of ['barrack','woodlands'] as const)for(const mode of ['solo','online'] as const){
 test(`${map} ${mode} held Space repeats source jumps after support and lands`,async({page})=>{
  const errors:string[]=[],serverErrors:unknown[]=[],authority:any[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('websocket',socket=>socket.on('framereceived',frame=>{
   const m=JSON.parse(String(frame.payload));if(m.type==='error')serverErrors.push(m);
   if(m.type==='snapshot')authority.push(m.snapshot);
  }));
  await page.addInitScript(()=>{
   let locked:Element|null=null;
   Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});
   Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});
  });
  await page.goto(`/?map=${map}&e2e=1&quality=low`);
  await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
  await page.locator(`#mode-${mode}`).click();await page.locator('#deploy').click();
  if(mode==='online'){
   await page.locator('#room-code').fill('BODY'+Date.now().toString(36).toUpperCase());await page.locator('#join-room').click();
   await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected',{timeout:10_000});
  }
  await page.locator('#game canvas').click();await page.waitForTimeout(200);
  const before=await page.evaluate(()=>{
   const w=window as any,debug=w.__RA_MULTIPLAYER_DEBUG__,before=debug.snapshot();
   w.__SOURCE_PLAYER_REVIEW__={samples:[],launches:0,previousVelocity:0,stopped:false};
   const sample=()=>{
    const r=w.__SOURCE_PLAYER_REVIEW__;if(r.stopped)return;
    const s=debug.snapshot(),vy=s.movement.velocity.y;
    if(vy>4&&r.previousVelocity<=0)r.launches++;
    r.previousVelocity=vy;r.samples.push({at:performance.now(),local:s.local,movement:s.movement,authoritativeLocal:s.authoritativeLocal});requestAnimationFrame(sample);
   };requestAnimationFrame(sample);return before;
  });
  await page.keyboard.down('Space');
  try{await expect.poll(()=>page.evaluate(()=>(window as any).__SOURCE_PLAYER_REVIEW__.launches),{timeout:10_000}).toBeGreaterThanOrEqual(2);}
  finally{await page.keyboard.up('Space');}
  await expect.poll(()=>page.evaluate(()=>{const s=(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot();return s.movement.grounded&&Math.abs(s.movement.velocity.y)<.1&&!s.originalScene.colliding;}),{timeout:5_000}).toBe(true);
  const evidence=await page.evaluate(()=>{
   const w=window as any;w.__SOURCE_PLAYER_REVIEW__.stopped=true;
   return {review:w.__SOURCE_PLAYER_REVIEW__,after:w.__RA_MULTIPLAYER_DEBUG__.snapshot()};
  });
  expect(Math.max(...evidence.review.samples.map((s:any)=>s.local.y))-before.local.y).toBeGreaterThan(.8);
  expect(evidence.after.loadout.ammo.launcher).toBe(before.loadout.ammo.launcher);expect(evidence.after.local.alive).toBe(true);
  if(mode==='online'){
   const states=authority.flatMap(s=>s.players.filter((p:any)=>p.id===before.clientId).map((p:any)=>({physicsTime:s.sourcePhysicsTime,transform:p.transform})));
   expect(states.some(s=>Number.isFinite(s.physicsTime)&&s.transform.sourceInput?.jump&&s.transform.velocity.y>7)).toBe(true);
  }
  expect(errors).toEqual([]);expect(serverErrors).toEqual([]);
  const out=process.env.RA_FIDELITY_ARTIFACT_DIR??'artifacts/fidelity-review/2026-10-01/current';await mkdir(out,{recursive:true});
  await writeFile(`${out}/${map}-${mode}-source-player.json`,JSON.stringify({verified:true,before,...evidence,authority,errors,serverErrors},null,2));
 });
}
