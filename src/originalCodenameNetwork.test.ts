import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {NetworkClient,type WebSocketLike} from './network';
import {ORIGINAL_CODENAME_REJECTION} from '../shared/originalCodename';
function socket(){
  const sent:string[]=[],listeners=new Map<string,Array<(event:any)=>void>>();
  const value:WebSocketLike={readyState:1,send:data=>sent.push(data),close:()=>undefined,addEventListener:(type,listener)=>{const list=listeners.get(type)??[];list.push(listener);listeners.set(type,list);}};
  return {value,sent,open:()=>listeners.get('open')?.forEach(listener=>listener({}))};
}
describe('source network codename consistency',()=>{
  for(const options of [{map:'barrack' as const},{map:'woodlands' as const},{sourceRemoteView:true}]){
    it(`filters the outgoing ${JSON.stringify(options)} join`,async()=>{
      const s=socket(),client=new NetworkClient({reconnect:false,websocketFactory:()=>s.value,...('sourceRemoteView'in options?options:{})});
      const pending=client.join('room',' A B!0_é ','map'in options?options.map:undefined).catch(()=>undefined);s.open();
      expect(JSON.parse(s.sent.find(data=>JSON.parse(data).type==='join')!)).toMatchObject({type:'join',name:'AB0'});
      client.dispose();await pending;
    });
    it.each(['0','!!!é'])('rejects censored %s without opening a socket',async name=>{
      const factory=vi.fn(()=>socket().value),client=new NetworkClient({websocketFactory:factory,...('sourceRemoteView'in options?options:{})});
      await expect(client.join('room',name,'map'in options?options.map:undefined)).rejects.toThrow(ORIGINAL_CODENAME_REJECTION);
      expect(factory).not.toHaveBeenCalled();client.dispose();
    });
  }
  for(const map of ['barrack','woodlands'] as const)it(`keeps explicit authored mode names with ${map} routing`,async()=>{
    const s=socket(),client=new NetworkClient({sourceRemoteView:false,reconnect:false,websocketFactory:()=>s.value});
    const pending=client.join('room',' A B!0_é ',map).catch(()=>undefined);s.open();
    expect(JSON.parse(s.sent.find(data=>JSON.parse(data).type==='join')!)).toMatchObject({name:'A B!0_é',map});
    client.dispose();await pending;
  });
  it('pins the actual Game archived Winter transport configuration',()=>{
    const source=readFileSync(new URL('./game.ts',import.meta.url),'utf8');
    const connect=source.slice(source.indexOf('private async connectOnline'),source.indexOf('private resetSourceRemoteView'));
    expect(connect).toContain('sourceRemoteView:!this.archivalWinter');
    expect(connect).toContain('client.join(room,callsign,this.mapId)');
  });
  it('keeps unknown/default joins trimmed for authoritative map selection',async()=>{
    const s=socket(),client=new NetworkClient({reconnect:false,websocketFactory:()=>s.value});
    const pending=client.join('room',' A B!0_é ').catch(()=>undefined);s.open();
    expect(JSON.parse(s.sent.find(data=>JSON.parse(data).type==='join')!).name).toBe('A B!0_é');client.dispose();await pending;
  });
});
