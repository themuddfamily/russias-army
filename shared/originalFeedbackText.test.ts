import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {
  ORIGINAL_FEEDBACK_COLORS,ORIGINAL_FEEDBACK_MAX_LINES,ORIGINAL_FEEDBACK_RETURN,
  ORIGINAL_TALK_BACKSPACE_MIN_CHARACTERS,ORIGINAL_TALK_COLOR,ORIGINAL_TALK_MAX_CHARACTERS,
  ORIGINAL_TALK_PREFIX,originalPickupFeedback,originalFeedbackLines,originalFeedbackText,originalTalkFeedbackText,
} from './originalFeedbackText';

describe('recovered feedback and talk text',()=>{
  it.each(['barrack','woodland'])('%s independently matches recovered feedback, input and MUS handlers',edition=>{
    const root=`../docs/research-evidence/2026-09-30/director-script-extraction/${edition}/casts/parents/`;
    const goody=readFileSync(new URL(root+'ParentScript 5 - goody.ls',import.meta.url),'utf8');
    const feedback=goody.slice(goody.indexOf('on feedback me, news'),goody.indexOf('on stepFrame me'));
    expect(feedback).toContain('if not news = 0 then');
    expect(feedback.indexOf('playsound()')).toBeLessThan(feedback.indexOf('arse = news & RETURN'));
    expect(feedback).toContain('arse = news & RETURN & member("hints").text');
    expect(Number(feedback.match(/arse\.line\[1\.\.(\d+)\]/)![1])).toBe(ORIGINAL_FEEDBACK_MAX_LINES);
    const colors=[...feedback.matchAll(/\.color = rgb\((\d+), (\d+), (\d+)\)/g)]
      .map(match=>'#'+match.slice(1).map(value=>Number(value).toString(16).padStart(2,'0')).join(''));
    expect(colors).toEqual([ORIGINAL_FEEDBACK_COLORS.older,ORIGINAL_FEEDBACK_COLORS.newest]);
    expect(feedback).toContain('member("hints").line[1].color');
    const talk=goody.slice(goody.indexOf('on keytalk me'),goody.indexOf('on hitobj me'));
    expect(talk).toContain(`member("talk").text = "${ORIGINAL_TALK_PREFIX}"`);
    expect(Number(talk.match(/char\.count < (\d+)/)![1])).toBe(ORIGINAL_TALK_MAX_CHARACTERS);
    expect(Number(talk.match(/char\.count > (\d+)/)![1])).toBe(ORIGINAL_TALK_BACKSPACE_MIN_CHARACTERS);
    expect(talk).toContain('submitmus([#subject: "talk", #content: member("talk").text])');
    expect(talk.indexOf('if keyPressed(RETURN)')).toBeLessThan(talk.indexOf('if keyPressed(TAB)'));
    expect(talk).toContain('member("talk").text = member("talk").text & the keyPressed');
    const mus=readFileSync(new URL(root+'MovieScript 4 - M U S.ls',import.meta.url),'utf8');
    expect(mus).toContain('wri = vsend & ": " & data');
    expect(mus).toContain('goody.feedback(wri)');
    expect(mus.indexOf('if Msg.subject = "talk"')).toBeLessThan(mus.indexOf('if vsend <> nom'));
  });

  it.each(['barrack','woodland'])('%s pickup messages use recovered symbols and follow reload',edition=>{
    const root=`../docs/research-evidence/2026-09-30/director-script-extraction/${edition}/casts/parents/`;
    const pickups=readFileSync(new URL(root+'ParentScript 13 - pickups.ls',import.meta.url),'utf8');
    const goody=readFileSync(new URL(root+'ParentScript 5 - goody.ls',import.meta.url),'utf8');
    expect(pickups).toContain('news = "Ammo for the " & wrd2 & "."');
    expect(pickups.indexOf('goody.weaponry.reload()')).toBeLessThan(pickups.indexOf('goody.feedback(news)'));
    for(const [weapon,symbol] of [['pistol','pistol'],['shotgun','spas12'],['rifle','ak47'],['launcher','rg6'],['rpg','rpg'],['sniper','dragunov']] as const){
      expect(goody).toMatch(new RegExp('#'+symbol+': [0-9]+'));
      expect(originalPickupFeedback(weapon)).toBe(`Ammo for the ${symbol}.`);
    }
  });

  it('prepends new feedback and retains five logical lines, including multiline payloads',()=>{
    let text='';
    for(let number=1;number<=6;number++)text=originalFeedbackText(text,String(number));
    expect(text).toBe('6\r5\r4\r3\r2');
    expect(originalFeedbackText(text,'first\rsecond\rthird')).toBe('first\rsecond\rthird\r6\r5');
    expect(originalFeedbackLines(text)).toEqual(['6','5','4','3','2']);
  });

  it('retains plain text, blank logical lines, trailing RETURN and refresh sentinel distinctions',()=>{
    expect(ORIGINAL_FEEDBACK_RETURN).toBe('\r');
    expect(originalFeedbackText('older',0)).toBe('older');
    expect(originalFeedbackText('older','0')).toBe('0\rolder');
    expect(originalFeedbackText('older','')).toBe('\rolder');
    expect(originalFeedbackText('','Welcome')).toBe('Welcome\r');
    expect(originalFeedbackText('a\r\rb\rc\rd',' x ')).toBe(' x \ra\r\rb\rc');
    expect(originalFeedbackText('older','<b>unescaped</b>\nvisual line')).toBe('<b>unescaped</b>\nvisual line\rolder');
  });

  it('preserves sender and full talk member without trimming, censorship or dropping its prefix',()=>{
    expect(originalTalkFeedbackText('COMRADE','>> hello')).toBe('COMRADE: >> hello');
    expect(originalTalkFeedbackText('self','>> ')).toBe('self: >> ');
    expect(originalTalkFeedbackText('name','>>  0 ')).toBe('name: >>  0 ');
    expect(ORIGINAL_TALK_COLOR).toBe('#ff0000');
    expect(ORIGINAL_TALK_MAX_CHARACTERS-ORIGINAL_TALK_PREFIX.length).toBe(37);
    expect(ORIGINAL_TALK_MAX_CHARACTERS-ORIGINAL_TALK_BACKSPACE_MIN_CHARACTERS).toBe(38);
  });
});
