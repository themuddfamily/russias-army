import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {expect,test} from '@playwright/test';

// This checks reproducible rendering of a diagnostic pose. The saved fit's
// heldout residuals currently contradict a claim of historical registration.
for(const quality of ['low','high']){
  test(`Woodland ${quality} renders the historical-camera candidate with the fitted projection`,async({page},testInfo)=>{
    test.setTimeout(180_000);
    const fitPath=process.env.REFERENCE_CAMERA_FIT??'artifacts/fidelity-review/2026-10-01/current/woodland-16s-texture-free-stretch-camera-fit.json';
    const label=process.env.REFERENCE_CAMERA_LABEL??'woodland-16s-rifle-depth-order';
    const showRifle=(process.env.REFERENCE_CAMERA_WEAPON??'rifle')==='rifle';
    const fit=JSON.parse(await readFile(fitPath,'utf8'));
    // Centered vertical crop hypotheses require a separate capture adapter.
    // This hook reproduces source FOV50 across the full recording height.
    expect(fit.fitVerticalCrop??false).toBe(false);
    expect(label).toMatch(/^[a-z0-9-]+$/);
    await page.setViewportSize({width:fit.imageSize[0],height:fit.imageSize[1]});
    const errors:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.goto(`/?map=woodlands&e2e=1&quality=${quality}`);
    await expect(page.locator('#loading')).toHaveCount(0,{timeout:45_000});
    await page.locator('#deploy').click();
    const rendered=await page.evaluate(view=>{
      const debug=window.__RA_MULTIPLAYER_DEBUG__;
      if(!debug)throw new Error('Reference camera hook missing');
      return debug.setRegisteredReferenceView(view);
    },{station:'outbuilding',position:fit.position,target:fit.target,up:fit.up,aspect:fit.effectiveCameraAspect,points:fit.points.map((p:{world:number[]})=>p.world),showWeapon:showRifle});
    const weapon=showRifle?await page.evaluate(()=>{
      const debug=window.__RA_MULTIPLAYER_DEBUG__!;debug.setPresentation('rifle');return debug.snapshot().originalWeapon;
    }):null;
    if(showRifle){
      expect(weapon?.weapon).toBe('rifle');expect(weapon?.displayedWeapon).toBe('rifle');
      expect(weapon?.sourcePosition).toEqual([3,-10,2]);expect(weapon?.worldFov).toBe(50);expect(weapon?.viewFov).toBe(50);
    }
    expect(rendered).not.toBeNull();
    expect(rendered!.fov).toBe(50);
    expect(rendered!.aspect).toBe(fit.effectiveCameraAspect);
    for(let index=0;index<fit.points.length;index++){
      expect(rendered!.projectedPixels[index][0]).toBeCloseTo(fit.points[index].projectedPixel[0],6);
      expect(rendered!.projectedPixels[index][1]).toBeCloseTo(fit.points[index].projectedPixel[1],6);
    }
    await expect(page.locator('#hud')).toBeHidden();
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    const out='artifacts/fidelity-review/2026-10-01/current';
    await mkdir(out,{recursive:true});
    const path=`${out}/${label}-${quality}.png`;
    await page.screenshot({path});
    await testInfo.attach('Diagnostic candidate; historical registration unverified',{path,contentType:'image/png'});
    let roofVisibility:null|{clip:{x:number;y:number;width:number;height:number};identical:boolean}=null;
    if(showRifle&&quality==='low'&&label.startsWith('woodland-16s-')){
      // The rifle starts below this region in this independently fitted pose.
      // Showing it must not clear world depth before transparent foliage draws.
      const clip={x:0,y:0,width:fit.imageSize[0],height:280};
      const withWeapon=await page.screenshot({clip});
      await page.evaluate(view=>window.__RA_MULTIPLAYER_DEBUG__!.setRegisteredReferenceView(view),{station:'outbuilding',position:fit.position,target:fit.target,up:fit.up,aspect:fit.effectiveCameraAspect,points:[],showWeapon:false});
      await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      const withoutWeapon=await page.screenshot({clip});
      await writeFile(`${out}/${label}-roof-with-weapon.png`,withWeapon);
      await writeFile(`${out}/${label}-roof-without-weapon.png`,withoutWeapon);
      roofVisibility={clip,identical:withWeapon.equals(withoutWeapon)};
      expect(roofVisibility.identical).toBe(true);
    }
    await writeFile(`${out}/${label}-${quality}.json`,JSON.stringify({status:'diagnostic-capture-not-historical-registration-proof',fitPath,quality,rendered,weapon,roofVisibility,fitRmsPixels:fit.fitRmsPixels,heldoutRmsPixels:fit.heldoutRmsPixels,heldoutMaxPixels:fit.heldoutMaxPixels,errors},null,2)+'\n');
    expect(errors).toEqual([]);
  });
}
