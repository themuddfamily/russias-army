import * as THREE from 'three';
import type { Pickup } from './arena';
import {createLegacyBankTexture} from './legacyBankTexture';
import {createLegacyTimberTexture} from './legacyTimberTexture';
import {createLegacyRoofTexture} from './legacyRoofTexture';
import {createLegacyStoneWallTexture} from './legacyStoneWallTexture';
import {createLegacyDenseFoliageTexture} from './legacyDenseFoliageTexture';
import {createLegacySparseFoliageTexture} from './legacySparseFoliageTexture';
import {woodlandCrownProfiles} from './legacyFoliageProfiles';
import { getLegacyMap, legacyGroundHeightAt, legacySupportHeightAt, legacyWoodlandBankWeightAt, type LegacyMapId } from '../shared/legacyMaps';

export interface LegacyArena {
  group: THREE.Group; colliders: THREE.Box3[]; spawnPoints: THREE.Vector3[]; pickups: Pickup[];
  groundHeightAt(x:number,z:number):number;
  supportHeightAt(x:number,z:number,maxHeight?:number):number;
  dispose():void;
}
/** Original authored blockouts based on the saved Barrack / Woodland frame boards. */
export function createLegacyArena(scene: THREE.Scene,mapId: LegacyMapId): LegacyArena {
  const plan=getLegacyMap(mapId),group=new THREE.Group();group.name=`legacy-${mapId}`;scene.add(group);
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  const geo=<T extends THREE.BufferGeometry>(g:T):T=>{geometries.add(g);return g;};
  const groundHeightAt=(x:number,z:number)=>legacyGroundHeightAt(mapId,x,z);
  let seed=4928;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  function texture(kind:'concrete'|'brick'|'plank'|'grass'|'stone'){
    const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d')!;
    ctx.fillStyle={concrete:'#b6b7aa',brick:'#786653',plank:mapId==='woodlands'?'#94958a':'#79756a',grass:mapId==='woodlands'?'#b5b0a2':'#687946',stone:'#9b9e99'}[kind];ctx.fillRect(0,0,256,256);
    for(let i=0;i<17000;i++){const t=random();ctx.fillStyle=t>.5?`rgba(250,244,215,${random()*.16})`:`rgba(23,30,17,${random()*.16})`;ctx.fillRect(random()*256,random()*256,1+random()*3,1+random()*3);}
    if(kind==='brick'){ctx.strokeStyle='#a4a18b';ctx.lineWidth=3;for(let y=0;y<256;y+=24){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(256,y);ctx.stroke();for(let x=(y%48?32:0);x<256;x+=64){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+24);ctx.stroke();}}}
    if(kind==='stone'){
      // Irregular overlapping mottled stone, with no regular red-brick coursing.
      for(let i=0;i<450;i++){const x=random()*256,y=random()*256;ctx.fillStyle=['rgba(128,134,129,.3)','rgba(172,175,165,.28)','rgba(145,150,144,.3)','rgba(158,162,153,.25)'][i%4];ctx.beginPath();ctx.ellipse(x,y,3+random()*15,2+random()*8,random()*3,0,Math.PI*2);ctx.fill();}
      for(let i=0;i<3500;i++){ctx.fillStyle=i%2?'rgba(69,74,68,.07)':'rgba(213,215,203,.08)';ctx.fillRect(random()*256,random()*256,1+random()*3,1+random()*2);}
    }
    if(kind==='plank'){ctx.fillStyle='#383c30';ctx.strokeStyle='#383c30';for(let x=0;x<256;x+=32){ctx.fillRect(x,0,2,256);ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,256);ctx.stroke();}}
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(kind==='grass'?28:2,kind==='grass'?28:2);t.anisotropy=4;textures.add(t);return t;
  }
  function mat(color:number,map?:THREE.Texture){const m=new THREE.MeshStandardMaterial({color,roughness:.93,map:map??null});materials.add(m);return m;}
  const concrete=mat(0xe0dfca,texture('concrete')),brick=mat(0xc2ae95,texture('brick')),plank=mat(mapId==='woodlands'?0xc5c6b8:0xa4a494,texture('plank'));
  // Sharp Woodland rooms retain dark worn floors below their paler framed walls.
  const floor=mapId==='woodlands'?mat(0x646052,plank.map??undefined):plank;floor.name=mapId==='woodlands'?'woodland-dark-plank-floor':'barrack-plank';
  if(mapId==='woodlands'){
    // Keep the floor's finer worn boards and original placement RNG; walls
    // receive the broader neutral-gray streaking visible inside the shed.
    const wallTimber=createLegacyTimberTexture();textures.add(wallTimber);
    plank.map=wallTimber;plank.color.setHex(0xd5d5d0);
  }
  function barkTexture(){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='#bac0ad';ctx.fillRect(0,0,256,256);
    // Independent seed keeps the existing authored foliage/backdrop placements stable.
    let barkSeed=9187;const barkRandom=()=>{barkSeed=(barkSeed*1664525+1013904223)>>>0;return barkSeed/4294967296;};
    for(let i=0;i<2100;i++){
      ctx.fillStyle=i%3===0?'rgba(64,75,51,.2)':i%3===1?'rgba(223,224,207,.25)':'rgba(104,113,84,.16)';
      ctx.fillRect(barkRandom()*256,barkRandom()*256,1+barkRandom()*8,2+barkRandom()*15);
    }
    for(let i=0;i<100;i++){
      ctx.strokeStyle='rgba(69,80,58,.18)';ctx.lineWidth=.5+barkRandom();
      const x=barkRandom()*256,y=barkRandom()*256;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(barkRandom()-.5)*5,y+8+barkRandom()*35);ctx.stroke();
    }
    const result=new THREE.CanvasTexture(canvas);result.name='woodland-mottled-pale-bark';result.colorSpace=THREE.SRGBColorSpace;
    result.wrapS=result.wrapT=THREE.RepeatWrapping;result.repeat.set(1,3);result.anisotropy=4;textures.add(result);return result;
  }
  const stone=mat(0xe0e2df,texture('stone'));stone.name='woodland-mottled-stone';
  if(mapId==='woodlands'){
    // Keep the original RNG consumption stable for placements and backdrop.
    const wallStone=createLegacyStoneWallTexture();textures.add(wallStone);stone.map=wallStone;
  }
  const innerStone=mapId==='woodlands'?mat(0x65675d,stone.map??undefined):stone;
  const grass=mat(mapId==='woodlands'?0xffffff:0x9cad75,texture('grass')),red=mat(0x9c514b),frame=mat(0xb8c0b7),glass=mat(0x617674),roof=mat(0x646c65),bark=mat(mapId==='woodlands'?0xc7ccba:0xabb3a1,mapId==='woodlands'?barkTexture():undefined),dark=mat(0x434d36);
  const barrackPink=mapId==='barrack'?mat(0xe39aa2,concrete.map??undefined):red;
  if(mapId==='barrack'){barrackPink.name='barrack-weathered-pink';glass.color.setHex(0x8a9da4);}
  const rustyRoof=mat(0x885044,texture('concrete'));rustyRoof.name='weathered-red-roof';
  let stoneRoof=roof;
  if(mapId==='woodlands'){
    const roofTexture=createLegacyRoofTexture();textures.add(roofTexture);
    stoneRoof=mat(0xb7b9b7,roofTexture);stoneRoof.name='woodland-weathered-stone-building-roof';
  }
  const interiorGlass=mat(0xbccbd0);interiorGlass.emissive.setHex(0x9daeb8);interiorGlass.emissiveIntensity=.38;
  const unitBox=geo(new THREE.BoxGeometry(1,1,1));
  function box(x:number,y:number,z:number,w:number,h:number,d:number,m:THREE.Material|THREE.Material[],name=''){
    let geometry=unitBox;
    if(mapId==='woodlands'&&(m===stone||m===innerStone)){
      // A shared unit-box UV would stretch masonry with each wall's length.
      // Project each face at a consistent authored world scale instead.
      geometry=geo(unitBox.clone());
      const vertices=geometry.attributes.position,normals=geometry.attributes.normal,uv=geometry.attributes.uv;
      for(let i=0;i<vertices.count;i++){
        const wx=x+vertices.getX(i)*w,wy=y+vertices.getY(i)*h,wz=z+vertices.getZ(i)*d;
        if(Math.abs(normals.getX(i))>.5)uv.setXY(i,wz/4,wy/4);
        else if(Math.abs(normals.getY(i))>.5)uv.setXY(i,wx/4,wz/4);
        else uv.setXY(i,wx/4,wy/4);
      }
    }
    const mesh=new THREE.Mesh(geometry,m);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
  }
  const terrainGeo=geo(new THREE.PlaneGeometry(260,260,200,200));terrainGeo.rotateX(-Math.PI/2);
  const p=terrainGeo.attributes.position,colors=new Float32Array(p.count*3),rockFaces=new Uint8Array(p.count);const color=new THREE.Color(),earthColor=new THREE.Color(0x534739),rockColor=new THREE.Color();
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),z=p.getZ(i),h=groundHeightAt(x,z);p.setY(i,h);
    const slope=Math.hypot(groundHeightAt(x+.5,z)-groundHeightAt(x-.5,z),groundHeightAt(x,z+.5)-groundHeightAt(x,z-.5));
    const shade=.88+.1*Math.sin(x*.27)*Math.cos(z*.19);
    if(mapId==='woodlands'){
      // Continuous dark earth follows the existing slope/gully, not disconnected rock props.
      const gully=Math.exp(-((x-3-Math.sin(z*.065)*3)**2)/145);
      const slopeWeight=THREE.MathUtils.smoothstep(slope,.13,.43);
      // The sharp stone-building view shows bare earth across its low yard.
      const yardDistance=Math.max(Math.abs(x-33)-13,Math.abs(z+18)-5);
      const yardWeight=1-THREE.MathUtils.smoothstep(yardDistance,0,4);
      const earthWeight=Math.min(.98,Math.max(slopeWeight,gully*.92,yardWeight*.98));
      color.setHex(0x70834c).lerp(earthColor,earthWeight).multiplyScalar(shade);
      // Broad mottled exposed faces follow the shared bank rather than floating
      // rock props. Surface variations are authored from the source color family.
      const bank=legacyWoodlandBankWeightAt(x,z);
      if(bank>.01){
        const rockWeight=Math.min(1,bank*2)*THREE.MathUtils.smoothstep(slope,.25,.85);
        rockFaces[i]=rockWeight>.15?1:0;
        const mottle=.82+.18*Math.sin(x*1.3+z*.7)*Math.cos(z*1.1-x*.4);
        color.lerp(rockColor.setHex(0x7b705c).multiplyScalar(mottle),rockWeight);
      }
    }else color.setHex(0xa4b985).multiplyScalar(shade);
    color.toArray(colors,i*3);
  }
  terrainGeo.setAttribute('color',new THREE.BufferAttribute(colors,3));terrainGeo.computeVertexNormals();grass.vertexColors=true;
  let terrainMaterials:THREE.Material|THREE.Material[]=grass;
  if(mapId==='woodlands'){
    const bankTexture=createLegacyBankTexture();textures.add(bankTexture);
    const bankUv=new Float32Array(p.count*2);
    for(let i=0;i<p.count;i++){bankUv[i*2]=p.getX(i)/4;bankUv[i*2+1]=p.getY(i)/4;}
    // Front-face world X/Y projection keeps coarse rock patches readable on
    // the steep bank; ordinary soil retains its separate horizontal UVs.
    terrainGeo.setAttribute('uv1',new THREE.BufferAttribute(bankUv,2));
    // Its own stone colour supplies the face palette; multiplying it by the
    // soil vertex tint as well would crush the exposed bank nearly to black.
    const bankMaterial=mat(0xb2a18a,bankTexture);
    const indices=terrainGeo.index!,groundIndices:number[]=[],bankIndices:number[]=[];
    for(let i=0;i<indices.count;i+=3){
      const a=indices.getX(i),b=indices.getX(i+1),c=indices.getX(i+2);
      (rockFaces[a]+rockFaces[b]+rockFaces[c]>=2?bankIndices:groundIndices).push(a,b,c);
    }
    // Two batches retain the shared heightfield while avoiding stretched fine
    // soil grain on the exposed face. The texture is an authored stone mottle.
    terrainGeo.setIndex([...groundIndices,...bankIndices]);terrainGeo.clearGroups();
    terrainGeo.addGroup(0,groundIndices.length,0);terrainGeo.addGroup(groundIndices.length,bankIndices.length,1);
    terrainMaterials=[grass,bankMaterial];
  }
  const terrain=new THREE.Mesh(terrainGeo,terrainMaterials);terrain.name='playable-grass-and-earth';terrain.receiveShadow=true;group.add(terrain);
  for(const c of plan.colliders){
    if(c.kind==='perimeter'||c.id.startsWith('tree-')||c.id.startsWith('shed-yard-'))continue;
    const b=plan.buildings.find(b=>c.id.startsWith(b.id));const material=c.id.includes('roof')||c.id.includes('parapet')?(mapId==='woodlands'?(c.id.includes('roof')?roof:stone):concrete):b?.finish==='stone'?stone:b?.finish==='brick'?(mapId==='woodlands'?stone:brick):b?.finish==='timber'?plank:concrete;
    const [a,v]=[c.min,c.max];const wall=box((a[0]+v[0])/2,(a[1]+v[1])/2,(a[2]+v[2])/2,v[0]-a[0],v[1]-a[1],v[2]-a[2],material,c.id);
    if(mapId==='woodlands'&&b?.id==='outbuilding'&&!c.id.includes('roof')){
      const faces=[material,material,material,material,material,material];
      if(c.id.endsWith('-west'))faces[0]=innerStone;
      else if(c.id.endsWith('-east'))faces[1]=innerStone;
      else faces[c.id.startsWith('outbuilding-1-')?5:4]=innerStone;
      wall.material=faces;
    }
    if(mapId==='barrack'&&b?.id==='south-barrack'&&!c.id.includes('roof')&&!c.id.includes('parapet')&&(c.id.endsWith('-west')||c.id.startsWith('south-barrack-1-'))){
      // B10 shows a broad pink plane; B12 retains brick on other walls.
      // Assign outward faces only, keeping the authored solids/routes unchanged.
      const faces=[material,material,material,material,material,material];
      faces[c.id.endsWith('-west')?1:4]=barrackPink;wall.material=faces;
    }
  }
  for(const b of plan.buildings){
    const {x,z,width:w,depth:d,base:y,height:h}=b;
    const bayX=x+(b.bayOffsetX??0);
    // Floors meet the flattened shared terrain. Sparse rooms remain readable through opposed doors.
    box(x,y+.015,z,w,.03,d,floor,b.id+'-floor');
    for(let n=-w/2+.5;n<w/2;n+=.65)box(x+n,y+.038,z,.014,.006,d,dark);
    if(mapId==='woodlands'&&b.finish==='timber'){
      // The continuous Woodland excerpt shows exposed wall rails and bracing.
      // Keep these shallow visual beams against existing walls, outside the through-route.
      const innerX=w/2-.32,innerZ=d/2-.32;
      for(const side of [-1,1]){
        for(const level of [.9,2.3])box(x+side*innerX,y+level,z,.14,.14,d-.6,plank,b.id+'-interior-rail');
        for(const offset of [-d/2+.45,0,d/2-.45])box(x+side*innerX,y+h/2,z+offset,.14,h-.15,.14,plank,b.id+'-interior-upright');
        const braceSpan=d-.9,braceRise=h-1;
        const brace=box(x+side*innerX,y+.5+braceRise/2,z,.13,Math.hypot(braceSpan,braceRise),.13,plank,b.id+'-interior-brace');
        brace.rotation.x=side*Math.atan2(braceSpan,braceRise);
        const segment=(w-3.4)/2;
        for(const direction of [-1,1])for(const level of [.9,2.3]){
          box(x+direction*(1.7+segment/2),y+level,z+side*innerZ,segment,.14,.14,plank,b.id+'-interior-rail');
        }
      }
    }
    for(const side of [-1,1]){
      for(let u=-w/2+2;u<w/2-1;u+=4){
        if(Math.abs(u)<2.5)continue;
        if(mapId==='woodlands'&&b.id==='outbuilding')continue;
        const tallBarrack=mapId==='barrack'&&b.finish==='brick';
        const windowWidth=tallBarrack?1.3:1.55,windowHeight=tallBarrack?2.3:1.8,windowY=y+h*(tallBarrack?.46:.67);
        if(tallBarrack&&!(b.id==='south-barrack'&&side===1))box(x+u,y+1.8,z+side*(d/2+.25),2.6,3.6,.05,barrackPink,'barrack-pink-window-surround');
        box(x+u,windowY,z+side*(d/2+.27),windowWidth,windowHeight,.07,frame);
        box(x+u,windowY,z+side*(d/2+.32),windowWidth-.25,windowHeight-.25,.06,glass);
        box(x+u,windowY,z+side*(d/2+.37),.06,windowHeight-.15,.05,frame);
        box(x+u,windowY,z+side*(d/2+.38),windowWidth-.15,.06,.05,frame);
        // Opaque daylight panes face into the room. Walls remain solid for shots/collision.
        const innerZ=z+side*(d/2-.29);
        box(x+u,windowY,innerZ,windowWidth,windowHeight,.06,frame,b.id+'-interior-window-frame');
        box(x+u,windowY,innerZ-side*.04,windowWidth-.25,windowHeight-.25,.04,interiorGlass,b.id+'-interior-window-pane');
        box(x+u,windowY,innerZ-side*.075,.065,windowHeight-.15,.035,frame);
        box(x+u,windowY,innerZ-side*.075,windowWidth-.15,.065,.035,frame);
      }
      if(mapId==='woodlands'&&b.id==='outbuilding'){
        if(side===1){
          // The source bay lintel is dark and flush, beside a broad door and
          // a narrow far-right door, rather than mirrored closed-door wings.
          box(bayX,y+(b.bayHeight??2.9)+.025,z+d/2+.25,(b.bayWidth??3)+.12,.1,.08,dark,b.id+'-bay-lintel');
          for(const door of [{offset:1.5,width:2.8},{offset:7.5,width:1}]){
            const doorX=x+door.offset,doorZ=z+d/2+.26;
            box(doorX,y+1.3,doorZ,door.width,2.6,.07,plank,b.id+'-closed-plank-doors');
            box(doorX,y+1.3,doorZ+.05,.045,2.6,.025,dark,b.id+'-door-seam');
            box(doorX,y+2.65,doorZ,door.width+.2,.14,.16,roof,b.id+'-door-lintel');
          }
        }
      }else box(bayX,y+2.9,z+side*(d/2+.45),3.6,.15,1.35,concrete);
    }
    // Sharp timber-shed footage shows enclosed framed plank walls, without this invented pane.
    if(b.finish!=='timber'&&b.id!=='outbuilding')for(const side of [-1,1]){
      const tallBarrack=mapId==='barrack'&&b.finish==='brick';
      const innerX=x+side*(w/2-.29),windowY=y+(tallBarrack?h*.46:Math.min(2.1,h*.62));
      const windowHeight=tallBarrack?2.3:1.55,windowWidth=tallBarrack?1.3:1.45;
      box(innerX,windowY,z,.06,windowHeight,windowWidth,frame,b.id+'-interior-side-frame');
      box(innerX-side*.04,windowY,z,.04,windowHeight-.25,windowWidth-.25,interiorGlass,b.id+'-interior-window-pane');
      box(innerX-side*.075,windowY,z,.035,windowHeight-.15,.065,frame);
      box(innerX-side*.075,windowY,z,.035,.065,windowWidth-.15,frame);
      box(x+side*(w/2+.28),windowY,z,.06,windowHeight,windowWidth,frame);
      box(x+side*(w/2+.32),windowY,z,.04,windowHeight-.25,windowWidth-.25,glass);
      if(tallBarrack){
        box(x+side*(w/2+.36),windowY,z,.035,windowHeight-.15,.065,frame);
        box(x+side*(w/2+.36),windowY,z,.035,.065,windowWidth-.15,frame);
      }
    }
    if(b.roof==='pitched'){
      const sections=b.roofSections??[{id:'whole',offsetX:0,width:w,height:h,rise:1.8}];
      for(const [sectionIndex,section] of sections.entries()){
        const rise=section.rise,half=d/2+.7,sectionX=x+section.offsetX,angle=Math.atan2(rise,half);
        for(const side of [-1,1]){
          const m=box(sectionX,y+section.height+rise/2+.2,z+side*half/2,section.width+.4,.16,Math.hypot(half,rise),b.id==='outbuilding'?stoneRoof:mapId==='woodlands'&&b.id==='cottage'?rustyRoof:roof,b.id+'-pitched-roof');m.rotation.x=side*angle;
        }
        const verts=new Float32Array([0,0,-d/2,0,0,d/2,0,rise,0]);const g=geo(new THREE.BufferGeometry());g.setAttribute('position',new THREE.BufferAttribute(verts,3));g.computeVertexNormals();
        for(const side of [-1,1]){
          const m=new THREE.Mesh(g,b.id==='outbuilding'?stone:plank);
          const outer=side===-1?sectionIndex===0:sectionIndex===sections.length-1;
          m.name=outer?b.id+'-gable-'+side:b.id+'-gable-'+section.id+'-'+side;
          m.position.set(sectionX+side*section.width/2,y+section.height+.2,z);if(side>0)m.rotation.y=Math.PI;group.add(m);
        }
        if(b.id==='outbuilding'&&sectionIndex===0){
          // Tiny pale rooflight on the shorter bay roof is visible in both sharp sources.
          const light=box(sectionX-.8,y+section.height+rise*(1-1.1/half)+.3,z+1.1,.38,.035,.55,interiorGlass,b.id+'-rooflight');light.rotation.x=angle;
        }
      }
    }
  }

  // Low close-set boards and exposed posts follow the same segmented terrain as collision.
  for(const f of plan.fences){
    for(let i=0;i<f.length;i++){
      const offset=i-f.length/2+.5,x=f.x+(f.axis==='x'?offset:0),z=f.z+(f.axis==='z'?offset:0),base=groundHeightAt(x,z);
      for(let board=0;board<5;board++){
        const shift=(board-2)*.2;
        box(x+(f.axis==='x'?shift:0),base+f.height/2,z+(f.axis==='z'?shift:0),f.axis==='x'?.185:.12,f.height,f.axis==='z'?.185:.12,plank,f.id+'-board');
      }
      for(const level of [.3,.85])box(x,base+level,z,f.axis==='x'?1:.15,.08,f.axis==='z'?1:.15,dark,f.id+'-rail');
    }
    for(let offset=-f.length/2;offset<=f.length/2;offset+=2){
      const x=f.x+(f.axis==='x'?offset:0),z=f.z+(f.axis==='z'?offset:0);
      box(x,groundHeightAt(x,z)+(f.height+.12)/2,z,.12,f.height+.12,.12,plank,f.id+'-post');
    }
  }
  // Each ramp is the same analytic plane as the shared support sampler.
  for(const r of plan.ramps){
    const rise=r.end-r.start,length=Math.hypot(r.length,rise);const m=box(r.x,(r.start+r.end)/2-.12,r.z,r.axis==='x'?length:r.width,.24,r.axis==='z'?length:r.width,concrete,r.id);
    if(r.axis==='z')m.rotation.x=-Math.atan2(rise,r.length);else m.rotation.z=Math.atan2(rise,r.length);
    // Sloped access rises have the broad solid concrete sides seen in Barrack.
    // Level roof bridges remain open underneath.
    if(r.start!==r.end){
      const half=r.length/2,across=r.width/2;
      const point=(along:number,height:number,side:number)=>new THREE.Vector3(r.axis==='x'?along:side,height,r.axis==='z'?along:side);
      const corners=[point(-half,0,-across),point(half,0,-across),point(half,0,across),point(-half,0,across),
        point(-half,r.start,-across),point(half,r.end,-across),point(half,r.end,across),point(-half,r.start,across)];
      const positions:number[]=[],uvs:number[]=[],center=point(0,(r.start+r.end)/4,0);
      for(const face of [[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5],[0,3,2,1]]){
        for(const indices of [[face[0],face[1],face[2]],[face[0],face[2],face[3]]]){
          const [a,b,c]=indices.map(i=>corners[i]);
          const normal=b.clone().sub(a).cross(c.clone().sub(a));if(normal.lengthSq()<1e-12)continue;
          if(normal.dot(a.clone().add(b).add(c).multiplyScalar(1/3).sub(center))<0)indices.reverse();
          for(const i of indices){const v=corners[i];positions.push(v.x,v.y,v.z);uvs.push((r.axis==='x'?v.x:v.z)/4,v.y/4);}
        }
      }
      const solidGeometry=geo(new THREE.BufferGeometry());solidGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      solidGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));solidGeometry.computeVertexNormals();
      const solid=new THREE.Mesh(solidGeometry,concrete);solid.name=r.id+'-solid';solid.position.set(r.x,0,r.z);solid.castShadow=true;solid.receiveShadow=true;group.add(solid);
    }
    // Low edge strips visually describe the ramp without fake full-height AABB walls.
    for(const side of [-1,1]){
      const strip=box(r.x+(r.axis==='z'?side*(r.width/2-.12):0),(r.start+r.end)/2+.25,r.z+(r.axis==='x'?side*(r.width/2-.12):0),r.axis==='x'?length:.22,.5,r.axis==='z'?length:.22,concrete);
      strip.rotation.copy(m.rotation);
    }
  }
  // Crossed alpha leaf sheets give trees irregular translucent gaps, unlike conical winter pines.
  const leafCanvas=document.createElement('canvas');leafCanvas.width=leafCanvas.height=256;const lc=leafCanvas.getContext('2d')!;
  // Fine ascending branch fans leave sky gaps and an elongated irregular silhouette.
  // Sharp Woodland references show wispy directional foliage, not round leaf discs.
  for(let branch=0;branch<24;branch++){
    const y=225-branch*8,side=branch%2?1:-1,length=46+Math.sin((branch+3)/29*Math.PI)*(42+random()*30);
    const tipX=128+side*length,tipY=y-18-random()*25;
    lc.strokeStyle='#505c3d';lc.lineWidth=.7;lc.beginPath();lc.moveTo(128,y+18);lc.lineTo(tipX,tipY);lc.stroke();
    for(let leaf=0;leaf<45;leaf++){
      const t=.25+random()*.75,x=128+(tipX-128)*t+(random()-.5)*24,yy=y+18+(tipY-y-18)*t+(random()-.5)*18;
      lc.fillStyle=['#324a2f','#52684a','#647659','#3d593d'][leaf%4];lc.beginPath();lc.ellipse(x,yy,1.4+random()*2.8,.8+random()*1.6,side*-.6,0,Math.PI*2);lc.fill();
    }
  }
  const leafTexture=new THREE.CanvasTexture(leafCanvas);leafTexture.colorSpace=THREE.SRGBColorSpace;textures.add(leafTexture);
  // Preserve Barrack's texture and placement RNG; Woodland gets independently
  // authored asymmetric leaf masses over the same crown cards and trunks.
  const denseTexture=mapId==='woodlands'?createLegacyDenseFoliageTexture():leafTexture;textures.add(denseTexture);
  const leafMat=new THREE.MeshStandardMaterial({map:denseTexture,alphaTest:.18,side:THREE.DoubleSide,roughness:1});materials.add(leafMat);
  // A low, irregular distant canopy closes the horizon without winter silhouettes.
  // These outside-boundary trees are visual only; playable trunk collision stays shared.
  const renderTrees=[...plan.trees];
  for(let i=0;i<150;i++){const a=i/150*Math.PI*2,r=92+random()*25;renderTrees.push({x:Math.cos(a)*r,z:Math.sin(a)*r,height:7+random()*5,radius:.2+random()*.12});}
  // A separate sparse branch texture avoids advancing the placement generator.
  // The sharp source shows both leafy crowns and nearly bare fine-branched trees.
  // Crown assignments are authored variants, not recovered original tree identities.
  let sparseLeaves:THREE.InstancedMesh|undefined;
  const sparseTree=(i:number)=>mapId==='woodlands'&&i%5<2;
  const sparseCount=renderTrees.filter((_,i)=>sparseTree(i)).length;
  if(sparseCount){
    const sparseTexture=createLegacySparseFoliageTexture();textures.add(sparseTexture);
    const sparseMaterial=new THREE.MeshStandardMaterial({map:sparseTexture,alphaTest:.12,side:THREE.DoubleSide,roughness:1});materials.add(sparseMaterial);
    sparseLeaves=new THREE.InstancedMesh(geo(new THREE.PlaneGeometry(1,1)),sparseMaterial,sparseCount*3);
    sparseLeaves.name='woodland-sparse-tree-canopies';sparseLeaves.castShadow=true;sparseLeaves.receiveShadow=true;group.add(sparseLeaves);
  }
  const trunks=new THREE.InstancedMesh(geo(new THREE.CylinderGeometry(.65,1,1,7)),bark,renderTrees.length);
  const leaves=new THREE.InstancedMesh(geo(new THREE.PlaneGeometry(1,1)),leafMat,(renderTrees.length-sparseCount)*6);const dummy=new THREE.Object3D();
  let denseIndex=0,sparseIndex=0;
  renderTrees.forEach((t,i)=>{
    const y=groundHeightAt(t.x,t.z);dummy.position.set(t.x,y+t.height*.38,t.z);dummy.scale.set(t.radius,t.height*.76,t.radius);dummy.rotation.set(0,0,.025*Math.sin(i));dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
    if(mapId==='woodlands'){
      for(const profile of woodlandCrownProfiles(i,sparseTree(i))){
        dummy.position.set(t.x+profile.offset[0]*t.height,y+profile.offset[1]*t.height,t.z+profile.offset[2]*t.height);
        dummy.scale.set(profile.scale[0]*t.height,profile.scale[1]*t.height,1);dummy.rotation.set(...profile.rotation);dummy.updateMatrix();
        if(sparseTree(i)&&sparseLeaves)sparseLeaves.setMatrixAt(sparseIndex++,dummy.matrix);
        else leaves.setMatrixAt(denseIndex++,dummy.matrix);
      }
    }else if(sparseTree(i)&&sparseLeaves){
      for(let j=0;j<3;j++){
        dummy.position.set(t.x,y+t.height*.65,t.z);
        dummy.scale.set(t.height*(.63+(i%3)*.035),t.height*.74,1);
        dummy.rotation.set(0,j*Math.PI/3+(i%5)*.19,.035*Math.sin(i+j));dummy.updateMatrix();sparseLeaves.setMatrixAt(sparseIndex++,dummy.matrix);
      }
    }else for(let j=0;j<6;j++){
      const a=j*Math.PI/3+(i%5)*.19,outer=j>=3,offset=outer?t.height*.13:.12;
      dummy.position.set(t.x+Math.cos(a)*offset,y+t.height*(outer?.62:.69),t.z+Math.sin(a)*offset);
      dummy.scale.set(t.height*(outer?.46:.76+(i%3)*.04),t.height*(outer?.46:.7),1);
      dummy.rotation.set(outer?.1*Math.sin(i):0,a,.07*Math.sin(i+j));dummy.updateMatrix();leaves.setMatrixAt(denseIndex++,dummy.matrix);
    }
  });
  trunks.name='leafy-tree-trunks';leaves.name='leafy-tree-canopies';trunks.castShadow=true;leaves.castShadow=true;leaves.receiveShadow=true;group.add(trunks,leaves);
  // Woodland source shows subdued horizontal ridge wires; Barrack keeps its mesh.
  // Both remain visual dressing over the existing shared perimeter collision.
  const wire=mat(mapId==='woodlands'?0x30382c:0x73786d);const wirePositions:number[]=[];
  for(const axis of ['x','z'] as const)for(const side of [-1,1]){
    for(let q=-55;q<=55;q+=5){const x=axis==='x'?side*55:q,z=axis==='z'?side*55:q,y=groundHeightAt(x,z);box(x,y+1.2,z,.11,2.4,.11,roof);}
    const levels=mapId==='woodlands'?[.9,1.9]:[.35,.85,1.35,1.85];
    for(let q=-55;q<55;q+=1){for(const level of levels){
      const x=axis==='x'?side*55:q,z=axis==='z'?side*55:q,xx=axis==='x'?x:q+1,zz=axis==='z'?z:q+1;
      if(mapId==='woodlands')wirePositions.push(x,groundHeightAt(x,z)+level,z,xx,groundHeightAt(xx,zz)+level,zz);
      else{
        wirePositions.push(x,groundHeightAt(x,z)+level,z,xx,groundHeightAt(xx,zz)+level+.45,zz);
        wirePositions.push(x,groundHeightAt(x,z)+level+.45,z,xx,groundHeightAt(xx,zz)+level,zz);
      }
    }}
  }
  const wireGeo=geo(new THREE.BufferGeometry());wireGeo.setAttribute('position',new THREE.Float32BufferAttribute(wirePositions,3));const lineMat=new THREE.LineBasicMaterial({color:wire.color,transparent:true,opacity:mapId==='woodlands'?.8:.5});materials.add(lineMat);
  const boundaryWire=new THREE.LineSegments(wireGeo,lineMat);boundaryWire.name=mapId==='woodlands'?'woodland-boundary-wire':'barrack-boundary-wire';group.add(boundaryWire);
  const pickups:Pickup[]=plan.pickups.map(p=>{
    const g=new THREE.Group();g.name=p.id;g.userData.pickupId=p.id;g.position.fromArray(p.position);group.add(g);
    const m=new THREE.Mesh(unitBox,mat(p.type==='health'?0x9aab88:p.type==='armor'?0x566878:0x867253));m.scale.set(.8,.45,.6);m.castShadow=true;g.add(m);
    if(p.type==='health'){for(const [w,h] of [[.34,.1],[.1,.34]]){const cross=new THREE.Mesh(unitBox,red);cross.scale.set(w,h,.02);cross.position.set(0,0,.31);g.add(cross);}}
    return {mesh:g,type:p.type,active:true,respawnAt:0};
  });
  let disposed=false;
  return {group,colliders:plan.colliders.map(c=>new THREE.Box3(new THREE.Vector3().fromArray(c.min),new THREE.Vector3().fromArray(c.max))),spawnPoints:plan.spawnPoints.map(p=>new THREE.Vector3().fromArray(p)),pickups,groundHeightAt,supportHeightAt:(x,z,maxHeight)=>legacySupportHeightAt(mapId,x,z,maxHeight),dispose(){if(disposed)return;disposed=true;group.removeFromParent();trunks.dispose();leaves.dispose();sparseLeaves?.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}};
}

export type LegacyArenaData = LegacyArena;
