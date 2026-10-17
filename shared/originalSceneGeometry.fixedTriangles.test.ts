import {describe,expect,it} from 'vitest';
import {createOriginalSceneGeometry,type OriginalFixedTriangleEntry,type OriginalSceneData,type OriginalSceneMesh,type OriginalSceneNode} from './originalSceneGeometry';
import {createOriginalAngularBody} from './originalAngularBody';
import {captureOriginalAngularFixedMotion} from './originalAngularFixedMotion';

const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function node(name:string,resource='surface',matrix=[...I],parent='World',visibility=1):OriginalSceneNode {
  return {name,resource,matrix,parent,visibility,shader:'default'};
}
function mesh(resource='surface',count=1):OriginalSceneMesh {
  return {resource,part:0,positions:[[0,0,0],[1,0,0],[0,1,0]],faces:Array.from({length:count},()=>[0,1,2]),normals:[],tex_coords:[]};
}
describe('bounded construction triangle pages',()=>{
  it('covers every retained triangle exactly once across32-entry boundaries in construction order',()=>{
    const data:OriginalSceneData={nodes:[node('first','first'),node('second','second')],meshes:[mesh('second',4),mesh('first',33)]};
    const geometry=createOriginalSceneGeometry(data,{scale:1,cellSize:1});
    const entries:OriginalFixedTriangleEntry[]=[];let offset=0;
    const first=geometry.fixedTrianglePage(offset);
    expect(first).toMatchObject({offset:0,nextOffset:32,total:37,complete:false});
    while(offset<geometry.triangleCount){
      const page=geometry.fixedTrianglePage(offset);
      expect(page.triangles.length).toBeLessThanOrEqual(32);expect(page.revision).toBe(first.revision);
      entries.push(...page.triangles);offset=page.nextOffset;
      expect(page.complete).toBe(offset===37);
    }
    expect(entries.map(entry=>entry.sourceIndex)).toEqual(Array.from({length:37},(_,index)=>index));
    expect(new Set(entries.map(entry=>entry.id)).size).toBe(37);
    expect(entries.map(entry=>entry.model)).toEqual([...Array(33).fill('first'),...Array(4).fill('second')]);
    expect(entries.map(entry=>entry.id)).toEqual(Array.from({length:37},(_,index)=>`fixed-triangle:${index}`));
    expect(geometry.fixedTrianglePage(32,2)).toMatchObject({nextOffset:34,total:37,complete:false});
    const terminal=geometry.fixedTrianglePage(37);
    expect(terminal).toMatchObject({offset:37,nextOffset:37,total:37,complete:true,triangles:[]});
  });

  it('retains invisible models, default exclusions and exact scaled parent transforms',()=>{
    const parent=[2,0,0,0,0,2,0,0,0,0,2,0,10,20,30,1],child=[...I];child[12]=1;child[13]=2;child[14]=3;
    const data:OriginalSceneData={nodes:[node('Parent','',parent),node('Door open1'),node('BADDY'),node('barrel1'),node('leaf','surface',child,'PARENT',0)],meshes:[mesh()]};
    const geometry=createOriginalSceneGeometry(data,{scale:.5,cellSize:1});
    const page=geometry.fixedTrianglePage(0);
    expect(page).toMatchObject({total:1,complete:true});
    expect(page.triangles[0]).toEqual({id:'fixed-triangle:0',sourceIndex:0,model:'leaf',triangle:[
      {x:6,y:18,z:-12},{x:7,y:18,z:-12},{x:6,y:18,z:-13},
    ]});
    const onlyDoor=createOriginalSceneGeometry(data,{scale:1,cellSize:1,includeModel:name=>name==='Door open1'});
    expect(onlyDoor.fixedTrianglePage(0).triangles.map(entry=>entry.model)).toEqual(['Door open1']);
    expect(onlyDoor.fixedTrianglePage(0).revision.scope).toBe('immutable-construction-subset');
  });

  it('returns deeply frozen fresh snapshots isolated from mutable constructor inputs',()=>{
    const positions=[[0,0,0],[1,0,0],[0,1,0]],faces=[[0,1,2],[0,0,0]],matrix=[...I];
    const model=node('surface','surface',matrix);
    const geometry=createOriginalSceneGeometry({nodes:[model],meshes:[{...mesh(),positions,faces}]},{scale:1,cellSize:1});
    const page=geometry.fixedTrianglePage(0);expect(page.total).toBe(1); // constructor already omits degenerate faces
    for(const value of [page,page.revision,page.triangles,page.triangles[0],page.triangles[0].triangle,...page.triangles[0].triangle])expect(Object.isFrozen(value)).toBe(true);
    expect(Reflect.set(page,'total',99)).toBe(false);
    expect(Reflect.set(page.triangles,'0',null)).toBe(false);
    expect(Reflect.set(page.triangles[0],'model','changed')).toBe(false);
    expect(Reflect.set(page.triangles[0].triangle,'0',{x:9,y:9,z:9})).toBe(false);
    expect(Reflect.set(page.triangles[0].triangle[0],'x',9)).toBe(false);
    positions[0][0]=999;faces[0][0]=2;matrix[12]=999;model.name='mutated';
    const next=geometry.fixedTrianglePage(0);
    expect(next).toEqual(page);expect(next).not.toBe(page);
    expect(next.triangles[0].triangle).not.toBe(page.triangles[0].triangle);
    expect(next.triangles[0].triangle[0]).not.toBe(page.triangles[0].triangle[0]);
    expect(next.revision).toBe(page.revision);
    const another=createOriginalSceneGeometry({nodes:[node('surface')],meshes:[mesh()]},{scale:1,cellSize:1});
    expect(another.fixedTrianglePage(0).revision).not.toBe(page.revision);
  });

  it('rejects invalid offsets and hard caps without clipping the requested page',()=>{
    const geometry=createOriginalSceneGeometry({nodes:[node('surface')],meshes:[mesh()]},{scale:1,cellSize:1});
    for(const offset of [-1,.5,2,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])expect(()=>geometry.fixedTrianglePage(offset)).toThrow(/offset/);
    for(const limit of [0,-1,.5,33,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])expect(()=>geometry.fixedTrianglePage(0,limit)).toThrow(/limit/);
    expect(geometry.fixedTrianglePage(1,1)).toMatchObject({offset:1,nextOffset:1,total:1,complete:true,triangles:[]});
  });

  it('can pass a complete nonempty page directly into detached motion capture',()=>{
    const geometry=createOriginalSceneGeometry({nodes:[node('surface')],meshes:[mesh()]},{scale:1,cellSize:1});
    const page=geometry.fixedTrianglePage(0);
    const angular=createOriginalAngularBody({
      vertices:[{x:0,y:0,z:0},{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}],
      faces:[[0,2,1],[0,1,3],[0,3,2],[1,2,3]],
      faceNormals:[{x:-1,y:0,z:0},{x:0,y:-1,z:0},{x:0,y:0,z:-1},{x:1,y:1,z:1}],
      edgeDirections:[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}],
    },1);
    const capture=captureOriginalAngularFixedMotion({position:{x:0,y:2,z:0},velocity:{x:0,y:0,z:0},angular,
      interval:0,contactDistance:0,triangles:page.triangles,sceneRevision:()=>geometry.fixedTrianglePage(0,1).revision});
    expect(capture.revision).toBe(page.revision);
    expect(capture.triangles).toEqual(page.triangles.map(({id,triangle})=>({id,triangle})));
    expect(capture.triangles[0].triangle).not.toBe(page.triangles[0].triangle);
  });
});
