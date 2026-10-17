import {describe,expect,it} from 'vitest';
import {OriginalRemoteView,type OriginalRemoteViewTarget} from './originalRemoteView';
const target=(x=0,yaw=0,motionTime=0,id='soldier'):OriginalRemoteViewTarget=>({id,position:{x,y:0,z:0},yaw,motionTime,alive:true});
const send=(view:OriginalRemoteView,tick:number,sentAt:number,targets=[target()])=>expect(view.recordSent({tick,sentAt,targets})).toEqual({ok:true});
const accept=(view:OriginalRemoteView,callbacks:number,now:number,receipts: {tick:number;callbacks:number}[]=[])=>expect(view.accept({callbacks,receipts},now)).toMatchObject({ok:true});
describe('viewer-specific source presentation authority foundation',()=>{
  it('mirrors a received firing event without resetting movement or removing other actors',()=>{
    const view=new OriginalRemoteView(0);send(view,1,0,[target(),target(20,0,500,'other')]);accept(view,0,0,[{tick:1,callbacks:0}]);
    send(view,2,50,[target(9),target(20,0,500,'other')]);accept(view,1,50,[{tick:2,callbacks:1}]);accept(view,2,67);
    const before=view.freeze();expect(view.recordSent({tick:3,sentAt:70,targets:[],firePlayerId:'soldier'})).toEqual({ok:true});
    accept(view,2,80,[{tick:3,callbacks:2}]);const fired=view.freeze();
    expect(fired[0]).toEqual({...before[0],motionTime:2000});expect(fired[1]).toEqual(before[1]);
    accept(view,3,100);expect(view.freeze()[0].position.x).toBe(2);expect(view.freeze()[0].motionTime).toBe(2000);
  });
  it('keeps last where metadata on death receipt and moves once before emitting detached die metadata',()=>{
    const view=new OriginalRemoteView(0);send(view,0,0,[target(),target(20,0,500,'other')]);accept(view,0,0,[{tick:0,callbacks:0}]);
    send(view,1,50,[{...target(9,1,300),weapon:'rifle'},target(20,0,500,'other')]);accept(view,1,50,[{tick:1,callbacks:1}]);accept(view,2,67);
    const before=view.freeze();expect(view.recordSent({tick:2,sentAt:70,targets:[],deathPlayerId:'soldier'})).toEqual({ok:true});
    accept(view,2,80,[{tick:2,callbacks:2}]);expect(view.freeze()[0]).toEqual({...before[0],alive:false});expect(view.freeze()[1]).toEqual(before[1]);
    send(view,3,80,[{...target(900,-20,2999),alive:false,weapon:'rpg'},target(20,0,500,'other')]);
    accept(view,2,80,[{tick:3,callbacks:2}]);expect(view.freeze()[0]).toEqual({...before[0],alive:false});
    const result=view.accept({callbacks:3,receipts:[]},100);
    expect(result).toMatchObject({ok:true,deaths:[{id:'soldier',position:{x:2,y:0,z:0},yaw:before[0].yaw+(1+Math.PI-before[0].yaw)/8*2,weapon:'rifle',callback:3}]});
    if(!result.ok||!result.deaths)throw Error('Expected native death transition');
    expect(Object.isFrozen(result.deaths)).toBe(true);expect(Object.isFrozen(result.deaths[0])).toBe(true);expect(Object.isFrozen(result.deaths[0].position)).toBe(true);
    expect(view.freeze().map(p=>p.id)).toEqual(['other']);accept(view,4,134);
    send(view,4,134,[target(30,-2,900),target(20,0,500,'other')]);accept(view,4,134,[{tick:4,callbacks:4}]);
    expect(view.freeze().find(actor=>actor.id==='soldier')).toMatchObject({alive:true,steps:10,position:{x:30}});expect(result.deaths[0].position.x).toBe(2);
  });
  it('ignores unknown and repeated dead receipts without changing the pending live phase',()=>{
    const view=new OriginalRemoteView(0);send(view,0,0,[target(0,0,2600)]);accept(view,0,0,[{tick:0,callbacks:0}]);
    expect(view.recordSent({tick:1,sentAt:0,targets:[],deathPlayerId:'unknown'})).toEqual({ok:true});accept(view,0,0,[{tick:1,callbacks:0}]);expect(view.freeze()[0].alive).toBe(true);
    expect(view.recordSent({tick:2,sentAt:0,targets:[],deathPlayerId:'soldier'})).toEqual({ok:true});accept(view,0,0,[{tick:2,callbacks:0}]);expect(view.freeze()[0].motionTime).toBe(2600);
    const before=view.freeze()[0];expect(view.recordSent({tick:3,sentAt:0,targets:[],deathPlayerId:'soldier'})).toEqual({ok:true});accept(view,0,0,[{tick:3,callbacks:0}]);expect(view.freeze()[0]).toEqual(before);
    expect(view.accept({callbacks:1,receipts:[]},34)).toMatchObject({ok:true,deaths:[{id:'soldier',position:{x:0,y:0,z:0},yaw:Math.PI,callback:1}]});
    expect(view.freeze()).toEqual([]);expect(view.recordSent({tick:4,sentAt:34,targets:[],deathPlayerId:'soldier'})).toEqual({ok:true});accept(view,1,34,[{tick:4,callbacks:1}]);accept(view,2,67);
  });
  it('rejects malformed, mixed fire/death and full-target death descriptors without recording them',()=>{
    const view=new OriginalRemoteView(0);
    for(const deathPlayerId of ['', 'x'.repeat(129),123])expect(view.recordSent({tick:0,sentAt:0,targets:[],deathPlayerId:deathPlayerId as string})).toEqual({ok:false,reason:'invalid_death_target'});
    expect(view.recordSent({tick:0,sentAt:0,targets:[target()],deathPlayerId:'soldier'})).toEqual({ok:false,reason:'invalid_death_target'});
    expect(view.recordSent({tick:0,sentAt:0,targets:[],deathPlayerId:'soldier',firePlayerId:'soldier'})).toEqual({ok:false,reason:'invalid_death_target'});expect(view.debugState().pendingTicks).toEqual([]);
  });
  it('allows a bounded welcome delivery offset without allowing clocks to run ahead',()=>{
    const view=new OriginalRemoteView(0);send(view,1,0);send(view,2,100);
    accept(view,0,150,[{tick:1,callbacks:0},{tick:2,callbacks:0}]);
    expect(view.accept({callbacks:100,receipts:[]},200)).toEqual({ok:false,reason:'future_callbacks'});
  });

  it('initializes at a trusted sent position and maps raw yaw without wrapping',()=>{
    const view=new OriginalRemoteView(0);send(view,1,0,[target(9,-40,300)]);accept(view,0,0,[{tick:1,callbacks:0}]);
    expect(view.freeze()[0]).toEqual({id:'soldier',position:{x:9,y:0,z:0},yaw:-40+Math.PI,motionTime:300,alive:true,steps:10});
  });
  it('reconstructs delayed moving/turning packets with the latest phase, not a raw historical pose',()=>{
    const view=new OriginalRemoteView(0);send(view,1,0);accept(view,0,0,[{tick:1,callbacks:0}]);
    send(view,2,50,[target(9,-3,900)]);accept(view,3,150,[{tick:2,callbacks:3}]);
    expect(view.freeze()[0].position.x).toBe(0);
    accept(view,4,150);const pose=view.freeze()[0];
    expect(pose.position.x).toBe(1);expect(pose.yaw).toBeCloseTo(Math.PI-6/9);expect(pose.motionTime).toBe(900);
    send(view,3,150,[target(19,3,2000)]);accept(view,4,180,[{tick:3,callbacks:4}]);accept(view,5,200);
    expect(view.freeze()[0].position.x).toBe(3);expect(view.freeze()[0].motionTime).toBe(2000);
    expect(view.freeze()[0].yaw).toBeCloseTo(pose.yaw+(3+Math.PI-pose.yaw)*2/9);
  });
  it('preserves the prolonged idle catch-up sequence instead of snapping a new packet',()=>{
    const view=new OriginalRemoteView(0);send(view,1,0);accept(view,0,0,[{tick:1,callbacks:0}]);
    accept(view,35,1200);expect(view.freeze()[0].steps).toBe(-25);
    send(view,2,1200,[target(34)]);accept(view,35,1200,[{tick:2,callbacks:35}]);
    expect(view.freeze()[0].steps).toBe(35);accept(view,36,1234);expect(view.freeze()[0].position.x).toBe(1);
  });
  it('freezes all displayed targets together for nearest-target authority and detaches old shots',()=>{
    const view=new OriginalRemoteView(0);send(view,1,0,[target(2,0,100,'near'),target(4,0,200,'far')]);accept(view,0,0,[{tick:1,callbacks:0}]);
    const shot=view.freeze();expect(shot.map(p=>[p.id,p.position.x,p.motionTime])).toEqual([['near',2,100],['far',4,200]]);
    expect(Object.isFrozen(shot)).toBe(true);expect(Object.isFrozen(shot[0].position)).toBe(true);
    send(view,2,50,[target(11,0,2000,'near'),target(22,0,2000,'far')]);accept(view,1,50,[{tick:2,callbacks:1}]);accept(view,2,67);
    expect(shot[0].position.x).toBe(2);expect(view.freeze()[0].position.x).toBe(3);
  });
  it('applies death and trusted reset/respawn while retaining omitted living actors',()=>{
    const view=new OriginalRemoteView(0);send(view,1,0,[target(),target(2,0,0,'other')]);accept(view,0,0,[{tick:1,callbacks:0}]);
    send(view,2,50,[{...target(9,0,2400),alive:false}]);accept(view,1,50,[{tick:2,callbacks:1}]);
    expect(view.freeze()).toHaveLength(2);expect(view.freeze()[0]).toMatchObject({alive:false,motionTime:0,steps:9,position:{x:0}});
    expect(view.accept({callbacks:2,receipts:[]},67)).toMatchObject({ok:true,deaths:[{id:'soldier',position:{x:0,y:0,z:0},yaw:Math.PI,callback:2}]});
    expect(view.freeze()).toMatchObject([{id:'other',alive:true,steps:8}]);
    send(view,3,100,[target(20,-30)]);accept(view,3,100,[{tick:3,callbacks:3}]);expect(view.freeze().find(p=>p.id==='soldier')).toMatchObject({alive:true,steps:10,position:{x:20},motionTime:0});
    send(view,4,150,[{...target(70),reset:true}]);accept(view,4,150,[{tick:4,callbacks:4}]);expect(view.freeze().find(p=>p.id==='soldier')!.position.x).toBe(70);
  });
  it('copies trusted snapshots so later caller mutations cannot alter authority',()=>{
    const view=new OriginalRemoteView(0),entry=target(3);send(view,1,0,[entry]);entry.position.x=999;entry.yaw=999;
    accept(view,0,0,[{tick:1,callbacks:0}]);expect(view.freeze()[0].position.x).toBe(3);expect(view.freeze()[0].yaw).toBe(Math.PI);
  });
  it.each([
    [{callbacks:3,receipts:[{tick:999,callbacks:2}]},'invalid_receipt_order'],
    [{callbacks:3,receipts:[{tick:2,callbacks:2}]},'invalid_receipt_order'],
    [{callbacks:3,receipts:[{tick:1,callbacks:2},{tick:1,callbacks:3}]},'invalid_receipt_order'],
    [{callbacks:3,receipts:[{tick:1,callbacks:2},{tick:2,callbacks:1}]},'invalid_callback_order'],
    [{callbacks:3,receipts:[{tick:1,callbacks:4}]},'invalid_callback_order'],
    [{callbacks:3.5,receipts:[]},'invalid_callback_order'],
    [{callbacks:300,receipts:[]},'future_callbacks'],
  ] as const)('rejects forged, reordered or invalid trace atomically: %s',(trace,reason)=>{
    const view=new OriginalRemoteView(0);send(view,1,0);send(view,2,50,[target(9)]);
    const before=view.debugState();expect(view.accept(trace,100)).toEqual({ok:false,reason});expect(view.debugState()).toEqual(before);expect(view.freeze()).toEqual([]);
    accept(view,3,100,[{tick:1,callbacks:0},{tick:2,callbacks:1}]);expect(view.freeze()[0].position.x).toBeCloseTo(2);
  });
  it('rejects a receipt before send, a future snapshot and a duplicate receipt',()=>{
    const view=new OriginalRemoteView(0,{maxCallbackLagMs:0});send(view,1,1000);
    expect(view.accept({callbacks:30,receipts:[{tick:1,callbacks:0}]},1000)).toEqual({ok:false,reason:'receipt_before_send'});
    expect(view.accept({callbacks:30,receipts:[{tick:1,callbacks:30}]},999)).toEqual({ok:false,reason:'future_snapshot'});
    accept(view,30,1000,[{tick:1,callbacks:30}]);expect(view.accept({callbacks:30,receipts:[{tick:1,callbacks:30}]},1000)).toEqual({ok:false,reason:'unknown_snapshot'});
  });
  it('rejects stale sent snapshots even when the client tries to skip them',()=>{
    const view=new OriginalRemoteView(0);send(view,1,0);
    expect(view.accept({callbacks:30,receipts:[]},1001)).toEqual({ok:false,reason:'stale_snapshot'});
    expect(view.accept({callbacks:30,receipts:[{tick:1,callbacks:0}]},1001)).toEqual({ok:false,reason:'stale_snapshot'});
    expect(view.debugState().pendingTicks).toEqual([1]);
  });
  it('bounds trusted clock lag, catch-up work, backwards time and callback rewind',()=>{
    const view=new OriginalRemoteView(0,{maxCallbacksPerAcceptance:20});
    expect(view.accept({callbacks:30,receipts:[]},1000)).toEqual({ok:false,reason:'callback_budget'});
    expect(view.accept({callbacks:0,receipts:[]},2000)).toEqual({ok:false,reason:'stale_callbacks'});
    accept(view,10,334);expect(view.accept({callbacks:9,receipts:[]},350)).toEqual({ok:false,reason:'invalid_callback_order'});
    expect(view.accept({callbacks:10,receipts:[]},333)).toEqual({ok:false,reason:'invalid_trusted_time'});
  });
  it('bounds the send queue without dropping a source receipt and allows capacity after acknowledgement',()=>{
    const view=new OriginalRemoteView(0,{maxPendingSnapshots:1});send(view,1,0);
    expect(view.recordSent({tick:2,sentAt:50,targets:[target()]})).toEqual({ok:false,reason:'snapshot_queue_full'});
    accept(view,1,50,[{tick:1,callbacks:0}]);send(view,2,50);
    expect(view.recordSent({tick:2,sentAt:50,targets:[]})).toEqual({ok:false,reason:'invalid_sent_order'});
  });
  it('rejects malformed trusted target values without consuming its tick',()=>{
    const view=new OriginalRemoteView(0);
    expect(view.recordSent({tick:1,sentAt:0,targets:[target(),target()]})).toEqual({ok:false,reason:'invalid_sent_target'});
    expect(view.recordSent({tick:1,sentAt:0,targets:[target(NaN)]})).toEqual({ok:false,reason:'invalid_sent_target'});send(view,1,0);
  });
  it('retains an omitted living actor until callback460 and emits one detached trusted timeout',()=>{
    const view=new OriginalRemoteView(0),entry={...target(2,.5,300),weapon:'rifle' as const};
    send(view,0,0,[entry]);entry.position.x=999;accept(view,0,0,[{tick:0,callbacks:0}]);
    send(view,1,100,[]);accept(view,3,100,[{tick:1,callbacks:3}]);
    expect(view.freeze()[0]).toMatchObject({id:'soldier',alive:true,steps:7,position:{x:2}});
    accept(view,459,15300);expect(view.freeze()[0].steps).toBe(-449);
    const result=view.accept({callbacks:460,receipts:[]},15334);
    expect(result).toMatchObject({ok:true,timeouts:[{id:'soldier',position:{x:2,y:0,z:0},yaw:.5+Math.PI,weapon:'rifle',callback:460}]});
    expect(view.freeze()).toEqual([]);
    if(!result.ok||!result.timeouts)throw Error('Expected trusted timeout');
    expect(Object.isFrozen(result.timeouts)).toBe(true);expect(Object.isFrozen(result.timeouts[0])).toBe(true);expect(Object.isFrozen(result.timeouts[0].position)).toBe(true);
    accept(view,461,15367);send(view,2,15367,[target(30,-2,900)]);accept(view,461,15367,[{tick:2,callbacks:461}]);
    expect(view.freeze()[0]).toMatchObject({alive:true,steps:10,position:{x:30},yaw:-2+Math.PI,motionTime:900});
    expect(result.timeouts[0].position.x).toBe(2);
  });
  it('uses a timely received actor packet to extend minus449 and updates trusted timeout weapon metadata',()=>{
    const view=new OriginalRemoteView(0);send(view,0,0,[{...target(),weapon:'pistol'}]);accept(view,0,0,[{tick:0,callbacks:0}]);
    accept(view,459,15300);send(view,1,15300,[{...target(9),weapon:'sniper'}]);accept(view,459,15300,[{tick:1,callbacks:459}]);
    expect(view.freeze()[0].steps).toBe(459);accept(view,460,15334);expect(view.freeze()[0].steps).toBe(458);
    accept(view,1367,45567);expect(view.freeze()[0].steps).toBe(-449);
    expect(view.accept({callbacks:1368,receipts:[]},45600)).toMatchObject({ok:true,timeouts:[{id:'soldier',position:{x:9,y:0,z:0},yaw:Math.PI,weapon:'sniper',callback:1368}]});
    expect(view.freeze()).toEqual([]);
  });
  it('retains an omitted pending death for its next callback and never emits an extra timeout',()=>{
    const view=new OriginalRemoteView(0);send(view,0,0,[{...target(),weapon:'launcher'}]);accept(view,0,0,[{tick:0,callbacks:0}]);
    expect(view.recordSent({tick:1,sentAt:0,targets:[],deathPlayerId:'soldier'})).toEqual({ok:true});accept(view,0,0,[{tick:1,callbacks:0}]);
    send(view,2,0,[]);accept(view,0,0,[{tick:2,callbacks:0}]);expect(view.freeze()).toMatchObject([{id:'soldier',alive:false,steps:10}]);
    expect(view.accept({callbacks:1,receipts:[]},34)).toMatchObject({ok:true,deaths:[{id:'soldier',position:{x:0,y:0,z:0},yaw:Math.PI,weapon:'launcher',callback:1}]});expect(view.freeze()).toEqual([]);
    accept(view,460,15334);expect(view.freeze()).toEqual([]);
  });
  it('rejects a later invalid receipt without committing an earlier would-be timeout or omission',()=>{
    const view=new OriginalRemoteView(0);send(view,0,0,[target()]);accept(view,0,0,[{tick:0,callbacks:0}]);accept(view,459,15300);
    send(view,1,15300,[]);send(view,2,15300,[]);const before=view.freeze(),clock=view.debugState();
    expect(view.accept({callbacks:460,receipts:[{tick:1,callbacks:460},{tick:999,callbacks:460}]},15334)).toEqual({ok:false,reason:'invalid_receipt_order'});
    expect(view.freeze()).toEqual(before);expect(view.debugState()).toEqual(clock);
    expect(view.accept({callbacks:460,receipts:[{tick:1,callbacks:460},{tick:2,callbacks:460}]},15334)).toMatchObject({ok:true,timeouts:[{id:'soldier',position:{x:0,y:0,z:0},yaw:Math.PI,callback:460}]});
    accept(view,461,15367);
  });
  it('orders timeout before a packet received at that exact callback and creates a new active actor',()=>{
    const view=new OriginalRemoteView(0);send(view,0,0,[target()]);accept(view,0,0,[{tick:0,callbacks:0}]);accept(view,459,15300);
    send(view,1,15334,[{...target(50,2,700),weapon:'shotgun'}]);
    expect(view.accept({callbacks:460,receipts:[{tick:1,callbacks:460}]},15334)).toMatchObject({ok:true,timeouts:[{id:'soldier',position:{x:0,y:0,z:0},yaw:Math.PI,callback:460}]});
    expect(view.freeze()[0]).toMatchObject({id:'soldier',alive:true,steps:10,position:{x:50},yaw:2+Math.PI,motionTime:700});
  });
  it('rejects invalid optional trusted weapon metadata and copies the recorded primitive',()=>{
    const view=new OriginalRemoteView(0);
    expect(view.recordSent({tick:0,sentAt:0,targets:[{...target(),weapon:'invalid' as never}]})).toEqual({ok:false,reason:'invalid_sent_target'});
    expect(view.debugState().pendingTicks).toEqual([]);
    const entry:OriginalRemoteViewTarget={...target(),weapon:'rpg'};send(view,0,0,[entry]);entry.weapon='sniper';accept(view,0,0,[{tick:0,callbacks:0}]);
    expect(view.accept({callbacks:460,receipts:[]},15334)).toMatchObject({ok:true,timeouts:[{id:'soldier',position:{x:0,y:0,z:0},yaw:Math.PI,weapon:'rpg',callback:460}]});
  });
  it('ignores unknown already-dead full snapshots, including a reset flag, without historical actors or pickups',()=>{
    const view=new OriginalRemoteView(0);
    send(view,0,0,[{...target(9,2,2400),alive:false,weapon:'rpg',reset:true}]);accept(view,0,0,[{tick:0,callbacks:0}]);
    expect(view.freeze()).toEqual([]);accept(view,1,34);
    send(view,1,34,[target(30)]);accept(view,1,34,[{tick:1,callbacks:1}]);expect(view.freeze()).toMatchObject([{alive:true,steps:10,position:{x:30}}]);
  });
  it('does not revive pending death on a genuine where, but uses that packet target and weapon before die',()=>{
    const view=new OriginalRemoteView(0);send(view,0,0,[{...target(),weapon:'rifle'}]);accept(view,0,0,[{tick:0,callbacks:0}]);
    expect(view.recordSent({tick:1,sentAt:0,targets:[],deathPlayerId:'soldier'})).toEqual({ok:true});
    send(view,2,0,[{...target(9,0,500),weapon:'pistol'}]);send(view,3,0,[{...target(99,3,2999),alive:false,weapon:'rpg'}]);
    accept(view,0,0,[{tick:1,callbacks:0},{tick:2,callbacks:0},{tick:3,callbacks:0}]);
    expect(view.freeze()).toMatchObject([{alive:false,steps:10,motionTime:500,position:{x:0}}]);
    expect(view.accept({callbacks:1,receipts:[]},34)).toMatchObject({ok:true,deaths:[{id:'soldier',position:{x:1,y:0,z:0},yaw:Math.PI,weapon:'pistol',callback:1}]});expect(view.freeze()).toEqual([]);
  });
  it('supports an explicitly trusted living reset before pending death advances',()=>{
    const view=new OriginalRemoteView(0);send(view,0,0,[target()]);accept(view,0,0,[{tick:0,callbacks:0}]);
    expect(view.recordSent({tick:1,sentAt:0,targets:[],deathPlayerId:'soldier'})).toEqual({ok:true});
    send(view,2,0,[{...target(70),reset:true}]);accept(view,0,0,[{tick:1,callbacks:0},{tick:2,callbacks:0}]);
    accept(view,1,34);expect(view.freeze()).toMatchObject([{alive:true,steps:9,position:{x:70}}]);
  });
  it('rejects invalid later receipts before committing pending death movement or metadata',()=>{
    const view=new OriginalRemoteView(0);send(view,0,0,[{...target(),weapon:'rifle'}]);accept(view,0,0,[{tick:0,callbacks:0}]);
    expect(view.recordSent({tick:1,sentAt:0,targets:[],deathPlayerId:'soldier'})).toEqual({ok:true});accept(view,0,0,[{tick:1,callbacks:0}]);
    send(view,2,0,[]);send(view,3,0,[]);const pose=view.freeze(),state=view.debugState();
    expect(view.accept({callbacks:1,receipts:[{tick:2,callbacks:1},{tick:999,callbacks:1}]},34)).toEqual({ok:false,reason:'invalid_receipt_order'});
    expect(view.freeze()).toEqual(pose);expect(view.debugState()).toEqual(state);
    expect(view.accept({callbacks:1,receipts:[{tick:2,callbacks:1},{tick:3,callbacks:1}]},34)).toMatchObject({ok:true,deaths:[{id:'soldier',position:{x:0,y:0,z:0},yaw:Math.PI,weapon:'rifle',callback:1}]});
    accept(view,2,67);
  });
  it('removes pending death before a same-callback new where creates a fresh active actor',()=>{
    const view=new OriginalRemoteView(0);send(view,0,0,[{...target(),weapon:'rifle'}]);accept(view,0,0,[{tick:0,callbacks:0}]);
    expect(view.recordSent({tick:1,sentAt:0,targets:[],deathPlayerId:'soldier'})).toEqual({ok:true});accept(view,0,0,[{tick:1,callbacks:0}]);
    send(view,2,34,[{...target(40,2,900),weapon:'sniper'}]);
    expect(view.accept({callbacks:1,receipts:[{tick:2,callbacks:1}]},34)).toMatchObject({ok:true,deaths:[{id:'soldier',position:{x:0,y:0,z:0},yaw:Math.PI,weapon:'rifle',callback:1}]});
    expect(view.freeze()).toMatchObject([{alive:true,steps:10,position:{x:40},yaw:Math.PI+2,motionTime:900}]);
  });
  it('gives the native minus450 disconnect boundary precedence over a pending death without duplicate metadata',()=>{
    const view=new OriginalRemoteView(0);send(view,0,0,[{...target(),weapon:'rifle'}]);accept(view,0,0,[{tick:0,callbacks:0}]);accept(view,459,15300);
    expect(view.recordSent({tick:1,sentAt:15300,targets:[],deathPlayerId:'soldier'})).toEqual({ok:true});accept(view,459,15300,[{tick:1,callbacks:459}]);
    expect(view.freeze()).toMatchObject([{alive:false,steps:-449}]);
    expect(view.accept({callbacks:460,receipts:[]},15334)).toMatchObject({ok:true,timeouts:[{id:'soldier',position:{x:0,y:0,z:0},yaw:Math.PI,weapon:'rifle',callback:460}]});expect(view.freeze()).toEqual([]);accept(view,461,15367);
  });
  it('can return separate finite timeout and death collections from one validated callback batch',()=>{
    const view=new OriginalRemoteView(0);send(view,0,0,[target(0,0,0,'missing'),{...target(20,0,500,'dying'),weapon:'pistol'}]);accept(view,0,0,[{tick:0,callbacks:0}]);accept(view,459,15300);
    send(view,1,15300,[{...target(20,0,500,'dying'),weapon:'pistol'}]);
    expect(view.recordSent({tick:2,sentAt:15300,targets:[],deathPlayerId:'dying'})).toEqual({ok:true});accept(view,459,15300,[{tick:1,callbacks:459},{tick:2,callbacks:459}]);
    const timeout={id:'missing',position:{x:0,y:0,z:0},yaw:Math.PI,callback:460},death={id:'dying',position:{x:20,y:0,z:0},yaw:Math.PI,weapon:'pistol',callback:460};
    expect(view.accept({callbacks:460,receipts:[]},15334)).toMatchObject({ok:true,timeouts:[timeout],deaths:[death],transitions:[timeout,death]});expect(view.freeze()).toEqual([]);accept(view,461,15367);
  });
  it('preserves death-before-timeout actor insertion order for equal-callback mixed transitions',()=>{
    const view=new OriginalRemoteView(0);send(view,0,0,[{...target(20,0,500,'dying'),weapon:'pistol'},target(0,0,0,'missing')]);accept(view,0,0,[{tick:0,callbacks:0}]);accept(view,459,15300);
    send(view,1,15300,[{...target(20,0,500,'dying'),weapon:'pistol'}]);
    expect(view.recordSent({tick:2,sentAt:15300,targets:[],deathPlayerId:'dying'})).toEqual({ok:true});accept(view,459,15300,[{tick:1,callbacks:459},{tick:2,callbacks:459}]);
    const timeout={id:'missing',position:{x:0,y:0,z:0},yaw:Math.PI,callback:460},death={id:'dying',position:{x:20,y:0,z:0},yaw:Math.PI,weapon:'pistol',callback:460};
    const result=view.accept({callbacks:460,receipts:[]},15334);
    expect(result).toMatchObject({ok:true,timeouts:[timeout],deaths:[death],transitions:[death,timeout]});
    if(!result.ok||!result.transitions||!result.deaths||!result.timeouts)throw Error('Expected ordered mixed transitions');
    expect(Object.isFrozen(result.transitions)).toBe(true);expect(result.transitions[0]).toBe(result.deaths[0]);expect(result.transitions[1]).toBe(result.timeouts[0]);
    expect(view.freeze()).toEqual([]);accept(view,461,15367);
  });
  it('keeps detached corpse birth and75 fade callbacks as blockers, removing on fade callback76',()=>{
    const view=new OriginalRemoteView(0);send(view,0,0,[{...target(2,.5),weapon:'rifle'}]);accept(view,0,0,[{tick:0,callbacks:0}]);
    expect(view.recordSent({tick:1,sentAt:0,targets:[],deathPlayerId:'soldier'})).toEqual({ok:true});accept(view,0,0,[{tick:1,callbacks:0}]);expect(view.freezeCorpses()).toEqual([]);
    expect(view.accept({callbacks:1,receipts:[]},34).ok).toBe(true);expect(view.freeze()).toEqual([]);
    const birth=view.freezeCorpses();expect(birth).toEqual([{ownerId:'soldier',sequence:1,position:{x:2,y:0,z:0},yaw:.5+Math.PI,motionTime:3000,deathBon:0}]);
    expect(Object.isFrozen(birth)).toBe(true);expect(Object.isFrozen(birth[0])).toBe(true);expect(Object.isFrozen(birth[0].position)).toBe(true);
    accept(view,2,67);expect(view.freezeCorpses()[0]).toMatchObject({motionTime:2408,deathBon:8});
    accept(view,76,2534);expect(view.freezeCorpses()[0]).toMatchObject({motionTime:3000,deathBon:600});
    accept(view,77,2567);expect(view.freezeCorpses()).toEqual([]);expect(birth[0]).toMatchObject({motionTime:3000,deathBon:0,position:{x:2}});
  });
  it('creates the same bounded fade blocker for a timeout without a damage-eligible active actor',()=>{
    const view=new OriginalRemoteView(0);send(view,0,0,[target(4)]);accept(view,0,0,[{tick:0,callbacks:0}]);
    expect(view.accept({callbacks:460,receipts:[]},15334).ok).toBe(true);
    expect(view.freeze()).toEqual([]);expect(view.freezeCorpses()).toMatchObject([{ownerId:'soldier',sequence:1,position:{x:4},motionTime:3000,deathBon:0}]);
    accept(view,535,17834);expect(view.freezeCorpses()[0]).toMatchObject({deathBon:600,motionTime:3000});
    accept(view,536,17867);expect(view.freezeCorpses()).toEqual([]);
  });
  it('retains independent corpse instances when the same actor id reappears and dies again',()=>{
    const view=new OriginalRemoteView(0);send(view,0,0,[target(2)]);accept(view,0,0,[{tick:0,callbacks:0}]);
    expect(view.recordSent({tick:1,sentAt:0,targets:[],deathPlayerId:'soldier'})).toEqual({ok:true});accept(view,0,0,[{tick:1,callbacks:0}]);expect(view.accept({callbacks:1,receipts:[]},34).ok).toBe(true);
    const first=view.freezeCorpses();send(view,2,34,[target(40)]);accept(view,1,34,[{tick:2,callbacks:1}]);expect(view.freeze()).toMatchObject([{id:'soldier',alive:true,position:{x:40}}]);
    expect(view.recordSent({tick:3,sentAt:34,targets:[],deathPlayerId:'soldier'})).toEqual({ok:true});accept(view,1,34,[{tick:3,callbacks:1}]);expect(view.accept({callbacks:2,receipts:[]},67).ok).toBe(true);
    expect(view.freeze()).toEqual([]);expect(view.freezeCorpses()).toMatchObject([
      {ownerId:'soldier',sequence:1,position:{x:2},deathBon:8,motionTime:2408},
      {ownerId:'soldier',sequence:2,position:{x:40},deathBon:0,motionTime:3000}]);
    send(view,4,67,[{...target(999),alive:false}]);expect(view.recordSent({tick:5,sentAt:67,targets:[],deathPlayerId:'soldier'})).toEqual({ok:true});accept(view,2,67,[{tick:4,callbacks:2},{tick:5,callbacks:2}]);
    accept(view,3,100);expect(view.freezeCorpses()).toHaveLength(2);expect(view.freezeCorpses().map(corpse=>corpse.deathBon)).toEqual([16,8]);expect(first[0].deathBon).toBe(0);
  });
  it('rejects invalid receipt transactions without advancing an existing corpse or duplicating its birth',()=>{
    const view=new OriginalRemoteView(0);send(view,0,0,[target()]);accept(view,0,0,[{tick:0,callbacks:0}]);
    expect(view.recordSent({tick:1,sentAt:0,targets:[],deathPlayerId:'soldier'})).toEqual({ok:true});accept(view,0,0,[{tick:1,callbacks:0}]);expect(view.accept({callbacks:1,receipts:[]},34).ok).toBe(true);
    send(view,2,34,[]);const corpses=view.freezeCorpses(),state=view.debugState();
    expect(view.accept({callbacks:2,receipts:[{tick:999,callbacks:2}]},67)).toEqual({ok:false,reason:'invalid_receipt_order'});
    expect(view.freezeCorpses()).toEqual(corpses);expect(view.debugState()).toEqual(state);
    accept(view,2,67,[{tick:2,callbacks:2}]);expect(view.freezeCorpses()).toMatchObject([{sequence:1,deathBon:8,motionTime:2408}]);
  });
  it('starts a new mirror generation without old corpses and creates no corpse from an unknown dead actor',()=>{
    const old=new OriginalRemoteView(0);send(old,0,0,[target()]);accept(old,0,0,[{tick:0,callbacks:0}]);
    expect(old.recordSent({tick:1,sentAt:0,targets:[],deathPlayerId:'soldier'})).toEqual({ok:true});accept(old,0,0,[{tick:1,callbacks:0}]);expect(old.accept({callbacks:1,receipts:[]},34).ok).toBe(true);expect(old.freezeCorpses()).toHaveLength(1);
    const fresh=new OriginalRemoteView(34);send(fresh,0,34,[{...target(99),alive:false}]);accept(fresh,0,34,[{tick:0,callbacks:0}]);
    expect(fresh.recordSent({tick:1,sentAt:34,targets:[],deathPlayerId:'soldier'})).toEqual({ok:true});accept(fresh,0,34,[{tick:1,callbacks:0}]);accept(fresh,1,68);
    expect(fresh.freeze()).toEqual([]);expect(fresh.freezeCorpses()).toEqual([]);expect(old.freezeCorpses()).toHaveLength(1);
  });

});
