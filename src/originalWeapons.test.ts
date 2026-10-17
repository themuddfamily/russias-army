import * as THREE from 'three';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {createOriginalWeapons,createOriginalWeaponGeometry,ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {ORIGINAL_WEAPON_UNIT_SCALE} from './originalWeaponPresentation';
const base=new URL('../public/assets/original-weapons/',import.meta.url);
const geometry=JSON.parse(readFileSync(new URL('geometry.json',base),'utf8')) as OriginalWeaponGeometryData;
const assets=()=>({geometry,textures:new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]))});

describe('packaged publisher weapon resources',()=>{
  it('matches recorded package hashes and both editions byte/semantic equality',()=>{
    const provenance=JSON.parse(readFileSync(new URL('provenance.json',base),'utf8'));
    const hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
    const rawGeometry=readFileSync(new URL('geometry.json',base));expect(hash(rawGeometry)).toBe(provenance.geometry.sha256);
    const canonical=hash(rawGeometry.subarray(0,-1));
    expect(provenance.sourceGeometry.barrack.canonicalSha256).toBe(canonical);expect(provenance.sourceGeometry.woodland.canonicalSha256).toBe(canonical);
    for(const name of ORIGINAL_WEAPON_TEXTURES){const record=provenance.textures[name];expect(hash(readFileSync(new URL(record.file,base)))).toBe(record.sha256);expect(record.source.barrack.sha256).toBe(record.sha256);expect(record.source.woodland.sha256).toBe(record.sha256);}
  });
  it('keeps all decoded vertices, indexed faces, normals and centered atlas UVs',()=>{
    expect(geometry.meshes).toHaveLength(12);
    const expected={ak47:[814,359],spas12:[765,358],rg6:[614,347],pistol:[231,154],dragunov:[1025,894],rpg:[886,482]};
    for(const data of geometry.meshes){const built=createOriginalWeaponGeometry(data);
      expect(built.getAttribute('position').count).toBe(data.positions.length);expect([...built.index!.array]).toEqual(data.faces.flat());
      for(let i=0;i<data.positions.length;i++)for(let axis=0;axis<3;axis++){
        expect(built.getAttribute('position').getComponent(i,axis)).toBeCloseTo(data.positions[i][axis]*ORIGINAL_WEAPON_UNIT_SCALE,6);
        expect(built.getAttribute('normal').getComponent(i,axis)).toBeCloseTo(data.normals[i][axis],6);
      }
      for(let i=0;i<data.positions.length;i++){expect(built.getAttribute('uv').getX(i)).toBeCloseTo(data.tex_coords[0][i][0]+.5,6);expect(built.getAttribute('uv').getY(i)).toBeCloseTo(.5-data.tex_coords[0][i][1],6);}
      const count=expected[data.resource as keyof typeof expected];if(count)expect([data.positions.length,data.faces.length]).toEqual(count);built.dispose();
    }
  });
  it('builds six rigid guns, binds runtime textures and attaches only the loaded source rocket',()=>{
    const bundle=assets(),collection=createOriginalWeapons(bundle);expect(collection.models.size).toBe(6);
    for(const [weapon,model] of collection.models){expect(model.rotation.order).toBe('ZYX');expect(model.scale.toArray()).toEqual([1,1,1]);expect(model.children.length).toBe(weapon==='rpg'?2:1);}
    expect(collection.rocket.parent).toBe(collection.models.get('rpg'));expect(collection.rocket.position.toArray()).toEqual([0,0,0]);
    collection.setLoaded('rpg',false);expect(collection.rocket.visible).toBe(false);collection.setLoaded('rpg',true);expect(collection.rocket.visible).toBe(true);
    for(const [name,texture] of bundle.textures){expect(texture.flipY).toBe(false);expect(texture.wrapS).toBe(THREE.RepeatWrapping);expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);expect((collection.resources.get(name==='mfmachinegun'?'mfak47':name)!.material as THREE.MeshBasicMaterial).map).toBe(texture);}
    collection.dispose();
  });
  it('uses original crossed flashes at a fixed shot-world matrix and disposes shared assets once',()=>{
    const bundle=assets(),collection=createOriginalWeapons(bundle),scene=new THREE.Scene();const matrix=new THREE.Matrix4().makeTranslation(2,3,4);
    const flash=collection.spawnFlash('rifle',matrix)!;scene.add(flash);expect(flash.geometry.index!.count).toBe(18);expect(flash.matrixAutoUpdate).toBe(false);expect((flash.material as THREE.Material).side).toBe(THREE.DoubleSide);
    matrix.makeTranslation(10,20,30);expect(flash.matrix.elements.slice(12,15)).toEqual([2,3,4]);expect(collection.spawnFlash('rpg',matrix)).toBeUndefined();
    const geometryDispose=vi.spyOn(flash.geometry,'dispose'),materialDispose=vi.spyOn(flash.material as THREE.Material,'dispose');const textureDisposes=[...bundle.textures.values()].map(texture=>vi.spyOn(texture,'dispose'));
    collection.releaseFlash(flash);expect(flash.parent).toBeNull();expect(geometryDispose).not.toHaveBeenCalled();
    const secondFlash=collection.spawnFlash('rifle',matrix)!;scene.add(secondFlash);
    collection.dispose();collection.dispose();expect(secondFlash.parent).toBeNull();expect(collection.spawnFlash('rifle',matrix)).toBeUndefined();expect(flash.parent).toBeNull();expect(geometryDispose).toHaveBeenCalledTimes(1);expect(materialDispose).toHaveBeenCalledTimes(1);for(const dispose of textureDisposes)expect(dispose).toHaveBeenCalledTimes(1);
  });
});
