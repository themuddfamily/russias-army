import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {transpileModule,ModuleKind,ScriptTarget} from 'typescript';
import {sweepOriginalConvexTriangle as sweep} from './originalConvexSweep';
import {originalGrenadeConvex} from './originalGrenadeShape';
import {originalGrenadeBasisFromDirection} from './originalGrenadeOrientation';
import {originalRpgConvex,originalRpgBasisFromDirection} from './originalRpgShape';
import {createOriginalBarrelConvex} from './originalBarrelShape';
import {ORIGINAL_MAP_SCALE as S} from './originalMapProfile';
const at=(x=0,y=0,z=0)=>({x,y,z});
it('rejects excluded time intervals without changing any recovered hull contact',()=>{
 const source=readFileSync(new URL('./originalConvexSweep.ts',import.meta.url),'utf8'),guard='if(axisEnter>1||axisExit<0)return null;';
 expect(source).toContain(guard);
 const exports:{sweepOriginalConvexTriangle?:typeof sweep}={};
 const compiled=transpileModule(source.replace(guard,''),{compilerOptions:{target:ScriptTarget.ES2022,module:ModuleKind.CommonJS}}).outputText;
 new Function('exports',compiled)(exports);const reference=exports.sweepOriginalConvexTriangle!;
 const data=JSON.parse(readFileSync(new URL('../public/assets/original-scenes/barrack/scene.json',import.meta.url),'utf8'));
 const barrel=createOriginalBarrelConvex(data.meshes.find((m:any)=>m.resource==='barrel').positions.map((p:number[])=>at(p[0]*S,p[2]*S,-p[1]*S)));
 const floor=Object.freeze([Object.freeze(at(-2,0,-2)),Object.freeze(at(2,0,-2)),Object.freeze(at(0,0,2))]) as readonly [ReturnType<typeof at>,ReturnType<typeof at>,ReturnType<typeof at>];
 for(const shape of [barrel,originalGrenadeConvex(originalGrenadeBasisFromDirection(at(.2,-1,.1))),originalRpgConvex(originalRpgBasisFromDirection(at(.1,.3,-1)))])
  for(const x of [-3,-2,-1,0,1,2,3])for(const y of [-.1,0,.02,.2,2])for(const speed of [-.4,0,.4]){
   const from=at(x,y,.3),to=at(x+.07,y+speed,.27);
   expect(sweep(shape,from,to,floor)).toEqual(reference(shape,from,to,floor));
  }
});
