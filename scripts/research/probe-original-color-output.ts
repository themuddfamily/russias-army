import * as THREE from 'three';
import type {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {Game} from '../../src/game';

export interface ColorOutputCase {map:'barrack'|'woodlands'|'winter';quality:'low'|'balanced'|'high'}
interface Harness {
  renderer:THREE.WebGLRenderer;container:HTMLDivElement;scene:THREE.Scene;
  camera:THREE.OrthographicCamera;archivalWinter:boolean;mapId:string;
  renderTier:string;enhancedRendering:boolean;renderPipelinePasses:string[];
  setupRenderer():void;setupPostProcessing():EffectComposer|undefined;
}
interface Pixels {
  world:number[];held:number[];size:number[];toneMapping:number;exposure:number;png:string;
}
export interface ColorOutputResult {
  fixture:ColorOutputCase;swatch:number[];tier:string;passes:string[];
  productionToneMapping:number;productionExposure:number;acesToneMapping:number;noToneMapping:number;
  control:Pixels;production:Pixels;
}

/** Numerical WebGL output probe, not a historical lighting/color reference.
 * Uses the actual renderer/postprocessing methods without constructing Game,
 * advancing its clock, loading a match, or changing production configuration. */
export async function runOriginalColorOutputProbe(fixture:ColorOutputCase):Promise<ColorOutputResult>{
  const url=new URL(location.href);url.searchParams.set('quality',fixture.quality);history.replaceState(null,'',url);
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
  const container=document.createElement('div');document.body.appendChild(container);
  const scene=new THREE.Scene(),heldScene=new THREE.Scene();
  const camera=new THREE.OrthographicCamera(-1,1,.5,-.5,.1,10);camera.position.z=2;camera.lookAt(0,0,0);camera.updateProjectionMatrix();
  const heldCamera=camera.clone(),swatch=[110,130,155];
  const texture=new THREE.DataTexture(new Uint8Array([...swatch,255]),1,1,THREE.RGBAFormat);
  texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=texture.magFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
  const geometry=new THREE.PlaneGeometry(.8,.8),material=new THREE.MeshBasicMaterial({map:texture,toneMapped:false});
  const world=new THREE.Mesh(geometry,material),held=new THREE.Mesh(geometry,material);world.position.x=-.5;held.position.x=.5;
  scene.add(world);
  const harness=Object.assign(Object.create(Game.prototype),{renderer,container,scene,camera,
    archivalWinter:fixture.map==='winter',mapId:fixture.map==='winter'?'barrack':fixture.map,renderPipelinePasses:[]}) as Harness;
  let composer:EffectComposer|undefined;
  try{
    harness.setupRenderer();
    const productionToneMapping=renderer.toneMapping,productionExposure=renderer.toneMappingExposure;
    composer=harness.setupPostProcessing();
    // Follow production's low one-scene path and enhanced composer-then-held
    // render path. Shared texture/material remove asset or lighting differences.
    if(composer)heldScene.add(held);else scene.add(held);
    if(composer){
      const images:HTMLImageElement[]=[];
      for(const pass of composer.passes){
        const textures=pass as unknown as {_areaTexture?:THREE.Texture;_searchTexture?:THREE.Texture};
        for(const item of [textures._areaTexture,textures._searchTexture])if(item?.image instanceof HTMLImageElement)images.push(item.image);
      }
      let timer:ReturnType<typeof setTimeout>|undefined;
      try{await Promise.race([Promise.all(images.map(image=>image.decode())),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('SMAA image readiness exceeded3s')),3000);})]);}
      finally{if(timer!==undefined)clearTimeout(timer);}
    }
    const sample=():Pixels=>{
      renderer.setRenderTarget(null);
      if(composer){
        composer.render();const autoClear=renderer.autoClear;renderer.autoClear=false;
        try{renderer.clearDepth();renderer.render(heldScene,heldCamera);}finally{renderer.autoClear=autoClear;}
      }else renderer.render(scene,camera);
      const gl=renderer.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;
      const pixel=(fraction:number)=>{const rgba=new Uint8Array(4);gl.readPixels(Math.floor(width*fraction),Math.floor(height*.5),1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba);return [...rgba];};
      const world=pixel(.25),held=pixel(.75),error=gl.getError();if(error!==gl.NO_ERROR)throw Error(`WebGL readback error${error}`);
      const png=renderer.domElement.toDataURL('image/png');if(png.length>524288)throw Error('Probe PNG exceeds bounded output');
      return {world,held,size:[width,height],toneMapping:renderer.toneMapping,exposure:renderer.toneMappingExposure,png};
    };
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;
    const control=sample();
    // Keep the SAME composer: its real OutputPass must refresh defines from
    // renderer settings when returning to actual Game.setupRenderer choices.
    renderer.toneMapping=productionToneMapping;renderer.toneMappingExposure=productionExposure;
    const production=sample();
    return {fixture,swatch,tier:harness.renderTier,passes:[...harness.renderPipelinePasses],productionToneMapping,
      productionExposure,acesToneMapping:THREE.ACESFilmicToneMapping,noToneMapping:THREE.NoToneMapping,control,production};
  }finally{
    if(composer){for(const pass of composer.passes)pass.dispose();composer.dispose();}
    geometry.dispose();material.dispose();texture.dispose();scene.clear();heldScene.clear();
    renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();container.remove();
  }
}
