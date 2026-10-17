import type {Vec3} from './protocol';
import {ORIGINAL_MAP_SCALE} from './originalMapProfile';

/** Staged convex foundation; not installed in production collision or rendering.
 * All 72 unique recovered support points retain the authored resource pivot.
 * Native Havok hull margins/inertia and template clone parenting are unproved.
 */
export const ORIGINAL_RPG_GEOMETRY_SHA256='7fb016ef55d032bf329dbfe99cf5904e44f297a57da9d2babff11c6f4f8f9c2b';
export const ORIGINAL_RPG_SOURCE_POINTS:ReadonlyArray<Readonly<Vec3>>=Object.freeze([
  Object.freeze({x:-42.994606018066406,y:-0.8657363653182983,z:6.756399154663086}),
  Object.freeze({x:-42.994606018066406,y:-0.8579415678977966,z:7.47039794921875}),
  Object.freeze({x:-42.994606018066406,y:-0.36635297536849976,z:6.246103286743164}),
  Object.freeze({x:-42.994606018066406,y:-0.34755897521972656,z:7.9696946144104}),
  Object.freeze({x:-42.994606018066406,y:0.3475590944290161,z:6.238308429718018}),
  Object.freeze({x:-42.994606018066406,y:0.36643972992897034,z:7.961899757385254}),
  Object.freeze({x:-42.994606018066406,y:0.8579416871070862,z:6.737605094909668}),
  Object.freeze({x:-42.994606018066406,y:0.8657364845275879,z:7.451603889465332}),
  Object.freeze({x:-41.6729621887207,y:-0.8657363057136536,z:6.756399154663086}),
  Object.freeze({x:-41.6729621887207,y:-0.8579415678977966,z:7.47039794921875}),
  Object.freeze({x:-41.6729621887207,y:-0.36635297536849976,z:6.246103286743164}),
  Object.freeze({x:-41.6729621887207,y:-0.34755897521972656,z:7.9696946144104}),
  Object.freeze({x:-41.6729621887207,y:0.3475590944290161,z:6.238308429718018}),
  Object.freeze({x:-41.6729621887207,y:0.36643972992897034,z:7.961899757385254}),
  Object.freeze({x:-41.6729621887207,y:0.8579416871070862,z:6.737605094909668}),
  Object.freeze({x:-41.6729621887207,y:0.8657364845275879,z:7.451603889465332}),
  Object.freeze({x:-30.906513214111328,y:-2.517962694168091,z:6.093066215515137}),
  Object.freeze({x:-30.906513214111328,y:-2.4952712059020996,z:8.169672966003418}),
  Object.freeze({x:-30.906513214111328,y:-1.0656282901763916,z:4.608687400817871}),
  Object.freeze({x:-30.906513214111328,y:-1.0108915567398071,z:9.62192153930664}),
  Object.freeze({x:-30.906513214111328,y:1.0108920335769653,z:4.586082458496094}),
  Object.freeze({x:-30.906513214111328,y:1.0656286478042603,z:9.599316596984863}),
  Object.freeze({x:-30.906513214111328,y:2.4952714443206787,z:6.038330078125}),
  Object.freeze({x:-30.906513214111328,y:2.51796293258667,z:8.114936828613281}),
  Object.freeze({x:-24.555267333984375,y:-2.5179624557495117,z:6.093066215515137}),
  Object.freeze({x:-24.555267333984375,y:-2.4952712059020996,z:8.169672966003418}),
  Object.freeze({x:-24.555267333984375,y:-1.065628170967102,z:4.608686923980713}),
  Object.freeze({x:-24.555267333984375,y:-1.0108916759490967,z:9.621920585632324}),
  Object.freeze({x:-24.555267333984375,y:1.0108920335769653,z:4.586082458496094}),
  Object.freeze({x:-24.555267333984375,y:1.0656286478042603,z:9.599316596984863}),
  Object.freeze({x:-24.555267333984375,y:2.4952714443206787,z:6.038330078125}),
  Object.freeze({x:-24.555267333984375,y:2.51796293258667,z:8.114936828613281}),
  Object.freeze({x:-21.115793228149414,y:-1.6538715362548828,z:6.440018653869629}),
  Object.freeze({x:-21.115793228149414,y:-1.638974905014038,z:7.80392599105835}),
  Object.freeze({x:-21.115793228149414,y:-0.6999678611755371,z:5.464982509613037}),
  Object.freeze({x:-21.115793228149414,y:-0.6640255451202393,z:8.757916450500488}),
  Object.freeze({x:-21.115793228149414,y:0.6640260219573975,z:5.4500861167907715}),
  Object.freeze({x:-21.115793228149414,y:0.6999683380126953,z:8.743020057678223}),
  Object.freeze({x:-21.115793228149414,y:1.6389755010604858,z:6.40407657623291}),
  Object.freeze({x:-21.115793228149414,y:1.6538721323013306,z:7.767983913421631}),
  Object.freeze({x:-16.51091766357422,y:-1.6538716554641724,z:6.440019130706787}),
  Object.freeze({x:-16.51091766357422,y:-1.6389750242233276,z:7.80392599105835}),
  Object.freeze({x:-16.51091766357422,y:-0.6999680995941162,z:5.4649834632873535}),
  Object.freeze({x:-16.51091766357422,y:-0.6640256643295288,z:8.757916450500488}),
  Object.freeze({x:-16.51091766357422,y:0.6640257835388184,z:5.450087070465088}),
  Object.freeze({x:-16.51091766357422,y:0.6999682188034058,z:8.743020057678223}),
  Object.freeze({x:-16.51091766357422,y:1.6389752626419067,z:6.40407657623291}),
  Object.freeze({x:-16.51091766357422,y:1.6538718938827515,z:7.767983913421631}),
  Object.freeze({x:-14.492424011230469,y:-2.252941131591797,z:6.199507713317871}),
  Object.freeze({x:-14.492424011230469,y:-2.2326748371124268,z:8.057515144348145}),
  Object.freeze({x:-14.492424011230469,y:-1.185927152633667,z:6.627872467041016}),
  Object.freeze({x:-14.492424011230469,y:-1.17527437210083,z:7.605939865112305}),
  Object.freeze({x:-14.492424011230469,y:-0.9534705281257629,z:4.871283531188965}),
  Object.freeze({x:-14.492424011230469,y:-0.9045369029045105,z:9.356986045837402}),
  Object.freeze({x:-14.492424011230469,y:-0.5018949508666992,z:5.928770542144775}),
  Object.freeze({x:-14.492424011230469,y:-0.47608572244644165,z:8.289885520935059}),
  Object.freeze({x:-14.492424011230469,y:0.47608575224876404,z:5.918117523193359}),
  Object.freeze({x:-14.492424011230469,y:0.501895010471344,z:8.2792329788208}),
  Object.freeze({x:-14.492424011230469,y:0.9045369625091553,z:4.851016998291016}),
  Object.freeze({x:-14.492424011230469,y:0.9534707069396973,z:9.336719512939453}),
  Object.freeze({x:-14.492424011230469,y:1.1752744913101196,z:6.602063179016113}),
  Object.freeze({x:-14.492424011230469,y:1.1859272718429565,z:7.580130577087402}),
  Object.freeze({x:-14.492424011230469,y:2.2326748371124268,z:6.150487422943115}),
  Object.freeze({x:-14.492424011230469,y:2.252941370010376,z:8.008495330810547}),
  Object.freeze({x:2.3411083221435547,y:-1.1859272718429565,z:6.627872943878174}),
  Object.freeze({x:2.3411083221435547,y:-1.17527437210083,z:7.605940341949463}),
  Object.freeze({x:2.3411083221435547,y:-0.501895010471344,z:5.928771018981934}),
  Object.freeze({x:2.3411083221435547,y:-0.47608572244644165,z:8.289885520935059}),
  Object.freeze({x:2.3411083221435547,y:0.47608572244644165,z:5.918118000030518}),
  Object.freeze({x:2.3411083221435547,y:0.501895010471344,z:8.2792329788208}),
  Object.freeze({x:2.3411083221435547,y:1.17527437210083,z:6.6020636558532715}),
  Object.freeze({x:2.3411083221435547,y:1.1859272718429565,z:7.5801310539245605}),
]);

/** Columns mapping raw resource coordinates to copy world axes; no unit scale. */
export interface OriginalRpgBasis {readonly x:Readonly<Vec3>;readonly y:Readonly<Vec3>;readonly z:Readonly<Vec3>}
export interface OriginalRpgPose {readonly pivot:Readonly<Vec3>;readonly basis:OriginalRpgBasis}
const finite=(v:Readonly<Vec3>)=>[v.x,v.y,v.z].every(Number.isFinite);
const dot=(a:Readonly<Vec3>,b:Readonly<Vec3>)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a:Readonly<Vec3>,b:Readonly<Vec3>):Vec3=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
function requireBasis(basis:OriginalRpgBasis):void {
  if(!finite(basis.x)||!finite(basis.y)||!finite(basis.z)
    ||Math.abs(dot(basis.x,basis.x)-1)>1e-8||Math.abs(dot(basis.y,basis.y)-1)>1e-8||Math.abs(dot(basis.z,basis.z)-1)>1e-8
    ||Math.abs(dot(basis.x,basis.y))>1e-8||Math.abs(dot(basis.x,basis.z))>1e-8||Math.abs(dot(basis.y,basis.z))>1e-8
    ||Math.abs(dot(cross(basis.x,basis.y),basis.z)-1)>1e-8)throw Error('Invalid original RPG rigid orientation');
}
/** Source degrees: Rz*Ry*Rx, self Z -90, then source Z-up -> copy Y-up.
 * Corroborated by recovered cosine3D and inspected dirplayer transform3d.rs;
 * the replacement player's Euler convention does not prove native Director.
 * API takes full source rotation so roll is never silently inferred from aim.
 */
export function originalRpgBasisFromSourceRotation(rotationDegrees:Readonly<Vec3>):OriginalRpgBasis {
  if(!finite(rotationDegrees))throw Error('Invalid original RPG source rotation');
  const rx=(rotationDegrees.x%360)*Math.PI/180,ry=(rotationDegrees.y%360)*Math.PI/180,rz=(rotationDegrees.z%360)*Math.PI/180;
  const sx=Math.sin(rx),cx=Math.cos(rx),sy=Math.sin(ry),cy=Math.cos(ry),sz=Math.sin(rz),cz=Math.cos(rz);
  // Source rotation columns before the recovered self-axis operation.
  const a={x:cy*cz,y:cy*sz,z:-sy};
  const b={x:sx*sy*cz-cx*sz,y:sx*sy*sz+cx*cz,z:sx*cy};
  const c={x:cx*sy*cz+sx*sz,y:cx*sy*sz-sx*cz,z:cx*cy};
  const convert=(v:Vec3):Vec3=>({x:v.x,y:v.z,z:-v.y});
  return {x:convert({x:-b.x,y:-b.y,z:-b.z}),y:convert(a),z:convert(c)};
}
/** Explicit zero-source-Y-rotation adapter. A direction cannot recover roll.
 * Vertical directions additionally cannot recover yaw; use the full source
 * rotation API when that heading or a native body orientation is available.
 */
export function originalRpgBasisFromDirection(direction:Readonly<Vec3>):OriginalRpgBasis {
  if(!finite(direction))throw Error('Invalid original RPG flight direction');
  const length=Math.hypot(direction.x,direction.y,direction.z);if(length===0||!Number.isFinite(length))throw Error('Invalid original RPG flight direction');
  return originalRpgBasisFromSourceRotation({x:Math.asin(Math.max(-1,Math.min(1,direction.y/length)))*180/Math.PI,y:0,z:Math.atan2(-direction.x,-direction.z)*180/Math.PI});
}
function transformed(point:Readonly<Vec3>,pose:OriginalRpgPose):Vec3 {
  const {x,y,z}=pose.basis,s=ORIGINAL_MAP_SCALE;
  return {x:pose.pivot.x+s*(point.x*x.x+point.y*y.x+point.z*z.x),y:pose.pivot.y+s*(point.x*x.y+point.y*y.y+point.z*z.y),z:pose.pivot.z+s*(point.x*x.z+point.y*y.z+point.z*z.z)};
}
function requirePose(pose:OriginalRpgPose):void {if(!finite(pose.pivot))throw Error('Invalid original RPG pivot');requireBasis(pose.basis);}
export function originalRpgWorldVertices(pose:OriginalRpgPose):Vec3[] {requirePose(pose);return ORIGINAL_RPG_SOURCE_POINTS.map(point=>transformed(point,pose));}
/** Exact convex support over all recovered points; deterministic index ties. */
export function originalRpgSupport(pose:OriginalRpgPose,direction:Readonly<Vec3>):{point:Vec3;sourceIndex:number} {
  requirePose(pose);const length=Math.hypot(direction.x,direction.y,direction.z);if(!finite(direction)||length===0||!Number.isFinite(length))throw Error('Invalid original RPG support direction');
  const unit={x:direction.x/length,y:direction.y/length,z:direction.z/length};
  const local={x:dot(pose.basis.x,unit),y:dot(pose.basis.y,unit),z:dot(pose.basis.z,unit)};
  let sourceIndex=0,projection=-Infinity;
  ORIGINAL_RPG_SOURCE_POINTS.forEach((point,index)=>{const candidate=dot(point,local);if(candidate>projection){projection=candidate;sourceIndex=index;}});
  return {point:transformed(ORIGINAL_RPG_SOURCE_POINTS[sourceIndex],pose),sourceIndex};
}
export function originalRpgWorldBounds(pose:OriginalRpgPose):{min:Vec3;max:Vec3} {
  const points=originalRpgWorldVertices(pose),min={x:Infinity,y:Infinity,z:Infinity},max={x:-Infinity,y:-Infinity,z:-Infinity};
  for(const point of points)for(const axis of ['x','y','z'] as const){min[axis]=Math.min(min[axis],point[axis]);max[axis]=Math.max(max[axis],point[axis]);}
  return {min,max};
}
/** Broad-phase bound around the ORIGINAL pivot, never a narrow-phase sphere. */
export const ORIGINAL_RPG_PIVOT_BOUND=Math.max(...ORIGINAL_RPG_SOURCE_POINTS.map(point=>Math.hypot(point.x,point.y,point.z)))*ORIGINAL_MAP_SCALE;

/** Offline SciPy hull triangulation; all72 support points remain authoritative.
 * Coplanar triangulation diagonals give redundant valid SAT axes.
 */
export const ORIGINAL_RPG_SOURCE_FACE_NORMALS:ReadonlyArray<Readonly<Vec3>>=Object.freeze([
  Object.freeze({x:0.0,y:0.010885098178358638,z:0.9999407555638722}),
  Object.freeze({x:0.0,y:0.010885327770351312,z:0.9999407530645663}),
  Object.freeze({x:0.0,y:0.6993279459922385,z:-0.7148009680703271}),
  Object.freeze({x:0.0,y:0.6993279459922385,z:-0.7148009680703271}),
  Object.freeze({x:-0.0,y:0.6993281232454097,z:-0.7148007946540443}),
  Object.freeze({x:0.0,y:0.714780190837333,z:0.69934918230205}),
  Object.freeze({x:0.0,y:0.714780190837333,z:0.69934918230205}),
  Object.freeze({x:0.0,y:0.9999403035434588,z:-0.010926543342504718}),
  Object.freeze({x:-0.0,y:0.9999403035434588,z:-0.010926543342504718}),
  Object.freeze({x:-0.0,y:0.9999403035434588,z:-0.010926543342504718}),
  Object.freeze({x:2.6832034833958235e-08,y:-0.7147800785357641,z:-0.6993492970815129}),
  Object.freeze({x:3.7536626853361316e-08,y:-0.9999403047977958,z:0.010926428551447709}),
  Object.freeze({x:3.908955758824024e-08,y:0.7147799375392672,z:0.6993494411889951}),
  Object.freeze({x:7.486897593405606e-08,y:0.010885327145518276,z:0.9999407530713654}),
  Object.freeze({x:9.420529113085e-08,y:-0.699327917296569,z:0.7148009961448253}),
  Object.freeze({x:1.5035087828414192e-07,y:0.010884867961557465,z:0.9999407580699153}),
  Object.freeze({x:0.026201519323130775,y:-0.6990878249162503,z:0.7145555915665526}),
  Object.freeze({x:0.026201539577834988,y:0.6990878532308012,z:-0.7145555631222116}),
  Object.freeze({x:0.026202395271940654,y:-0.010881360870237194,z:-0.9995974342042024}),
  Object.freeze({x:0.02620239809056478,y:0.010881130731674996,z:0.9995974366355207}),
  Object.freeze({x:0.02620667735842509,y:-0.010903275294928325,z:-0.9995970831538448}),
  Object.freeze({x:0.026206725007828332,y:0.010903274581835569,z:0.9995970819123859}),
  Object.freeze({x:0.026206864446297152,y:-0.9995968664465967,z:0.010922675772818625}),
  Object.freeze({x:0.02620688884162653,y:0.9995968645531829,z:-0.010922790517461605}),
  Object.freeze({x:0.02620771859140995,y:0.6991103462469036,z:-0.7145333297032183}),
  Object.freeze({x:0.0262077205732408,y:-0.7145345649462299,z:-0.69910908367683}),
  Object.freeze({x:0.02620773762062749,y:-0.6991104609350832,z:0.7145332167925742}),
  Object.freeze({x:0.026207773083914906,y:0.7145346762252163,z:0.6991089679740258}),
  Object.freeze({x:0.026210680170955646,y:-0.9995969796107236,z:0.010903146247508079}),
  Object.freeze({x:0.026210702475978263,y:0.9995969776575176,z:-0.010903271695780169}),
  Object.freeze({x:0.026213706399365756,y:-0.7145558782993028,z:-0.6990870749661446}),
  Object.freeze({x:0.026213723068998017,y:0.714555861957681,z:0.6990870910442972}),
  Object.freeze({x:0.0629787080353883,y:-0.9979555069464868,z:0.010885241815137314}),
  Object.freeze({x:0.06297871221786318,y:0.997955505316409,z:-0.010885367060896059}),
  Object.freeze({x:0.0629791182072229,y:-0.6979623555764285,z:0.7133597836071529}),
  Object.freeze({x:0.06297913940916684,y:0.7133825026216635,z:0.697939132698929}),
  Object.freeze({x:0.06297916932482084,y:-0.7133825172750982,z:-0.6979391150217904}),
  Object.freeze({x:0.06297917440487391,y:0.6979622382481513,z:-0.7133598934415303}),
  Object.freeze({x:0.06298002741784572,y:-0.99795559506988,z:0.0108695177063848}),
  Object.freeze({x:0.06298004210948994,y:0.9979555941428141,z:-0.010869517696287398}),
  Object.freeze({x:0.06298309058105005,y:0.7133493940655917,z:0.6979726157143363}),
  Object.freeze({x:0.06298312241912378,y:-0.7133493926294432,z:-0.6979726143091449}),
  Object.freeze({x:0.06298379417961339,y:0.010885365308758022,z:0.9979551846114308}),
  Object.freeze({x:0.06298385039574741,y:-0.010885365968381822,z:-0.997955181056274}),
  Object.freeze({x:0.06298507401985999,y:0.01087011245210569,z:0.9979552700927989}),
  Object.freeze({x:0.06298508946961091,y:-0.010870598959965394,z:-0.9979552638183521}),
  Object.freeze({x:0.0629884149873501,y:-0.6978827431844324,z:0.7134368481812198}),
  Object.freeze({x:0.06298842852425494,y:0.6978829912256366,z:-0.713436604352484}),
  Object.freeze({x:0.13483123876576156,y:0.9908094257412616,z:-0.010826768454236614}),
  Object.freeze({x:0.13483124835920576,y:-0.9908094244359231,z:0.010826768439972925}),
  Object.freeze({x:0.13483126781624724,y:-0.6929420839961034,z:0.7082738153046466}),
  Object.freeze({x:0.13483127470455328,y:0.6929422589752072,z:-0.7082736428019062}),
  Object.freeze({x:0.1348318180998003,y:0.7082529232900948,z:0.6929633305442198}),
  Object.freeze({x:0.1348318448181702,y:-0.7082531716764519,z:-0.6929630714786866}),
  Object.freeze({x:0.13483237219468377,y:0.9908093807417718,z:-0.010816766728606505}),
  Object.freeze({x:0.13483238178812457,y:-0.9908093794364226,z:0.010816766714355875}),
  Object.freeze({x:0.13483380022620942,y:-0.7082409149378912,z:-0.6929752179728346}),
  Object.freeze({x:0.1348340500952752,y:0.010785924455568793,z:0.9908094886346939}),
  Object.freeze({x:0.13483412712181386,y:-0.01078592496060118,z:-0.9908094781470567}),
  Object.freeze({x:0.1348355252499762,y:-0.69291482467429,z:0.7082996730743006}),
  Object.freeze({x:0.13483555998713803,y:0.6929148213687153,z:-0.708299669695332}),
  Object.freeze({x:0.13483763192773773,y:-0.010816842972561557,z:-0.9908086641346184}),
  Object.freeze({x:0.13483770372538292,y:0.01081815536547143,z:0.9908086400352767}),
  Object.freeze({x:0.13484347166401778,y:0.7081798703062393,z:0.6930357201779958}),
  Object.freeze({x:1.0,y:-0.0,z:0.0}),
  Object.freeze({x:1.0,y:-0.0,z:0.0}),
  Object.freeze({x:1.0,y:-0.0,z:0.0}),
  Object.freeze({x:1.0,y:-0.0,z:0.0}),
  Object.freeze({x:1.0,y:-0.0,z:0.0}),
  Object.freeze({x:1.0,y:-0.0,z:0.0}),
  Object.freeze({x:1.0,y:-0.0,z:-0.0}),
  Object.freeze({x:1.0,y:-0.0,z:-0.0}),
  Object.freeze({x:1.0,y:-0.0,z:-0.0}),
  Object.freeze({x:1.0,y:-0.0,z:-0.0}),
  Object.freeze({x:1.0,y:-0.0,z:-0.0}),
  Object.freeze({x:1.0,y:-0.0,z:-0.0}),
]);
export const ORIGINAL_RPG_SOURCE_EDGE_DIRECTIONS:ReadonlyArray<Readonly<Vec3>>=Object.freeze([
  Object.freeze({x:0.0,y:0.010891138931105682,z:0.999940689787541}),
  Object.freeze({x:0.0,y:0.010891138931105682,z:0.999940689787541}),
  Object.freeze({x:0.0,y:0.010906893407742788,z:0.999940518069046}),
  Object.freeze({x:0.0,y:0.010907018905509512,z:0.9999405167001659}),
  Object.freeze({x:0.0,y:0.010916451144396613,z:0.9999404137719466}),
  Object.freeze({x:0.0,y:0.010916451144396613,z:0.9999404137719466}),
  Object.freeze({x:0.0,y:0.010926428551447714,z:0.9999403047977964}),
  Object.freeze({x:0.0,y:0.010926543342504718,z:0.9999403035434588}),
  Object.freeze({x:0.0,y:0.010926543342504718,z:0.9999403035434588}),
  Object.freeze({x:0.0,y:0.010926543342504718,z:0.9999403035434588}),
  Object.freeze({x:0.0,y:0.010953584242439153,z:0.9999400076965836}),
  Object.freeze({x:0.0,y:0.3725749055180794,z:-0.9280021227228924}),
  Object.freeze({x:0.0,y:0.39276226700658984,z:0.9196400391543663}),
  Object.freeze({x:0.0,y:0.3927738157942161,z:0.9196351067822777}),
  Object.freeze({x:0.0,y:0.6993273906034844,z:-0.7148015114363718}),
  Object.freeze({x:0.0,y:0.6993274069929614,z:-0.7148014954016961}),
  Object.freeze({x:0.0,y:0.6993491823020499,z:-0.7147801908373329}),
  Object.freeze({x:0.0,y:0.6993491823020499,z:-0.7147801908373329}),
  Object.freeze({x:0.0,y:0.6993492970815133,z:-0.7147800785357643}),
  Object.freeze({x:0.0,y:0.6993494411889957,z:-0.7147799375392678}),
  Object.freeze({x:0.0,y:0.6993521660371871,z:-0.714777271504274}),
  Object.freeze({x:0.0,y:0.6993611313381312,z:-0.7147684995671321}),
  Object.freeze({x:0.0,y:0.6993611313381312,z:-0.7147684995671321}),
  Object.freeze({x:0.0,y:0.6993616285372729,z:-0.7147680130851501}),
  Object.freeze({x:0.0,y:0.6994236173231696,z:-0.7147073551675346}),
  Object.freeze({x:0.0,y:0.7147787302384474,z:0.6993506751256574}),
  Object.freeze({x:0.0,y:0.7147788428311734,z:0.6993505600490564}),
  Object.freeze({x:0.0,y:0.7147854307075505,z:0.6993438267749431}),
  Object.freeze({x:0.0,y:0.7148007946540442,z:0.6993281232454096}),
  Object.freeze({x:0.0,y:0.714800968070327,z:0.6993279459922384}),
  Object.freeze({x:0.0,y:0.714800968070327,z:0.6993279459922384}),
  Object.freeze({x:0.0,y:0.7148009961448284,z:0.699327917296572}),
  Object.freeze({x:0.0,y:0.7148274820749466,z:0.6993008443226647}),
  Object.freeze({x:0.0,y:0.7148274820749466,z:0.6993008443226647}),
  Object.freeze({x:0.0,y:0.7148561246484666,z:0.6992715645960272}),
  Object.freeze({x:0.0,y:0.7148563683503836,z:0.6992713154626755}),
  Object.freeze({x:0.0,y:0.9196525059403043,z:-0.39273307515120026}),
  Object.freeze({x:0.0,y:0.9196637651215724,z:-0.39270670878202896}),
  Object.freeze({x:0.0,y:0.9280015301602984,z:0.37257638145774175}),
  Object.freeze({x:0.0,y:0.9999402666344477,z:-0.0109299205408653}),
  Object.freeze({x:0.0,y:0.9999403983840834,z:-0.010917860572496892}),
  Object.freeze({x:0.0,y:0.9999404128458245,z:-0.010916535976316505}),
  Object.freeze({x:0.0,y:0.9999405166734533,z:-0.010907021354488627}),
  Object.freeze({x:0.0,y:0.9999405166810855,z:-0.010907020654780197}),
  Object.freeze({x:0.0,y:0.9999406779487687,z:-0.010892225821973845}),
  Object.freeze({x:0.0,y:0.9999406832587768,z:-0.010891738335574459}),
  Object.freeze({x:0.0,y:0.9999407530645662,z:-0.01088532777035131}),
  Object.freeze({x:0.0,y:0.9999407530713682,z:-0.010885327145518306}),
  Object.freeze({x:0.0,y:0.9999407555638722,z:-0.010885098178358638}),
  Object.freeze({x:0.0,y:0.9999407580699264,z:-0.010884867961557586}),
  Object.freeze({x:0.9504793286266033,y:-0.0033958361776046785,z:-0.3107692297351462}),
  Object.freeze({x:0.9504793286266033,y:0.0033958361776046785,z:0.3107692297351462}),
  Object.freeze({x:0.9504809499211032,y:-0.21734571399956223,z:0.22214140641289215}),
  Object.freeze({x:0.9504809576172499,y:0.21734575143941287,z:-0.22214133685163714}),
  Object.freeze({x:0.9504831959971354,y:0.31075754234981984,z:-0.003382898131933819}),
  Object.freeze({x:0.9504831962265835,y:-0.3107575424248372,z:0.0033828267726244646}),
  Object.freeze({x:0.9504836034505695,y:-0.22214200874179763,z:-0.21733349379186756}),
  Object.freeze({x:0.950483640466146,y:0.22214198171280303,z:0.21733335953537142}),
  Object.freeze({x:0.9810931121033568,y:-0.02781462221537063,z:-0.19152715779848645}),
  Object.freeze({x:0.9810931221077582,y:0.027814576008994885,z:0.19152711326151994}),
  Object.freeze({x:0.9810934007998442,y:-0.15253273343868826,z:0.11911970507316634}),
  Object.freeze({x:0.9810934051480804,y:0.1525327050584553,z:-0.11911970560110854}),
  Object.freeze({x:0.9810939251877973,y:-0.19208462175337368,z:-0.023626426845044006}),
  Object.freeze({x:0.981093933931465,y:0.19208458278647314,z:0.0236263805655611}),
  Object.freeze({x:0.981094521355486,y:-0.155091442346877,z:-0.11575916670836538}),
  Object.freeze({x:0.9810945240081984,y:0.1550914253324403,z:0.11575916702135844}),
  Object.freeze({x:0.9844495624023837,y:0.11508944873613484,z:0.13271577854711983}),
  Object.freeze({x:0.9844495747496202,y:-0.11508943076290198,z:-0.13271570254481227}),
  Object.freeze({x:0.9844497381177327,y:0.13519150678985156,z:0.11216937911844341}),
  Object.freeze({x:0.9844497394098108,y:-0.13519149725892896,z:-0.11216937926566435}),
  Object.freeze({x:0.9844500204735849,y:0.01627914737433551,z:0.1749089664663397}),
  Object.freeze({x:0.984450034158151,y:-0.016279128183902033,z:-0.1749088912307991}),
  Object.freeze({x:0.9844506058020288,y:-0.012456200627750437,z:0.17521942758136116}),
  Object.freeze({x:0.9844506188420287,y:0.012456229917850222,z:-0.1752193522353642}),
  Object.freeze({x:0.9893258700299878,y:-0.05723079483526624,z:-0.13401104063446134}),
  Object.freeze({x:0.9893262600158533,y:0.057223746407685405,z:0.13401117151235264}),
  Object.freeze({x:0.9893267077365802,y:-0.05428917941422075,z:0.13522333510762857}),
  Object.freeze({x:0.9893267113854055,y:0.13522329658053772,z:0.05428920888381481}),
  Object.freeze({x:0.9893267126906243,y:-0.13522328700248273,z:-0.05428920895543857}),
  Object.freeze({x:0.9893267166062798,y:0.05428920917030979,z:-0.1352232582683175}),
  Object.freeze({x:0.989326805952682,y:0.13400411837220566,z:-0.05723082458563945}),
  Object.freeze({x:0.9893268072461331,y:-0.13400410879094735,z:0.057230824660463336}),
  Object.freeze({x:0.9945057428228988,y:-0.013733277247243297,z:0.10377728358520784}),
  Object.freeze({x:0.994505748782073,y:0.013733266765412632,z:-0.10377722786506845}),
  Object.freeze({x:0.994505808563985,y:-0.0830903899893994,z:0.06367247304686614}),
  Object.freeze({x:0.9945058124226919,y:0.083090386790418,z:-0.06367241695193043}),
  Object.freeze({x:0.9945060541153062,y:0.015994859996235202,z:0.10344985636386589}),
  Object.freeze({x:0.9945060598558401,y:-0.015994863609936502,z:-0.10344980061900345}),
  Object.freeze({x:0.9945061317967987,y:0.0636673384481828,z:0.08309045573044375}),
  Object.freeze({x:0.994506135560701,y:-0.06366735277464546,z:-0.08309039970291102}),
  Object.freeze({x:0.9976749911245564,y:-0.02539307132106813,z:0.0632440037750577}),
  Object.freeze({x:0.9976749929972193,y:0.025393067836135933,z:-0.063243975633003}),
  Object.freeze({x:0.9976751221515923,y:0.026763584185081134,z:0.06267424671564262}),
  Object.freeze({x:0.9976751254028244,y:-0.026763594870086966,z:-0.06267419039834764}),
  Object.freeze({x:0.9976754435031541,y:-0.06266910931102473,z:0.026763635196809736}),
  Object.freeze({x:0.9976754457669593,y:0.06266910945322596,z:-0.026763550475203825}),
  Object.freeze({x:0.9976754461137559,y:0.06323886796022897,z:0.02538798536368821}),
  Object.freeze({x:0.9976754466538744,y:-0.06323888212485416,z:-0.025387928855876138}),
  Object.freeze({x:0.999597490021347,y:-0.026326047246882835,z:-0.01057341852845303}),
  Object.freeze({x:0.9995974906445869,y:0.026326023579870066,z:0.010573418535045459}),
  Object.freeze({x:0.9995976359471328,y:-0.011141265837599614,z:-0.02608521428778107}),
  Object.freeze({x:0.9995976375119052,y:0.011141236250752307,z:0.026085166961754332}),
  Object.freeze({x:0.9995976378416005,y:-0.02608516697035795,z:0.01114120665013912}),
  Object.freeze({x:0.999597637931625,y:0.026085143289276896,z:-0.011141254018003116}),
  Object.freeze({x:0.9995978081687522,y:-0.010564836648765416,z:0.02631741117228538}),
  Object.freeze({x:0.9995978084813907,y:0.010564807047776785,z:-0.026317411180516524}),
  Object.freeze({x:0.9999999999999886,y:-1.8769433871830677e-08,z:-1.5015547097464542e-07}),
  Object.freeze({x:0.9999999999999971,y:1.876943387183084e-08,z:-7.507773548732336e-08}),
  Object.freeze({x:0.9999999999999993,y:3.753886774366176e-08,z:0.0}),
  Object.freeze({x:1.0,y:0.0,z:0.0}),
  Object.freeze({x:1.0,y:0.0,z:0.0}),
  Object.freeze({x:1.0,y:0.0,z:0.0}),
  Object.freeze({x:1.0,y:0.0,z:0.0}),
  Object.freeze({x:1.0,y:0.0,z:0.0}),
]);

export const ORIGINAL_RPG_SOURCE_FACES:ReadonlyArray<readonly [number,number,number]>=Object.freeze([
  Object.freeze([0,1,4] as const),
  Object.freeze([0,2,18] as const),
  Object.freeze([0,4,2] as const),
  Object.freeze([0,16,1] as const),
  Object.freeze([0,18,16] as const),
  Object.freeze([1,3,4] as const),
  Object.freeze([1,16,17] as const),
  Object.freeze([1,17,19] as const),
  Object.freeze([1,19,3] as const),
  Object.freeze([2,4,18] as const),
  Object.freeze([3,5,4] as const),
  Object.freeze([3,19,21] as const),
  Object.freeze([3,21,5] as const),
  Object.freeze([4,5,7] as const),
  Object.freeze([4,6,20] as const),
  Object.freeze([4,7,6] as const),
  Object.freeze([4,20,18] as const),
  Object.freeze([5,21,7] as const),
  Object.freeze([6,7,23] as const),
  Object.freeze([6,22,20] as const),
  Object.freeze([6,23,22] as const),
  Object.freeze([7,21,23] as const),
  Object.freeze([16,18,26] as const),
  Object.freeze([16,24,25] as const),
  Object.freeze([16,25,17] as const),
  Object.freeze([16,26,24] as const),
  Object.freeze([17,25,19] as const),
  Object.freeze([18,20,26] as const),
  Object.freeze([19,25,27] as const),
  Object.freeze([19,27,29] as const),
  Object.freeze([19,29,21] as const),
  Object.freeze([20,22,30] as const),
  Object.freeze([20,28,26] as const),
  Object.freeze([20,30,28] as const),
  Object.freeze([21,29,23] as const),
  Object.freeze([22,23,30] as const),
  Object.freeze([23,29,31] as const),
  Object.freeze([23,31,30] as const),
  Object.freeze([24,26,52] as const),
  Object.freeze([24,48,49] as const),
  Object.freeze([24,49,25] as const),
  Object.freeze([24,52,48] as const),
  Object.freeze([25,49,53] as const),
  Object.freeze([25,53,27] as const),
  Object.freeze([26,28,58] as const),
  Object.freeze([26,58,52] as const),
  Object.freeze([27,53,29] as const),
  Object.freeze([28,30,58] as const),
  Object.freeze([29,53,59] as const),
  Object.freeze([29,59,31] as const),
  Object.freeze([30,31,62] as const),
  Object.freeze([30,62,58] as const),
  Object.freeze([31,59,63] as const),
  Object.freeze([31,63,62] as const),
  Object.freeze([48,52,64] as const),
  Object.freeze([48,64,65] as const),
  Object.freeze([48,65,49] as const),
  Object.freeze([49,65,53] as const),
  Object.freeze([52,58,66] as const),
  Object.freeze([52,66,64] as const),
  Object.freeze([53,65,67] as const),
  Object.freeze([53,67,69] as const),
  Object.freeze([53,69,59] as const),
  Object.freeze([58,62,70] as const),
  Object.freeze([58,68,66] as const),
  Object.freeze([58,70,68] as const),
  Object.freeze([59,69,71] as const),
  Object.freeze([59,71,63] as const),
  Object.freeze([62,63,70] as const),
  Object.freeze([63,71,70] as const),
  Object.freeze([64,66,71] as const),
  Object.freeze([64,71,65] as const),
  Object.freeze([65,71,67] as const),
  Object.freeze([66,68,71] as const),
  Object.freeze([67,71,69] as const),
  Object.freeze([68,70,71] as const),
]);

/** World-space fixed-orientation polytope, compatible with convex SAT sweeps.
 * Face normals and edge directions are unit vectors, never scaled or translated.
 */
export function originalRpgWorldConvex(pose:OriginalRpgPose):{vertices:readonly Vec3[];faceNormals:readonly Vec3[];edgeDirections:readonly Vec3[];faces:ReadonlyArray<readonly [number,number,number]>} {
  requirePose(pose);
  const rotate=(point:Readonly<Vec3>):Vec3=>({x:point.x*pose.basis.x.x+point.y*pose.basis.y.x+point.z*pose.basis.z.x,y:point.x*pose.basis.x.y+point.y*pose.basis.y.y+point.z*pose.basis.z.y,z:point.x*pose.basis.x.z+point.y*pose.basis.y.z+point.z*pose.basis.z.z});
  const frozen=(vectors:Vec3[]):readonly Vec3[]=>Object.freeze(vectors.map(vector=>Object.freeze(vector)));
  return Object.freeze({faces:ORIGINAL_RPG_SOURCE_FACES,vertices:frozen(ORIGINAL_RPG_SOURCE_POINTS.map(point=>transformed(point,pose))),faceNormals:frozen(ORIGINAL_RPG_SOURCE_FACE_NORMALS.map(rotate)),edgeDirections:frozen(ORIGINAL_RPG_SOURCE_EDGE_DIRECTIONS.map(rotate))});
}

/** Oriented offsets from the physical pivot for sweepConvex(from,to,shape).
 * Sweep callers add the pivot exactly once; source offsets stay uncentered.
 */
export function originalRpgConvex(basis:OriginalRpgBasis):{vertices:readonly Vec3[];faceNormals:readonly Vec3[];edgeDirections:readonly Vec3[];faces:ReadonlyArray<readonly [number,number,number]>} {
  return originalRpgWorldConvex({pivot:{x:0,y:0,z:0},basis});
}
