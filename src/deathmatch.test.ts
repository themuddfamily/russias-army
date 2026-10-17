import { describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { canCollectDrop,chooseSafestSpawn,dropExpired,rankStandings,recordElimination,standingPlace,winnerAtLimit } from './deathmatch';

describe('chooseSafestSpawn',()=>{
  it('chooses the point farthest from the nearest threat',()=>{
    const points=[new Vector3(0,0,0),new Vector3(10,0,0),new Vector3(30,0,0)];
    const result=chooseSafestSpawn(points,[new Vector3(2,0,0),new Vector3(12,0,0)]);
    expect(result.x).toBe(30);
  });

  it('returns a clone instead of mutating arena spawn data',()=>{
    const point=new Vector3(4,0,7);vi.spyOn(Math,'random').mockReturnValue(0);
    const result=chooseSafestSpawn([point],[]);result.x=99;
    expect(point.x).toBe(4);vi.restoreAllMocks();
  });
});

describe('deathmatch standings',()=>{
  const entries=[{id:'b',name:'B',frags:4,deaths:3},{id:'a',name:'A',frags:4,deaths:2},{id:'p',name:'YOU',frags:5,deaths:8}];
  it('ranks by frags, deaths, then stable id',()=>expect(rankStandings(entries).map(item=>item.id)).toEqual(['p','a','b']));
  it('finds placement by identity when another player uses the same display name',()=>{
    const duplicateNames=[
      {id:'remote',name:'YOU',frags:8,deaths:1},
      {id:'local',name:'YOU',frags:3,deaths:2},
    ];
    expect(standingPlace(duplicateNames,'local')).toBe(2);
    expect(standingPlace(duplicateNames,'missing')).toBe(0);
  });
  it('reconciles a winning kill before the next standings snapshot',()=>{
    const stale=[
      {id:'local',name:'YOU',frags:11,deaths:4},
      {id:'rival',name:'RIVAL',frags:11,deaths:2},
    ];
    expect(standingPlace(stale,'local')).toBe(2);
    const current=recordElimination(stale,'local','rival',12,3);
    expect(current).toEqual([
      {id:'local',name:'YOU',frags:12,deaths:4},
      {id:'rival',name:'RIVAL',frags:11,deaths:3},
    ]);
    expect(standingPlace(current,'local')).toBe(1);
  });
  it('returns a winner only at the configured frag limit',()=>{expect(winnerAtLimit(entries,6)).toBeUndefined();expect(winnerAtLimit(entries,5)?.id).toBe('p');});
});

describe('weapon drop lifecycle',()=>{
  it('requires horizontal and vertical proximity',()=>{const feet=new Vector3(0,0,0);expect(canCollectDrop(feet,new Vector3(1,0,0))).toBe(true);expect(canCollectDrop(feet,new Vector3(2,0,0))).toBe(false);expect(canCollectDrop(feet,new Vector3(.5,2,0))).toBe(false);});
  it('expires exactly at its deadline',()=>{expect(dropExpired(9.99,10)).toBe(false);expect(dropExpired(10,10)).toBe(true);});
});
