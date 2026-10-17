import {expect,test,type BrowserContext} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {PostEffectsFixture,PostEffectsResult} from '../scripts/research/probe-original-post-effects';

test('source pipelines omit invented bloom and GTAO while Winter retains its previous effects',async({browser},testInfo)=>{
  test.setTimeout(90_000);
  const phase=resolve('artifacts/fidelity-review/2026-10-03/current/source-post-effects-validation');
  const bundles={before:await readFile(resolve(phase,'probe-before.bundle.mjs')),after:await readFile(resolve(phase,'probe-after.bundle.mjs'))};
  const server=createServer((request,response)=>{
    const variant=request.url==='/probe-before.bundle.mjs'?'before':request.url==='/probe-after.bundle.mjs'?'after':null;
    if(variant){response.writeHead(200,{'Content-Type':'text/javascript'});response.end(bundles[variant]);}
    else if(request.url?.startsWith('/favicon')){response.writeHead(204);response.end();}
    else{response.writeHead(200,{'Content-Type':'text/html'});response.end('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:black}</style>');}
  });
  await new Promise<void>((accept,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);accept();});});
  const port=(server.address() as {port:number}).port;let context:BrowserContext|undefined;
  const results:unknown[]=[],errors:string[]=[];
  const compare=(a:PostEffectsResult['baseline'],b:PostEffectsResult['baseline'])=>{
    expect(a.size).toEqual(b.size);const left=Buffer.from(a.rgbaBase64,'base64'),right=Buffer.from(b.rgbaBase64,'base64');
    expect(left.length).toBe(a.size[0]*a.size[1]*4);expect(right.length).toBe(left.length);expect(left.length).toBeLessThanOrEqual(262144);
    let maxChannelDifference=0,pixelsChangedByAtLeast3=0;
    for(let index=0;index<left.length;index+=4){let difference=0;for(let channel=0;channel<3;channel++)difference=Math.max(difference,Math.abs(left[index+channel]-right[index+channel]));maxChannelDifference=Math.max(maxChannelDifference,difference);if(difference>=3)pixelsChangedByAtLeast3++;}
    return {maxChannelDifference,pixelsChangedByAtLeast3};
  };
  try{
    context=await browser.newContext({viewport:{width:256,height:128},deviceScaleFactor:1});const page=await context.newPage();
    page.on('pageerror',error=>{if(errors.length<32)errors.push(error.message);});await page.goto(`http://127.0.0.1:${port}/`);
    const fixtures:PostEffectsFixture[]=[];for(const map of ['barrack','woodlands'] as const)for(const quality of ['low','balanced','high'] as const)fixtures.push({map,quality});fixtures.push({map:'winter',quality:'high'});
    for(const fixture of fixtures){
      const run=(variant:'before'|'after',controls:boolean)=>page.evaluate(async({fixture,variant,controls})=>{
        const module=await import(`/probe-${variant}.bundle.mjs`);return module.runOriginalPostEffectsProbe(fixture,controls) as Promise<PostEffectsResult>;
      },{fixture,variant,controls});
      const before=await run('before',true),after=await run('after',false);
      expect(before.build.variant).toBe('before');expect(after.build.variant).toBe('after');expect(before.build.gameSourceSha256).not.toBe(after.build.gameSourceSha256);
      expect(before.fixtureRandom.seed).toBe(0x5a17c0de);expect(after.fixtureRandom.seed).toBe(before.fixtureRandom.seed);
      expect(before.fixtureRandom.restored).toBe(true);expect(after.fixtureRandom.restored).toBe(true);
      const cleanComparison=compare(before.clean,after.baseline),beforeAfter=compare(before.baseline,after.baseline);
      const strip=(record:PostEffectsResult)=>{const {baseline,clean,...metadata}=record;return {...metadata,baseline:{size:baseline.size},clean:{size:clean.size}};};
      results.push({fixture,before:strip(before),after:strip(after),cleanComparison,beforeAfter});
      for(const [label,image] of [['before',before.baseline],['before-clean',before.clean],['after',after.baseline]] as const){expect(image.png.length).toBeLessThanOrEqual(524288);await writeFile(testInfo.outputPath(`${fixture.map}-${fixture.quality}-${label}.png`),Buffer.from(image.png.split(',')[1],'base64'));}
      await writeFile(testInfo.outputPath('original-post-effects-results.json'),JSON.stringify({results,errors},null,2));
      if(fixture.map==='winter'){
        expect(before.fixtureRandom.calls).toBeGreaterThan(0);expect(after.fixtureRandom.calls).toBe(before.fixtureRandom.calls);
        expect(before.passes).toEqual(['RenderPass','GTAOPass','UnrealBloomPass','SMAAPass','OutputPass']);
        expect(after.passes).toEqual(before.passes);expect(beforeAfter.maxChannelDifference).toBeLessThanOrEqual(2);expect(after.toneMapping).toBe(before.toneMapping);
      }else{
        expect(after.passes).toEqual(fixture.quality==='low'?[]:['RenderPass','SMAAPass','OutputPass']);
        expect(cleanComparison.maxChannelDifference).toBeLessThanOrEqual(2);
        if(fixture.quality==='low'){expect(before.passes).toEqual([]);expect(beforeAfter.maxChannelDifference).toBeLessThanOrEqual(2);}
        else{
          expect(before.bloom.roi.maxChannelDifference).toBeGreaterThanOrEqual(3);expect(before.bloom.roi.pixelsChangedByAtLeast3).toBeGreaterThanOrEqual(8);
          expect(beforeAfter.maxChannelDifference).toBeGreaterThanOrEqual(3);expect(beforeAfter.pixelsChangedByAtLeast3).toBeGreaterThanOrEqual(8);
          if(fixture.quality==='high'){expect(before.gtao.roi.maxChannelDifference).toBeGreaterThanOrEqual(3);expect(before.gtao.roi.pixelsChangedByAtLeast3).toBeGreaterThanOrEqual(8);}
        }
      }
    }
    expect(errors).toEqual([]);
  }finally{
    try{await writeFile(testInfo.outputPath('original-post-effects-results.json'),JSON.stringify({results,errors},null,2));}
    finally{try{await context?.close();}finally{server.closeAllConnections();await new Promise<void>((accept,reject)=>server.close(error=>error?reject(error):accept()));}}
  }
});
