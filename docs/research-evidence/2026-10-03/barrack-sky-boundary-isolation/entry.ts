import * as THREE from 'three';
import {createOriginalSceneMaterials} from '../../../../src/originalSceneMaterials';
import {ORIGINAL_MAP_SCALE} from '../../../../shared/originalMapProfile';
(async()=>{
 const data=await (await fetch('/assets/original-scenes/barrack/scene.json')).json();
 const name=data.runtime.sky.texture;
 const texture=await new THREE.TextureLoader().loadAsync(data.textures[name].url);
 const library=createOriginalSceneMaterials(data,{[name]:texture});
 const sky=library.createSky(),group=new THREE.Group(),scene=new THREE.Scene();
 group.rotation.x=-Math.PI/2;group.scale.setScalar(ORIGINAL_MAP_SCALE);group.add(sky);scene.add(group);scene.background=library.background;scene.fog=null;
 const camera=new THREE.PerspectiveCamera(50,1280/576,.1,1200);camera.position.set(50.7,12.46582918772978,64.24);camera.rotation.set(0,Math.PI/2,0,'YXZ');camera.updateMatrixWorld(true);scene.updateMatrixWorld(true);
 const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(1280,576);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;document.body.append(renderer.domElement);
 const settings=()=>({wrapS:texture.wrapS,wrapT:texture.wrapT,minFilter:texture.minFilter,magFilter:texture.magFilter,repeat:texture.repeat.toArray(),offset:texture.offset.toArray(),generateMipmaps:texture.generateMipmaps,flipY:texture.flipY,colorSpace:texture.colorSpace});
 const capture=()=>{renderer.render(scene,camera);const gl=renderer.getContext(),pixels=new Uint8Array(1280*576*4);gl.readPixels(0,0,1280,576,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return {png:renderer.domElement.toDataURL('image/png'),pixels:Array.from(pixels)};};
 const baselineSettings=settings(),baseline=capture();texture.wrapT=THREE.ClampToEdgeWrapping;texture.needsUpdate=true;const interventionSettings=settings(),intervention=capture();
 const points=[];const pos=sky.geometry.getAttribute('position');for(let i=0;i<pos.count;i++)if(pos.getY(i)===data.runtime.sky.height/2){const world=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(sky.matrixWorld),eye=world.clone().applyMatrix4(camera.matrixWorldInverse),p=world.clone().project(camera);if(-eye.z>0)points.push({index:i,x:(p.x+1)*640,y:(1-p.y)*288});}
 (window as any).result={baseline,intervention,baselineSettings,interventionSettings,points,runtime:data.runtime.sky,scale:ORIGINAL_MAP_SCALE,renderer:{antialias:true,pixelRatio:1,width:1280,height:576,outputColorSpace:renderer.outputColorSpace,toneMapping:renderer.toneMapping,exposure:renderer.toneMappingExposure,glRenderer:renderer.getContext().getParameter(renderer.getContext().RENDERER)}};
})().catch(e=>{(window as any).failure=String(e.stack||e)});
