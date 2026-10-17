import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const folder='docs/research-evidence/2026-10-03/barrack-sky-boundary-isolation';
await build({entryPoints:[folder+'/entry.ts'],outfile:folder+'/bundle.js',bundle:true,format:'iife',platform:'browser'});
const server=createServer(async(req,res)=>{try{let path=req.url==='/'?folder+'/index.html':req.url==='/bundle.js'?folder+'/bundle.js':'public'+req.url;const b=await readFile(resolve(path));res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg'})[extname(path)]||'application/octet-stream');res.end(b);}catch(e){res.writeHead(404);res.end(String(e));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:576},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.result||window.failure,{timeout:60000});const failure=await page.evaluate(()=>window.failure);if(failure)throw Error(failure);const result=await page.evaluate(()=>window.result);
for(const name of ['baseline','intervention']){await writeFile(folder+'/'+name+'.png',Buffer.from(result[name].png.split(',')[1],'base64'));await writeFile(folder+'/'+name+'.rgba',Buffer.from(result[name].pixels));delete result[name];}
await writeFile(folder+'/settings.json',JSON.stringify({...result,errors},null,2));console.log(JSON.stringify({status:'captured',errors}));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
