import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test.setTimeout(120_000);
test.use({viewport:{width:1280,height:576}});
type State = {
  map:string;connection:string;
  local:{x:number;y:number;z:number;yaw:number;alive:boolean};
  originalScene:{triangles:number;scale:number;radius:number;colliding:boolean}|null;
  authoritativeLocal:{position:{x:number;y:number;z:number};grounded:boolean}|null;
};
type Review = Window & {__RA_MULTIPLAYER_DEBUG__:{snapshot():State}};
async function state(page:Page):Promise<State>{return page.evaluate(()=>(window as unknown as Review).__RA_MULTIPLAYER_DEBUG__.snapshot());}
const out='artifacts/fidelity-review/2026-09-30/current';
for(const map of ['barrack','woodlands'])for(const {mode,quality} of [{mode:'solo',quality:'low'},{mode:'online',quality:'low'},{mode:'online',quality:'high'}]){
  test(`${map} ${mode} ${quality} plays on original source triangles and sphere support`,async({page},testInfo)=>{
    const serverErrors:unknown[]=[];page.on('websocket',socket=>socket.on('framereceived',({payload})=>{try{const message=JSON.parse(String(payload));if(message.type==='error')serverErrors.push(message);}catch{}}));
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.addInitScript(()=>{
      let locked:Element|null=null;
      Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});
      Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});
      Object.defineProperty(Document.prototype,'exitPointerLock',{configurable:true,value(){locked=null;document.dispatchEvent(new Event('pointerlockchange'));}});
    });
    await page.goto(`/?map=${map}&quality=${quality}&e2e=1`);
    await expect(page.locator('#loading')).toHaveCount(0,{timeout:45_000});
    await page.locator(`#mode-${mode}`).click();await page.locator('#deploy').click();
    if(mode==='online'){
      await page.locator('#room-code').fill(`ORIGINAL${Date.now().toString(36).toUpperCase()}`);
      await page.locator('#join-room').click();
      await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');
    }
    await page.locator('#game canvas').click();
    const before=await state(page);
    expect(before.originalScene?.triangles).toBeGreaterThan(20_000);
    expect(before.originalScene?.scale).toBeCloseTo(1.72/85);
    expect(before.originalScene?.radius).toBeCloseTo(25*1.72/85);
    expect(before.originalScene?.colliding).toBe(false);
    await page.keyboard.down('KeyW');
    try{await expect.poll(async()=>{const next=await state(page);return Math.hypot(next.local.x-before.local.x,next.local.z-before.local.z);},{timeout:15_000}).toBeGreaterThan(.12);}
    finally{await testInfo.attach('movement-state',{body:JSON.stringify({before,current:await state(page),serverErrors},null,2),contentType:'application/json'});await page.keyboard.up('KeyW');}
    await page.waitForTimeout(750);
    const after=await state(page);
    expect(after.local.alive).toBe(true);expect(after.originalScene?.colliding).toBe(false);
    if(mode==='online'){
      await expect.poll(async()=>{const next=await state(page),authoritative=next.authoritativeLocal?.position;
        return authoritative?Math.hypot(next.local.x-authoritative.x,next.local.y-authoritative.y,next.local.z-authoritative.z):Infinity;
      },{timeout:15_000}).toBeLessThan(.12);
    }
    await mkdir(out,{recursive:true});
    const artifact=`${map}-${mode}${quality==='high'?'-high':''}-original-scene`;
    const path=`${out}/${artifact}.png`;await page.screenshot({path});
    await testInfo.attach('Recovered source scene',{path,contentType:'image/png'});
    await writeFile(`${out}/${artifact}.json`,JSON.stringify({verified:errors.length===0&&serverErrors.length===0,quality,before,after,errors,serverErrors},null,2));
    expect(errors).toEqual([]);expect(serverErrors).toEqual([]);
  });
}
