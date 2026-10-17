import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.setTimeout(150_000);

type Quality='low'|'high';

interface SnowStats {
  active:{footprints:number;puffs:number};
  capacity:{footprints:number;puffs:number};
  actors:number;
  drawCalls:number;
  triangles:number;
  points:number;
  resources:{geometries:number;materials:number;textures:number};
}

interface RenderStats {calls:number;triangles:number;points:number;geometries:number;textures:number}

interface Snapshot {
  render:RenderStats;
  snowTracks:SnowStats;
  combatEffects:{active:Record<string,number>;render:{submittedTriangles:number}};
}

for(const quality of ['low','high'] as const){
  test(`${quality}-tier combatants leave persistent boot impressions and powder on snow`,async({page},testInfo)=>{
    const errors:string[]=[];
    await page.addInitScript(()=>{
      document.addEventListener('webglcontextlost',(event)=>{
        const state=window as typeof window&{__snowContextLosses?:string[]};
        (state.__snowContextLosses??=[]).push((event as WebGLContextEvent).statusMessage||'WebGL context lost');
      },true);
    });
    page.on('pageerror',(error)=>errors.push(`page: ${error.message}`));
    page.on('console',(message)=>{if(message.type()==='error')errors.push(`console: ${message.text()}`);});

    await page.goto(`/?map=winter&quality=${quality}&e2e=1`);
    await expect(page.locator('#loading')).toHaveCount(0,{timeout:15_000});
    await page.locator('#deploy').click();
    await page.evaluate(()=>document.dispatchEvent(new Event('pointerlockerror')));
    await expect(page.locator('#pause')).toBeVisible();
    await page.locator('#pause').evaluate((element)=>{element.style.display='none';});

    const baseline=await page.evaluate(async()=>{
      const debug=(window as typeof window&{
        __RA_MULTIPLAYER_DEBUG__?:{
          snapshot():Snapshot;
          setView(x:number,z:number,yaw?:number,pitch?:number):void;
          setCombatEffectsFrozen(frozen:boolean):void;
          advanceEffects(seconds:number):void;
          clearSnowTracks():void;
        };
      }).__RA_MULTIPLAYER_DEBUG__;
      if(!debug)throw new Error('Snow interaction debug hook is unavailable.');
      // Bots can emit transient sparks before pointer-lock failure pauses the
      // round. Drain and freeze them so frame deltas describe snow alone.
      debug.setCombatEffectsFrozen(true);debug.advanceEffects(3);debug.clearSnowTracks();
      debug.setView(-46,18,0,-.42);
      await new Promise<void>((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
      return debug.snapshot();
    });
    expect(baseline.snowTracks).toMatchObject({active:{footprints:0,puffs:0},drawCalls:0});
    expect(Object.values(baseline.combatEffects.active).every((count)=>count===0)).toBe(true);
    expect(baseline.combatEffects.render.submittedTriangles).toBe(0);

    const active=await page.evaluate(async()=>{
      const debug=(window as typeof window&{
        __RA_MULTIPLAYER_DEBUG__?:{
          snapshot():Snapshot;
          seedSnowTrail():void;
          advanceSnowTracks(seconds:number):void;
        };
      }).__RA_MULTIPLAYER_DEBUG__;
      if(!debug)throw new Error('Snow interaction debug hook is unavailable.');
      debug.seedSnowTrail();
      debug.advanceSnowTracks(.08);
      await new Promise<void>((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
      return debug.snapshot();
    });

    expect(active.snowTracks).toMatchObject({
      active:{footprints:12,puffs:quality==='low'?40:48},
      capacity:quality==='low'?{footprints:96,puffs:40}:{footprints:256,puffs:128},
      drawCalls:2,
      triangles:24,
      points:quality==='low'?40:48,
      resources:{geometries:2,materials:2,textures:1},
    });
    expect(active.render.calls-baseline.render.calls).toBeGreaterThanOrEqual(1);
    expect(active.render.calls-baseline.render.calls).toBeLessThanOrEqual(quality==='low'?2:8);
    expect(active.render.triangles-baseline.render.triangles).toBeGreaterThanOrEqual(24);
    expect(active.render.triangles-baseline.render.triangles).toBeLessThanOrEqual(quality==='low'?30:72);
    expect(active.render.points-baseline.render.points).toBeGreaterThanOrEqual(quality==='low'?40:48);
    expect(active.render.points-baseline.render.points).toBeLessThanOrEqual(quality==='low'?40:120);

    await mkdir('artifacts/snow-interaction-review',{recursive:true});
    const screenshot=await page.locator('#game canvas').screenshot({
      path:`artifacts/snow-interaction-review/${quality}-trail.png`,
      animations:'disabled',
    });
    await testInfo.attach(`${quality}-dynamic-snow-trail`,{body:screenshot,contentType:'image/png'});
    expect(screenshot.byteLength).toBeGreaterThan(20_000);

    const contextLosses=await page.evaluate(()=>(
      window as typeof window&{__snowContextLosses?:string[]}
    ).__snowContextLosses??[]);
    expect(contextLosses).toEqual([]);
    expect(errors).toEqual([]);
  });
}
