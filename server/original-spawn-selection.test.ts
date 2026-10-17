import {afterEach,describe,expect,it,vi} from 'vitest';
import {MatchRoom} from './match-room';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import {ORIGINAL_SOURCE_SPAWNS} from '../shared/originalMapProfile';
import type {MessagePeer,ServerMessage} from './protocol';
class Peer implements MessagePeer {messages:ServerMessage[]=[];send(message:ServerMessage){this.messages.push(message);}}
afterEach(()=>vi.restoreAllMocks());
describe('recovered six-way source spawn selection',()=>{
 it.each(['barrack','woodlands'] as const)('%s samples all six paired starts independent of living threats',map=>{
  let id=0;const room=new MatchRoom('source-spawns',{map,now:()=>0,idFactory:()=>`p${++id}`});
  const runtime=getOriginalMapRuntime(map),random=vi.spyOn(Math,'random');
  // Equal intervals represent Lingo random(6)'s one-based uniform choice.
  // All previous players remain alive, including at the sampled position.
  for(const index of [5,0,3,1,4,2,2]){
   random.mockReturnValue((index+.5)/6);
   const joined=room.join(new Peer(),`PLAYER${id}`,0);if(!joined.ok)throw Error(joined.message);
   expect(joined.player.transform.position).toEqual(runtime.spawnPoints[index]);
   expect(joined.player.transform.yaw).toBeCloseTo(ORIGINAL_SOURCE_SPAWNS[map][index].rotation[2]*Math.PI/180);
   expect(joined.player.transform.pitch).toBeCloseTo(ORIGINAL_SOURCE_SPAWNS[map][index].rotation[0]*Math.PI/180);
  }
 });
 it.each(['barrack','woodlands','winter'] as const)('retains the authored safety policy for %s explicit custom starts',map=>{
  let id=0;const starts=map==='winter'?[{x:0,y:0,z:0},{x:10,y:0,z:0}]:getOriginalMapRuntime(map).spawnPoints.slice(0,2);
  const room=new MatchRoom('custom',{...(map==='winter'?{collisionProfile:'winter' as const}:{map}),spawnPoints:starts,idFactory:()=>`p${++id}`,now:()=>0});
  vi.spyOn(Math,'random').mockReturnValue(.99);
  const first=room.join(new Peer(),'FIRST',0),second=room.join(new Peer(),'SECOND',0);
  expect(first).toMatchObject({ok:true,player:{transform:{position:starts[0]}}});
  expect(second).toMatchObject({ok:true,player:{transform:{position:starts[1]}}});
 });
});
