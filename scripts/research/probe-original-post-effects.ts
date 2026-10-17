import * as THREE from 'three';
import type {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {Game} from '../../src/game';

declare const __RA_POST_EFFECTS_BUILD__:{variant:'before'|'after';gameSourceSha256:string};
export interface PostEffectsFixture {map:'barrack'|'woodlands'|'winter';quality:'low'|'balanced'|'high'}
interface Harness {renderer:THREE.WebGLRenderer;container:HTMLDivElement;scene:THREE.Scene;camera:THREE.OrthographicCamera;archivalWinter:boolean;mapId:string;renderTier:string;enhancedRendering:boolean;renderPipelinePasses:string[];setupRenderer():void;setupPostProcessing():EffectComposer|undefined}
interface ImageEvidence {size:number[];png:string;rgbaBase64:string}
interface Delta {maxChannelDifference:number;pixelsChanged:number;pixelsChangedByAtLeast3:number}
export interface PostEffectsResult {
  build:typeof __RA_POST_EFFECTS_BUILD__;fixture:PostEffectsFixture;passes:string[];toneMapping:number;
  fixtureRandom:{seed:number;calls:number;restored:boolean};
  baseline:ImageEvidence;clean:ImageEvidence;bloom:{all:Delta;roi:Delta};gtao:{all:Delta;roi:Delta};cleanDelta:Delta;
  rois:{bloom:number[];gtao:number[]};scope:string;
}
const base64=(bytes:Uint8Array)=>{let text='';for(let start=0;start<bytes.length;start+=8192)text+=String.fromCharCode(...bytes.subarray(start,start+8192));return btoa(text);};

/** Actual Game pipeline comparison with synthetic unlit geometry. This is an
 * output/ownership regression, not a native Director lighting reference. */
export async function runOriginalPostEffectsProbe(fixture:PostEffectsFixture,controls=true):Promise<PostEffectsResult>{
  const url=new URL(location.href);url.searchParams.set('quality',fixture.quality);history.replaceState(null,'',url);
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true}),container=document.createElement('div');document.body.appendChild(container);
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1.4,1.4,.7,-.7,.1,10);camera.position.z=4;camera.lookAt(0,0,0);camera.updateProjectionMatrix();
  const gray=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(.32,.32,.32),toneMapped:false}),white=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false});
  const backingGeometry=new THREE.PlaneGeometry(3.2,1.8),patchGeometry=new THREE.PlaneGeometry(.44,.44),cornerGeometry=new THREE.BoxGeometry(.6,.65,.5);
  const backing=new THREE.Mesh(backingGeometry,gray),patch=new THREE.Mesh(patchGeometry,white),corner=new THREE.Mesh(cornerGeometry,gray);
  patch.position.set(-.75,.2,.05);corner.position.set(.58,-.15,.25);scene.add(backing,patch,corner);
  const harness=Object.assign(Object.create(Game.prototype),{renderer,container,scene,camera,archivalWinter:fixture.map==='winter',mapId:fixture.map==='winter'?'barrack':fixture.map,renderPipelinePasses:[]}) as Harness;
  let composer:EffectComposer|undefined;
  const fixtureRandom={seed:0x5a17c0de,calls:0,restored:false};
  try{
    harness.setupRenderer();
    // GTAOPass constructs SimplexNoise with Math.random. Give both saved and
    // current pipelines the same fixture noise; never alter production RNG.
    const originalRandom=Math.random;let randomState=fixtureRandom.seed;
    try{
      Math.random=()=>{fixtureRandom.calls++;randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
      composer=harness.setupPostProcessing();
    }finally{Math.random=originalRandom;fixtureRandom.restored=Math.random===originalRandom;}
    if(composer){
      const images:HTMLImageElement[]=[];
      for(const pass of composer.passes){const typed=pass as unknown as {_areaTexture?:THREE.Texture;_searchTexture?:THREE.Texture};for(const texture of [typed._areaTexture,typed._searchTexture])if(texture?.image instanceof HTMLImageElement)images.push(texture.image);}
      let timer:ReturnType<typeof setTimeout>|undefined;
      try{await Promise.race([Promise.all(images.map(image=>image.decode())),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('SMAA readiness exceeded3s')),3000);})]);}finally{if(timer!==undefined)clearTimeout(timer);}
    }
    const render=()=>{
      renderer.setRenderTarget(null);if(composer)composer.render();else renderer.render(scene,camera);
      const gl=renderer.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;
      if(width*height>65536)throw Error('Probe pixel budget exceeded');
      const bytes=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
      const error=gl.getError();if(error!==gl.NO_ERROR)throw Error(`WebGL readback error${error}`);
      return {bytes,size:[width,height]};
    };
    const baseline=render(),[width,height]=baseline.size;
    // Fixed world-space regions chosen before observing pixel differences.
    // White-patch halo and gray backing/box junction include adjacent pixels.
    const roi=(bounds:number[])=>[Math.floor((bounds[0]+1.4)/2.8*width),Math.floor((bounds[1]+.7)/1.4*height),Math.ceil((bounds[2]+1.4)/2.8*width),Math.ceil((bounds[3]+.7)/1.4*height)];
    const rois={bloom:roi([-1.15,-.15,-.3,.55]),gtao:roi([.15,-.6,1.1,.35])};
    const delta=(a:Uint8Array,b:Uint8Array,bounds=[0,0,width,height]):Delta=>{
      let maxChannelDifference=0,pixelsChanged=0,pixelsChangedByAtLeast3=0;
      for(let y=Math.max(0,bounds[1]);y<Math.min(height,bounds[3]);y++)for(let x=Math.max(0,bounds[0]);x<Math.min(width,bounds[2]);x++){
        const index=(y*width+x)*4;let difference=0;for(let channel=0;channel<3;channel++)difference=Math.max(difference,Math.abs(a[index+channel]-b[index+channel]));
        maxChannelDifference=Math.max(maxChannelDifference,difference);if(difference)pixelsChanged++;if(difference>=3)pixelsChangedByAtLeast3++;
      }
      return {maxChannelDifference,pixelsChanged,pixelsChangedByAtLeast3};
    };
    const disabled=(names:string[])=>{
      if(!controls||!composer)return baseline;
      const previous=composer.passes.map(pass=>pass.enabled);
      try{composer.passes.forEach((pass,index)=>{if(names.includes(harness.renderPipelinePasses[index]))pass.enabled=false;});return render();}
      finally{composer.passes.forEach((pass,index)=>{pass.enabled=previous[index];});}
    };
    const noBloom=disabled(['UnrealBloomPass']),noGtao=disabled(['GTAOPass']),clean=disabled(['UnrealBloomPass','GTAOPass']);
    const capture=(frame:ReturnType<typeof render>):ImageEvidence=>{
      // Encode the preserved GPU bytes, including before controls, rather than
      // relying on whichever frame happens to remain on the default canvas.
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');if(!context)throw Error('Missing capture context');
      const topOrigin=new Uint8ClampedArray(frame.bytes.length);for(let y=0;y<height;y++)topOrigin.set(frame.bytes.subarray(y*width*4,(y+1)*width*4),(height-y-1)*width*4);
      context.putImageData(new ImageData(topOrigin,width,height),0,0);const png=canvas.toDataURL('image/png');if(png.length>524288)throw Error('Probe PNG exceeds512KiB');
      return {size:frame.size,png,rgbaBase64:base64(frame.bytes)};
    };
    return {build:__RA_POST_EFFECTS_BUILD__,fixture,passes:[...harness.renderPipelinePasses],toneMapping:renderer.toneMapping,fixtureRandom,baseline:capture(baseline),clean:capture(clean),
      bloom:{all:delta(baseline.bytes,noBloom.bytes),roi:delta(baseline.bytes,noBloom.bytes,rois.bloom)},
      gtao:{all:delta(baseline.bytes,noGtao.bytes),roi:delta(baseline.bytes,noGtao.bytes,rois.gtao)},cleanDelta:delta(baseline.bytes,clean.bytes),rois,
      scope:'Synthetic fixed unlit patch/corner. Actual Game renderer/composer methods; fixture-only seeded Math.random during synchronous composer construction, restored before rendering. No native pixel, material inheritance, lighting or historical camera claim.'};
  }finally{
    if(composer){for(const pass of composer.passes)pass.dispose();composer.dispose();}
    gray.dispose();white.dispose();backingGeometry.dispose();patchGeometry.dispose();cornerGeometry.dispose();scene.clear();
    renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();container.remove();
  }
}
