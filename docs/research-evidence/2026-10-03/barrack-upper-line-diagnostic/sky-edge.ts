import * as THREE from 'three';
import {readFileSync,writeFileSync} from 'node:fs';
import {createOriginalSceneMaterials} from '../../../../src/originalSceneMaterials';
import {ORIGINAL_MAP_SCALE} from '../../../../shared/originalMapProfile';
const folder='docs/research-evidence/2026-10-03/barrack-upper-line-diagnostic/';
const data=JSON.parse(readFileSync('public/assets/original-scenes/barrack/scene.json','utf8'));
const textures=Object.fromEntries(Object.keys(data.textures).map(name=>[name,new THREE.Texture()]));
const library=createOriginalSceneMaterials(data,textures),sky=library.createSky();
const root=new THREE.Group();root.rotation.x=-Math.PI/2;root.scale.setScalar(ORIGINAL_MAP_SCALE);root.add(sky);root.updateMatrixWorld(true);
const camera=new THREE.PerspectiveCamera(50,1280/576,.1,1200);camera.position.set(50.7,10.74582918772978+1.72,64.24);camera.rotation.set(0,Math.PI/2,0,'YXZ');camera.updateMatrixWorld(true);
const position=sky.geometry.getAttribute('position'),uv=sky.geometry.getAttribute('uv'),top=[];
for(let i=0;i<position.count;i++)if(position.getY(i)===1000){
 const world=new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(sky.matrixWorld),eye=world.clone().applyMatrix4(camera.matrixWorldInverse),ndc=world.clone().project(camera);
 top.push({index:i,world:world.toArray(),depth:-eye.z,pixel:[(ndc.x+1)*640,(1-ndc.y)*288],uv:[uv.getX(i),uv.getY(i)],transformedUv:new THREE.Vector2(uv.getX(i),uv.getY(i)).applyMatrix3(sky.material.map!.matrix).toArray()});
}
sky.material.map!.updateMatrix();
for(const point of top)point.transformedUv=new THREE.Vector2(...point.uv as [number,number]).applyMatrix3(sky.material.map!.matrix).toArray();
writeFileSync(folder+'sky-edge.json',JSON.stringify({scope:'Projection of current generated sky top edge from exact captured before-camera fixture; not native cylinder or filtering proof',top,repeat:sky.material.map!.repeat.toArray(),offset:sky.material.map!.offset.toArray(),wrapT:sky.material.map!.wrapT,minFilter:sky.material.map!.minFilter,magFilter:sky.material.map!.magFilter},null,2));
console.log(JSON.stringify(top.filter(p=>p.depth>0&&p.pixel[0]>0&&p.pixel[0]<1280)));library.dispose();
