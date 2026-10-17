import {describe,expect,it} from 'vitest';
import {MatchRoom} from './match-room';
import type {MessagePeer} from './protocol';
import {ORIGINAL_CODENAME_REJECTION} from '../shared/originalCodename';
const peer=():MessagePeer=>({send:()=>undefined});
describe('source authority codename joins',()=>{
  for(const map of ['barrack','woodlands'] as const){
    it(`${map} filters direct protocol names before joining`,()=>{
      const room=new MatchRoom('name',{map,now:()=>0});const joined=room.join(peer(),' A B!0_é ',0);
      expect(joined).toMatchObject({ok:true,player:{name:'AB0'}});
      expect(room.getSnapshot(0).players[0].name).toBe('AB0');
    });
    it.each(['0','!!!é',''])(`${map} rejects censored %s`,name=>{
      const room=new MatchRoom('name',{map,now:()=>0});expect(room.join(peer(),name,0)).toMatchObject({ok:false,code:'invalid_name',message:ORIGINAL_CODENAME_REJECTION});expect(room.size).toBe(0);
    });
    it(`${map} retained resume keeps authoritative name`,()=>{
      const messages:any[]=[];const initialPeer={send:(value:any)=>messages.push(value)};
      const retained=new MatchRoom('retained',{map,now:()=>0});const first=retained.join(initialPeer,'Original!',0);if(!first.ok)throw Error('join');
      retained.suspend(first.player.id,1,initialPeer);
      const token=messages.find(message=>message.type==='welcome')?.resumeToken;
      expect(token).toBeTruthy();const resumed=retained.join(peer(),'!!!',2,token);
      expect(resumed).toMatchObject({ok:true,player:{id:first.player.id,name:'Original'}});
    });
  }
  it('retains authored Winter name sanitization',()=>{
    const room=new MatchRoom('winter',{collisionProfile:'winter',now:()=>0});expect(room.join(peer(),' A B!0_é ',0)).toMatchObject({ok:true,player:{name:'A B!0_é'}});
  });
});
