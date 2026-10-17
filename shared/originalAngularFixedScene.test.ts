import {describe,expect,it} from 'vitest';
import {createOriginalAngularBody,originalAngularConvex} from './originalAngularBody';
import {originalConvexTrianglePatch} from './originalContactPatch';
import {planOriginalAngularFixedScene,ORIGINAL_ANGULAR_FIXED_SCENE_LIMITS,type OriginalAngularFixedSceneInput} from './originalAngularFixedScene';
import {createOriginalSceneGeometry,type OriginalFixedTrianglePage} from './originalSceneGeometry';
import type {OriginalConvexPolytope} from './originalConvexSweep';
import type {OriginalFixedMotionExclusionOracle} from './originalAngularFixedMotion';

const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const at=(x=0,y=0,z=0)=>({x,y,z});
function cube():OriginalConvexPolytope {
  return {vertices:[-1,1].flatMap(z=>[-1,1].flatMap(y=>[-1,1].map(x=>at(x,y,z)))),
    faceNormals:[at(1),at(-1),at(0,1),at(0,-1),at(0,0,1),at(0,0,-1)],edgeDirections:[at(1),at(0,1),at(0,0,1)],
    faces:[[0,2,1],[1,2,3],[4,5,6],[5,7,6],[0,4,2],[2,4,6],[1,3,5],[3,7,5],[0,1,4],[1,5,4],[2,6,3],[3,6,7]]};
}
function geometry(contactIndices:readonly number[]=[],count=34){
  return createOriginalSceneGeometry({
    nodes:Array.from({length:count},(_,index)=>({name:`surface-${index}`,resource:`resource-${index}`,parent:'World',matrix:[...I],visibility:1,shader:'default'})),
    meshes:Array.from({length:count},(_,index)=>{
      const x=contactIndices.includes(index)?0:100;
      return {resource:`resource-${index}`,part:0,positions:[[x-10,10,0],[x+10,10,0],[x,-10,0]],faces:[[0,1,2]],normals:[],tex_coords:[]};
    }),
  },{scale:1,cellSize:20});
}
function seed(scene=geometry([33])):OriginalAngularFixedSceneInput {
  return {geometry:scene,position:at(0,1),velocity:at(),angular:createOriginalAngularBody(cube(),1),interval:1,contactDistance:0,activeSceneRevision:()=>1};
}
/** Fixture proof only: exact identity orientation, zero momentum/translation and
 * all provided triangles far in X imply the same separated stationary query
 * at every source duration. No production plane oracle is installed. */
const stationaryFar:OriginalFixedMotionExclusionOracle=motion=>{
  expect(motion.position).toEqual(at(0,1));expect(motion.velocity).toEqual(at());expect(motion.angular.angularVelocity).toEqual(at());
  expect(motion.angular.orientation).toEqual({x:0,y:0,z:0,w:1});
  expect(motion.triangles.every(entry=>entry.triangle.every(point=>point.x>=90))).toBe(true);
  return {kind:'excluded',proof:'Exact stationary separated synthetic source fixture across the whole cell.'};
};
const unknown:OriginalFixedMotionExclusionOracle=()=>({kind:'unresolved'});

describe('detached complete construction-scene proposals',()=>{
  it('considers every page before selecting a real contact and retains source-order ties',()=>{
    const hit=planOriginalAngularFixedScene(seed(),stationaryFar);
    expect(hit.kind).toBe('contact');if(hit.kind!=='contact')throw Error(hit.kind);
    expect(hit.sourceIndex).toBe(33);expect(hit.model).toBe('surface-33');expect(hit.pose.fraction).toBe(0);
    expect(hit.stats.triangles).toBe(34);expect(hit.stats.pages).toBe(3);expect(hit.receipts.map(page=>page.offset)).toEqual([0,32]);
    const tie=planOriginalAngularFixedScene(seed(geometry([0,32])),stationaryFar);
    expect(tie.kind).toBe('contact');if(tie.kind!=='contact')throw Error(tie.kind);
    expect(tie.sourceIndex).toBe(0);expect(tie.contact.triangleId).toBe('fixed-triangle:0');
  });

  it('excludes the complete population only after all pages have whole-cell receipts',()=>{
    const result=planOriginalAngularFixedScene(seed(geometry()),stationaryFar);
    expect(result).toMatchObject({kind:'excluded',scope:'constructed-triangle-population-binary64-fractions'});
    expect(result.stats.triangles).toBe(34);expect(result.receipts.map(page=>page.excludedPrefixEnd)).toEqual([1,1]);
  });

  it('blocks a later source-order hit when any competing earlier prefix remains unknown',()=>{
    const result=planOriginalAngularFixedScene(seed(),unknown);
    expect(result).toMatchObject({kind:'unresolved',reason:'unresolved-earlier-competing-page'});
    expect(result.stats.triangles).toBe(34);expect(result.receipts[0].excludedPrefixEnd).toBe(0);
    expect(result.receipts[1].kind).toBe('contact');
  });

  it('permits only a rigorously covered strictly later cap region to remain unresolved',()=>{
    const partlyKnown:OriginalFixedMotionExclusionOracle=(motion,cell)=>cell.hi<=.5?stationaryFar(motion,cell):{kind:'unresolved'};
    const result=planOriginalAngularFixedScene(seed(),partlyKnown);
    expect(result.kind).toBe('contact');if(result.kind!=='contact')throw Error(result.kind);
    expect(result.sourceIndex).toBe(33);expect(result.receipts[0].kind).toBe('unresolved');
    expect(result.receipts[0].excludedPrefixEnd).toBeGreaterThanOrEqual(.5);
    expect(result.stats.cells).toBeLessThanOrEqual(ORIGINAL_ANGULAR_FIXED_SCENE_LIMITS.cells);
    expect(result.stats.evaluations).toBeLessThanOrEqual(ORIGINAL_ANGULAR_FIXED_SCENE_LIMITS.evaluations);
  });

  it('fails closed on activation changes and non-cap oracle errors even behind a known prefix',()=>{
    let epoch=1;const input={...seed(),activeSceneRevision:()=>epoch};
    const stale=planOriginalAngularFixedScene(input,()=>{epoch++;return {kind:'excluded',proof:'Not usable after activation changed.'};});
    expect(stale.kind).toBe('unresolved');
    const error=planOriginalAngularFixedScene(seed(),(motion,cell)=>{
      if(cell.hi<=.5)return stationaryFar(motion,cell);if(cell.lo>=.5)throw Error('fixture-oracle-failure');return {kind:'unresolved'};
    });
    expect(error).toMatchObject({kind:'unresolved',reason:'scene-callback-failure'});
  });

  it('freezes one incoming trajectory before the first callback and all oracle calls',()=>{
    const original=seed(),input={...original,angular:{...original.angular,referenceConvex:cube()}};let first=true;
    const mutated={...input,activeSceneRevision:()=>{if(first){first=false;input.position.y=100;input.angular.angularVelocity.z=90;}return 1;}};
    const result=planOriginalAngularFixedScene(mutated,(motion,cell)=>{
      input.position.x=999;input.angular.referenceConvex.vertices[0].x=999;
      return stationaryFar(motion,cell);
    });
    expect(result.kind).toBe('contact');if(result.kind!=='contact')throw Error(result.kind);
    expect(result.pose.position).toEqual(at(0,1));expect(result.pose.angular.angularVelocity).toEqual(at());
    expect(result.sourceIndex).toBe(33);
  });

  it('rebuilds the finite selected patch from its freshly evaluated actual rotated hull',()=>{
    const shape=cube();shape.vertices.forEach(vertex=>{vertex.x*=2;});
    const input={...seed(geometry([0],1)),angular:createOriginalAngularBody(shape,1)};
    input.angular.orientation.y=Math.SQRT1_2;input.angular.orientation.w=Math.SQRT1_2;
    const result=planOriginalAngularFixedScene(input,unknown);
    expect(result.kind).toBe('contact');if(result.kind!=='contact')throw Error(result.kind);
    const triangle=input.geometry.fixedTrianglePage(0).triangles[0].triangle;
    const expected=originalConvexTrianglePatch(originalAngularConvex(result.pose.angular),result.pose.position,triangle,result.contact.hit.normal);
    expect(result.patch).not.toBeNull();expect(result.patch).toEqual(expected);
    const stale=originalConvexTrianglePatch(input.angular.referenceConvex,result.pose.position,triangle,result.contact.hit.normal);
    expect(result.patch!.pairs).not.toEqual(stale!.pairs);
    expect(Object.isFrozen(result.patch)).toBe(true);expect(Object.isFrozen(result.patch!.pairs)).toBe(true);
    expect(Object.isFrozen(result.patch!.witnessA)).toBe(true);
  });

  it('rejects gaps, changed construction tokens and insufficient aggregate caps without population claims',()=>{
    const real=geometry();
    const corrupted={fixedTrianglePage:(offset:number,limit=32):OriginalFixedTrianglePage=>{
      const page=real.fixedTrianglePage(offset,limit);return Object.freeze({...page,offset:offset+1});
    }};
    expect(planOriginalAngularFixedScene({...seed(),geometry:corrupted},stationaryFar).kind).toBe('unresolved');
    const other=geometry();
    const swapped={fixedTrianglePage:(offset:number,limit=32)=>offset===0?real.fixedTrianglePage(offset,limit):other.fixedTrianglePage(offset,limit)};
    expect(planOriginalAngularFixedScene({...seed(),geometry:swapped},stationaryFar)).toMatchObject({kind:'unresolved',reason:'Invalid construction scene revision'});
    for(const limits of [{pages:1},{triangles:32},{cells:1},{evaluations:1}])expect(planOriginalAngularFixedScene(seed(),stationaryFar,limits).kind).toBe('unresolved');
    expect(()=>planOriginalAngularFixedScene(seed(),stationaryFar,{pages:1025})).toThrow(/only be lowered/);
    expect(()=>planOriginalAngularFixedScene(seed(),stationaryFar,{evaluations:2049})).toThrow(/only be lowered/);
  });

  it('fails unresolved on oversized model metadata without truncating construction geometry',()=>{
    const real=geometry();
    const provider={fixedTrianglePage:(offset:number,limit=32):OriginalFixedTrianglePage=>{
      const page=real.fixedTrianglePage(offset,limit);
      return Object.freeze({...page,triangles:Object.freeze(page.triangles.map(entry=>Object.freeze({...entry,model:'x'.repeat(1025)})))});
    }};
    expect(planOriginalAngularFixedScene({...seed(),geometry:provider},stationaryFar)).toMatchObject({kind:'unresolved',reason:'scene-model-metadata-cap'});
  });

  it('selects a nonzero actual source clock winner across pages after exact half-open exclusions',()=>{
    const shape=cube();shape.vertices.forEach(vertex=>{vertex.x*=2;});
    const angular=createOriginalAngularBody(shape,1);angular.angularVelocity.y=90;
    const input={...seed(),position:at(0,3),velocity:at(0,-2),angular};
    const endpoint:OriginalFixedMotionExclusionOracle=(motion,cell)=>{
      expect(motion.position).toEqual(at(0,3));expect(motion.velocity).toEqual(at(0,-2));
      expect(motion.angular.angularVelocity).toEqual(at(0,90));
      // Coarse finite quaternion component/norm bounds keep worldX far below90;
      // a rotating rectangle does not retain the unrotated89-unit margin.
      if(motion.triangles.every(entry=>entry.triangle.every(point=>point.x>=90)))return {kind:'excluded',proof:'Far fixed-X source separation under the finite principal-axis rotation/norm contracts.'};
      // T0 dispatches to stationary SAT, not the positive-skin EPS wrapper.
      // Principal-Y spin keeps quaternionX/Z and COM0, hence source vertexY
      // exactly±1 under the finite source-pose contracts. Every representable
      // f<1 gives RN(3-RN(2f))-1>=2^-52; at1 gap is0. This fixture proof does
      // not assert an arbitrary rotating-hull plane oracle or native behavior.
      return cell.hi<1||!cell.upperInclusive?{kind:'excluded',proof:'Principal-Y source vertex heights±1 and exact binary64 vertical separation for every included f<1.'}:{kind:'unresolved'};
    };
    const result=planOriginalAngularFixedScene(input,endpoint);
    expect(result.kind).toBe('contact');if(result.kind!=='contact')throw Error(result.kind);
    expect(result.stats.triangles).toBe(34);expect(result.sourceIndex).toBe(33);
    expect(result.pose.fraction).toBe(1);expect(result.pose.duration).toBe(1);expect(result.pose.position).toEqual(at(0,1));
    expect(result.receipts.map(page=>page.excludedPrefixEnd)).toEqual([1,1]);
    const triangle=input.geometry.fixedTrianglePage(32).triangles[1].triangle;
    expect(result.patch).toEqual(originalConvexTrianglePatch(originalAngularConvex(result.pose.angular),result.pose.position,triangle,result.contact.hit.normal));
    expect(result.patch).not.toBeNull();
    const stale=originalConvexTrianglePatch(input.angular.referenceConvex,result.pose.position,triangle,result.contact.hit.normal);
    expect(result.patch!.pairs).not.toEqual(stale!.pairs);
  });

  it('never mistakes oracle or active callback cap-message errors for planner cap provenance',()=>{
    const spoof:OriginalFixedMotionExclusionOracle=(motion,cell)=>{
      if(cell.hi<=.5)return stationaryFar(motion,cell);
      if(cell.lo>=.5)throw Error('cell-cap');return {kind:'unresolved'};
    };
    expect(planOriginalAngularFixedScene(seed(),spoof)).toMatchObject({kind:'unresolved',reason:'scene-callback-failure'});
    let armed=false;
    const input={...seed(),activeSceneRevision:()=>{if(armed){armed=false;throw Error('point-evaluation-cap');}return 1;}};
    const trigger:OriginalFixedMotionExclusionOracle=(motion,cell)=>{
      if(cell.hi<=.5)return stationaryFar(motion,cell);
      if(cell.lo>=.5)armed=true;return {kind:'unresolved'};
    };
    expect(planOriginalAngularFixedScene(input,trigger)).toMatchObject({kind:'unresolved',reason:'scene-callback-failure'});
  });
});
