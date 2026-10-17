import { mkdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

// Enhanced post-processing is intentionally exercised under SwiftShader in CI;
// the seven staged canvas readbacks can take several minutes there.
test.setTimeout(300_000);

interface EffectCapacities {
  tracers: number;
  sparks: number;
  chips: number;
  dust: number;
  smoke: number;
  explosionFlashes: number;
  shockRings: number;
}

interface CombatStats {
  active: EffectCapacities;
  capacity: EffectCapacities;
  resources: { geometries:number;materials:number;textures:number };
  render: { batches:number;activeBatches:number;submittedTriangles:number };
}

interface ImpactStats {
  active: { bullets: number; scorches: number };
  capacity: { bullets: number; scorches: number };
  drawCalls: number;
  resources: { geometries: number; materials: number; textures: number };
}

interface RenderStats {
  calls: number;
  triangles: number;
  points: number;
  geometries: number;
  textures: number;
}

interface DebugSnapshot {
  impactMarks: ImpactStats;
  combatEffects: CombatStats;
  blastLights: { active:number;capacity:number };
  render: RenderStats;
}

interface DifferenceSample {
  changedPixels: number;
  brightenedPixels: number;
  warmPixels: number;
  newBlackPixels: number;
  largestNewBlackComponent: number;
  meanLuminanceRatio: number;
}

async function debugSnapshot(page: Page): Promise<DebugSnapshot> {
  return page.evaluate(() => {
    const debug = (window as typeof window & {
      __RA_MULTIPLAYER_DEBUG__?: { snapshot(): DebugSnapshot };
    }).__RA_MULTIPLAYER_DEBUG__;
    if (!debug) throw new Error('Combat presentation debug hook is unavailable.');
    return debug.snapshot();
  });
}

async function settleFrames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function compareScreenshots(page: Page, baseline: Buffer, current: Buffer): Promise<DifferenceSample> {
  return page.evaluate(async ({ baselinePng, currentPng }) => {
    const decode = async (encoded: string): Promise<ImageData> => {
      const image = new Image();image.src=`data:image/png;base64,${encoded}`;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=240;canvas.height=150;
      const context=canvas.getContext('2d',{willReadFrequently:true});
      if(!context)throw new Error('Unable to sample combat presentation screenshot.');
      context.drawImage(image,0,0,canvas.width,canvas.height);
      return context.getImageData(0,0,canvas.width,canvas.height);
    };
    const before=await decode(baselinePng);const after=await decode(currentPng);
    const blackMask=new Uint8Array(before.width*before.height);
    let changedPixels=0;let brightenedPixels=0;let warmPixels=0;let newBlackPixels=0;
    let beforeLuminance=0;let afterLuminance=0;
    for(let pixel=0;pixel<blackMask.length;pixel++){
      const offset=pixel*4;
      const br=before.data[offset];const bg=before.data[offset+1];const bb=before.data[offset+2];
      const ar=after.data[offset];const ag=after.data[offset+1];const ab=after.data[offset+2];
      const by=br*.2126+bg*.7152+bb*.0722;const ay=ar*.2126+ag*.7152+ab*.0722;
      beforeLuminance+=by;afterLuminance+=ay;
      if(Math.abs(ay-by)>=12)changedPixels++;
      if(ay-by>=12)brightenedPixels++;
      if(ar>ag+15&&ag>ab+8&&ay>70)warmPixels++;
      if(ay<=6&&by>=24){blackMask[pixel]=1;newBlackPixels++;}
    }
    let largestNewBlackComponent=0;const stack:number[]=[];
    for(let start=0;start<blackMask.length;start++){
      if(blackMask[start]!==1)continue;blackMask[start]=2;stack.push(start);let size=0;
      while(stack.length){const pixel=stack.pop()!;size++;const x=pixel%before.width;const y=Math.floor(pixel/before.width);
        const neighbors=[x>0?pixel-1:-1,x+1<before.width?pixel+1:-1,y>0?pixel-before.width:-1,y+1<before.height?pixel+before.width:-1];
        for(const neighbor of neighbors)if(neighbor>=0&&blackMask[neighbor]===1){blackMask[neighbor]=2;stack.push(neighbor);}
      }
      largestNewBlackComponent=Math.max(largestNewBlackComponent,size);
    }
    return {changedPixels,brightenedPixels,warmPixels,newBlackPixels,largestNewBlackComponent,meanLuminanceRatio:afterLuminance/Math.max(1,beforeLuminance)};
  }, { baselinePng:baseline.toString('base64'), currentPng:current.toString('base64') });
}

function expectNoOpaqueBlackArtifact(sample: DifferenceSample):void {
  expect(sample.newBlackPixels).toBeLessThanOrEqual(180);
  expect(sample.largestNewBlackComponent).toBeLessThanOrEqual(64);
  expect(sample.meanLuminanceRatio).toBeGreaterThan(.88);
}

for (const quality of ['low', 'high'] as const) {
  test(`${quality}-tier transient combat VFX render through deterministic live stages`, async ({ page }, testInfo) => {
    const runtimeErrors: string[] = [];
    await page.addInitScript(() => {
      const state=window as typeof window&{__RA_WEBGL_CONTEXT_LOSSES__:string[]};state.__RA_WEBGL_CONTEXT_LOSSES__=[];
      document.addEventListener('webglcontextlost',(event)=>state.__RA_WEBGL_CONTEXT_LOSSES__.push((event as WebGLContextEvent).statusMessage||'WebGL context lost'),true);
    });
    page.on('pageerror', (error) => runtimeErrors.push(`page: ${error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`); });

    await page.goto(`/?map=winter&quality=${quality}&e2e=1`);
    await expect(page.locator('#loading')).toHaveCount(0, { timeout: 15_000 });
    const canvas = page.locator('#game canvas');await expect(canvas).toBeVisible();
    await page.locator('#deploy').click();await expect(page.locator('#hud')).toBeVisible();
    await page.evaluate(() => document.dispatchEvent(new Event('pointerlockerror')));
    await expect(page.locator('#pause')).toBeVisible();

    await page.evaluate(() => {
      const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{
        setView(x:number,z:number,yaw?:number,pitch?:number):void;
        setEnvironmentPresentation(preset:'facade'):void;
        setCombatEffectsFrozen(frozen:boolean):void;
        clearImpactMarks():void;
        advanceEffects(seconds:number):void;
      }}).__RA_MULTIPLAYER_DEBUG__!;
      debug.setCombatEffectsFrozen(true);debug.advanceEffects(3);debug.clearImpactMarks();
      debug.setEnvironmentPresentation('facade');debug.setView(-21,-3,0,-.02);
      document.querySelector<HTMLElement>('#hud')!.style.display='none';
      document.querySelector<HTMLElement>('#pause')!.style.display='none';
    });
    await settleFrames(page);
    const baselineStats=await debugSnapshot(page);
    expect(baselineStats.combatEffects.active).toEqual({tracers:0,sparks:0,chips:0,dust:0,smoke:0,explosionFlashes:0,shockRings:0});
    expect(baselineStats.combatEffects.resources).toEqual({geometries:6,materials:9,textures:1});
    expect(baselineStats.combatEffects.render).toEqual({batches:9,activeBatches:0,submittedTriangles:0});
    expect(baselineStats.impactMarks.active).toEqual({bullets:0,scorches:0});
    expect(baselineStats.blastLights).toEqual({active:0,capacity:quality==='high'?6:3});

    await mkdir('artifacts/combat-review',{recursive:true});
    const baseline=await canvas.screenshot({path:`artifacts/combat-review/${quality}-combat-baseline.png`,animations:'disabled'});
    await testInfo.attach(`${quality}-combat-baseline`,{body:baseline,contentType:'image/png'});

    await page.evaluate(() => {
      const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{triggerEffect(kind:'impact',x:number,y:number,z:number):void;advanceEffects(seconds:number):void}}).__RA_MULTIPLAYER_DEBUG__!;
      debug.triggerEffect('impact',-18.35,1.45,-10.72);debug.advanceEffects(.02);
    });
    await settleFrames(page);
    const impactStats=await debugSnapshot(page);
    expect(impactStats.combatEffects.active).toEqual({tracers:1,sparks:10,chips:4,dust:5,smoke:1,explosionFlashes:0,shockRings:0});
    expect(impactStats.combatEffects.render).toEqual({batches:9,activeBatches:6,submittedTriangles:110});
    expect(impactStats.impactMarks.active).toEqual({bullets:1,scorches:0});
    const impact=await canvas.screenshot({path:`artifacts/combat-review/${quality}-impact-flash-020ms.png`,animations:'disabled'});
    await testInfo.attach(`${quality}-impact-flash-020ms`,{body:impact,contentType:'image/png'});
    const impactDifference=await compareScreenshots(page,baseline,impact);
    expect(impactDifference.changedPixels).toBeGreaterThan(20);expect(impactDifference.brightenedPixels).toBeGreaterThan(5);expectNoOpaqueBlackArtifact(impactDifference);

    await page.evaluate(() => (window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{advanceEffects(seconds:number):void}}).__RA_MULTIPLAYER_DEBUG__!.advanceEffects(.43));
    await settleFrames(page);
    const impactResidueStats=await debugSnapshot(page);
    expect(impactResidueStats.combatEffects.active.tracers).toBe(0);expect(impactResidueStats.combatEffects.active.sparks).toBe(0);
    const impactResidue=await canvas.screenshot({path:`artifacts/combat-review/${quality}-impact-residue-450ms.png`,animations:'disabled'});
    await testInfo.attach(`${quality}-impact-residue-450ms`,{body:impactResidue,contentType:'image/png'});
    expectNoOpaqueBlackArtifact(await compareScreenshots(page,baseline,impactResidue));

    await page.evaluate(() => (window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{advanceEffects(seconds:number):void}}).__RA_MULTIPLAYER_DEBUG__!.advanceEffects(2.1));
    expect(Object.values((await debugSnapshot(page)).combatEffects.active).every((count)=>count===0)).toBe(true);

    await page.evaluate(() => {
      const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{triggerEffect(kind:'explosion',x:number,y:number,z:number):void;advanceEffects(seconds:number):void}}).__RA_MULTIPLAYER_DEBUG__!;
      // Stage the blast just in front of the facade so its hot core is not
      // depth-clipped into the wall-mounted scorch decal.
      debug.triggerEffect('explosion',-18.35,.05,-9.2);debug.advanceEffects(.06);
    });
    await settleFrames(page);
    const ignitionStats=await debugSnapshot(page);const expectedExplosion=quality==='high'?{sparks:24,chips:9,dust:12,smoke:10}:{sparks:12,chips:4,dust:5,smoke:5};
    expect(ignitionStats.combatEffects.active).toEqual({tracers:0,...expectedExplosion,explosionFlashes:1,shockRings:1});
    expect(ignitionStats.combatEffects.render).toEqual({batches:9,activeBatches:7,submittedTriangles:quality==='high'?518:414});
    expect(ignitionStats.blastLights.active).toBe(1);expect(ignitionStats.impactMarks.active).toEqual({bullets:1,scorches:1});
    const ignition=await canvas.screenshot({path:`artifacts/combat-review/${quality}-explosion-ignition-060ms.png`,animations:'disabled'});
    await testInfo.attach(`${quality}-explosion-ignition-060ms`,{body:ignition,contentType:'image/png'});
    const ignitionDifference=await compareScreenshots(page,baseline,ignition);
    expect(ignitionDifference.changedPixels).toBeGreaterThan(80);expect(ignitionDifference.brightenedPixels).toBeGreaterThan(35);expect(ignitionDifference.warmPixels).toBeGreaterThan(20);expectNoOpaqueBlackArtifact(ignitionDifference);

    await page.evaluate(() => (window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{advanceEffects(seconds:number):void}}).__RA_MULTIPLAYER_DEBUG__!.advanceEffects(.12));
    await settleFrames(page);
    const fireballStats=await debugSnapshot(page);expect(fireballStats.combatEffects.active.explosionFlashes).toBe(1);expect(fireballStats.combatEffects.active.shockRings).toBe(1);expect(fireballStats.blastLights.active).toBe(0);
    const fireball=await canvas.screenshot({path:`artifacts/combat-review/${quality}-explosion-fireball-180ms.png`,animations:'disabled'});
    await testInfo.attach(`${quality}-explosion-fireball-180ms`,{body:fireball,contentType:'image/png'});
    const fireballDifference=await compareScreenshots(page,baseline,fireball);
    expect(fireballDifference.changedPixels).toBeGreaterThan(80);expect(fireballDifference.warmPixels).toBeGreaterThan(20);expectNoOpaqueBlackArtifact(fireballDifference);

    await page.evaluate(() => (window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{advanceEffects(seconds:number):void}}).__RA_MULTIPLAYER_DEBUG__!.advanceEffects(.47));
    await settleFrames(page);
    const smokeStats=await debugSnapshot(page);expect(smokeStats.combatEffects.active.explosionFlashes).toBe(0);expect(smokeStats.combatEffects.active.shockRings).toBe(0);expect(smokeStats.combatEffects.active.sparks).toBe(0);expect(smokeStats.combatEffects.active.smoke).toBe(expectedExplosion.smoke);
    const smoke=await canvas.screenshot({path:`artifacts/combat-review/${quality}-explosion-smoke-650ms.png`,animations:'disabled'});
    await testInfo.attach(`${quality}-explosion-smoke-650ms`,{body:smoke,contentType:'image/png'});
    const smokeDifference=await compareScreenshots(page,baseline,smoke);expect(smokeDifference.changedPixels).toBeGreaterThan(20);expectNoOpaqueBlackArtifact(smokeDifference);

    await page.evaluate(() => (window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{advanceEffects(seconds:number):void}}).__RA_MULTIPLAYER_DEBUG__!.advanceEffects(1.85));
    await settleFrames(page);
    const residueStats=await debugSnapshot(page);expect(Object.values(residueStats.combatEffects.active).every((count)=>count===0)).toBe(true);expect(residueStats.combatEffects.render.activeBatches).toBe(0);expect(residueStats.impactMarks.active).toEqual({bullets:1,scorches:1});expect(residueStats.combatEffects.resources).toEqual(baselineStats.combatEffects.resources);
    const residue=await canvas.screenshot({path:`artifacts/combat-review/${quality}-explosion-residue-2500ms.png`,animations:'disabled'});
    await testInfo.attach(`${quality}-explosion-residue-2500ms`,{body:residue,contentType:'image/png'});
    expectNoOpaqueBlackArtifact(await compareScreenshots(page,baseline,residue));

    expect(await page.evaluate(() => (window as typeof window&{__RA_WEBGL_CONTEXT_LOSSES__:string[]}).__RA_WEBGL_CONTEXT_LOSSES__)).toEqual([]);
    expect(runtimeErrors).toEqual([]);
  });
}
