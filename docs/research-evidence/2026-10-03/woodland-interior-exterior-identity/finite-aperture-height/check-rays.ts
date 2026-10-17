import fs from 'node:fs';
import path from 'node:path';
import {createOriginalSceneGeometry,sourcePointToWorld} from '../../../../../shared/originalSceneGeometry';
const folder=path.dirname(new URL(import.meta.url).pathname),R=process.cwd();
const scene=JSON.parse(fs.readFileSync(path.join(R,'public/assets/original-scenes/woodland/scene.json'),'utf8'));
const w=JSON.parse(fs.readFileSync(path.join(folder,'witness-float.json'),'utf8'));
const scale=1.72/85,g=createOriginalSceneGeometry(scene,{scale});
const counts:Record<string,number>={};
for(const name of ['playerSupportHeightAt','playerIntersects','raycast']){const fn=(g as any)[name].bind(g);(g as any)[name]=(...args:any[])=>{counts[name]=(counts[name]??0)+1;return fn(...args)}}
const C=w.sourceCamera,feetHeight=g.playerSupportHeightAt(C[0]*scale,-C[1]*scale,(C[2]-85+1)*scale,25*scale,50*scale);
const original=sourcePointToWorld(C,scale);
const support=feetHeight===undefined?null:{sourceFeetZ:feetHeight/scale,sourceEyeZ:feetHeight/scale+85,deltaFromSeamWitness:feetHeight/scale+85-C[2],playerIntersects:g.playerIntersects({x:original.x,y:feetHeight,z:original.z},25*scale,50*scale)};
const origin=support?{...original,y:feetHeight!+85*scale}:original;
const downward=g.raycast(origin,{x:0,y:-1,z:0},300*scale);
// Two rays stop0.01 source units short of the intended cafe top endpoints. Target edges are not occluders.
const rays=Object.entries(w.targets).map(([id,p]:[string,any])=>{const target=sourcePointToWorld(p,scale),d={x:target.x-origin.x,y:target.y-origin.y,z:target.z-origin.z},distance=Math.hypot(d.x,d.y,d.z),hit=g.raycast(origin,d,distance-.01*scale);return {cafeVertex:Number(id),origin,target,maxDistanceSourceUnits:distance/scale-.01,hit,hitSourcePoint:hit?[hit.point.x/scale,-hit.point.z/scale,hit.point.y/scale]:null}});
const result={scope:'Constructed source-seam XY witness, actual recovered fixed-scene radius-aware support, and finite endpoint visibility. No image camera fit/native view registration.',scale,triangleCount:g.triangleCount,originalSourceCamera:C,support,actualSourceCamera:[origin.x/scale,-origin.z/scale,origin.y/scale],downwardSupportRay:downward,rays,queryCounts:counts,totalPublicCallsIncludingInternalPlayerIntersects:Object.values(counts).reduce((a,b)=>a+b,0),admittedSourceAnchors:[]};
if(result.totalPublicCallsIncludingInternalPlayerIntersects>50)throw Error('Query budget exceeded');
fs.writeFileSync(path.join(folder,'ray-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
