import {stepOriginalPhysicsWorld,applyOriginalPlayerControls} from '../../shared/originalPlayerPhysics.ts';
const at=(x=0,y=0,z=0)=>({x,y,z});
const q=.05;
const shape={vertices:[at(-q,-q,-q),at(q,-q,-q),at(-q,q,-q),at(q,q,-q),at(-q,-q,q),at(q,-q,q),at(-q,q,q),at(q,q,q)],faceNormals:[at(1),at(-1),at(0,1),at(0,-1),at(0,0,1),at(0,0,-1)],edgeDirections:[at(1),at(0,1),at(0,0,1)],faces:[[0,2,1],[1,2,3],[4,5,6],[5,7,6],[0,4,2],[2,4,6],[1,3,5],[3,7,5],[0,1,4],[1,5,4],[2,6,3],[3,6,7]] as [number,number,number][]};
for(const include of [false,true]){
 const player={id:'p',position:at(),velocity:at(100,-20),supported:false};
 const movable={id:'box',position:at(.8,-.55),velocity:at(),convex:shape,radius:Math.sqrt(3)*q,mass:1,restitution:.2,friction:0};
 const events:any[]=[];
 const result=stepOriginalPhysicsWorld([player],[],{movableBodies:include?[movable]:[],sweep:(from,to,r)=>{if(r>.4&&from.x<=.05000001&&to.x>.05){const f=(.05-from.x)/(to.x-from.x);return {position:at(.05,from.y+(to.y-from.y)*f,0),normal:at(-1),fraction:f};}return null;},sweepConvex:()=>null,onResolvedContact:e=>events.push(e)});
 const supported=player.supported, velocityBefore={...player.velocity};
 const controls=applyOriginalPlayerControls(player,{yaw:0,pitch:0,jump:true});
 console.log(JSON.stringify({include,result,supported,velocityBefore,controls,velocityAfter:player.velocity,events:events.map(e=>({a:e.bodyA,b:e.bodyB,normal:e.normal,time:e.time}))}));
}
