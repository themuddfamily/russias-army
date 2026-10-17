import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {WeaponState} from './weapons';
import type {NetworkSnapshot} from './network';

interface TestElement {
  textContent:string;className:string;value:string;dataset:Record<string,string>;children:TestElement[];scrollTop:number;scrollHeight:number;
  blur:ReturnType<typeof vi.fn>;focus:ReturnType<typeof vi.fn>;
  classList:{add(value:string):unknown;remove(value:string):unknown;contains(value:string):boolean};
  replaceChildren(...rows:TestElement[]):void;
  append(row:TestElement):void;
}
function element():TestElement{
  const classes=new Set(['hidden']);
  return {textContent:'',className:'',value:'COMRADE',dataset:{},children:[],scrollTop:0,scrollHeight:0,blur:vi.fn(),focus:vi.fn(),
    classList:{add:(value:string)=>classes.add(value),remove:(value:string)=>classes.delete(value),contains:(value:string)=>classes.has(value)},
    replaceChildren(...rows:TestElement[]){this.children=rows;},append(row:TestElement){this.children.push(row);}};
}
interface MembersHarness {
  keyDown(event:KeyboardEvent):void;openChat():void;releaseActiveInput():void;showCurrentMembers():void;
  phase:string;playerAlive:boolean;chatOpen:boolean;archivalWinter:boolean;
  latestNetworkSnapshot?:NetworkSnapshot;keys:Set<string>;remotePlayers:Map<string,{name:string;sourceActorActive:boolean;alive?:boolean}>;
}
function harness(mode='online',archivalWinter=false){
  const elements=new Map<string,ReturnType<typeof element>>();
  const node=(id:string)=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)!;};
  vi.stubGlobal('document',{getElementById:node,createElement:()=>element(),pointerLockElement:null});
  const game=Object.create(Game.prototype) as MembersHarness;
  Object.assign(game,{phase:'playing',playerAlive:true,archivalWinter,mode,chatOpen:false,
    keys:new Set(),controlsPreset:'legacy',weaponState:new WeaponState(),rightMouseAiming:false,
    localCallsign:'COMRADE',remotePlayers:new Map(),network:{clientId:'local',room:'ROOM'},enemies:[{id:'bot-1',name:'VOLKOV',alive:true},{id:'bot-2',name:'ORLOV',alive:true}]});
  return {game,node};
}
function key(repeat=false){return {code:'KeyM',repeat,ctrlKey:false,altKey:false,metaKey:false,preventDefault:vi.fn()} as unknown as KeyboardEvent;}
function snapshot(names:Array<[string,string]>):NetworkSnapshot {
  return {room:'ROOM',tick:1,serverTime:1000,fragLimit:12,state:'playing',winnerId:null,projectiles:[],players:names.map(([id,name])=>({
    id,name,health:100,maxHealth:100,frags:0,deaths:0,alive:true,respawnAt:null,
    transform:{position:{x:0,y:0,z:35},velocity:{x:0,y:0,z:0},yaw:0,pitch:0,grounded:true,weapon:'rifle'},
  }))};
}
afterEach(()=>vi.unstubAllGlobals());
describe('source-supported M member feedback',()=>{
  it('writes raw current names through ordinary feedback instead of creating a roster window',()=>{
    const {game,node}=harness();game.latestNetworkSnapshot=snapshot([['local','STALE LOCAL'],['unregistered','SNAPSHOT ONLY']]);game.remotePlayers.set('visitor',{name:'<img src=x>',sourceActorActive:true});game.keys.add('KeyW');
    const lookup=vi.spyOn(document,'getElementById');
    const event=key();game.keyDown(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();expect(game.keys.has('KeyW')).toBe(true);
    expect(node('chat-log').children[0].textContent).toBe('Members: COMRADE <img src=x> ');
    expect(node('chat-log').children[0].className).toBe('feedback');
    expect(lookup.mock.calls.some(([id])=>id.startsWith('members-'))).toBe(false);
  });
  it('reads current actor registrations on fresh presses despite stale standings and suppresses repeats',()=>{
    const {game}=harness(),feedback=vi.fn();Object.assign(game,{appendChat:feedback});
    game.latestNetworkSnapshot=snapshot([['local','COMRADE']]);game.keyDown(key());
    game.keyDown(key(true));expect(feedback).toHaveBeenCalledOnce();
    game.remotePlayers.set('visitor',{name:'GUEST',sourceActorActive:true});game.keyDown(key());
    expect(feedback).toHaveBeenLastCalledWith('', 'Members: COMRADE GUEST ', 'feedback');
    game.latestNetworkSnapshot=snapshot([['local','STALE LOCAL'],['visitor','GUEST']]);game.remotePlayers.delete('visitor');game.keyDown(key());
    expect(feedback).toHaveBeenLastCalledWith('', 'Members: COMRADE ', 'feedback');
  });
  it('includes the offline callsign and current bots without invented original labels or statistics',()=>{
    const {game,node}=harness('solo'),feedback=vi.fn();Object.assign(game,{appendChat:feedback});
    node('callsign').value='OTHER EDIT';Object.assign(game,{localCallsign:'TEST PLAYER'});game.keyDown(key());
    expect(feedback).toHaveBeenCalledWith('', 'Members: TEST PLAYER VOLKOV ORLOV ', 'feedback');
  });
  it('includes pending death registration until actor deletion and omits retained corpse-only records',()=>{
    const {game}=harness(),feedback=vi.fn();Object.assign(game,{appendChat:feedback});
    const pending={name:'PENDING',alive:false,sourceActorActive:true};game.remotePlayers.set('pending',pending);
    game.remotePlayers.set('corpse',{name:'CORPSE',alive:false,sourceActorActive:false});game.keyDown(key());
    expect(feedback).toHaveBeenLastCalledWith('', 'Members: COMRADE PENDING ', 'feedback');
    pending.sourceActorActive=false;game.keyDown(key());expect(feedback).toHaveBeenLastCalledWith('', 'Members: COMRADE ', 'feedback');
    game.remotePlayers.delete('pending');game.keyDown(key());expect(feedback).toHaveBeenLastCalledWith('', 'Members: COMRADE ', 'feedback');
  });
  it('omits dead solo bots while keeping the captured local callsign',()=>{
    const {game,node}=harness('solo'),feedback=vi.fn();Object.assign(game,{appendChat:feedback,localCallsign:'SAVED',enemies:[{name:'LIVING',alive:true},{name:'DEAD',alive:false}]});
    node('callsign').value='EDITED';game.keyDown(key());expect(feedback).toHaveBeenCalledWith('', 'Members: SAVED LIVING ', 'feedback');
  });
  it('preserves the archival Winter snapshot roster when the feedback helper is invoked',()=>{
    const {game}=harness('online',true),feedback=vi.fn();Object.assign(game,{appendChat:feedback});
    game.latestNetworkSnapshot=snapshot([['local','WINTER NAME'],['standing','STANDING']]);game.remotePlayers.set('actor',{name:'ACTOR',sourceActorActive:true});
    game.showCurrentMembers();expect(feedback).toHaveBeenCalledWith('', 'Members: WINTER NAME STANDING ', 'feedback');
  });
  it('never turns M typed in chat into feedback or gameplay',()=>{
    const {game}=harness(),feedback=vi.fn();Object.assign(game,{appendChat:feedback});
    game.openChat();game.keyDown(key());expect(feedback).not.toHaveBeenCalled();expect(game.keys.size).toBe(0);
  });
  it('limits member feedback to a living default-map player during gameplay',()=>{
    for(const state of [{phase:'menu',playerAlive:true,archivalWinter:false},{phase:'paused',playerAlive:true,archivalWinter:false},
      {phase:'lost',playerAlive:false,archivalWinter:false},{phase:'playing',playerAlive:false,archivalWinter:false},
      {phase:'playing',playerAlive:true,archivalWinter:true}]){
      const {game}=harness(),feedback=vi.fn();Object.assign(game,{...state,appendChat:feedback});game.keyDown(key());expect(feedback).not.toHaveBeenCalled();
    }
  });
});
