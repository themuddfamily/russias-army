import {readFileSync,writeFileSync} from 'node:fs';
import {createOriginalSceneGeometry} from '../../../shared/originalSceneGeometry';
import {ORIGINAL_MAP_SCALE,ORIGINAL_SOURCE_SPAWNS,ORIGINAL_PLAYER_RADIUS,ORIGINAL_PLAYER_BODY_HEIGHT,getOriginalSettledSpawns} from '../../../shared/originalMapProfile';
const rows=[];
for(const [map,name] of [['barrack','barrack-level1'],['woodlands','woodland-level2']] as const){
 const raw=JSON.parse(readFileSync(new URL(`./w3d-decoded/${name}/geometry.json`,import.meta.url),'utf8'));
 const g=createOriginalSceneGeometry(raw,{scale:ORIGINAL_MAP_SCALE});const spawns=getOriginalSettledSpawns(map,g);
 const r={map,scale:ORIGINAL_MAP_SCALE,groundBounds:g.groundBounds,spawns:spawns.map((feet,i)=>({source:ORIGINAL_SOURCE_SPAWNS[map][i],settledFeet:feet,supportSourceUnits:feet.y/ORIGINAL_MAP_SCALE,sourceSpawnEyeAboveSupport:ORIGINAL_SOURCE_SPAWNS[map][i].position[2]-feet.y/ORIGINAL_MAP_SCALE,sourceLateralEquilibriumShift:[feet.x/ORIGINAL_MAP_SCALE-(ORIGINAL_SOURCE_SPAWNS[map][i].position[0]+4),-feet.z/ORIGINAL_MAP_SCALE-ORIGINAL_SOURCE_SPAWNS[map][i].position[1]],nonOverlapping:!g.playerIntersects(feet,ORIGINAL_PLAYER_RADIUS,ORIGINAL_PLAYER_BODY_HEIGHT)}))};rows.push(r);
 if(r.spawns.some(spawn=>!spawn.nonOverlapping))throw new Error(`${map} source spawn intersects original geometry`);
 console.log(`${map}: ${r.spawns.length} supported, non-overlapping spawns`);
}
writeFileSync(new URL('./ORIGINAL_SPAWN_VALIDATION.json',import.meta.url),JSON.stringify(rows,null,2)+'\n');
