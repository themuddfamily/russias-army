import {expect,test,type BrowserContext} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {ColorOutputCase,ColorOutputResult} from '../scripts/research/probe-original-color-output';

test('actual Game output keeps source world and held swatches equal across tiers and preserves Winter ACES',async({browser},testInfo)=>{
  test.setTimeout(90_000);
  const bundle=await readFile(resolve('artifacts/fidelity-review/2026-10-03/current/source-post-effects-validation/color-probe.bundle.mjs'));
  const html='<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:black}</style><script type="module">import {runOriginalColorOutputProbe} from "/probe.bundle.mjs";window.runOriginalColorOutputProbe=runOriginalColorOutputProbe;</script>';
  const server=createServer((request,response)=>{
    if(request.url?.startsWith('/probe.bundle.mjs')){response.writeHead(200,{'Content-Type':'text/javascript'});response.end(bundle);}
    else if(request.url?.startsWith('/favicon')){response.writeHead(204);response.end();}
    else{response.writeHead(200,{'Content-Type':'text/html'});response.end(html);}
  });
  await new Promise<void>((accept,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);accept();});});
  const port=(server.address() as {port:number}).port;let context:BrowserContext|undefined;
  const results:unknown[]=[],errors:string[]=[];
  try{
    context=await browser.newContext({viewport:{width:256,height:128},deviceScaleFactor:1});
    const page=await context.newPage();page.on('pageerror',error=>{if(errors.length<32)errors.push(error.message);});
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction(()=>typeof (window as unknown as {runOriginalColorOutputProbe?:unknown}).runOriginalColorOutputProbe==='function');
    const fixtures:ColorOutputCase[]=[];
    for(const map of ['barrack','woodlands'] as const)for(const quality of ['low','balanced','high'] as const)fixtures.push({map,quality});
    fixtures.push({map:'winter',quality:'balanced'});
    for(const fixture of fixtures){
      const result=await page.evaluate(async fixture=>{
        const run=(window as unknown as {runOriginalColorOutputProbe:(fixture:ColorOutputCase)=>Promise<ColorOutputResult>}).runOriginalColorOutputProbe;
        return run(fixture);
      },fixture);
      const {control,production}=result;
      for(const [label,sample] of [['control',control],['production',production]] as const){
        expect(sample.png.length).toBeLessThanOrEqual(524288);
        await writeFile(testInfo.outputPath(`${fixture.map}-${fixture.quality}-${label}.png`),Buffer.from(sample.png.split(',')[1],'base64'));
      }
      const strip=(sample:typeof control)=>{const {png:_,...record}=sample;return record;};
      results.push({...result,control:strip(control),production:strip(production)});
      await writeFile(testInfo.outputPath('original-color-output-results.json'),JSON.stringify({results,errors},null,2));
      expect(result.tier).toBe(fixture.quality);expect(control.world[3]).toBe(255);expect(production.world[3]).toBe(255);expect(production.held[3]).toBe(255);
      const difference=(a:number[],b:number[])=>Math.max(...a.slice(0,3).map((value,index)=>Math.abs(value-b[index])));
      if(fixture.quality==='low'){
        expect(result.passes).toEqual([]);expect(difference(control.world,result.swatch)).toBeLessThanOrEqual(2);expect(difference(control.held,result.swatch)).toBeLessThanOrEqual(2);
      }else{
        expect(result.passes).toEqual(['RenderPass',...(fixture.map==='winter'
          ?[...(fixture.quality==='high'?['GTAOPass']:[]),'UnrealBloomPass']:[]),'SMAAPass','OutputPass']);
        expect(difference(control.world,control.held)).toBeGreaterThanOrEqual(10);
      }
      if(fixture.map==='winter'){
        expect(result.productionToneMapping).toBe(result.acesToneMapping);expect(result.productionExposure).toBe(1.02);
        expect(production.world).toEqual(control.world);expect(production.held).toEqual(control.held);
      }else{
        expect(result.productionToneMapping).toBe(result.noToneMapping);
        expect(difference(production.world,production.held)).toBeLessThanOrEqual(2);
        expect(difference(production.world,result.swatch)).toBeLessThanOrEqual(2);expect(difference(production.held,result.swatch)).toBeLessThanOrEqual(2);
      }
    }
    expect(errors).toEqual([]);
  }finally{
    try{await writeFile(testInfo.outputPath('original-color-output-results.json'),JSON.stringify({results,errors},null,2));}
    finally{try{await context?.close();}finally{server.closeAllConnections();await new Promise<void>((accept,reject)=>server.close(error=>error?reject(error):accept()));}}
  }
});
