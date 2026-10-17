import {readFileSync,writeFileSync} from 'node:fs';
import {createOriginalSceneGeometry} from '../../../../shared/originalSceneGeometry';
import {ORIGINAL_MAP_SCALE} from '../../../../shared/originalMapProfile';
const folder='docs/research-evidence/2026-10-03/barrack-upper-line-diagnostic/';
const scene=JSON.parse(readFileSync('public/assets/original-scenes/barrack/scene.json','utf8'));
const geometry=createOriginalSceneGeometry(scene,{scale:ORIGINAL_MAP_SCALE});
const origin={x:50.7,y:10.74582918772978+1.72,z:64.24};
const tan=Math.tan(50*Math.PI/360),aspect=1280/576;
const rays=[];
for(const x of [400,600,800,950])for(const y of [150,170,190,210]){
 const direction={x:-1,y:(1-2*y/576)*tan,z:-(2*x/1280-1)*aspect*tan};
 rays.push({pixel:[x,y],direction,hit:geometry.raycast(origin,direction,1200)});
}
writeFileSync(folder+'rays.json',JSON.stringify({scope:'CPU fixed-scene probes around a visible high line in a current-copy window fixture screenshot; not pixel/object registration or source renderer parity',origin,viewport:[1280,576],fov:50,rays,queries:rays.length},null,2));
console.log(JSON.stringify(rays));
