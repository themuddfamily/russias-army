import {expect,test} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {PROTOCOL_VERSION} from '../shared/protocol';

test.setTimeout(90_000);
test.use({viewport:{width:1280,height:576}});

interface ReviewState {
  clientId:string;room:string;
  local:{x:number;y:number;z:number;health:number;alive:boolean};
  loadout:{ammo:Record<string,number>};
  movement:{grounded:boolean;velocity:{y:number}};
  originalScene:{colliding:boolean};
}

for(const map of ['barrack','woodlands'] as const){
test(`actual RG6 ground shot reaches authoritative ${map} snapshots`,async({page},testInfo)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const boosts=new Set<string>();
  const serverErrors:unknown[]=[],boostEvents:unknown[]=[],timeline:unknown[]=[];
  let localId='',authoritativePeak=0;
  page.on('websocket',socket=>{socket.on('framesent',frame=>{
    const message=JSON.parse(String(frame.payload));
    if(message.type==='transform'||message.type==='shoot')timeline.push({at:performance.now(),wallTime:Date.now(),sent:message});
  });socket.on('framereceived',frame=>{
    const message=JSON.parse(String(frame.payload));
    if(message.type==='event'&&message.event.type==='projectile_contact')boosts.add(message.event.data.projectileId);
    if(message.type==='event'&&message.event.type==='projectile_contact')boostEvents.push(message.event);
    if(message.type==='error')serverErrors.push(message);
    if(message.type==='error'||message.type==='event'&&message.event.type==='projectile_contact')timeline.push({at:performance.now(),wallTime:Date.now(),received:message});
    if(message.type==='snapshot'){
      const player=message.snapshot.players.find((player:{id:string})=>player.id===localId);
      if(player){authoritativePeak=Math.max(authoritativePeak,player.transform.position.y);timeline.push({at:performance.now(),snapshotTime:message.snapshot.serverTime,player:player.transform});}
    }
  });});
  await page.addInitScript(()=>{
    let locked:Element|null=null;
    Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});
    Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});
    Object.defineProperty(Document.prototype,'exitPointerLock',{configurable:true,value(){locked=null;document.dispatchEvent(new Event('pointerlockchange'));}});
  });
  await page.goto(`/?map=${map}&e2e=1&quality=low`);
  await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
  await page.locator('#mode-online').click();await page.locator('#deploy').click();
  await page.locator('#room-code').fill('JUMP'+Date.now().toString(36).toUpperCase());
  await page.locator('#join-room').click();
  await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected',{timeout:10_000});
  const read=()=>page.evaluate(()=>{
    const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{snapshot():ReviewState}}).__RA_MULTIPLAYER_DEBUG__;
    if(!debug)throw new Error('Gameplay snapshot missing');return debug.snapshot();
  });
  const before=await read();
  localId=before.clientId;authoritativePeak=before.local.y;
  // A second real WebSocket client observes server positions without allocating
  // another renderer. It sends no player movement or boost claims.
  await page.evaluate(async({room,protocol,map})=>{
    const state={latest:null as null|{players:Array<{id:string;transform:{position:{y:number}}}>},socket:new WebSocket('ws://127.0.0.1:8081')};
    (window as typeof window&{__RG6_OBSERVER__?:typeof state}).__RG6_OBSERVER__=state;
    await new Promise<void>((resolve,reject)=>{
      state.socket.onerror=()=>reject(new Error('Observer connection failed'));
      state.socket.onopen=()=>state.socket.send(JSON.stringify({type:'join',protocol,room,name:'OBSERVER',map}));
      state.socket.onmessage=event=>{
        const message=JSON.parse(event.data);
        if(message.type==='snapshot')state.latest=message.snapshot;
        if(message.type==='welcome')resolve();
      };
    });
  },{room:before.room,protocol:PROTOCOL_VERSION,map});
  await page.locator('#game canvas').click();
  await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.enableSourceCallbackCapture());
  await page.keyboard.down('KeyW');await page.keyboard.down('Space');
  let verified=false;
  try {
    await page.evaluate(()=>{
      const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{fireNetworkWeapon(weapon:'launcher',yaw:number,pitch:number):void}}).__RA_MULTIPLAYER_DEBUG__;
      if(!debug)throw new Error('Actual fire path missing');debug.fireNetworkWeapon('launcher',0,-1.5);
    });
    await expect.poll(()=>boosts.size,{timeout:10_000}).toBe(1);
    await expect.poll(async()=>(await read()).local.y,{timeout:10_000}).toBeGreaterThan(before.local.y+2);
    await expect.poll(()=>authoritativePeak,{timeout:10_000}).toBeGreaterThan(before.local.y+2);
    expect((await read()).loadout.ammo.launcher).toBe(5);
    expect((await read()).local.alive).toBe(true);
    await page.keyboard.up('Space');await page.keyboard.up('KeyW');
    await page.waitForTimeout(250);
    await expect.poll(async()=>{const current=await read();return current.movement.grounded&&current.movement.velocity.y===0&&!current.originalScene.colliding;},{timeout:5000}).toBe(true);
    expect(boosts.size).toBe(1);
    expect(serverErrors).toEqual([]);
    verified=true;
  } finally {
    const diagnostics=JSON.stringify({verified,before,boostEvents,serverErrors,authoritativePeak,timeline,local:await read(),callbackCapture:await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.readSourceCallbackCapture())},null,2);
    await testInfo.attach('RG6 live protocol diagnostics',{body:diagnostics,contentType:'application/json'});
    const captureOut=process.env.RA_FIDELITY_ARTIFACT_DIR??'artifacts/fidelity-review/2026-10-02/current';await mkdir(captureOut,{recursive:true});await writeFile(`${captureOut}/${map}-rg6-online-callback-capture.json`,diagnostics);
    if(verified){const out=process.env.RA_FIDELITY_ARTIFACT_DIR??'artifacts/fidelity-review/2026-09-30/current';await mkdir(out,{recursive:true});await writeFile(`${out}/${map}-rg6-jump.json`,diagnostics);}
    await page.keyboard.up('Space');await page.keyboard.up('KeyW');
    await page.evaluate(()=>{(window as typeof window&{__RG6_OBSERVER__?:{socket:WebSocket}}).__RG6_OBSERVER__?.socket.close();});
  }
  expect(errors).toEqual([]);
});
}

for(const map of ['barrack','woodlands'] as const){
  test(`actual solo RG6 contact jump rises and lands in ${map}`,async({page},testInfo)=>{
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{
      let locked:Element|null=null;
      Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});
      Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});
    });
    await page.goto(`/?map=${map}&e2e=1&quality=low`);
    await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
    await page.locator('#deploy').click();
    await page.evaluate(()=>{const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{setView(x:number,z:number,yaw:number,pitch:number):void;snapshot():ReviewState}}).__RA_MULTIPLAYER_DEBUG__!;const here=debug.snapshot().local;debug.setView(here.x,here.z,0,-1.5);});
    await page.waitForTimeout(1800);
    await page.locator('#game canvas').click();
    const initial=await page.evaluate(()=>{
      const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{setView(x:number,z:number,yaw:number,pitch:number):void;snapshot():ReviewState}}).__RA_MULTIPLAYER_DEBUG__;
      if(!debug)throw new Error('Actual game missing');
      const here=debug.snapshot().local;debug.setView(here.x,here.z,0,-1.5);
      (debug as any).enableSourceCallbackCapture();
      const before=debug.snapshot();
      const review={peak:before.local.y,initialY:before.local.y,initialHealth:before.local.health,survived:true};
      (window as typeof window&{__RG6_SOLO_REVIEW__?:typeof review}).__RG6_SOLO_REVIEW__=review;
      const sample=()=>{const state=debug.snapshot();review.peak=Math.max(review.peak,state.local.y);review.survived&&=state.local.alive;if(state.loadout.ammo.launcher<6)document.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}));requestAnimationFrame(sample);};requestAnimationFrame(sample);
      document.dispatchEvent(new KeyboardEvent('keydown',{code:'Digit4',bubbles:true}));
      document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',bubbles:true}));
      document.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',bubbles:true}));
      document.querySelector('#game canvas')!.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true}));
      return review;
    });
    try {
    await expect.poll(()=>page.evaluate(()=>{
      const w=window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{snapshot():ReviewState};__RG6_SOLO_REVIEW__?:{peak:number}};
      return w.__RA_MULTIPLAYER_DEBUG__!.snapshot().loadout.ammo.launcher;
    }),{timeout:5000}).toBe(5);
    await page.evaluate(()=>document.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true})));
    await expect.poll(()=>page.evaluate(()=>(window as typeof window&{__RG6_SOLO_REVIEW__?:{peak:number}}).__RG6_SOLO_REVIEW__!.peak),{timeout:5000}).toBeGreaterThan(initial.initialY+2);
    expect(await page.evaluate(()=>(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{snapshot():ReviewState}}).__RA_MULTIPLAYER_DEBUG__!.snapshot().local.alive)).toBe(true);
    await page.keyboard.up('Space');await page.keyboard.up('KeyW');
    await expect.poll(()=>page.evaluate(()=>{
      const current=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{snapshot():ReviewState}}).__RA_MULTIPLAYER_DEBUG__!.snapshot();
      return current.movement.grounded&&current.movement.velocity.y===0&&!current.originalScene.colliding;
    }),{timeout:5000}).toBe(true);
    expect(errors).toEqual([]);
    const evidence=await page.evaluate(()=>{
      const w=window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{snapshot():ReviewState};__RG6_SOLO_REVIEW__?:{peak:number;initialY:number;initialHealth:number;survived:boolean}};
      return {verified:true,review:w.__RG6_SOLO_REVIEW__,final:w.__RA_MULTIPLAYER_DEBUG__!.snapshot()};
    });
    expect(evidence.review?.survived).toBe(true);expect(evidence.final.loadout.ammo.launcher).toBe(5);expect(evidence.final.local.alive).toBe(true);
    const out=process.env.RA_FIDELITY_ARTIFACT_DIR??'artifacts/fidelity-review/2026-09-30/current';await mkdir(out,{recursive:true});await writeFile(`${out}/${map}-rg6-solo-jump.json`,JSON.stringify(evidence,null,2));
    } finally {
      const record=await page.evaluate(()=>({review:(window as any).__RG6_SOLO_REVIEW__,final:(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot(),callbackCapture:(window as any).__RA_MULTIPLAYER_DEBUG__.readSourceCallbackCapture()}));
      const diagnostics=JSON.stringify(record,null,2);await testInfo.attach('RG6 solo callback capture',{body:diagnostics,contentType:'application/json'});
      const out=process.env.RA_FIDELITY_ARTIFACT_DIR??'artifacts/fidelity-review/2026-10-02/current';await mkdir(out,{recursive:true});await writeFile(`${out}/${map}-rg6-solo-callback-capture.json`,diagnostics);
      await page.mouse.up();await page.keyboard.up('Space');await page.keyboard.up('KeyW');
    }
  });
}
