import {describe,it,expect} from 'vitest';
import {getLegacyMap,legacyGroundHeightAt,legacySupportHeightAt,legacyRampHeightAt,getLegacyReferenceCameras,LEGACY_MAP_IDS,LEGACY_WOODLAND_MAX_TERRAIN_HEIGHT} from './legacyMaps';
import {hasLegacyLineOfSight,raycastLegacyMap} from './legacyCollision';

describe('shared reference-inspired maps',()=>{
  it('provides a long low stone bay with closed wall wings and a clear shed yard gate',()=>{
    const map=getLegacyMap('woodlands'),building=map.buildings.find(b=>b.id==='outbuilding')!;
    expect(building.finish).toBe('stone');expect(building.roof).toBe('pitched');
    expect(building.width/building.depth).toBeGreaterThan(2.5);
    const y=building.base+1.65;
    const bayX=building.x+building.bayOffsetX!;
    expect(hasLegacyLineOfSight('woodlands',{x:bayX,y,z:building.z},{x:bayX,y,z:building.z+building.depth/2+1})).toBe(true);
    expect(hasLegacyLineOfSight('woodlands',{x:bayX,y,z:building.z},{x:bayX,y,z:building.z-building.depth/2-1})).toBe(false);
    expect(hasLegacyLineOfSight('woodlands',{x:building.x+building.width*.32,y,z:building.z-building.depth/2-1},{x:building.x+building.width*.32,y,z:building.z+building.depth/2+1})).toBe(false);
    expect(map.fences).toHaveLength(3);
    for(const fence of map.fences){
      const panels=map.colliders.filter(c=>c.id.startsWith(fence.id+'-panel-'));
      expect(panels).toHaveLength(fence.length);
      for(const panel of panels){
        const x=(panel.min[0]+panel.max[0])/2,z=(panel.min[2]+panel.max[2])/2;
        expect(panel.min[1]).toBeCloseTo(legacyGroundHeightAt('woodlands',x,z));
      }
    }
    const shed=map.buildings.find(b=>b.id==='shed')!;
    // Its centre route continues from both doors into the yard and through the south gap.
    for(let z=17;z<=36;z+=.25){
      const ground=legacyGroundHeightAt('woodlands',shed.x,z);
      expect(map.colliders.some(c=>c.id.startsWith('shed-yard-')&&shed.x+.35>c.min[0]&&shed.x-.35<c.max[0]&&z+.35>c.min[2]&&z-.35<c.max[2]&&ground+1.7>c.min[1]&&ground<c.max[1])).toBe(false);
    }
  });
  it('keeps sparse Barrack trees in open playable grass with collidable trunks',()=>{
    const map=getLegacyMap('barrack');
    const playable=map.trees.filter(t=>Math.abs(t.x)<map.bounds&&Math.abs(t.z)<map.bounds);
    expect(playable.length).toBe(4);
    expect(map.trees.some(t=>Math.max(Math.abs(t.x),Math.abs(t.z))>map.bounds)).toBe(true);
    for(const t of playable){
      const trunk=map.colliders.find(c=>c.id.startsWith('tree-')&&t.x>=c.min[0]&&t.x<=c.max[0]&&t.z>=c.min[2]&&t.z<=c.max[2]);
      expect(trunk).toBeDefined();
      expect(trunk!.min[1]).toBe(0);
      expect(trunk!.max[1]).toBeGreaterThan(1.7);
      for(const b of map.buildings){
        expect(Math.abs(t.x-b.x)>b.width/2+3||Math.abs(t.z-b.z)>b.depth/2+3).toBe(true);
      }
      for(const r of map.ramps){
        const along=r.axis==='x'?Math.abs(t.x-r.x):Math.abs(t.z-r.z);
        const across=r.axis==='x'?Math.abs(t.z-r.z):Math.abs(t.x-r.x);
        expect(along>r.length/2+2||across>r.width/2+2).toBe(true);
      }
      for(const p of [...map.spawnPoints,...map.pickups.map(p=>p.position)]){
        expect(Math.hypot(t.x-p[0],t.z-p[2])).toBeGreaterThan(3);
      }
    }
  });
  it('represents both flat and pitched Woodland roof families',()=>{
    const buildings=getLegacyMap('woodlands').buildings;
    expect(buildings.find(b=>b.id==='farmhouse')?.roof).toBe('flat');
    expect(buildings.some(b=>b.roof==='pitched')).toBe(true);
  });
  for(const id of LEGACY_MAP_IDS){
    it(`${id} spawns are clear and pickup IDs are unique`,()=>{
      const map=getLegacyMap(id);
      for(const p of map.spawnPoints){
        expect(p[1]).toBeCloseTo(legacyGroundHeightAt(id,p[0],p[2]));
        for(const c of map.colliders){
          const overlaps=p[0]+.35>c.min[0]&&p[0]-.35<c.max[0]&&p[2]+.35>c.min[2]&&p[2]-.35<c.max[2]&&p[1]+1.7>c.min[1]&&p[1]+.05<c.max[1];
          expect(overlaps,`${id} spawn ${p} vs ${c.id}`).toBe(false);
        }
      }
      expect(new Set(map.pickups.map(p=>p.id)).size).toBe(map.pickups.length);
      expect(getLegacyReferenceCameras(id).length).toBeGreaterThanOrEqual(5);
    });
    it(`${id} rooms have level floors and clear opposed entrances`,()=>{
      for(const b of getLegacyMap(id).buildings){
        for(const sign of [-1,1]){
          const x=b.x+(b.bayOffsetX??0),z=b.z+sign*b.depth/2;
          expect(legacyGroundHeightAt(id,x,z)).toBeCloseTo(b.base);
          expect(legacySupportHeightAt(id,x,z,b.base+.35)).toBeCloseTo(b.base);
          const wall=getLegacyMap(id).colliders.find(c=>x>c.min[0]&&x<c.max[0]&&z>c.min[2]&&z<c.max[2]&&b.base+1.65>c.min[1]&&b.base+1.65<c.max[1]);
          if(b.frontBayOnly&&sign===-1)expect(wall).toBeDefined();
          else expect(wall).toBeUndefined();
        }
      }
    });
  }
  it('keeps ground-floor players below roofs while roof players stand on them',()=>{
    const b=getLegacyMap('barrack').buildings[0];
    expect(legacySupportHeightAt('barrack',b.x,b.z,.35)).toBe(0);
    expect(legacySupportHeightAt('barrack',b.x,b.z,5.5)).toBeCloseTo(5.24);
  });
  it('keeps the asymmetric stone bay opening clear and supports its separate roof heights',()=>{
    const map=getLegacyMap('woodlands'),b=map.buildings.find(b=>b.id==='outbuilding')!;
    const bayX=b.x+b.bayOffsetX!,front=b.z+b.depth/2;
    expect(b.width).toBe(18);expect(b.depth).toBe(7);
    // A player capsule fits inside the opening at both shoulders without meeting a wall.
    for(const dx of [-1,0,1]){
      const x=bayX+dx;
      const walls=map.colliders.filter(c=>x+.35>c.min[0]&&x-.35<c.max[0]&&front+.35>c.min[2]&&front-.35<c.max[2]&&b.base+1.7>c.min[1]&&b.base+.05<c.max[1]);
      expect(walls).toHaveLength(0);
    }
    const lintel=raycastLegacyMap('woodlands',{x:bayX,y:b.base+b.bayHeight!+.1,z:front+1},{x:0,y:0,z:-1},2);
    expect(lintel?.id).toBe('outbuilding-1-lintel');
    const rear=raycastLegacyMap('woodlands',{x:bayX,y:b.base+1.65,z:b.z},{x:0,y:0,z:-1},b.depth);
    expect(rear?.id).toBe('outbuilding--1-bay-wall');
    for(const section of b.roofSections!){
      const x=b.x+section.offsetX;
      expect(legacySupportHeightAt('woodlands',x,b.z,b.base+.35)).toBeCloseTo(b.base);
      expect(legacySupportHeightAt('woodlands',x,b.z,b.base+section.height+.3)).toBeCloseTo(b.base+section.height+.24);
      const roof=raycastLegacyMap('woodlands',{x,y:b.base+6,z:b.z},{x:0,y:-1,z:0},6);
      expect(roof?.id).toBe('outbuilding-roof-'+section.id);
      expect(roof?.point.y).toBeCloseTo(b.base+section.height+.24);
    }
    // The higher right wall closes the small vertical break above the short bay roof.
    const closed=raycastLegacyMap('woodlands',{x:b.x+1.5,y:b.base+3.25,z:front+1},{x:0,y:0,z:-1},2);
    expect(closed?.id).toBe('outbuilding-1-doors-wall');
  });
  it('supports continuous ascending and descending ramp routes with small steps',()=>{
    for(const ramp of getLegacyMap('barrack').ramps){
      let last=ramp.start;
      for(let i=0;i<=100;i++){
        const along=(i/100-.5)*ramp.length;
        const x=ramp.x+(ramp.axis==='x'?along:0),z=ramp.z+(ramp.axis==='z'?along:0);
        const y=legacyRampHeightAt(ramp,x,z)!;
        expect(Number.isFinite(y)).toBe(true);
        expect(Math.abs(y-last)).toBeLessThan(.1);
        const support=legacySupportHeightAt('barrack',x,z,y+.15);
        expect(support).toBeGreaterThanOrEqual(y-.001);
        expect(support-y).toBeLessThanOrEqual(.151); // Small overlap step onto adjoining roof slab.
        last=y;
      }
    }
  });
  it('woodlands has meaningful traversable elevation unlike the flat Barrack scene',()=>{
    const values=[];for(let x=-50;x<=50;x+=5)for(let z=-50;z<=50;z+=5){values.push(legacyGroundHeightAt('woodlands',x,z));expect(legacyGroundHeightAt('barrack',x,z)).toBe(0);}
    expect(Math.max(...values)-Math.min(...values)).toBeGreaterThan(8);
    expect(getLegacyMap('woodlands').trees.filter(t=>Math.abs(t.x)<50&&Math.abs(t.z)<50).length).toBeGreaterThan(30);
  });
  it('keeps the low stone-building approach level while the bank rises behind its terrace',()=>{
    const building=getLegacyMap('woodlands').buildings.find(b=>b.id==='outbuilding')!;
    for(const x of [26,33,40])for(const z of [-15,-18,-22,-28,-31.5]){
      expect(legacyGroundHeightAt('woodlands',x,z)).toBeCloseTo(building.base,8);
    }
    expect(legacyGroundHeightAt('woodlands',41,-43)-building.base).toBeGreaterThan(9);
    for(let x=-55;x<=55;x+=2.5)for(let z=-55;z<=55;z+=2.5){
      expect(legacyGroundHeightAt('woodlands',x,z)).toBeLessThanOrEqual(LEGACY_WOODLAND_MAX_TERRAIN_HEIGHT);
    }
  });
  it('hits the raised bank with descending projectiles from above the former terrain bound',()=>{
    const hit=raycastLegacyMap('woodlands',{x:41,y:30,z:-45},{x:0,y:-1,z:0},40);
    expect(hit?.surface).toBe('ground');
    expect(hit?.id).toBe('terrain');
    expect(hit!.point.y).toBeCloseTo(legacyGroundHeightAt('woodlands',41,-45),4);
    expect(hit!.point.y).toBeGreaterThan(14.1);
    expect(hit!.distance).toBeCloseTo(30-hit!.point.y,4);
  });
  it('blocks a clear airborne sightline with the exposed bank rather than an unrelated collider',()=>{
    const from={x:41,y:16,z:-35},to={x:41,y:16,z:-52};
    expect(from.y).toBeGreaterThan(legacyGroundHeightAt('woodlands',from.x,from.z));
    expect(to.y).toBeGreaterThan(legacyGroundHeightAt('woodlands',to.x,to.z));
    expect(hasLegacyLineOfSight('woodlands',from,to,{includeGround:false})).toBe(true);
    expect(hasLegacyLineOfSight('woodlands',from,to)).toBe(false);
    const hit=raycastLegacyMap('woodlands',from,{x:0,y:0,z:-1},17);
    expect(hit?.surface).toBe('ground');
    expect(hit!.point.z).toBeGreaterThan(-41);
    expect(hit!.point.z).toBeLessThan(-39);
    expect(hit!.point.y).toBeGreaterThan(14.1);
    expect(hit!.point.y).toBeCloseTo(legacyGroundHeightAt('woodlands',hit!.point.x,hit!.point.z),4);
  });
});
