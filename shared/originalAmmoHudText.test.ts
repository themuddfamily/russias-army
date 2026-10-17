import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {ORIGINAL_AMMO_HUD_COLORS,ORIGINAL_AMMO_HUD_SLOTS,originalAmmoHudCounts,originalAmmoHudPrefix,originalAmmoHudText} from './originalAmmoHudText';

describe('recovered ammunition HUD text',()=>{
  it.each(['barrack','woodland'])('%s independently matches recovered slot order, inclusive padding and row colors',edition=>{
    const script=readFileSync(new URL(`../docs/research-evidence/2026-09-30/director-script-extraction/${edition}/casts/parents/ParentScript 6 - weaponry.ls`,import.meta.url),'utf8');
    const handler=script.slice(script.indexOf('on sortweapons me'),script.indexOf('on choosegun me'));
    const names=handler.match(/choice = \[([^\]]+)\]/)![1].match(/#[a-z0-9]+/g)!.map(name=>name.slice(1));
    expect(ORIGINAL_AMMO_HUD_SLOTS.map(entry=>entry.name)).toEqual(names);
    expect(handler).toContain('addstring = string(i) & ": " & vweap');
    expect(handler).toContain('moo = addstring.length');
    const paddingEnd=Number(handler.match(/repeat with len = moo to (\d+)/)![1]);
    expect(handler).toContain('addstring = addstring & SPACE');
    for(const [index,name] of names.entries()){
      let expected=`${index+1}: ${name}`;
      const originalLength=expected.length;
      for(let length=originalLength;length<=paddingEnd;length++)expected+=' ';
      expect(originalAmmoHudPrefix(ORIGINAL_AMMO_HUD_SLOTS[index].weapon)).toBe(expected);
    }
    expect(handler).toContain('cham = goody.chambers.getaProp(vweap) & " / " & goody.weapons.getaProp(vweap)');
    expect(handler).toContain('addstring & cham & RETURN');
    const colors=[...handler.matchAll(/member\("weapons"\)\.line\[i\]\.color = rgb\((\d+), (\d+), (\d+)\)/g)]
      .map(match=>'#'+match.slice(1).map(value=>Number(value).toString(16).padStart(2,'0')).join(''));
    expect(handler).toContain('if lin contains string(goody.weapon) then');
    expect(colors).toEqual([ORIGINAL_AMMO_HUD_COLORS.selected,ORIGINAL_AMMO_HUD_COLORS.other]);
  });

  it('maps browser weapon identifiers to source symbols without modern display names',()=>{
    expect(ORIGINAL_AMMO_HUD_SLOTS.map(entry=>[entry.weapon,entry.slot,entry.name])).toEqual([
      ['pistol',1,'pistol'],['shotgun',2,'spas12'],['rifle',3,'ak47'],
      ['launcher',4,'rg6'],['rpg',5,'rpg'],['sniper',6,'dragunov'],
    ]);
  });

  it('preserves live values without zero padding, clamping or historical stored ammunition',()=>{
    expect(originalAmmoHudCounts(0,0)).toBe('0 / 0');
    expect(originalAmmoHudCounts(-1,123456)).toBe('-1 / 123456');
    expect(originalAmmoHudCounts(2.5,1.25)).toBe('2.5 / 1.25');
    expect(originalAmmoHudText('sniper',30,12)).toBe('6: dragunov  30 / 12');
    expect(originalAmmoHudText('rifle',28,84)).toBe('3: ak47      28 / 84');
  });
});
