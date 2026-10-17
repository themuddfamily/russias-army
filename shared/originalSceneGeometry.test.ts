import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createOriginalSceneGeometry,originalNodeWorldMatrices,sourcePointToWorld,type OriginalSceneData,type OriginalSceneMesh,type OriginalSceneNode} from './originalSceneGeometry';
import type {OriginalConvexPolytope} from './originalConvexSweep';
import {originalRpgConvex,originalRpgBasisFromSourceRotation} from './originalRpgShape';
import {ORIGINAL_MAP_SCALE} from './originalMapProfile';
const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function node(name:string,resource=name,matrix=I,parent='World'):OriginalSceneNode{return {name,resource,matrix,parent,visibility:1,shader:'default'};}
function mesh(resource:string,worldPositions:number[][],faces:number[][]):OriginalSceneMesh {
 return {resource,part:0,positions:worldPositions.map(([x,y,z])=>[x,-z,y]),faces,normals:[],tex_coords:[]};
}
function sourceData(name:string):OriginalSceneData {
 return JSON.parse(readFileSync(new URL(`../docs/research-evidence/2026-09-30/w3d-decoded/${name}/geometry.json`,import.meta.url),'utf8')) as OriginalSceneData;
}
const floor=mesh('floor',[[-4,0,-4],[4,0,-4],[4,0,4],[-4,0,4]],[[0,2,1],[0,3,2]]);
describe('original map triangle geometry',()=>{
 it('finds the recovered full RPG nose where the previous transverse sphere still misses the wall',()=>{
  const wall=mesh('wall',[[-3,0,0],[3,0,0],[3,3,0],[-3,3,0]],[[0,1,2],[0,2,3]]);
  const geometry=createOriginalSceneGeometry({nodes:[node('wall')],meshes:[wall]},{scale:1,cellSize:.5});
  const shape=originalRpgConvex(originalRpgBasisFromSourceRotation({x:0,y:0,z:0}));
  const extent=-Math.min(...shape.vertices.map(v=>v.z));
  const from={x:0,y:1,z:2},to={x:0,y:1,z:.4};
  expect(geometry.sweepSphere(from,to,2.7133301903537212*ORIGINAL_MAP_SCALE)).toBeNull();
  const hit=geometry.sweepConvex(from,to,shape)!;
  expect(hit).not.toBeNull();expect(hit.position.z).toBeCloseTo(extent,10);expect(hit.fraction).toBeCloseTo((2-extent)/1.6,10);expect(hit.normal.z).toBeCloseTo(1,10);
 });
 it('sweeps a full offset convex shape through actual concave openings and preserves its pivot at contact',()=>{
  const wall=mesh('wall',[[-3,0,0],[-1,0,0],[-1,3,0],[-3,3,0],[1,0,0],[3,0,0],[3,3,0],[1,3,0]],[[0,1,2],[0,2,3],[4,5,6],[4,6,7]]);
  const geometry=createOriginalSceneGeometry({nodes:[node('wall')],meshes:[wall]},{scale:1,cellSize:.5});
  const axes=[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}];
  const shape:OriginalConvexPolytope={vertices:[-.2,.2].flatMap(x=>[-.2,.2].flatMap(y=>[.1,.9].map(z=>({x,y,z})))),faceNormals:axes,edgeDirections:axes};
  expect(geometry.sweepConvex({x:0,y:1,z:-2},{x:0,y:1,z:2},shape)).toBeNull();
  const hit=geometry.sweepConvex({x:2,y:1,z:-2},{x:2,y:1,z:2},shape)!;
  expect(hit.fraction).toBeCloseTo(1.1/4,12);expect(hit.position.z).toBeCloseTo(-.9,12);expect(hit.normal.z).toBeCloseTo(-1,12);
 });
 it('sweeps projectile spheres to floor contact without tunneling or stopping separating motion',()=>{
  const geometry=createOriginalSceneGeometry({nodes:[node('floor')],meshes:[floor]},{scale:1,cellSize:1});
  const hit=geometry.sweepSphere({x:0,y:2,z:0},{x:0,y:-2,z:0},.1)!;
  expect(hit.position.y).toBeCloseTo(.1,5);expect(hit.normal).toEqual({x:0,y:1,z:0});expect(hit.fraction).toBeCloseTo(.475,5);
  expect(geometry.sweepSphere({x:0,y:.1,z:0},{x:0,y:2,z:0},.1)).toBeNull();
  expect(geometry.sweepSphere({x:0,y:.1,z:0},{x:2,y:.1,z:0},.1)).toBeNull();
 });
 it('keeps a concave opening clear for spheres and returns its wall normal at the edge',()=>{
  const wall=mesh('wall',[[-3,0,0],[-1,0,0],[-1,3,0],[-3,3,0],[1,0,0],[3,0,0],[3,3,0],[1,3,0]],[[0,1,2],[0,2,3],[4,5,6],[4,6,7]]);
  const geometry=createOriginalSceneGeometry({nodes:[node('wall')],meshes:[wall]},{scale:1,cellSize:1});
  expect(geometry.sweepSphere({x:0,y:1,z:-2},{x:0,y:1,z:2},.2)).toBeNull();
  const hit=geometry.sweepSphere({x:2,y:1,z:-2},{x:2,y:1,z:2},.2)!;
  expect(hit.position.z).toBeCloseTo(-.2,5);expect(hit.normal.z).toBeCloseTo(-1);
 });
 it('composes stored parent/node matrices before applying the proper Z-up basis and caller scale',()=>{
  const parent=[2,0,0,0,0,2,0,0,0,0,2,0,100,200,300,1],child=[...I];child[12]=1;child[13]=2;child[14]=3;
  const data:OriginalSceneData={nodes:[node('Parent','',parent),node('floor','floor',child,'PARENT')],meshes:[{resource:'floor',part:0,positions:[[0,0,0],[2,0,0],[0,2,0]],faces:[[0,1,2]],normals:[],tex_coords:[]}]};
  const matrix=originalNodeWorldMatrices(data).get('floor')!;
  expect(matrix.slice(12,15)).toEqual([102,204,306]);
  expect(sourcePointToWorld([102,204,306],.01)).toEqual({x:1.02,y:3.06,z:-2.04});
  const geometry=createOriginalSceneGeometry(data,{scale:.01,cellSize:.1});
  expect(geometry.supportHeightAt(1.03,-2.05,4)).toBeCloseTo(3.06);
  expect(geometry.raycast({x:1.03,y:4,z:-2.05},{x:0,y:-1,z:0},2)).toMatchObject({id:'floor',surface:'ground'});
 });
 it('preserves concave doorway openness rather than filling the model bounds',()=>{
  const wall=mesh('wall',[[-3,0,0],[-1,0,0],[-1,3,0],[-3,3,0],[1,0,0],[3,0,0],[3,3,0],[1,3,0],[-1,2,0],[1,2,0],[1,3,0],[-1,3,0]],[[0,1,2],[0,2,3],[4,5,6],[4,6,7],[8,9,10],[8,10,11]]);
  const geometry=createOriginalSceneGeometry({nodes:[node('wall'),node('floor')],meshes:[wall,floor]},{scale:1,cellSize:1});
  expect(geometry.raycast({x:0,y:1,z:-2},{x:0,y:0,z:1},4)).toBeNull();
  expect(geometry.raycast({x:2,y:1,z:-2},{x:0,y:0,z:1},4)).toMatchObject({id:'wall',distance:2});
  expect(geometry.raycast({x:0,y:2.5,z:-2},{x:0,y:0,z:1},4)).toMatchObject({id:'wall',distance:2});
  expect(geometry.supportHeightAt(0,0,1)).toBe(0);
  expect(geometry.raycast({x:0,y:2,z:0},{x:0,y:-1,z:0},3,{includeGround:false})).toBeNull();
 });
 it('uses original fixed-model exclusions while retaining invisible leaf geometry',()=>{
  const leaf=mesh('leaf',[[-1,2,-1],[1,2,-1],[1,2,1],[-1,2,1]],[[0,2,1],[0,3,2]]);
  const excluded=['door open 1','BADDY','barrel1'].map(name=>node(name,'leaf'));
  const geometry=createOriginalSceneGeometry({nodes:[...excluded,{...node('rowanbranch','leaf'),visibility:0},node('floor')],meshes:[leaf,floor]},{scale:1,cellSize:1});
  expect(geometry.triangleCount).toBe(4);
  expect(geometry.supportHeightAt(0,0,3)).toBe(2);
  expect(geometry.supportHeightAt(0,0,3,true)).toBe(0);
 });
 it('finds nearest triangles across grid boundaries and respects ray limits/minimums',()=>{
  const roof=mesh('roof',[[-2,2,-2],[2,2,-2],[2,2,2],[-2,2,2]],[[0,2,1],[0,3,2]]);
  const geometry=createOriginalSceneGeometry({nodes:[node('roof'),node('floor')],meshes:[floor,roof]},{scale:1,cellSize:.5});
  expect(geometry.raycast({x:-3,y:3,z:-3},{x:1,y:-1,z:1},10)?.id).toBe('roof');
  expect(geometry.raycast({x:0,y:3,z:0},{x:0,y:-1,z:0},.9)).toBeNull();
  expect(geometry.raycast({x:0,y:3,z:0},{x:0,y:-1,z:0},4,{minDistance:1.1})?.id).toBe('floor');
  expect(geometry.supportHeightAt(0,0,1)).toBe(0);
 });
 it('never treats an underside or a steep face as standing support',()=>{
  const underside=mesh('underside',[[-2,2,-2],[2,2,-2],[2,2,2],[-2,2,2]],[[0,1,2],[0,2,3]]);
  const steep=mesh('steep',[[0,0,0],[1,3,0],[1,3,1],[0,0,1]],[[0,2,1],[0,3,2]]);
  const geometry=createOriginalSceneGeometry({nodes:[node('underside'),node('steep'),node('floor')],meshes:[underside,steep,floor]},{scale:1,cellSize:1});
  expect(geometry.supportHeightAt(-1,0,3)).toBe(0);
  expect(geometry.supportHeightAt(.5,.5,1.8)).toBe(0);
  expect(geometry.raycast({x:-1,y:1,z:0},{x:0,y:1,z:0},2)).toMatchObject({id:'underside',distance:1});
 });
 it('visits vertical rays on grid boundaries and diagonal rays through cell corners',()=>{
  const geometry=createOriginalSceneGeometry({nodes:[node('floor')],meshes:[floor]},{scale:1,cellSize:1});
  expect(geometry.raycast({x:1,y:2,z:1},{x:0,y:-1,z:0},3)).toMatchObject({id:'floor',distance:2});
  expect(geometry.raycast({x:-4,y:4,z:-4},{x:1,y:-1,z:1},10)?.distance).toBeCloseTo(4*Math.sqrt(3));
  expect(geometry.raycast({x:4,y:4,z:4},{x:-1,y:-1,z:-1},10)?.distance).toBeCloseTo(4*Math.sqrt(3));
 });
 it('rejects invalid scales, face indices and cyclic hierarchy instead of inventing geometry',()=>{
  expect(()=>createOriginalSceneGeometry({nodes:[node('floor')],meshes:[floor]},{scale:0})).toThrow(/scale/);
  expect(()=>createOriginalSceneGeometry({nodes:[node('floor')],meshes:[{...floor,faces:[[0,1,9]]}]},{scale:1})).toThrow(/face/);
  expect(()=>originalNodeWorldMatrices({nodes:[node('a','',I,'b'),node('b','',I,'a')],meshes:[]})).toThrow(/Cyclic/);
 });
 it('matches recovered Barrack floor/roof spawn samples and transformed floor bounds',()=>{
  const geometry=createOriginalSceneGeometry(sourceData('barrack-level1'),{scale:.01});
  expect(geometry.supportHeightAt(2.96,5.63,1.12)).toBeCloseTo(0,5);
  expect(geometry.supportHeightAt(38.10,16.86,4.36)).toBeCloseTo(3.241904,5);
  expect(geometry.supportHeightAt(30.72,-21.57,5.14)).toBeCloseTo(4.018135,5);
  expect(geometry.supportHeightAt(-1.97,27.48,5.84)).toBeCloseTo(4.721638,5);
  expect(geometry.groundBounds?.min.x).toBeCloseTo(-81.394658203125,7);
  expect(geometry.groundBounds?.max.z).toBeCloseTo(85.428515625,7);
 });
 it('matches recovered Woodland floor samples including negative and elevated terrain',()=>{
  const geometry=createOriginalSceneGeometry(sourceData('woodland-level2'),{scale:.01});
  for(const [x,z,height] of [[1.66,-40.16,8.274894],[-34.14,29.75,-3.227533],[26.13,15.84,-4.595726],[55.48,55.78,5.411441],[6.15,65.91,4.688594],[20.96,42.55,2.383592]]){
   expect(geometry.supportHeightAt(x,z,height+.9,true)).toBeCloseTo(height,5);
   expect(geometry.raycast({x,y:height+2,z},{x:0,y:-1,z:0},3)?.surface).toBe('ground');
  }
  expect(geometry.groundBounds?.min.y).toBeCloseTo(-5.051790771484375,7);
  expect(geometry.groundBounds?.max.y).toBeCloseTo(16.31307373046875,7);
 });
 it('sweeps through a thin wall without tunneling and slides along its contact plane',()=>{
  const wall=mesh('wall',[[0,0,-3],[0,4,-3],[0,4,3],[0,0,3]],[[0,1,2],[0,2,3]]);
  const geometry=createOriginalSceneGeometry({nodes:[node('wall'),node('floor')],meshes:[wall,floor]},{scale:1,cellSize:1});
  expect(geometry.playerIntersects({x:-.3,y:0,z:0},.4,1.8)).toBe(true);
  expect(geometry.playerIntersects({x:-.4,y:0,z:0},.4,1.8)).toBe(false);
  const swept=geometry.movePlayer({x:-10,y:0,z:0},{x:10,y:0,z:0},.4,1.8);
  expect(swept.collided).toBe(true);expect(swept.position.x).toBeCloseTo(-.4,5);
  expect(geometry.playerIntersects(swept.position,.4,1.8)).toBe(false);
  const slide=geometry.movePlayer({x:-2,y:0,z:-1},{x:2,y:0,z:1},.4,1.8);
  expect(slide.position.x).toBeCloseTo(-.4,5);expect(slide.position.z).toBeCloseTo(1,5);
 });
 it('passes through a concave doorway while blocking its jambs and upper lintel',()=>{
  const door=mesh('doorway',[[-3,0,0],[-1,0,0],[-1,3,0],[-3,3,0],[1,0,0],[3,0,0],[3,3,0],[1,3,0],[-1,2,0],[1,2,0],[1,3,0],[-1,3,0]],[[0,1,2],[0,2,3],[4,5,6],[4,6,7],[8,9,10],[8,10,11]]);
  const geometry=createOriginalSceneGeometry({nodes:[node('building'),node('floor')],meshes:[{...door,resource:'building'},floor]},{scale:1,cellSize:1});
  const through=geometry.movePlayer({x:0,y:0,z:-2},{x:0,y:0,z:2},.4,1.8);
  expect(through.position).toEqual({x:0,y:0,z:2});expect(through.collided).toBe(false);
  const jamb=geometry.movePlayer({x:2,y:0,z:-2},{x:2,y:0,z:2},.4,1.8);
  expect(jamb.position.z).toBeCloseTo(-.4,5);
  const lintel=geometry.movePlayer({x:0,y:1,z:-2},{x:0,y:1,z:2},.4,1.8);
  expect(lintel.collided).toBe(true);expect(lintel.position.z).toBeLessThan(0);
 });
 it('blocks upward motion at ceilings and downward motion at floors for capsules and spheres',()=>{
  const roof=mesh('roof',[[-2,3,-2],[2,3,-2],[2,3,2],[-2,3,2]],[[0,1,2],[0,2,3]]);
  const geometry=createOriginalSceneGeometry({nodes:[node('roof'),node('floor')],meshes:[roof,floor]},{scale:1,cellSize:1});
  const up=geometry.movePlayer({x:0,y:0,z:0},{x:0,y:4,z:0},.4,1.8);
  expect(up.position.y).toBeCloseTo(1.2,5);expect(up.collided).toBe(true);
  const down=geometry.movePlayer({x:0,y:1,z:0},{x:0,y:-5,z:0},.5,1);
  expect(down.position.y).toBeCloseTo(0,5);expect(down.collided).toBe(true);
  expect(geometry.playerIntersects(down.position,.5,1)).toBe(false);
 });
 it('keeps a rounded player tangent to walkable ramps and rejects steep banks as support',()=>{
  const ramp=mesh('floor',[[0,0,-2],[4,2,-2],[4,2,2],[0,0,2]],[[0,2,1],[0,3,2]]);
  const geometry=createOriginalSceneGeometry({nodes:[node('floor')],meshes:[ramp]},{scale:1,cellSize:1});
  const startY=geometry.playerSupportHeightAt(1,0,3,.4,1.8)!;
  const endY=geometry.playerSupportHeightAt(3,0,3,.4,1.8)!;
  expect(startY).toBeCloseTo(.5+.4*(Math.sqrt(1.25)-1));
  expect(geometry.playerIntersects({x:1,y:startY,z:0},.4,1.8)).toBe(false);
  const ascent=geometry.movePlayer({x:1,y:startY,z:0},{x:3,y:endY,z:0},.4,1.8);
  expect(ascent.position.y).toBeCloseTo(endY,5);expect(ascent.position.x).toBeCloseTo(3,5);
  const steep=mesh('floor',[[0,0,-2],[1,3,-2],[1,3,2],[0,0,2]],[[0,2,1],[0,3,2]]);
  const bank=createOriginalSceneGeometry({nodes:[node('floor')],meshes:[steep]},{scale:1,cellSize:1});
  expect(bank.playerSupportHeightAt(.5,0,4,.4,1.8)).toBeUndefined();
  expect(bank.movePlayer({x:-1,y:0,z:0},{x:2,y:0,z:0},.4,1.8).collided).toBe(true);
 });
 it('uses exact recovered Barrack support and movement rather than authored map proxies',()=>{
  const geometry=createOriginalSceneGeometry(sourceData('barrack-level1'),{scale:.01});
  const x=2.96,z=5.63,radius=.25,height=.5;
  const y=geometry.playerSupportHeightAt(x,z,1,radius,height)!;
  expect(y).toBeCloseTo(0,5);expect(geometry.playerIntersects({x,y,z},radius,height)).toBe(false);
  const step=geometry.movePlayer({x,y,z},{x:x+.05,y,z},radius,height);
  expect(step.position.x).toBeCloseTo(x+.05,5);
  const ground=geometry.movePlayer({x,y:y+.5,z},{x,y:y-2,z},radius,height);
  expect(ground.position.y).toBeCloseTo(y,5);expect(ground.collided).toBe(true);
 });

 it('places and moves source-sized spheres on all recovered Woodland spawn facets',()=>{
  const geometry=createOriginalSceneGeometry(sourceData('woodland-level2'),{scale:.01});
  for(const [x,z,maxY] of [[1.66,-40.16,9.14],[-34.14,29.75,-2.36],[26.13,15.84,-3.73],[55.48,55.78,6.28],[6.15,65.91,5.56],[20.96,42.55,3.26]]){
   const y=geometry.playerSupportHeightAt(x,z,maxY,.25,.5,true);
   expect(y).toBeDefined();expect(geometry.playerIntersects({x,y:y!,z},.25,.5)).toBe(false);
   const movement=geometry.movePlayer({x,y:y!+.2,z},{x,y:y!-1,z},.25,.5);
   const landed=geometry.playerSupportHeightAt(movement.position.x,movement.position.z,maxY,.25,.5,true);
   expect(movement.position.y).toBeCloseTo(landed!,5);
   expect(geometry.playerIntersects(movement.position,.25,.5)).toBe(false);
  }
 });

 it('stops at intersecting interior walls without penetrating either contact plane',()=>{
  const a=mesh('a',[[0,0,-3],[0,3,-3],[0,3,3],[0,0,3]],[[0,1,2],[0,2,3]]);
  const b=mesh('b',[[-3,0,0],[3,0,0],[3,3,0],[-3,3,0]],[[0,1,2],[0,2,3]]);
  const geometry=createOriginalSceneGeometry({nodes:[node('a'),node('b'),node('floor')],meshes:[a,b,floor]},{scale:1,cellSize:1});
  const move=geometry.movePlayer({x:-2,y:0,z:-2},{x:2,y:0,z:2},.4,1.8);
  expect(move.position.x).toBeCloseTo(-.4,5);expect(move.position.z).toBeCloseTo(-.4,5);
  expect(move.normals.length).toBeGreaterThanOrEqual(2);
  expect(geometry.playerIntersects(move.position,.4,1.8)).toBe(false);
 });

 it('minimally resolves source Barrack spawn overlap with the recovered plinth wall',()=>{
  const scale=1.72/85,radius=25*scale,height=2*radius;
  const geometry=createOriginalSceneGeometry(sourceData('barrack-level1'),{scale});
  const x=3814*scale,z=1686*scale,y=geometry.playerSupportHeightAt(x,z,436*scale,radius,height)!;
  const original={x,y,z};expect(geometry.playerIntersects(original,radius,height)).toBe(true);
  const corrected=geometry.resolvePlayerOverlap(original,radius,height);
  // Exact vertical face x=3837.65869140625; sphere clearance is sourceR25.
  expect(corrected.x).toBeCloseTo((3837.65869140625-25)*scale,5);
  expect(corrected.y).toBeCloseTo(y,7);expect(corrected.z).toBeCloseTo(z,7);
  expect(geometry.playerIntersects(corrected,radius,height)).toBe(false);
  expect(geometry.playerSupportHeightAt(corrected.x,corrected.z,436*scale,radius,height)).toBeCloseTo(y,7);
  expect(geometry.resolvePlayerOverlap(corrected,radius,height)).toEqual(corrected);
 });
 it('resolves thin-wall and corner penetration along their actual contact normals',()=>{
  const a=mesh('a',[[0,0,-3],[0,3,-3],[0,3,3],[0,0,3]],[[0,1,2],[0,2,3]]);
  const b=mesh('b',[[-3,0,0],[3,0,0],[3,3,0],[-3,3,0]],[[0,1,2],[0,2,3]]);
  const geometry=createOriginalSceneGeometry({nodes:[node('a'),node('b'),node('floor')],meshes:[a,b,floor]},{scale:1,cellSize:1});
  const single=geometry.resolvePlayerOverlap({x:-.2,y:0,z:-1},.4,1.8);
  expect(single.x).toBeCloseTo(-.4,5);expect(single.y).toBeCloseTo(0,12);expect(single.z).toBeCloseTo(-1,12);
  const corner=geometry.resolvePlayerOverlap({x:-.2,y:0,z:-.2},.4,1.8);
  expect(corner.x).toBeCloseTo(-.4,5);expect(corner.z).toBeCloseTo(-.4,5);expect(corner.y).toBeCloseTo(0,12);
  expect(geometry.playerIntersects(corner,.4,1.8)).toBe(false);
 });

 it('climbs and descends the recovered broad Barrack plinth ramp through both support transitions',()=>{
  const data=sourceData('barrack-level1'),scale=1.72/85,radius=25*scale,height=2*radius;
  const part=data.meshes.find(m=>m.resource==='plinths'&&m.part===0)!;
  const matrix=originalNodeWorldMatrices(data).get('plinths')!;
  const points=[...new Set([...part.faces[12],...part.faces[34]])].map(i=>{
   const p=part.positions[i];return [matrix[0]*p[0]+matrix[4]*p[1]+matrix[8]*p[2]+matrix[12],matrix[1]*p[0]+matrix[5]*p[1]+matrix[9]*p[2]+matrix[13],matrix[2]*p[0]+matrix[6]*p[1]+matrix[10]*p[2]+matrix[14]];
  });
  const low=points.filter(p=>p[2]===Math.min(...points.map(p=>p[2]))),high=points.filter(p=>p[2]===Math.max(...points.map(p=>p[2])));
  const midpoint=(edge:number[][])=>edge[0].map((_,i)=>edge.reduce((sum,p)=>sum+p[i],0)/edge.length);
  const lower=midpoint(low),upper=midpoint(high);
  expect(Math.hypot(low[0][0]-low[1][0],low[0][1]-low[1][1])).toBeGreaterThan(2*25);
  const run=Math.hypot(upper[0]-lower[0],upper[1]-lower[1]),rise=upper[2]-lower[2];
  expect(run/Math.hypot(run,rise)).toBeGreaterThan(.5);
  const start=sourcePointToWorld([lower[0]-75,lower[1],lower[2]],scale),finish=sourcePointToWorld([upper[0]+75,upper[1],upper[2]],scale);
  const geometry=createOriginalSceneGeometry(data,{scale});
  const initialY=geometry.playerSupportHeightAt(start.x,start.z,start.y+1,radius,height)!;
  let position={...start,y:initialY};expect(geometry.playerIntersects(position,radius,height)).toBe(false);
  const traverse=(destination:{x:number;y:number;z:number})=>{
   const from={...position},steps=Math.ceil(Math.hypot(destination.x-from.x,destination.z-from.z)/.1);
   for(let step=1;step<=steps;step++){
    const x=from.x+(destination.x-from.x)*step/steps,z=from.z+(destination.z-from.z)*step/steps;
    const y=geometry.playerSupportHeightAt(x,z,position.y+.2,radius,height);
    expect(y,`support step ${step} x=${x}`).toBeDefined();
    const movement=geometry.movePlayer(position,{x,y:y!,z},radius,height);
    expect(movement.position.x,`blocked ramp step ${step}`).toBeCloseTo(x,2);
    expect(movement.position.z).toBeCloseTo(z,5);
    expect(geometry.playerIntersects(movement.position,radius,height)).toBe(false);
    position=movement.position;
   }
  };
  traverse(finish);expect(position.y).toBeGreaterThan(initialY+7);
  traverse(start);expect(position.y).toBeCloseTo(initialY,5);
 });

});
