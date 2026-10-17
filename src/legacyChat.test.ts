import { afterEach,describe,expect,it,vi } from 'vitest';
import { Game } from './game';
import {WeaponState} from './weapons';

function element(){
  const classes=new Set(['hidden']);
  return {value:'',textContent:'',focus:vi.fn(),blur:vi.fn(),classList:{add:(v:string)=>classes.add(v),remove:(v:string)=>classes.delete(v),contains:(v:string)=>classes.has(v)}};
}
function harness(){
  const form=element(),input=element(),capture=vi.fn(),exit=vi.fn();
  vi.stubGlobal('document',{pointerLockElement:{},exitPointerLock:exit,getElementById:(id:string)=>id==='chat-form'?form:input});
  const game=Object.create(Game.prototype) as {
    openChat():void;closeChat(capture?:boolean):void;sendChat():void;keyDown(event:KeyboardEvent):void;mouseDown(event:MouseEvent):void;
    chatOpen:boolean;keys:Set<string>;firing:boolean;aiming:boolean;rightMouseAiming:boolean;mode:string;
    network:{chat(text:string):boolean}|undefined;appendChat:ReturnType<typeof vi.fn>;
  };
  Object.assign(game,{phase:'playing',archivalWinter:false,arena:{runtime:{}},playerAlive:true,weaponState:new WeaponState('woodlands'),chatOpen:false,keys:new Set(['KeyW','ShiftLeft']),firing:true,aiming:true,rightMouseAiming:true,
    requestPointerCapture:capture,mode:'online',appendChat:vi.fn(),setMessage:vi.fn(),network:{chat:vi.fn(()=>true)}});
  return {game,form,input,capture,exit};
}
function key(code:string,ctrlKey=false){return {code,ctrlKey,metaKey:false,altKey:false,repeat:false,preventDefault:vi.fn(),stopImmediatePropagation:vi.fn()} as unknown as KeyboardEvent;}
afterEach(()=>vi.unstubAllGlobals());

describe('actual game chat input isolation',()=>{
  it('preserves source polling keys while opening a focused chat form',()=>{
    const {game,form,input,exit}=harness();game.openChat();
    expect(game.chatOpen).toBe(true);expect([...game.keys]).toEqual(['KeyW','ShiftLeft']);expect(game.firing).toBe(true);
    expect(game.aiming).toBe(false);expect(game.rightMouseAiming).toBe(true);
    expect(form.classList.contains('hidden')).toBe(false);expect(input.focus).toHaveBeenCalledOnce();expect(exit).not.toHaveBeenCalled();
    for(const code of ['KeyW','KeyR','Digit6','KeyG','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'])game.keyDown(key(code));
    expect([...game.keys]).toEqual(['KeyW','ShiftLeft','KeyR','Digit6','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
    game.closeChat(false);expect([...game.keys]).toEqual(['KeyW','ShiftLeft','KeyR','Digit6','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
  });
  it('retains source mouse motion collected before the talk form opens',()=>{
    const {game}=harness();Object.assign(game,{originalMouseDelta:{x:20,y:-8}});game.openChat();
    expect((game as unknown as {originalMouseDelta:{x:number;y:number}}).originalMouseDelta).toEqual({x:20,y:-8});
    Object.assign(game,{originalMouseDelta:{x:-10,y:4}});game.closeChat(false);
    expect((game as unknown as {originalMouseDelta:{x:number;y:number}}).originalMouseDelta).toEqual({x:-10,y:4});
  });
  it('keeps Winter chat releasing pointer capture and pending gameplay input',()=>{
    const {game,input,exit}=harness();Object.assign(game,{archivalWinter:true,originalMouseDelta:{x:20,y:-8}});game.openChat();
    expect(exit).toHaveBeenCalledOnce();expect(input.focus).toHaveBeenCalledOnce();expect(game.keys.size).toBe(0);expect(game.firing).toBe(false);
    expect((game as unknown as {originalMouseDelta:{x:number;y:number}}).originalMouseDelta).toEqual({x:0,y:0});
  });
  it('keeps browser-close shortcuts blocked while allowing text editing',()=>{
    const {game}=harness();game.openChat();
    game.keys.clear();const close=key('KeyW',true);game.keyDown(close);expect(close.preventDefault).toHaveBeenCalledOnce();expect(game.keys.has('KeyW')).toBe(false);
    const selectAll=key('KeyA',true);game.keyDown(selectAll);expect(selectAll.preventDefault).not.toHaveBeenCalled();expect(game.keys.has('KeyA')).toBe(false);
    const copy=key('KeyC',true);game.keyDown(copy);expect(copy.preventDefault).not.toHaveBeenCalled();
    const tab=key('KeyT',true);game.closeChat(false);game.keyDown(tab);
    expect(tab.preventDefault).toHaveBeenCalledOnce();expect(game.chatOpen).toBe(false);
  });
  it('records every source polled keyboard control during typing without dispatching edge actions',()=>{
    const {game}=harness();game.openChat();game.keys.clear();
    const switchWeapon=vi.fn(),reload=vi.fn(),throwGrenade=vi.fn();Object.assign(game,{switchWeapon,reload,throwGrenade});
    const controls=['KeyW','KeyS','KeyA','KeyD','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyR','ShiftLeft','ShiftRight','ControlLeft','ControlRight','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6'];
    for(const code of controls)game.keyDown(key(code,code.startsWith('Control')));
    for(const code of ['KeyG','KeyM'])game.keyDown(key(code));
    expect([...game.keys]).toEqual(controls);expect(switchWeapon).not.toHaveBeenCalled();expect(reload).not.toHaveBeenCalled();expect(throwGrenade).not.toHaveBeenCalled();
  });
  it.each(['ControlLeft','ControlRight'])('records standalone source %s before and during typing without treating it as a shortcut',code=>{
    const {game}=harness();game.keys.clear();game.keyDown(key(code,true));expect(game.keys.has(code)).toBe(true);
    expect((game as unknown as {setMessage:ReturnType<typeof vi.fn>}).setMessage).not.toHaveBeenCalled();
    game.openChat();expect(game.keys.has(code)).toBe(true);game.keys.delete(code);game.keyDown(key(code,true));expect(game.keys.has(code)).toBe(true);
    game.closeChat(false);expect(game.keys.has(code)).toBe(true);
  });
  it('keeps explicit focus and pause input release clearing keys',()=>{
    const {game}=harness();game.openChat();
    (game as unknown as {releaseActiveInput():void}).releaseActiveInput();expect(game.keys.size).toBe(0);
    game.closeChat(false);expect(game.keys.size).toBe(0);
  });
  it('records source mouse buttons during captured talk without losing text focus or aiming presentation',()=>{
    const {game,input}=harness(),surface={};Object.assign(game,{renderer:{domElement:surface},firing:false,rightMouseAiming:false});
    (document as unknown as {pointerLockElement:unknown}).pointerLockElement=surface;game.openChat();
    for(const button of [0,2]){const preventDefault=vi.fn();game.mouseDown({button,preventDefault} as unknown as MouseEvent);expect(preventDefault).toHaveBeenCalledOnce();}
    expect(game.firing).toBe(true);expect(game.rightMouseAiming).toBe(true);expect(game.aiming).toBe(false);expect(input.blur).not.toHaveBeenCalled();
    game.closeChat(false);expect(game.firing).toBe(true);expect(game.rightMouseAiming).toBe(true);
  });
  it('does not record source talk buttons without capture or after pausing/death',()=>{
    const {game}=harness(),surface={};Object.assign(game,{renderer:{domElement:surface},firing:false,rightMouseAiming:false});game.openChat();
    for(const state of [{phase:'playing',playerAlive:true,captured:false},{phase:'paused',playerAlive:true,captured:true},{phase:'playing',playerAlive:false,captured:true}]){
      Object.assign(game,state);(document as unknown as {pointerLockElement:unknown}).pointerLockElement=state.captured?surface:null;
      game.mouseDown({button:0,preventDefault:vi.fn()} as unknown as MouseEvent);game.mouseDown({button:2,preventDefault:vi.fn()} as unknown as MouseEvent);
      expect(game.firing).toBe(false);expect(game.rightMouseAiming).toBe(false);
    }
  });
  it('cannot resurrect mouse buttons cleared by a lifecycle input release while talk is open',()=>{
    const {game}=harness();game.openChat();expect(game.firing).toBe(true);expect(game.rightMouseAiming).toBe(true);
    (game as unknown as {releaseActiveInput():void}).releaseActiveInput();game.closeChat(false);
    expect(game.firing).toBe(false);expect(game.rightMouseAiming).toBe(false);
  });
  it('sends through authoritative transport and never invents a local online echo',()=>{
    const {game,input,capture,form}=harness();game.openChat();input.value='  hello comrades  ';game.sendChat();
    expect(game.network!.chat).toHaveBeenCalledWith('>>   hello comrades  ');expect(game.appendChat).not.toHaveBeenCalled();
    expect(input.value).toBe('');expect(game.chatOpen).toBe(false);expect(form.classList.contains('hidden')).toBe(true);expect(capture).toHaveBeenCalledOnce();
  });
  it('preserves text and focus after a disconnected send and cancels source typing with Tab',()=>{
    const {game,input,capture}=harness();game.openChat();game.network=undefined;input.value='retry me';game.sendChat();
    expect(game.chatOpen).toBe(true);expect(input.value).toBe('retry me');expect(capture).not.toHaveBeenCalled();
    game.keyDown(key('Tab'));expect(game.chatOpen).toBe(false);expect(capture).toHaveBeenCalledOnce();
  });
});
