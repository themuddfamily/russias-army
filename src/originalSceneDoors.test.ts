import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';
import {createOriginalSceneDoors,sampleOriginalDoorMatrix,type OriginalDoorTracks,type OriginalDoorOpenEvent} from './originalSceneDoors';
const tracks=JSON.parse(readFileSync(new URL('../public/assets/original-scenes/barrack/doors.json',import.meta.url),'utf8')) as OriginalDoorTracks;
const evidence=JSON.parse(readFileSync(new URL('../docs/research-evidence/2026-09-30/original-door-animation/barrack-level1/door-tracks.json',import.meta.url),'utf8')) as {doors:{name:string;samples:{time_seconds:number;source_base_times_delta_matrix:number[]}[]}[]};
function setup(){
 const root=new THREE.Group();root.rotation.x=-Math.PI/2;root.scale.setScalar(ORIGINAL_MAP_SCALE);
 const models=new Map<string,THREE.Group>();for(const track of tracks.doors){const m=new THREE.Group();root.add(m);models.set(track.name,m);}
 const events:OriginalDoorOpenEvent[]=[];const doors=createOriginalSceneDoors(models,tracks,ORIGINAL_MAP_SCALE,{onOpen:event=>events.push(event)});root.updateMatrixWorld(true);return {root,models,events,doors};
}
function closeMatrix(actual:readonly number[],expected:readonly number[]){expect(actual).toHaveLength(16);for(let i=0;i<16;i++)expect(actual[i]).toBeCloseTo(expected[i],7);}
describe('recovered Barrack door animation',()=>{
 it('retains all13 source bindings and282 keys, including the trailing-tab identifier',()=>{
  expect(tracks.doors).toHaveLength(13);expect(tracks.doors.reduce((n,d)=>n+d.keys.length,0)).toBe(282);
  expect(tracks.doors.some(d=>d.name==='door open 30\t')).toBe(true);
  for(const d of tracks.doors)expect(d.motionName).toBe(`${d.name}-Key`);
 });
 it('matches independently preserved source trajectories at half-open and held-open times',()=>{
  for(const d of tracks.doors)for(const time of [.5,1.6]){
   const golden=evidence.doors.find(x=>x.name===d.name)!.samples.find(x=>x.time_seconds===time)!;
   closeMatrix(sampleOriginalDoorMatrix(d,time).elements,golden.source_base_times_delta_matrix);
  }
 });
 it('keeps hinge pivots near their source placement and retains door5 translation and door21 nonuniform scale',()=>{
  const normal=tracks.doors.find(d=>d.name==='door open 28')!;
  const m=sampleOriginalDoorMatrix(normal,1.6);expect(new THREE.Vector3().setFromMatrixPosition(m).distanceTo(new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(normal.baseMatrix)))).toBeLessThan(.001);
  const translating=tracks.doors.find(d=>d.name==='door open 5')!;
  expect(sampleOriginalDoorMatrix(translating,1.6).elements[13]-translating.baseMatrix[13]).toBeCloseTo(84.48052978515625*1.2099997997283936,5);
  const scaled=tracks.doors.find(d=>d.name==='door open 21')!;
  expect(sampleOriginalDoorMatrix(scaled,1.6).determinant()).toBeCloseTo(new THREE.Matrix4().fromArray(scaled.baseMatrix).determinant(),7);
 });
 it('triggers at the normalized source100-unit eye distance and emits immediate opening once',()=>{
  const {doors,models,events}=setup();const name='door open 5',origin=models.get(name)!.getWorldPosition(new THREE.Vector3());
  expect(doors.triggerNearby({x:origin.x,y:origin.y+(100.001*ORIGINAL_MAP_SCALE),z:origin.z})).not.toContain(name);
  expect(doors.triggerNearby({x:origin.x,y:origin.y+(99.999*ORIGINAL_MAP_SCALE),z:origin.z})).toContain(name);
  expect(doors.getState(name)?.phase).toBe('opening');expect(events.filter(e=>e.name===name)).toEqual([{name,remote:false,position:{x:origin.x,y:origin.y,z:origin.z}}]);
  expect(doors.trigger(name)).toBe(false);expect(events.filter(e=>e.name===name)).toHaveLength(1);
 });
 it('applies remote openings without duplicate events and never reaches the authored reclose segment',()=>{
  const {doors,events}=setup();const name='door open 30\t';expect(doors.trigger(name,true)).toBe(true);expect(events[0].remote).toBe(true);
  doors.update(.8);expect(doors.getState(name)?.phase).toBe('opening');
  doors.update(30);expect(doors.getState(name)).toEqual({name,phase:'open',elapsedSeconds:1.6});
  const frozen=doors.getModelMatrix(name)!.elements;closeMatrix(frozen,sampleOriginalDoorMatrix(tracks.doors.find(d=>d.name===name)!,1.6).elements);
  doors.update(30);closeMatrix(doors.getModelMatrix(name)!.elements,frozen);expect(doors.trigger(name,true)).toBe(false);
 });
 it('rejects missing models and invalid keys rather than inventing an opening',()=>{
  expect(()=>createOriginalSceneDoors(new Map(),tracks,ORIGINAL_MAP_SCALE)).toThrow(/Missing original door/);
  const bad={version:1,doors:[{...tracks.doors[0],keys:[{...tracks.doors[0].keys[0],time:NaN}]}]} as OriginalDoorTracks;
  expect(()=>createOriginalSceneDoors(new Map(),bad,ORIGINAL_MAP_SCALE)).toThrow(/Invalid original door key/);
  const {doors}=setup();expect(doors.trigger('door open missing')).toBe(false);expect(()=>doors.update(-1)).toThrow(/elapsed/);
 });
});
