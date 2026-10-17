import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.setTimeout(60_000);

for(const quality of ['low','high'] as const){
  test(`Woodland ${quality} soldier renders the legacy presentation`,async({page},testInfo)=>{
    test.setTimeout(180_000);
    const errors:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.goto(`/?map=woodlands&e2e=1&quality=${quality}`);
    await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
    await page.locator('#deploy').click();
    await page.evaluate(()=>document.dispatchEvent(new Event('pointerlockerror')));
    await expect(page.locator('#pause')).toBeVisible();
    await page.locator('#pause').evaluate(element=>{element.style.display='none';});
    const snapshot=await page.evaluate(()=>{
      const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{
        setSoldierPresentation(distance:number,weapon:'rifle',detail:'full',pose:{yaw:number}):void;
        soldierSnapshot():{detailLevel:string;weapon:string;visibleMeshes:number}|null;
      }}).__RA_MULTIPLAYER_DEBUG__;
      if(!debug)throw new Error('Soldier review hook missing');
      debug.setSoldierPresentation(4,'rifle','full',{yaw:.38});return debug.soldierSnapshot();
    });
    expect(snapshot).toMatchObject({presentation:'legacy',detailLevel:'full',weapon:'rifle'});
    expect(snapshot!.visibleMeshes).toBe(2);
    expect(snapshot).toMatchObject({original:{bones:25,vertices:742,triangles:832}});
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    const out='artifacts/fidelity-review/2026-09-30/current';await mkdir(out,{recursive:true});
    const path=`${out}/woodlands-soldier-${quality}.png`;
    await page.screenshot({path});await testInfo.attach(`Woodland soldier ${quality}`,{path,contentType:'image/png'});
    expect(errors).toEqual([]);
  });
}

type DetailLevel = 'full' | 'reduced' | 'silhouette';
type WeaponId = 'pistol' | 'shotgun' | 'rifle' | 'launcher' | 'rpg' | 'sniper';
const WEAPONS:readonly WeaponId[]=['pistol','shotgun','rifle','launcher','rpg','sniper'];

interface SoldierSnapshot {
  detailLevel: DetailLevel;
  weapon: WeaponId;
  visibleMeshes: number;
  triangles: number;
}

interface SoldierReviewPose {
  yaw?: number;
  aimPitch?: number;
  crouch?: number;
  firing?: boolean;
}

interface SoldierSilhouette {
  pixels: number[];
  changedPixels: number;
  componentPixels: number;
  componentShare: number;
  bounds: { x: number; y: number; width: number; height: number };
}

async function soldierSilhouette(page:Page,baseline:Buffer,current:Buffer):Promise<SoldierSilhouette>{
  return page.evaluate(async({baselineData,currentData})=>{
    const width=720;const height=450;const size=width*height;
    const decode=async(data:string):Promise<ImageData>=>{
      const image=new Image();image.src=`data:image/png;base64,${data}`;
      await image.decode();
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d',{willReadFrequently:true});
      if(!context)throw new Error('2D canvas is unavailable for soldier silhouette review.');
      context.drawImage(image,0,0,width,height);return context.getImageData(0,0,width,height);
    };
    const [before,after]=await Promise.all([decode(baselineData),decode(currentData)]);
    const changed=new Uint8Array(size);let changedPixels=0;
    const left=Math.floor(width*.35);const right=Math.ceil(width*.65);
    const top=Math.floor(height*.40);const bottom=Math.ceil(height*.82);
    for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
      const pixel=y*width+x;const offset=pixel*4;
      const delta=Math.max(
        Math.abs(before.data[offset]-after.data[offset]),
        Math.abs(before.data[offset+1]-after.data[offset+1]),
        Math.abs(before.data[offset+2]-after.data[offset+2]),
      );
      if(delta>=10){changed[pixel]=1;changedPixels++;}
    }
    const visited=new Uint8Array(size);let largest:number[]=[];
    for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
      const start=y*width+x;if(!changed[start]||visited[start])continue;
      const component:number[]=[];const queue=[start];visited[start]=1;
      for(let cursor=0;cursor<queue.length;cursor++){
        const pixel=queue[cursor];component.push(pixel);const px=pixel%width;const py=Math.floor(pixel/width);
        const neighbours=[pixel-1,pixel+1,pixel-width,pixel+width];
        for(const neighbour of neighbours){
          const nx=neighbour%width;const ny=Math.floor(neighbour/width);
          if(nx<left||nx>=right||ny<top||ny>=bottom||Math.abs(nx-px)+Math.abs(ny-py)!==1)continue;
          if(changed[neighbour]&&!visited[neighbour]){visited[neighbour]=1;queue.push(neighbour);}
        }
      }
      if(component.length>largest.length)largest=component;
    }
    let minX=width;let maxX=0;let minY=height;let maxY=0;
    for(const pixel of largest){const x=pixel%width;const y=Math.floor(pixel/width);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
    return {
      pixels:largest,changedPixels,componentPixels:largest.length,
      componentShare:changedPixels===0?0:largest.length/changedPixels,
      bounds:{x:minX,y:minY,width:largest.length?maxX-minX+1:0,height:largest.length?maxY-minY+1:0},
    };
  },{baselineData:baseline.toString('base64'),currentData:current.toString('base64')});
}

function silhouetteDifference(left:SoldierSilhouette,right:SoldierSilhouette):number{
  const leftPixels=new Set(left.pixels);let difference=0;
  for(const pixel of right.pixels)if(!leftPixels.delete(pixel))difference++;
  return difference+leftPixels.size;
}

test('soldier review mode preserves readable close, mid and far LOD presentations', async ({ page }, testInfo) => {
  const errors: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener('webglcontextlost', () => {
      (window as typeof window & { __soldierContextLost?: boolean }).__soldierContextLost = true;
    }, true);
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });

  await page.goto('/?map=winter&e2e=1&quality=low');
  await expect(page.locator('#loading')).toHaveCount(0, { timeout: 10_000 });
  await page.locator('#deploy').click();
  await page.evaluate(() => document.dispatchEvent(new Event('pointerlockerror')));
  await expect(page.locator('#pause')).toBeVisible();
  await page.locator('#pause').evaluate((element) => { element.style.display = 'none'; });

  const settleFrames=async():Promise<void>=>page.evaluate(()=>new Promise<void>((resolve)=>{
    requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()));
  }));

  const present = async (distance: number, weapon: WeaponId, detail: DetailLevel): Promise<SoldierSnapshot> => {
    return page.evaluate(({ distance, weapon, detail }) => {
      const debug = (window as typeof window & {
        __RA_MULTIPLAYER_DEBUG__?: {
          setSoldierPresentation(distance: number, weapon: WeaponId, detail: DetailLevel): void;
          setSoldierPresentationVisible(visible: boolean): void;
          soldierSnapshot(): SoldierSnapshot | null;
        };
      }).__RA_MULTIPLAYER_DEBUG__;
      if (!debug) throw new Error('Soldier presentation hook is unavailable.');
      debug.setSoldierPresentation(distance, weapon, detail);
      const snapshot = debug.soldierSnapshot();
      if (!snapshot) throw new Error('Soldier presentation snapshot is unavailable.');
      return snapshot;
    }, { distance, weapon, detail });
  };

  const close = await present(8, 'rifle', 'full');
  expect(close.detailLevel).toBe('full');
  expect(close.visibleMeshes).toBeGreaterThan(50);
  expect(close.visibleMeshes).toBeLessThanOrEqual(65);
  expect(close.triangles).toBeGreaterThan(6_000);
  expect(close.triangles).toBeLessThan(7_500);
  const closeScreenshot = await page.screenshot();
  await testInfo.attach('modern-soldier-close', { body: closeScreenshot, contentType: 'image/png' });

  // Render every planted-grip stance in the real scene. Exact glove-to-grip
  // error and transform stability are covered by SoldierModel's unit contract;
  // these captures guard the composed silhouettes and weapon identity.
  await mkdir('artifacts/soldier-review',{recursive:true});
  const canvas=page.locator('#game canvas');
  await page.evaluate(()=>{
    const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{setSoldierPresentationVisible(visible:boolean):void}}).__RA_MULTIPLAYER_DEBUG__;
    if(!debug)throw new Error('Soldier presentation hook is unavailable.');
    debug.setSoldierPresentationVisible(false);
  });
  await settleFrames();
  const baseline=await canvas.screenshot({animations:'disabled'});
  const silhouettes=new Map<WeaponId,SoldierSilhouette>();
  for(const weapon of WEAPONS){
    const stance=await present(5,weapon,'full');
    expect(stance.detailLevel).toBe('full');
    expect(stance.weapon).toBe(weapon);
    expect(stance.visibleMeshes).toBeGreaterThan(45);
    expect(stance.visibleMeshes).toBeLessThanOrEqual(65);
    expect(stance.triangles).toBeLessThanOrEqual(8_500);
    await settleFrames();
    const capture=await canvas.screenshot({
      path:`artifacts/soldier-review/ik-low-${weapon}.png`,
      animations:'disabled',
    });
    const silhouette=await soldierSilhouette(page,baseline,capture);
    expect(silhouette.changedPixels,`${weapon} foreground pixels`).toBeGreaterThan(1_500);
    expect(silhouette.componentPixels,`${weapon} connected silhouette`).toBeGreaterThan(900);
    expect(silhouette.componentShare,`${weapon} connected share`).toBeGreaterThan(.45);
    expect(silhouette.bounds.height,`${weapon} silhouette height`).toBeGreaterThan(80);
    expect(silhouette.bounds.height,`${weapon} silhouette height`).toBeLessThan(150);
    expect(silhouette.bounds.width,`${weapon} silhouette width`).toBeGreaterThan(30);
    expect(silhouette.bounds.width,`${weapon} silhouette width`).toBeLessThan(170);
    expect(Math.abs(silhouette.bounds.x+silhouette.bounds.width/2-360),`${weapon} horizontal centering`).toBeLessThan(40);
    silhouettes.set(weapon,silhouette);
    await testInfo.attach(`ik-low-${weapon}`,{body:capture,contentType:'image/png'});
  }
  for(let left=0;left<WEAPONS.length;left++)for(let right=left+1;right<WEAPONS.length;right++){
    const first=WEAPONS[left];const second=WEAPONS[right];
    expect(silhouetteDifference(silhouettes.get(first)!,silhouettes.get(second)!),`${first}/${second} silhouette identity`).toBeGreaterThan(60);
  }

  const mid = await present(30, 'pistol', 'reduced');
  expect(mid.detailLevel).toBe('reduced');
  expect(mid.weapon).toBe('pistol');
  expect(mid.visibleMeshes).toBeGreaterThan(20);
  expect(mid.visibleMeshes).toBeLessThanOrEqual(36);
  expect(mid.triangles).toBeLessThanOrEqual(5_500);
  expect(mid.visibleMeshes).toBeLessThan(close.visibleMeshes);
  expect(mid.triangles).toBeLessThan(close.triangles * .8);

  const far = await present(60, 'rpg', 'silhouette');
  expect(far).toMatchObject({ detailLevel: 'silhouette', weapon: 'rpg', visibleMeshes: 7 });
  expect(far.triangles).toBeLessThan(500);

  const contextLost = await page.evaluate(() => Boolean(
    (window as typeof window & { __soldierContextLost?: boolean }).__soldierContextLost,
  ));
  expect(contextLost).toBe(false);
  expect(errors).toEqual([]);
});

test('high-tier planted rifle stance remains readable in the composed arena',async({page},testInfo)=>{
  const errors:string[]=[];
  page.on('pageerror',(error)=>errors.push(`page: ${error.message}`));
  page.on('console',(message)=>{if(message.type()==='error')errors.push(`console: ${message.text()}`);});
  await page.goto('/?map=winter&e2e=1&quality=high');
  await expect(page.locator('#loading')).toHaveCount(0,{timeout:15_000});
  await page.locator('#deploy').click();
  await page.evaluate(()=>document.dispatchEvent(new Event('pointerlockerror')));
  await expect(page.locator('#pause')).toBeVisible();
  await page.locator('#pause').evaluate((element)=>{element.style.display='none';});
  await mkdir('artifacts/soldier-review',{recursive:true});
  const canvas=page.locator('#game canvas');
  const settle=async():Promise<void>=>page.evaluate(()=>new Promise<void>((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  const present=async(pose:SoldierReviewPose):Promise<SoldierSnapshot>=>page.evaluate((reviewPose)=>{
    const debug=(window as typeof window&{
      __RA_MULTIPLAYER_DEBUG__?:{
        setSoldierPresentation(distance:number,weapon:WeaponId,detail:DetailLevel,pose?:SoldierReviewPose):void;
        soldierSnapshot():SoldierSnapshot|null;
      };
    }).__RA_MULTIPLAYER_DEBUG__;
    if(!debug)throw new Error('Soldier presentation hook is unavailable.');
    debug.setSoldierPresentation(4,'rifle','full',reviewPose);
    const snapshot=debug.soldierSnapshot();
    if(!snapshot)throw new Error('Soldier presentation snapshot is unavailable.');
    return snapshot;
  },pose);

  await page.evaluate(()=>{
    const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{setSoldierPresentationVisible(visible:boolean):void}}).__RA_MULTIPLAYER_DEBUG__;
    if(!debug)throw new Error('Soldier presentation hook is unavailable.');
    debug.setSoldierPresentationVisible(false);
  });
  await settle();
  const baseline=await canvas.screenshot({animations:'disabled'});
  const poses:readonly {name:string;pose:SoldierReviewPose}[]=[
    {name:'three-quarter',pose:{yaw:.38}},
    {name:'profile',pose:{yaw:1.48}},
    {name:'rear',pose:{yaw:2.78}},
    {name:'crouched',pose:{yaw:.38,crouch:1}},
    {name:'firing',pose:{yaw:.38,firing:true}},
  ];
  const silhouettes=new Map<string,SoldierSilhouette>();
  for(const review of poses){
    const snapshot=await present(review.pose);
    expect(snapshot).toMatchObject({detailLevel:'full',weapon:'rifle'});
    expect(snapshot.visibleMeshes).toBeGreaterThan(50);
    expect(snapshot.visibleMeshes).toBeLessThanOrEqual(65);
    expect(snapshot.triangles).toBeLessThanOrEqual(8_500);
    await settle();
    const capture=await canvas.screenshot({
      path:`artifacts/soldier-review/coherence-high-${review.name}.png`,
      animations:'disabled',
    });
    if(review.name==='three-quarter')await writeFile('artifacts/soldier-review/ik-high-rifle.png',capture);
    const silhouette=await soldierSilhouette(page,baseline,capture);
    expect(silhouette.changedPixels,`${review.name} foreground pixels`).toBeGreaterThan(1_500);
    expect(silhouette.componentPixels,`${review.name} connected silhouette`).toBeGreaterThan(850);
    expect(silhouette.componentShare,`${review.name} connected share`).toBeGreaterThan(.42);
    expect(silhouette.bounds.height,`${review.name} silhouette height`).toBeGreaterThan(65);
    expect(silhouette.bounds.height,`${review.name} silhouette height`).toBeLessThan(160);
    expect(silhouette.bounds.width,`${review.name} silhouette width`).toBeGreaterThan(28);
    expect(silhouette.bounds.width,`${review.name} silhouette width`).toBeLessThan(190);
    silhouettes.set(review.name,silhouette);
    await testInfo.attach(`coherence-high-${review.name}`,{body:capture,contentType:'image/png'});
  }
  const standing=silhouettes.get('three-quarter')!;
  const crouched=silhouettes.get('crouched')!;
  expect(silhouetteDifference(standing,silhouettes.get('profile')!),'profile pose identity').toBeGreaterThan(200);
  expect(silhouetteDifference(standing,silhouettes.get('rear')!),'rear pose identity').toBeGreaterThan(160);
  expect(standing.bounds.height-crouched.bounds.height,'settled crouch height reduction').toBeGreaterThanOrEqual(8);
  expect(silhouetteDifference(standing,silhouettes.get('firing')!),'firing pose identity').toBeGreaterThan(15);
  expect(errors).toEqual([]);
});
