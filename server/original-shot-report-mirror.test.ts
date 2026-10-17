import {describe,expect,it} from 'vitest';
import {MatchRoom} from './match-room';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import {createOriginalSceneGeometry,type OriginalSceneData} from '../shared/originalSceneGeometry';
import {OriginalWeaponCounter} from '../shared/originalWeaponCounter';
import {OriginalRemoteView} from '../shared/originalRemoteView';
import type {MessagePeer,ServerMessage} from './protocol';

class Peer implements MessagePeer {messages:ServerMessage[]=[];send(message:ServerMessage){this.messages.push(message);}}
/** Explicit small trusted population; real admission, scene intersection,
 * publication, dispatch queue and mirror callbacks remain production code. */
const data:OriginalSceneData={
 nodes:[{name:'floorwall',resource:'wall',parent:'World',matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],visibility:1,shader:'default'}],
 meshes:[{resource:'wall',part:0,positions:[[-3,1,100],[3,1,100],[3,1,104],[-3,1,104]],faces:[[0,1,2],[0,2,3]],normals:[],tex_coords:[]}],
};

describe('actual source shot publication reaches the negotiated authority mirror',()=>{
 for(const map of ['barrack','woodlands'] as const)it(`${map} queues the positive report until its next callback and leaves event receipts inert`,()=>{
  const room=new MatchRoom('shot-report-mirror',{map,now:()=>1100,spawnPoints:[{x:0,y:100,z:0}]}),shooterPeer=new Peer(),joined=room.join(shooterPeer,'SHOOTER',1100);
  if(!joined.ok)throw Error('shooter join');const review=room as any,shooter=review.players.get(joined.player.id);
  review.original={...review.original,geometry:createOriginalSceneGeometry(data,{scale:1,cellSize:1})};review.doorWorld=undefined;
  review.barrelWorld.applySnapshots([]);shooter.sourceWorld.doors=undefined;shooter.sourceWorld.barrels.applySnapshots([]);
  shooter.transform.position={x:0,y:100,z:0};shooter.transform.weapon='pistol';
  shooter.sourceCounter=new OriginalWeaponCounter(map,'pistol');shooter.sourceCounterUpdatedAt=1100;shooter.sourceCounterReady=true;shooter.sourceCounterWeapon='pistol';
  const peer=new Peer(),vj=room.join(peer,'VIEWER',1100,undefined,true);if(!vj.ok)throw Error('viewer join');
  const viewer=review.players.get(vj.player.id),mirror=viewer.sourceRemoteView as OriginalRemoteView;
  expect(mirror.accept({callbacks:0,receipts:[{tick:0,callbacks:0}]},1100)).toEqual({ok:true});
  expect(mirror.freeze().find(p=>p.id===shooter.id)?.motionTime).toBe(0);
  room.handleMessage(shooter.id,{type:'shoot',shot:{shotId:'positive',weapon:'pistol',origin:{x:0,y:100+getOriginalMapRuntime(map).profile.eyeHeight,z:0},direction:{x:0,y:0,z:-1}}},1100);
  expect(shooter.sourcePendingShots).toBe(1);
  expect(peer.messages.find(m=>m.type==='event'&&m.event.type==='shot')).toMatchObject({sourceViewTick:1,event:{data:{playerId:shooter.id}}});
  expect(mirror.accept({callbacks:0,receipts:[{tick:1,callbacks:0}]},1100)).toEqual({ok:true});
  expect(mirror.freeze().find(p=>p.id===shooter.id)?.motionTime).toBe(0);
  room.tick(1100);
  const publication=peer.messages.filter(m=>m.type==='snapshot').at(-1)!;
  expect(publication).toMatchObject({sourceViewTick:2});
  if(publication.type!=='snapshot')throw Error('missing publication');
  expect(publication.snapshot.players.find(p=>p.id===shooter.id)).toMatchObject({sourceShots:1,transform:{weapon:'pistol'}});
  expect(shooter.sourcePendingShots).toBe(0);
  expect(mirror.accept({callbacks:0,receipts:[{tick:2,callbacks:0}]},1100)).toEqual({ok:true});
  expect(mirror.freeze().find(p=>p.id===shooter.id)?.motionTime).toBe(0);
  expect(mirror.accept({callbacks:1,receipts:[]},1100+1000/30)).toMatchObject({ok:true,shots:[{id:shooter.id,weapon:'pistol',callback:1,position:{x:0,y:100,z:0}}]});
  expect(mirror.freeze().find(p=>p.id===shooter.id)).toMatchObject({motionTime:1000,steps:9});
  expect(mirror.accept({callbacks:2,receipts:[]},1100+2000/30)).toEqual({ok:true});
  expect(mirror.freeze().find(p=>p.id===shooter.id)?.motionTime).toBe(1000);
  expect(peer.messages.some(m=>m.type==='error')).toBe(false);
 });
});
