import {readFileSync,writeFileSync} from 'node:fs';
import {createOriginalDoorWorld} from '../../../../shared/originalDoorWorld';
import {ORIGINAL_MAP_SCALE as S,ORIGINAL_PLAYER_RADIUS as R} from '../../../../shared/originalMapProfile';
import {ORIGINAL_COLLISION_CONTACT_DISTANCE as T} from '../../../../shared/originalExplosives';
const base='docs/research-evidence/2026-10-03/barrack-window-connection/', world=createOriginalDoorWorld(JSON.parse(readFileSync('public/assets/original-scenes/barrack/scene.json','utf8')),S,JSON.parse(readFileSync('public/assets/original-scenes/barrack/doors.json','utf8')));
let queries=3289; const records=[];
for(let z=34;z<=72;z+=2){queries++;const support=world.fixedGeometry.playerSupportHeightAt(77.12,z,8,R,2*R);queries++;const intersects=support===undefined?null:world.playerIntersects({x:77.12,y:support,z},R,2*R);records.push({x:77.12,z,support,intersects});}
const blocked=JSON.parse(readFileSync(base+'replay.json','utf8')).segments.at(-1).final;queries++;const contacts=world.contactsSphere(blocked,R,T);
writeFileSync(base+'inspection.json',JSON.stringify({queries,budget:4000,records,blocked,contacts},null,2));console.log(JSON.stringify({queries,records,contacts},null,2));
