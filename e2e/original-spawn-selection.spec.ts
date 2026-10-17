import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {ORIGINAL_SOURCE_SPAWNS} from '../shared/originalMapProfile';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import '../server/original-scenes';
import {ORIGINAL_COLLISION_CONTACT_DISTANCE} from '../shared/originalExplosives';
import type {ServerMessage} from '../shared/protocol';

for(const map of ['barrack','woodlands'] as const)test(`${map} solo entry and Replay preserve all six randomly selected source poses`,async({page})=>{
  test.setTimeout(120_000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    const state=window as typeof window&{__SPAWN_RANDOM__:number};state.__SPAWN_RANDOM__=.01;
    Math.random=()=>state.__SPAWN_RANDOM__;
  });
  await page.goto(`/?map=${map}&quality=low&e2e=1`);
  await expect(page.locator('#loading')).toHaveCount(0,{timeout:45_000});
  const samples=[];
  for(let index=0;index<6;index++){
    const fraction=(index+.5)/6;
    await page.evaluate(value=>{(window as typeof window&{__SPAWN_RANDOM__:number}).__SPAWN_RANDOM__=value;},fraction);
    await page.locator('#deploy').click();
    // Pause before sampling so gravity does not turn a spawn pose into a route.
    await page.evaluate(()=>document.dispatchEvent(new Event('pointerlockerror')));
    const state=await page.evaluate(()=>window.__RA_MULTIPLAYER_DEBUG__!.snapshot());
    const source=ORIGINAL_SOURCE_SPAWNS[map][index];
    const settled=getOriginalMapRuntime(map).spawnPoints[index];
    // Even before pause, one live physics callback can settle a slope/wall.
    // Bound the actor displacement by the recovered contact distance.
    expect(Math.hypot(state.local.x-settled.x,state.local.z-settled.z)).toBeLessThan(ORIGINAL_COLLISION_CONTACT_DISTANCE);
    expect(state.local.yaw).toBeCloseTo(source.rotation[2]*Math.PI/180,7);
    expect(state.local.pitch).toBeCloseTo(source.rotation[0]*Math.PI/180,7);
    expect(state.loadout.equipped).toBe('launcher');
    samples.push({index,fraction,local:state.local,source});
    await page.evaluate(()=>window.__RA_MULTIPLAYER_DEBUG__!.setTransientPresentation('death'));
    await expect(page.locator('#result')).toBeVisible();
    await page.locator('#restart').click();
    await expect(page.locator('#menu-entry')).toBeVisible();
  }
  expect(errors).toEqual([]);
  const out='artifacts/fidelity-review/2026-10-01/current';await mkdir(out,{recursive:true});
  await writeFile(`${out}/${map}-source-random-spawn-replay.json`,JSON.stringify({verified:true,map,samples,errors},null,2)+'\n');
});

for(const map of ['barrack','woodlands'] as const)test(`${map} real authority chooses a recovered paired source pose`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const welcomes:Extract<ServerMessage,{type:'welcome'}>[]=[];
  page.on('websocket',socket=>socket.on('framereceived',frame=>{
    const message=JSON.parse(String(frame.payload)) as ServerMessage;
    if(message.type==='welcome')welcomes.push(message);
  }));
  await page.goto(`/?map=${map}&quality=low&e2e=1`);
  await expect(page.locator('#loading')).toHaveCount(0,{timeout:45_000});
  await page.locator('#mode-online').click();await page.locator('#deploy').click();
  await page.locator('#room-code').fill('SPAWN'+Date.now().toString(36));await page.locator('#join-room').click();
  await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');
  await expect.poll(()=>welcomes.length).toBe(1);
  await expect.poll(()=>page.evaluate(()=>window.__RA_MULTIPLAYER_DEBUG__!.snapshot().authoritativeLocal!==null)).toBe(true);
  const state=await page.evaluate(()=>window.__RA_MULTIPLAYER_DEBUG__!.snapshot());
  // Welcome records the exact initial choice; later snapshots have advanced
  // source gravity and contact resolution, so are not initialization records.
  const initial=welcomes[0].player.transform,position=initial.position;
  const index=getOriginalMapRuntime(map).spawnPoints.findIndex(p=>Math.hypot(p.x-position.x,p.z-position.z)<1e-7);
  expect(index).toBeGreaterThanOrEqual(0);
  const rotation=ORIGINAL_SOURCE_SPAWNS[map][index].rotation;
  expect(initial.yaw).toBeCloseTo(rotation[2]*Math.PI/180,7);
  expect(initial.pitch).toBeCloseTo(rotation[0]*Math.PI/180,7);
  expect(Math.hypot(state.local.x-position.x,state.local.z-position.z)).toBeLessThan(ORIGINAL_COLLISION_CONTACT_DISTANCE);
  expect(errors).toEqual([]);
  const out='artifacts/fidelity-review/2026-10-01/current';await mkdir(out,{recursive:true});
  await writeFile(`${out}/${map}-source-random-spawn-authority.json`,JSON.stringify({verified:true,map,index,initial,local:state.local,authority:state.authoritativeLocal,errors},null,2)+'\n');
});
