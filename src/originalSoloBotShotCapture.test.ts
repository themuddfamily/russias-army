import {describe,expect,it,vi} from 'vitest';
import {captureOriginalSoloBotShot,isOriginalSoloBotShotCapture,type OriginalSoloBotShotCaptureInput} from './originalSoloBotShotCapture';
const options={maxTextChars:1024};
function input():OriginalSoloBotShotCaptureInput{return {ownerId:'bot-1',ownerLife:2,sequence:1,capturedAt:12.5,weapon:'rifle',targetId:'player',targetLife:3,sourceShotOrigin:{x:1,y:2,z:3},aimDirection:{x:.6,y:0,z:.8},targetDistance:20,authoredDamage:12.345,chanceRoll:.4};}
describe('immutable issued authored bot shot operands',()=>{
 it.each(['pistol','shotgun','rifle','launcher','rpg','sniper'] as const)('captures %s float damage and the already drawn probability without performing gameplay',weapon=>{
  const random=vi.spyOn(Math,'random');try{const raw={...input(),weapon},capture=captureOriginalSoloBotShot(raw,options);expect(capture).toEqual({...raw,chance:.86-20*.014});expect(capture.authoredDamage).toBe(12.345);expect(capture.chanceRoll).toBe(.4);expect(isOriginalSoloBotShotCapture(capture)).toBe(true);expect(random).not.toHaveBeenCalled();}finally{random.mockRestore();}
 });
 it.each([[0,.8],[20,.86-20*.014],[100,.24],[Number.MAX_VALUE,.24]])('derives the exact chance clamp at distance %s',(targetDistance,chance)=>{
  expect(captureOriginalSoloBotShot({...input(),targetDistance},options).chance).toBe(chance);
 });
 it('preserves a genuinely coincident zero direction instead of inventing a ray',()=>{
  const capture=captureOriginalSoloBotShot({...input(),aimDirection:{x:0,y:0,z:0},targetDistance:0},options);expect(capture.aimDirection).toEqual({x:0,y:0,z:0});expect(capture.chance).toBe(.8);expect(()=>captureOriginalSoloBotShot({...input(),aimDirection:{x:0,y:0,z:0}},options)).toThrow('unit direction');
 });
 it('deeply freezes detached vectors and scalar operands',()=>{
  const raw=input(),capture=captureOriginalSoloBotShot(raw,options);expect(capture.sourceShotOrigin).not.toBe(raw.sourceShotOrigin);expect(capture.aimDirection).not.toBe(raw.aimDirection);expect(Object.isFrozen(capture)).toBe(true);expect(Object.isFrozen(capture.sourceShotOrigin)).toBe(true);expect(Object.isFrozen(capture.aimDirection)).toBe(true);
  (raw.sourceShotOrigin as {x:number}).x=99;(raw.aimDirection as {x:number}).x=0;(raw as {authoredDamage:number}).authoredDamage=1;expect(capture.sourceShotOrigin.x).toBe(1);expect(capture.aimDirection.x).toBe(.6);expect(capture.authoredDamage).toBe(12.345);
 });
 it('captures known fields and vector components once without inspecting or retaining unrelated getters',()=>{
  const seed=input();let ownerReads=0,directionReads=0,xReads=0,limitReads=0;
  const aim={get x(){xReads++;return .6;},y:0,z:.8,get unknown(){throw Error('unknown vector read');}};
  const raw={...seed,get ownerId(){ownerReads++;return seed.ownerId;},get aimDirection(){directionReads++;return aim;},get unknown(){throw Error('unknown shot read');}};
  const capture=captureOriginalSoloBotShot(raw,{get maxTextChars(){limitReads++;return 1024;}});expect([ownerReads,directionReads,xReads,limitReads]).toEqual([1,1,1,1]);expect('unknown' in capture).toBe(false);expect('unknown' in capture.aimDirection).toBe(false);
 });
 it('does not brand structural copies, arbitrary values or forged fields',()=>{
  const capture=captureOriginalSoloBotShot(input(),options);for(const value of [undefined,null,0,{},input(),{...capture},Object.freeze({...capture})])expect(isOriginalSoloBotShotCapture(value)).toBe(false);
 });
 it.each([{ownerLife:0},{ownerLife:1.5},{targetLife:-1},{sequence:0},{sequence:Number.MAX_SAFE_INTEGER+1},{capturedAt:-1},{capturedAt:Infinity},{targetDistance:-1},{targetDistance:NaN},{authoredDamage:0},{authoredDamage:-1},{authoredDamage:Infinity},{chanceRoll:-.1},{chanceRoll:1},{chanceRoll:NaN},{weapon:'unknown'},{ownerId:''},{ownerId:' bot '},{targetId:''},{targetId:' player '}])('rejects malformed known scalar or identity %s',patch=>{
  expect(()=>captureOriginalSoloBotShot({...input(),...patch} as OriginalSoloBotShotCaptureInput,options)).toThrow();
 });
 it.each([{x:2,y:0,z:0},{x:Infinity,y:0,z:0},{x:NaN,y:0,z:1},{x:1e308,y:1e308,z:1e308}])('rejects malformed direction %s',aimDirection=>{
  expect(()=>captureOriginalSoloBotShot({...input(),aimDirection},options)).toThrow();
 });
 it('rejects nonfinite origin and enforces aggregate text before vector getters',()=>{
  expect(()=>captureOriginalSoloBotShot({...input(),sourceShotOrigin:{x:0,y:Infinity,z:0}},options)).toThrow('vector');
  const raw={...input(),get sourceShotOrigin():OriginalSoloBotShotCaptureInput['sourceShotOrigin']{throw Error('vector walked before text budget');}};expect(()=>captureOriginalSoloBotShot(raw,{maxTextChars:1})).toThrow('text budget');
 });
 it.each([0,-1,1.5,65537,NaN])('rejects malformed text bound %s before reading input',maxTextChars=>{
  const raw={get ownerId(){throw Error('input walked before bounds');}} as unknown as OriginalSoloBotShotCaptureInput;expect(()=>captureOriginalSoloBotShot(raw,{maxTextChars})).toThrow('text bound');
 });
 it.each([0,1-Number.EPSILON])('retains valid probability endpoint %s exactly',chanceRoll=>{
  expect(captureOriginalSoloBotShot({...input(),chanceRoll},options).chanceRoll).toBe(chanceRoll);
 });
});
