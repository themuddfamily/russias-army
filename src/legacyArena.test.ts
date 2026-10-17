import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {createLegacyArena} from './legacyArena';
import {getLegacyMap,LEGACY_MAP_IDS} from '../shared/legacyMaps';

// Scene construction tests need canvas drawing calls, not a GPU or bitmap assertions.
const context={fillStyle:'',strokeStyle:'',lineWidth:1,fillRect(){},beginPath(){},moveTo(){},lineTo(){},quadraticCurveTo(){},closePath(){},stroke(){},ellipse(){},fill(){},createRadialGradient(){return {addColorStop(){}};}};
beforeEach(()=>vi.stubGlobal('document',{createElement:(tag:string)=>{if(tag!=='canvas')throw new Error(tag);return {width:0,height:0,getContext:()=>({...context})};}}));
afterEach(()=>vi.unstubAllGlobals());

describe('legacy scene geometry and ownership',()=>{
  it('separates dark Woodland floors from pale timber walls and textures trunks without changing layout',()=>{
    const before=JSON.stringify(getLegacyMap('woodlands'));
    const woodland=createLegacyArena(new THREE.Scene(),'woodlands'),barrack=createLegacyArena(new THREE.Scene(),'barrack');
    const floor=woodland.group.getObjectByName('shed-floor') as THREE.Mesh;
    const wall=woodland.group.getObjectByName('shed-west') as THREE.Mesh;
    const floorMaterial=floor.material as THREE.MeshStandardMaterial,wallMaterial=wall.material as THREE.MeshStandardMaterial;
    expect(floorMaterial).not.toBe(wallMaterial);
    // Wall streaking is distinct from the finer floor boards; neither surface
    // should lose its texture when the other material is configured.
    expect(floorMaterial.map).not.toBeNull();expect(wallMaterial.map).not.toBeNull();
    expect(floorMaterial.map).not.toBe(wallMaterial.map);
    expect(floorMaterial.color.r+floorMaterial.color.g+floorMaterial.color.b).toBeLessThan((wallMaterial.color.r+wallMaterial.color.g+wallMaterial.color.b)/2);
    const trunks=woodland.group.getObjectByName('leafy-tree-trunks') as THREE.InstancedMesh;
    const bark=trunks.material as THREE.MeshStandardMaterial;
    expect(bark.map?.name).toBe('woodland-mottled-pale-bark');
    expect(bark.map?.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(bark.map?.repeat.y).toBe(3);
    const oldTrunks=barrack.group.getObjectByName('leafy-tree-trunks') as THREE.InstancedMesh;
    expect((oldTrunks.material as THREE.MeshStandardMaterial).map).toBeNull();
    expect(JSON.stringify(getLegacyMap('woodlands'))).toBe(before);
    woodland.dispose();barrack.dispose();
  });
  it('mixes sparse Woodland crowns without moving shared trunks or changing Barrack crowns',()=>{
    const map=getLegacyMap('woodlands'),before=JSON.stringify(map);
    const woodland=createLegacyArena(new THREE.Scene(),'woodlands'),repeat=createLegacyArena(new THREE.Scene(),'woodlands'),barrack=createLegacyArena(new THREE.Scene(),'barrack');
    const trunks=woodland.group.getObjectByName('leafy-tree-trunks') as THREE.InstancedMesh;
    const dense=woodland.group.getObjectByName('leafy-tree-canopies') as THREE.InstancedMesh;
    const sparse=woodland.group.getObjectByName('woodland-sparse-tree-canopies') as THREE.InstancedMesh;
    expect(sparse.count).toBeGreaterThan(0);expect(dense.count).toBeGreaterThan(0);
    expect(dense.count/6+sparse.count/3).toBe(trunks.count);
    expect((sparse.material as THREE.MeshStandardMaterial).map?.name).toBe('woodland-sparse-branch-crown');
    for(const name of ['leafy-tree-trunks','leafy-tree-canopies','woodland-sparse-tree-canopies']){
      const first=woodland.group.getObjectByName(name) as THREE.InstancedMesh,second=repeat.group.getObjectByName(name) as THREE.InstancedMesh;
      expect(Array.from(first.instanceMatrix.array)).toEqual(Array.from(second.instanceMatrix.array));
    }
    const matrix=new THREE.Matrix4(),position=new THREE.Vector3();
    map.trees.forEach((tree,i)=>{
      trunks.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix);
      expect(position.x).toBeCloseTo(tree.x,4);expect(position.z).toBeCloseTo(tree.z,4);
      expect(position.y).toBeCloseTo(woodland.groundHeightAt(tree.x,tree.z)+tree.height*.38,4);
    });
    expect(barrack.group.getObjectByName('woodland-sparse-tree-canopies')).toBeUndefined();
    const barrackTrunks=barrack.group.getObjectByName('leafy-tree-trunks') as THREE.InstancedMesh,barrackCrowns=barrack.group.getObjectByName('leafy-tree-canopies') as THREE.InstancedMesh;
    expect(barrackCrowns.count).toBe(barrackTrunks.count*6);
    expect(JSON.stringify(map)).toBe(before);
    woodland.dispose();repeat.dispose();barrack.dispose();
  });
  it('uses sparse terrain-following Woodland strands while retaining Barrack diagonal mesh',()=>{
    const woodland=createLegacyArena(new THREE.Scene(),'woodlands'),barrack=createLegacyArena(new THREE.Scene(),'barrack');
    const wire=woodland.group.getObjectByName('woodland-boundary-wire') as THREE.LineSegments;
    const vertices=wire.geometry.attributes.position;
    expect(vertices.count).toBe(4*110*2*2);
    for(let i=0;i<vertices.count;i+=2){
      const level=vertices.getY(i)-woodland.groundHeightAt(vertices.getX(i),vertices.getZ(i));
      const endLevel=vertices.getY(i+1)-woodland.groundHeightAt(vertices.getX(i+1),vertices.getZ(i+1));
      expect(endLevel).toBeCloseTo(level,4);
      expect(Math.min(Math.abs(level-.9),Math.abs(level-1.9))).toBeLessThan(.0001);
    }
    expect((wire.material as THREE.LineBasicMaterial).color.getHex()).toBe(0x30382c);
    const oldWire=barrack.group.getObjectByName('barrack-boundary-wire') as THREE.LineSegments;
    expect(oldWire.geometry.attributes.position.count).toBe(4*110*4*4);
    expect((oldWire.material as THREE.LineBasicMaterial).color.getHex()).toBe(0x73786d);
    expect(woodland.colliders.length).toBe(getLegacyMap('woodlands').colliders.length);
    woodland.dispose();barrack.dispose();
  });
  it('shows closed plank doors beside the open stone bay and terrain-supported timber fencing',()=>{
    const arena=createLegacyArena(new THREE.Scene(),'woodlands');arena.group.updateMatrixWorld(true);
    const map=getLegacyMap('woodlands'),building=map.buildings.find(b=>b.id==='outbuilding')!;
    const doors=arena.group.children.filter(o=>o.name==='outbuilding-closed-plank-doors');
    expect(doors).toHaveLength(2);
    for(const door of doors){
      const bounds=new THREE.Box3().setFromObject(door);
      expect(bounds.min.x).toBeGreaterThan(building.x+(building.bayOffsetX??0)+(building.bayWidth??3)/2);
      const wall=map.colliders.find(c=>c.id.startsWith('outbuilding')&&door.position.x>=c.min[0]&&door.position.x<=c.max[0]&&door.position.z>=c.min[2]-.1&&door.position.z<=c.max[2]+.1);
      expect(wall).toBeDefined();
    }
    const roof=arena.group.children.filter(o=>o.name==='outbuilding-pitched-roof') as THREE.Mesh[];
    expect(roof).toHaveLength(4);
    expect(roof.every(o=>(o.material as THREE.Material).name!=='weathered-red-roof')).toBe(true);
    for(const fence of map.fences){
      const boards=arena.group.children.filter(o=>o.name===fence.id+'-board');
      expect(boards).toHaveLength(fence.length*5);
      expect(arena.group.children.some(o=>o.name===fence.id+'-post')).toBe(true);
    }
    expect(arena.group.children.some(o=>o.name==='shed-interior-window-pane')).toBe(false);
    arena.dispose();
  });
  it('keeps timber rails and diagonal bracing against walls and clear of opposed doors',()=>{
    const map=getLegacyMap('woodlands'),before=JSON.stringify(map);
    const arena=createLegacyArena(new THREE.Scene(),'woodlands');arena.group.updateMatrixWorld(true);
    const shed=map.buildings.find(b=>b.id==='shed')!;
    const beams=arena.group.children.filter(o=>/^shed-interior-(rail|upright|brace)$/.test(o.name));
    expect(beams.filter(o=>o.name.endsWith('brace'))).toHaveLength(2);
    expect(beams.length).toBeGreaterThan(10);
    for(const beam of beams){
      const bounds=new THREE.Box3().setFromObject(beam);
      expect(bounds.min.y).toBeGreaterThan(shed.base);
      expect(bounds.max.y).toBeLessThan(shed.base+shed.height);
      const touchesSide=Math.abs(beam.position.x-shed.x)>shed.width/2-.5;
      const doorClear=bounds.max.x<shed.x-1.5||bounds.min.x>shed.x+1.5;
      expect(touchesSide||doorClear,beam.name).toBe(true);
    }
    expect(JSON.stringify(map)).toBe(before);
    arena.dispose();
  });
  it('closes pitched roofs with outward-facing gables visible from either exterior',()=>{
    const arena=createLegacyArena(new THREE.Scene(),'woodlands');arena.group.updateMatrixWorld(true);
    for(const building of getLegacyMap('woodlands').buildings.filter(b=>b.roof==='pitched')){
      for(const side of [-1,1]){
        const gable=arena.group.getObjectByName(building.id+'-gable-'+side) as THREE.Mesh;
        const gableBounds=new THREE.Box3().setFromObject(gable);
        const origin=new THREE.Vector3(building.x+side*(building.width/2+2),(gableBounds.min.y+gableBounds.max.y)/2,building.z);
        const ray=new THREE.Raycaster(origin,new THREE.Vector3(-side,0,0));
        expect(ray.intersectObject(gable).length,`${building.id} exterior side ${side}`).toBe(1);
        const inwardOrigin=origin.clone();inwardOrigin.x=building.x+side*(building.width/2-1);
        ray.set(inwardOrigin,new THREE.Vector3(side,0,0));
        expect(ray.intersectObject(gable).length).toBe(0);
      }
    }
    expect(arena.group.children.some(o=>o.name.startsWith('farmhouse-gable-'))).toBe(false);
    arena.dispose();
  });
  for(const id of LEGACY_MAP_IDS){
    it(`${id} builds level interior floors, room-facing daylight panes, and shared pickups`,()=>{
      const scene=new THREE.Scene(),arena=createLegacyArena(scene,id),map=getLegacyMap(id);
      arena.group.updateMatrixWorld(true);
      for(const b of map.buildings){
        const floor=arena.group.getObjectByName(b.id+'-floor') as THREE.Mesh;
        const bounds=new THREE.Box3().setFromObject(floor);
        expect(bounds.max.y).toBeCloseTo(b.base+.03);
        expect(bounds.min.x).toBeCloseTo(b.x-b.width/2);
        const panes=arena.group.children.filter(m=>m.name===b.id+'-interior-window-pane') as THREE.Mesh[];
        if(b.finish==='timber'||b.id==='outbuilding')expect(panes).toHaveLength(0);
        else expect(panes.length).toBeGreaterThanOrEqual(2);
        for(const pane of panes){
          expect(Math.abs(pane.position.x-b.x)).toBeLessThan(b.width/2-.225);
          expect(Math.abs(pane.position.z-b.z)).toBeLessThan(b.depth/2-.225);
          expect((pane.material as THREE.MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(0);
        }
      }
      expect(arena.pickups.map(p=>p.mesh.userData.pickupId)).toEqual(map.pickups.map(p=>p.id));
      arena.pickups.forEach((p,i)=>expect(p.mesh.position.toArray()).toEqual(map.pickups[i].position));
      const trees=arena.group.getObjectByName('leafy-tree-trunks') as THREE.InstancedMesh;
      expect(trees.count).toBeGreaterThan(map.trees.length);
      arena.dispose();
    });
  }
  it('rendered ramp centerlines meet their shared support endpoints',()=>{
    const arena=createLegacyArena(new THREE.Scene(),'barrack');arena.group.updateMatrixWorld(true);
    for(const ramp of getLegacyMap('barrack').ramps){
      const mesh=arena.group.getObjectByName(ramp.id)!;
      for(const side of [-1,1]){
        const local=ramp.axis==='x'?new THREE.Vector3(side*.5,.5,0):new THREE.Vector3(0,.5,side*.5);
        const world=mesh.localToWorld(local);
        expect(world.y).toBeCloseTo(side<0?ramp.start:ramp.end,1);
        expect(Math.abs((ramp.axis==='x'?world.x-ramp.x:world.z-ramp.z)-side*ramp.length/2)).toBeLessThan(.05);
      }
    }
    arena.dispose();
  });
  it('renders solid access-ramp sides while leaving level bridges open underneath',()=>{
    const arena=createLegacyArena(new THREE.Scene(),'barrack');arena.group.updateMatrixWorld(true);
    for(const ramp of getLegacyMap('barrack').ramps){
      const solid=arena.group.getObjectByName(ramp.id+'-solid');
      if(ramp.start===ramp.end){expect(solid).toBeUndefined();continue;}
      expect(solid).toBeInstanceOf(THREE.Mesh);
      for(const side of [-1,1]){
        const origin=new THREE.Vector3(ramp.x,ramp.start/4+ramp.end/4,ramp.z);
        const direction=new THREE.Vector3();
        if(ramp.axis==='z'){origin.x+=side*(ramp.width/2+2);direction.x=-side;}
        else{origin.z+=side*(ramp.width/2+2);direction.z=-side;}
        const hits=new THREE.Raycaster(origin,direction).intersectObject(solid!);
        expect(hits.length,`${ramp.id} side ${side}`).toBeGreaterThan(0);
        expect(hits[0].distance).toBeCloseTo(2,5);
      }
    }
    arena.dispose();
  });
  it('uses Woodland stone and earth without changing shared landforms or Barrack red facades',()=>{
    const before=JSON.stringify(getLegacyMap('woodlands'));
    const woodland=createLegacyArena(new THREE.Scene(),'woodlands');
    const barrack=createLegacyArena(new THREE.Scene(),'barrack');
    const farm=woodland.group.getObjectByName('farmhouse-west') as THREE.Mesh;
    expect((farm.material as THREE.Material).name).toBe('woodland-mottled-stone');
    const redFacades=(arena:ReturnType<typeof createLegacyArena>)=>arena.group.children.filter(o=>o instanceof THREE.Mesh && (Array.isArray(o.material)?o.material:[o.material]).some(m=>m.name==='barrack-weathered-pink'));
    expect(redFacades(woodland)).toHaveLength(0);
    expect(redFacades(barrack).length).toBeGreaterThan(0);
    const terrain=woodland.group.getObjectByName('playable-grass-and-earth') as THREE.Mesh;
    const vertices=terrain.geometry.attributes.position,colors=terrain.geometry.attributes.color;
    let earthVertices=0,greenVertices=0;
    for(let i=0;i<vertices.count;i++){
      expect(vertices.getY(i)).toBeCloseTo(woodland.groundHeightAt(vertices.getX(i),vertices.getZ(i)),4);
      if(colors.getX(i)>colors.getY(i))earthVertices++;
      else greenVertices++;
    }
    expect(earthVertices).toBeGreaterThan(1000);
    expect(greenVertices).toBeGreaterThan(1000);
    expect(woodland.group.children.some(o=>o instanceof THREE.Mesh&&o.geometry.type==='IcosahedronGeometry')).toBe(false);
    expect(JSON.stringify(getLegacyMap('woodlands'))).toBe(before);
    woodland.dispose();barrack.dispose();
  });
  it('disposes each owned mesh resource once and removes the scene root',()=>{
    const scene=new THREE.Scene(),arena=createLegacyArena(scene,'woodlands');
    const owned=new Set<THREE.BufferGeometry|THREE.Material|THREE.Texture|THREE.InstancedMesh>();
    arena.group.traverse(o=>{
      if(o instanceof THREE.Mesh||o instanceof THREE.LineSegments){owned.add(o.geometry);const materials=Array.isArray(o.material)?o.material:[o.material];for(const m of materials){owned.add(m);const map=(m as THREE.MeshStandardMaterial).map;if(map)owned.add(map);}}
      if(o instanceof THREE.InstancedMesh)owned.add(o);
    });
    const counts=new Map<object,number>();owned.forEach(o=>{const source=o as {addEventListener(type:'dispose',listener:()=>void):void};source.addEventListener('dispose',()=>counts.set(o,(counts.get(o)??0)+1));});
    arena.dispose();arena.dispose();
    expect(scene.children).not.toContain(arena.group);
    owned.forEach(o=>expect(counts.get(o),String(o.type)).toBe(1));
  });
});
