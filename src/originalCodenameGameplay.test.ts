import {afterEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {Game} from './game';
import {ORIGINAL_CODENAME_REJECTION} from '../shared/originalCodename';
interface Element {value:string;textContent:string;classList:{add:ReturnType<typeof vi.fn>;remove:ReturnType<typeof vi.fn>;toggle:ReturnType<typeof vi.fn>};focus:ReturnType<typeof vi.fn>;dataset:Record<string,string>}
function setup(map='barrack',mode='online',winter=false){
  const elements=new Map<string,Element>();
  const element=(id:string)=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',classList:{add:vi.fn(),remove:vi.fn(),toggle:vi.fn()},focus:vi.fn(),dataset:{}});return elements.get(id)!;};
  element('callsign').value='A B!0';element('room-code').value='BARRACK';
  vi.stubGlobal('document',{getElementById:element,pointerLockElement:null,fullscreenElement:null});
  const game=Object.create(Game.prototype) as any;
  Object.assign(game,{mapId:map,mode,archivalWinter:winter,phase:'menu',localCallsign:'A B!0',
    refreshRooms:vi.fn(),enterImmersiveMode:vi.fn(),connectOnline:vi.fn(),
    audio:{resume:vi.fn()},restartState:vi.fn(),clock:{getDelta:vi.fn()},appendChat:vi.fn(),
    closeChat:vi.fn(),releaseActiveInput:vi.fn(),releaseKeyboardCapture:vi.fn(),disconnectNetwork:vi.fn(),
    resetCombatPresentation:vi.fn(),snowTracks:{clear:vi.fn()},enemies:[],spawnEnemies:vi.fn(),updateNetworkStatus:vi.fn(),setMode:vi.fn()});
  return {game,element};
}
afterEach(()=>vi.unstubAllGlobals());
describe('actual Game source codename entry and Replay',()=>{
  for(const map of ['barrack','woodlands']){
    it(`${map} filters before room selection and uses the filtered name for online joining`,()=>{
      const {game,element}=setup(map);game.openRoomSelection();
      expect(element('callsign').value).toBe('AB0');expect(element('room-callsign').textContent).toBe('AB0');
      expect(element('menu').dataset.stage).toBe('rooms');game.start();
      expect(game.connectOnline).toHaveBeenCalledWith('BARRACK','AB0');expect(game.localCallsign).toBe('AB0');
    });
    it.each(['0','!!! é😀'])(`${map} rejects censored %s before room or solo start`,name=>{
      for(const mode of ['online','solo']){
        const {game,element}=setup(map,mode);element('callsign').value=name;
        if(mode==='online')game.openRoomSelection();else game.start();
        expect(element('callsign').value).toBe('');expect(element('entry-note').textContent).toBe(ORIGINAL_CODENAME_REJECTION);
        expect(game.restartState).not.toHaveBeenCalled();expect(game.connectOnline).not.toHaveBeenCalled();expect(game.enterImmersiveMode).not.toHaveBeenCalled();
        expect(element('callsign').focus).toHaveBeenCalled();
      }
    });
    it(`${map} solo uses the filtered name in its source welcome`,()=>{
      const {game}=setup(map,'solo');game.start();expect(game.localCallsign).toBe('AB0');
      expect(game.appendChat).toHaveBeenCalledWith('','Welcome to Russia Army, comrade AB0!','welcome');
    });
    it(`${map} Replay filters the prior actor name before returning to entry`,()=>{
      const {game,element}=setup(map);game.phase='lost';element('callsign').value='EDITED';game.returnToMenu();
      expect(element('callsign').value).toBe('AB0');expect(game.phase).toBe('menu');
      game.openRoomSelection();expect(element('room-callsign').textContent).toBe('AB0');
    });
    it(`${map} pins source verification at entry and Replay`,()=>{
      const edition=map==='woodlands'?'woodland':'barrack';const base=`../docs/research-evidence/2026-09-30/director-script-extraction/${edition}/casts/parents/`;
      const mus=readFileSync(new URL(base+'MovieScript 4 - M U S.ls',import.meta.url),'utf8');
      expect(mus).toContain('naughties = "abcdefghijklmnopqrstuvwxyz1234567890"');expect(mus).toContain('alert("Codename censored, try again.")');
      expect(readFileSync(new URL(base+'BehaviorScript 2 - flashlobby.ls',import.meta.url),'utf8')).toContain('nom = VerifyUserName(nom)');
      expect(readFileSync(new URL(base+'BehaviorScript 34 - endgame.ls',import.meta.url),'utf8')).toContain('member("rooms").text = VerifyUserName(nom)');
    });
  }
  it('preserves authored Winter names and Replay field behavior',()=>{
    const {game,element}=setup('barrack','online',true);game.openRoomSelection();expect(element('callsign').value).toBe('A B!0');
    game.start();expect(game.connectOnline).toHaveBeenCalledWith('BARRACK','A B!0');
    game.phase='lost';element('callsign').value='WINTER EDIT';game.returnToMenu();expect(element('callsign').value).toBe('WINTER EDIT');
  });
});
