import * as THREE from 'three';
import {describe,expect,it} from 'vitest';
import {Game} from './game';
import {ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';
const shape={faces:[[0,1,2],[1,3,2],[4,6,5],[5,6,7],[0,4,1],[1,4,5],[2,3,6],[3,7,6],[0,2,4],[2,6,4],[1,5,3],[3,5,7]] as [number,number,number][],vertices:[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>({x:x*.1,y:y*.1,z:z*.1})))),faceNormals:[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}],edgeDirections:[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}]};
describe('standalone client convex/player relative point velocity',()=>{
 it.each([{body:1,point:0,hit:true},{body:1,point:.2,hit:true},{body:-1,point:0,hit:false},{body:.2,point:1,hit:false}])('body $body point $point admits approaching contact=$hit',({body,point,hit})=>{
  const g=Object.create(Game.prototype);Object.assign(g,{camera:new THREE.PerspectiveCamera(),velocity:new THREE.Vector3(body*1.5,0,0),playerAlive:true,arena:{runtime:{geometry:{sweepConvex:()=>null}}}});
  g.camera.position.set(0,60*ORIGINAL_MAP_SCALE,0);
  const pivot={x:.55,y:0,z:0};
  const contact=g.sweepOriginalConvex(pivot,pivot,shape,true,()=>({x:point,y:0,z:0}));
  expect(contact!==null).toBe(hit);if(contact){expect(contact.body.id).toBe('player');expect(contact.body.velocity.x).toBe(body);expect(contact.witnessA).toBeDefined();}
 });
});
