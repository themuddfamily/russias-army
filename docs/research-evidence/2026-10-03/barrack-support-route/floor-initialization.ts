import {readFileSync,writeFileSync} from 'node:fs';
import {createOriginalSceneGeometry} from '../../../../shared/originalSceneGeometry';
import {ORIGINAL_MAP_SCALE as S} from '../../../../shared/originalMapProfile';
import {ORIGINAL_PLAYER_RADIUS as R} from '../../../../shared/originalPlayerPhysics';
const b='docs/research-evidence/2026-10-03/barrack-support-route/',g=createOriginalSceneGeometry(JSON.parse(readFileSync('public/assets/original-scenes/barrack/scene.json','utf8')),{scale:S}),x=48.6,z=64.24;
const floorOnly=g.supportHeightAt(x,z,Infinity,true),localSupport=g.playerSupportHeightAt(x,z,11,R,2*R),prior=JSON.parse(readFileSync(b+'verification.json','utf8'));
writeFileSync(b+'floor-initialization.json',JSON.stringify({x,z,floorOnly,localSupport,matches:floorOnly===localSupport,additionalQueries:2,totalQueries:prior.totalQueries+2,budget:3000,decision:'No reverse replay: actual Game floor-only initialization does not agree with elevated outside support; use an actually connected approach rather than inventing a debug hook.'},null,2));console.log({floorOnly,localSupport});
