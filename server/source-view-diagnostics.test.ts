import {describe,it,expect} from 'vitest';
import {MatchRoom} from './match-room';
import type {MessagePeer,ServerMessage} from './protocol';
class Peer implements MessagePeer {messages:ServerMessage[]=[];send(m:ServerMessage){this.messages.push(m);}}
function setup(sink?:(event:Record<string,unknown>)=>void){
 let timer=100;const events:Record<string,unknown>[]=[],room=new MatchRoom('diagnostic',{map:'woodlands',now:()=>0,diagnosticNow:()=>timer++,sourceViewDiagnostics:sink??(e=>events.push(e))});
 const peer=new Peer(),join=room.join(peer,'PRIVATE-NAME',0,undefined,true);if(!join.ok)throw Error('join');
 const welcome=peer.messages.find(m=>m.type==='welcome');if(welcome?.type!=='welcome'||!welcome.sourceRemoteView)throw Error('welcome');
 const trace={generation:welcome.sourceRemoteView.generation,callbacks:0,receipts:[{tick:0,callbacks:0}]};
 return {room,peer,join,events,trace};
}
describe('opt-in monotonic source view diagnostics',()=>{
 it('captures failed receipt age, trusted epoch, last validation and preceding world catch-up without credentials',()=>{
  const s=setup();s.room.handleMessage(s.join.player.id,{type:'transform',sequence:0,clientTime:0,transform:{...s.join.player.transform,sourceInput:{forward:false,backward:false,left:false,right:false,jump:false}},sourceRemoteView:s.trace},0);
  s.room.tick(200);const work=s.events.find(e=>e.kind==='source-world-work')!;expect(work).toMatchObject({trustedNow:200,callbacks:6,players:1,sourceBodies:1,durationMs:1,worldTimeBefore:0});expect(work.worldTimeAfter).toBeCloseTo(200);
  const snapshots=s.peer.messages.filter(m=>m.type==='snapshot');const latest=snapshots.at(-1);if(latest?.type!=='snapshot'||latest.sourceViewTick===undefined)throw Error('snapshot');
  s.room.handleMessage(s.join.player.id,{type:'transform',sequence:1,clientTime:1500,transform:s.join.player.transform,sourceRemoteView:{generation:s.trace.generation,callbacks:45,receipts:[{tick:latest.sourceViewTick,callbacks:6}]}},1500);
  const rejection=s.events.find(e=>e.kind==='source-view-rejected')!;
  expect(rejection).toMatchObject({room:'diagnostic',map:'woodlands',trustedNow:1500,reason:'stale_snapshot',generation:s.trace.generation,lastValidation:{trustedNow:0,callbacks:0,receiptCount:1},lastWorldWork:{kind:'source-world-work',callbacks:6,durationMs:1,trustedNow:200,worldTimeAfter:work.worldTimeAfter},mirror:{epoch:0,callbacks:0,lastAcceptedAt:0,pendingCount:1,pending:[{tick:latest.sourceViewTick,sentAt:200,ageMs:1300}]},trace:{callbacks:45}});
  expect(typeof rejection.processingAt).toBe('number');expect(rejection.processingEndedAt).toBeGreaterThan(rejection.processingAt as number);
  const serialized=JSON.stringify(s.events);expect(serialized).not.toContain('PRIVATE-NAME');expect(serialized).not.toContain(s.join.player.name);
  if(s.peer.messages[0].type==='welcome')expect(serialized).not.toContain(s.peer.messages[0].resumeToken);
 });
 it('keeps short ordinary callback work out of stdout, but attaches it to the next rejection',()=>{
  const s=setup();s.room.tick(100);expect(s.events).toEqual([]);
  s.room.handleMessage(s.join.player.id,{type:'transform',sequence:0,clientTime:101,transform:s.join.player.transform,sourceRemoteView:{...s.trace,generation:s.trace.generation+1}},101);
  expect(s.events).toHaveLength(1);expect(s.events[0]).toMatchObject({kind:'source-view-rejected',lastWorldWork:{callbacks:3,trustedNow:100},trace:{generation:s.trace.generation+1}});
 });
 it('never serializes arbitrary malformed trace data and ignores diagnostic sink failures',()=>{
  const s=setup();s.room.handleMessage(s.join.player.id,{type:'transform',sequence:0,clientTime:1,transform:s.join.player.transform,sourceRemoteView:{generation:'SECRET-TOKEN',callbacks:0,receipts:[]} as any},1);
  expect(s.events[0]).toMatchObject({kind:'source-view-rejected',trace:null});expect(JSON.stringify(s.events)).not.toContain('SECRET-TOKEN');
  const throwing=setup(()=>{throw Error('diagnostic sink');});expect(()=>throwing.room.tick(200)).not.toThrow();
  expect(()=>throwing.room.handleMessage(throwing.join.player.id,{type:'transform',sequence:0,clientTime:201,transform:throwing.join.player.transform,sourceRemoteView:{...throwing.trace,generation:999}},201)).not.toThrow();
  expect(throwing.peer.messages.at(-1)).toMatchObject({type:'error',code:'invalid_source_view'});
 });
});
