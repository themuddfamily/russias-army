import type { ArenaAabb, ArenaVector } from './arenaCollision';

/** Reference-inspired layouts; historical map coordinates have not been recovered. */
export const LEGACY_MAP_IDS = ['barrack', 'woodlands'] as const;
export type LegacyMapId = typeof LEGACY_MAP_IDS[number];
export interface LegacyRamp { id: string; x: number; z: number; width: number; length: number; axis: 'x' | 'z'; start: number; end: number }
export interface LegacyRoofSection { id:string; offsetX:number; width:number; height:number; rise:number }
export interface LegacyBuilding { id: string; x: number; z: number; width: number; depth: number; base: number; height: number; finish: 'brick' | 'plaster' | 'timber' | 'stone'; roof: 'flat' | 'pitched'; bayOffsetX?:number; bayWidth?:number; bayHeight?:number; frontBayOnly?:boolean; roofSections?:LegacyRoofSection[] }
export interface LegacyTimberFence { id:string; x:number; z:number; axis:'x'|'z'; length:number; height:number }
export interface LegacyTree { x: number; z: number; height: number; radius: number }
export interface LegacyMap { id: LegacyMapId; bounds: number; colliders: ArenaAabb[]; spawnPoints: ArenaVector[]; ramps: LegacyRamp[]; buildings: LegacyBuilding[]; fences:LegacyTimberFence[]; trees: LegacyTree[]; pickups: { id: string; type: 'health' | 'ammo' | 'armor'; position: ArenaVector }[] }
const cache = new Map<LegacyMapId, LegacyMap>();
/** Analytic bound used by authoritative terrain raycasts, including the authored bank. */
export const LEGACY_WOODLAND_MAX_TERRAIN_HEIGHT = 3.5 + 3.4 + 2.2 + 5 + 16.5;
/** Sharp 15-second source shows a tall bank behind the stone bay; coordinates are authored. */
export function legacyWoodlandBankWeightAt(x:number,z:number):number {
  const t=Math.max(0,Math.min(1,(-z-36.5)/4));
  return t*t*(3-2*t)*Math.exp(-(((x-41)/19)**4)-((z+41)/12)**4);
}
const plans = {
  barrack: [
    {id:'west-barrack',x:-19,z:-10,width:24,depth:16,base:0,height:5,finish:'brick',roof:'flat'},
    {id:'east-barrack',x:16,z:-10,width:24,depth:16,base:0,height:5,finish:'plaster',roof:'flat'},
    {id:'south-barrack',x:17,z:22,width:19,depth:12,base:0,height:5,finish:'brick',roof:'flat'},
    {id:'store',x:-31,z:28,width:12,depth:10,base:0,height:3.4,finish:'plaster',roof:'pitched'},
  ],
  woodlands: [
    {id:'cottage',x:-17,z:-15,width:11,depth:9,base:0,height:3.6,finish:'plaster',roof:'pitched'},
    // Woodland sheet 0 includes a larger box-shaped building with a horizontal roofline.
    // This represents that roof family, not a recovered original placement or floor plan.
    {id:'farmhouse',x:22,z:20,width:15,depth:11,base:0,height:5.8,finish:'brick',roof:'flat'},
    {id:'shed',x:-31,z:26,width:8,depth:7,base:0,height:3.2,finish:'timber',roof:'pitched'},
    // Sharp still/excerpt supports this long low stone family; proportions are authored.
    // The visible facade has a short left bay and a longer closed-door section.
    // Rear closure is an authored fit for the dark bay; the historical rear is unseen.
    {id:'outbuilding',x:33,z:-28,width:18,depth:7,base:0,height:3.4,finish:'stone',roof:'pitched',bayOffsetX:-5,bayWidth:3,bayHeight:2.9,frontBayOnly:true,roofSections:[
      {id:'bay',offsetX:-5.5,width:7,height:3.15,rise:.85},
      {id:'doors',offsetX:3.5,width:11,height:3.4,rise:1.05},
    ]},
  ],
} satisfies Record<LegacyMapId, LegacyBuilding[]>;
function rawHeight(x: number,z: number): number {
  return 3.5 + 3.4*Math.sin(x*.052)*Math.cos(z*.044) + 2.2*Math.sin(z*.074+x*.023) + 5*Math.exp(-((x-35)**2+(z+4)**2)/380) - 3.2*Math.exp(-((x+3)**2)/95)*Math.exp(-(z*z)/1800) + 16.5*legacyWoodlandBankWeightAt(x,z);
}
export function legacyGroundHeightAt(id: LegacyMapId,x: number,z: number): number {
  if(id==='barrack') return 0;
  let h=rawHeight(x,z);
  // Low approach yard exposes the full bay instead of burying its lower facade
  // behind the former high foreground slope. It joins the existing level floor.
  const yardDistance=Math.max(Math.abs(x-33)-13,Math.abs(z+18)-5);
  if(yardDistance<4){const t=Math.max(0,Math.min(1,yardDistance/4));const smooth=t*t*(3-2*t);h=rawHeight(33,-28)*(1-smooth)+h*smooth;}
  for(const b of plans.woodlands){
    const d=Math.max(Math.abs(x-b.x)-b.width/2,Math.abs(z-b.z)-b.depth/2);
    if(d<5){const t=Math.max(0,Math.min(1,d/5));const smooth=t*t*(3-2*t);h=rawHeight(b.x,b.z)*(1-smooth)+h*smooth;}
  }
  return h;
}
export function legacyRampHeightAt(r: LegacyRamp,x:number,z:number): number | undefined {
  const along=r.axis==='x'?x-r.x:z-r.z;const across=r.axis==='x'?z-r.z:x-r.x;
  if(Math.abs(across)>r.width/2||Math.abs(along)>r.length/2) return undefined;
  return r.start+(r.end-r.start)*(along/r.length+.5);
}
export function legacySupportHeightAt(id: LegacyMapId,x:number,z:number,maxHeight=Infinity): number {
  let h=legacyGroundHeightAt(id,x,z);
  const map=getLegacyMap(id);
  for(const r of map.ramps){const y=legacyRampHeightAt(r,x,z);if(y!==undefined&&y<=maxHeight+.001)h=Math.max(h,y);}
  for(const c of map.colliders){if(x>=c.min[0]&&x<=c.max[0]&&z>=c.min[2]&&z<=c.max[2]&&c.max[1]<=maxHeight+.001)h=Math.max(h,c.max[1]);}
  return h;
}
export function getLegacyMap(id: LegacyMapId): LegacyMap {
  const cached=cache.get(id);if(cached)return cached;
  const buildings:LegacyBuilding[]=plans[id].map(b=>({...b,base:legacyGroundHeightAt(id,b.x,b.z)}));
  const colliders:ArenaAabb[]=[];
  const add=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,kind:ArenaAabb['kind']='building')=>colliders.push({id:name,kind,min:[x-w/2,y-h/2,z-d/2],max:[x+w/2,y+h/2,z+d/2]});
  for(const b of buildings){
    const {x,z,width:w,depth:d,base:y,height:h}=b;
    if(b.roofSections){
      const sections=b.roofSections;
      const west=sections[0],east=sections[sections.length-1];
      add(b.id+'-west',x-w/2,y+west.height/2,z,.45,west.height,d);
      add(b.id+'-east',x+w/2,y+east.height/2,z,.45,east.height,d);
      const bayX=b.bayOffsetX??0,bayWidth=b.bayWidth??3,bayHeight=b.bayHeight??2.9;
      for(const section of sections){
        const left=section.offsetX-section.width/2,right=section.offsetX+section.width/2;
        for(const sign of [-1,1]){
          const opening=(!b.frontBayOnly||sign===1)&&bayX+bayWidth/2>left&&bayX-bayWidth/2<right;
          if(!opening){add(`${b.id}-${sign}-${section.id}-wall`,x+section.offsetX,y+section.height/2,z+sign*d/2,section.width,section.height,.45);continue;}
          const gapLeft=Math.max(left,bayX-bayWidth/2),gapRight=Math.min(right,bayX+bayWidth/2);
          for(const [edge,start,end] of [['left',left,gapLeft],['right',gapRight,right]] as const){
            if(end>start)add(`${b.id}-${sign}-${section.id}-${edge}`,x+(start+end)/2,y+section.height/2,z+sign*d/2,end-start,section.height,.45);
          }
          add(`${b.id}-${sign}-lintel`,x+(gapLeft+gapRight)/2,y+bayHeight+(section.height-bayHeight)/2,z+sign*d/2,gapRight-gapLeft,section.height-bayHeight,.45);
        }
        add(`${b.id}-roof-${section.id}`,x+section.offsetX,y+section.height+.12,z,section.width+.4,.24,d+.4);
      }
      continue;
    }
    add(b.id+'-west',x-w/2,y+h/2,z,.45,h,d);add(b.id+'-east',x+w/2,y+h/2,z,.45,h,d);
    // Wide opposed doorways preserve through-routes and accessible interiors.
    for(const sign of [-1,1]){
      const wall=(w-3)/2;
      for(const side of [-1,1])add(`${b.id}-${sign}-${side}`,x+side*(w/2-wall/2),y+h/2,z+sign*d/2,wall,h,.45);
      add(`${b.id}-${sign}-lintel`,x,y+2.9+(h-2.9)/2,z+sign*d/2,3,Math.max(.1,h-2.9),.45);
    }
    add(b.id+'-roof',x,y+h+.12,z,w+.4,.24,d+.4);
    if(b.roof==='flat')for(const sign of [-1,1])for(const side of [-1,1]){const length=(w-5.8)/2;add(`${b.id}-parapet-${sign}-${side}`,x+side*(w/2-length/2),y+h+.65,z+sign*d/2,length,.85,.28);}
  }
  const ramps:LegacyRamp[]=id==='barrack'?[
    {id:'west-rise',x:-19,z:10,width:5,length:24,axis:'z',start:5.24,end:0},
    {id:'east-rise',x:16,z:-30,width:5,length:24,axis:'z',start:0,end:5.24},
    {id:'south-rise',x:35,z:22,width:5,length:18,axis:'x',start:5.24,end:0},
    {id:'roof-bridge',x:-1.5,z:-10,width:5,length:11,axis:'x',start:5.24,end:5.24},
    {id:'south-bridge',x:17,z:7,width:5,length:18,axis:'z',start:5.24,end:5.24},
  ]:[];
  // Weathered timber surrounds part of the shed yard in the sharp original still.
  // These authored segments leave both opposed shed entrances and the south gate open.
  const fences:LegacyTimberFence[]=id==='woodlands'?[
    {id:'shed-yard-west',x:-37,z:26,axis:'z',length:12,height:1.15},
    {id:'shed-yard-east',x:-25,z:26,axis:'z',length:12,height:1.15},
    {id:'shed-yard-south',x:-35,z:34,axis:'x',length:4,height:1.15},
  ]:[];
  for(const f of fences)for(let i=0;i<f.length;i++){
    const offset=i-f.length/2+.5,x=f.x+(f.axis==='x'?offset:0),z=f.z+(f.axis==='z'?offset:0);
    const base=legacyGroundHeightAt(id,x,z);
    add(f.id+'-panel-'+i,x,base+f.height/2,z,f.axis==='x'?1:.12,f.height,f.axis==='z'?1:.12,'barrier');
  }
  let seed=173;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const trees:LegacyTree[]=[];
  for(let i=0;i<(id==='woodlands'?230:110);i++){
    const x=(random()-.5)*144,z=(random()-.5)*144;
    if(id==='barrack'&&Math.max(Math.abs(x),Math.abs(z))<57)continue;
    if(buildings.some(b=>Math.abs(x-b.x)<b.width/2+5&&Math.abs(z-b.z)<b.depth/2+5))continue;
    if(id==='woodlands'&&Math.abs(x)<7)continue;
    const height=7+random()*7,radius=.18+random()*.18;trees.push({x,z,height,radius});
    if(Math.abs(x)<54&&Math.abs(z)<54)add('tree-'+i,x,legacyGroundHeightAt(id,x,z)+height*.3,z,radius*2,height*.6,radius*2,'barrier');
  }
  if(id==='barrack'){
    // B10 sheet 0 row 1 column 5 and row 2 column 1 show isolated trees
    // beside grassy routes. These sparse open-grass placements are authored,
    // not recovered historical coordinates; retain the distant forest above.
    const isolatedTrees:LegacyTree[]=[
      {x:-43,z:-35,height:11,radius:.3},
      {x:-43,z:45,height:10,radius:.27},
      {x:43,z:12,height:12,radius:.32},
      {x:15,z:44,height:10.5,radius:.28},
    ];
    isolatedTrees.forEach((t,i)=>{
      trees.push(t);
      add(`tree-barrack-isolated-${i}`,t.x,t.height*.3,t.z,t.radius*2,t.height*.6,t.radius*2,'barrier');
    });
  }
  for(const axis of ['x','z'] as const)for(const sign of [-1,1])add(`boundary-${axis}-${sign}`,axis==='x'?sign*56:0,12,axis==='z'?sign*56:0,axis==='x'?1:113,40,axis==='z'?1:113,'perimeter');
  const positions=id==='barrack'?[[0,35],[40,40],[-42,8],[0,40],[40,-42],[1,-35],[-12,35],[40,0]]:[[0,35],[43,39],[-42,7],[0,40],[40,-44],[0,-35],[-12,36],[43,0]];
  const spawnPoints=positions.map(([x,z])=>[x,legacyGroundHeightAt(id,x,z),z] as ArenaVector);
  const pickups = (['health','ammo','armor','health','ammo','ammo'] as const).map((type,i)=>{const [x,,z]=spawnPoints[i];return {id:`${id}-pickup-${i}`,type,position:[x+2,legacyGroundHeightAt(id,x+2,z)+.65,z] as ArenaVector};});
  const map={id,bounds:55,colliders,spawnPoints,ramps,buildings,fences,trees,pickups};cache.set(id,map);return map;
}

export interface LegacyReferenceCamera { name: string; position: ArenaVector; target: ArenaVector; reference: string }
/** Repeatable comparison stations for this blockout; not recovered original camera transforms. */
export function getLegacyReferenceCameras(id: LegacyMapId): LegacyReferenceCamera[] {
  const eye=(x:number,z:number,y?:number):ArenaVector=>[x,(y??legacyGroundHeightAt(id,x,z))+1.65,z];
  if(id==='barrack')return [
    {name:'courtyard',position:eye(-2,36),target:[-5,3,-10],reference:'barrack-2012-sheet-1.jpg: roof/ramp silhouette'},
    {name:'pink-facade',position:eye(-4,39),target:[17,2.5,22],reference:'barrack-2010-sheet-0.jpg: row 5 columns 3–4 pink wall plane; station authored'},
    {name:'ramp',position:eye(-19,25),target:[-19,4,-5],reference:'barrack-2012-sheet-1.jpg: rows 1–3'},
    {name:'roof',position:eye(-19,-10,5.24),target:[20,5,-10],reference:'barrack-2010-sheet-0.jpg: rows 3–5'},
    {name:'interior',position:eye(-19,-13),target:[-19,1.6,2],reference:'interior verification pending'},
    {name:'treeline',position:eye(40,4),target:[65,5,0],reference:'barrack-2012-sheet-0.jpg: grassy horizon'},
  ];
  return [
    {name:'hills',position:eye(0,35),target:[30,5,-15],reference:'woodland-2014-sheet-1.jpg: rolling slopes'},
    {name:'cottage',position:eye(-17,0),target:[-17,5,-15],reference:'woodland-2014-sheet-0.jpg: small buildings'},
    {name:'interior',position:eye(-17,-16),target:[-17,legacyGroundHeightAt(id,-17,-15)+1.5,-9],reference:'woodland-2014-sheet-0.jpg: plank rooms'},
    {name:'shed',position:eye(-32,25),target:[-27.4,legacyGroundHeightAt(id,-31,26)+1.7,28.8],reference:'2026-09-30/woodland-video-11s.jpg: timber interior rails and framing'},
    {name:'outbuilding',position:eye(33,-15),target:[33,legacyGroundHeightAt(id,33,-28)+1.8,-28],reference:'2026-09-30/woodland-video-15s.jpg: low stone open bay and closed plank doors'},
    {name:'outbuilding-yard',position:eye(33,-14,legacyGroundHeightAt(id,33,-28)+5.2),target:[33,legacyGroundHeightAt(id,33,-28)+1.7,-28],reference:'2026-09-30/woodland-mark-wiering.jpg: elevated yard approach, asymmetric roof sections; station authored'},
    {name:'forest',position:eye(-40,-30),target:[-30,7,-43],reference:'woodland-2014-sheet-2.jpg: playable forest'},
    {name:'gully',position:eye(0,0),target:[10,5,-15],reference:'woodland-2014-sheet-1.jpg: earth banks'},
    {name:'stonebarn-interior',position:eye(33,-28),target:[37,legacyGroundHeightAt(id,33,-28)+1.65,-28],reference:'2026-10-03/woodland-interior-reference/frame-02.png: 22s stonebarn room; source-runtime pose authored, footage registration pending'},
    {name:'cliffview-interior',position:[135.64513028492647,10.383001712574679,-102.94151585477941],target:[133.31807146139707,10.135194852941178,-105.77445703125001],reference:'woodland-2014-sheet-0.jpg: tiles12/17 window/board-floor family candidate; recovered cliffview room, authored camera, footage correspondence pending'},
  ];
}
