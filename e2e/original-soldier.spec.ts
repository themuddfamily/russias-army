import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
test.setTimeout(180_000);
test.use({viewport:{width:1280,height:720}});
type Snapshot={presentation:string;visibleMeshes:number;original:{bones:number;vertices:number;triangles:number;timeMs:number;alive:boolean;weapon:string;gunWorldScale:number[]}};
type SourcePose={yaw?:number;firing?:boolean;sourceWalkSeconds?:number;sourceDeathSeconds?:number};
type Review=Window&{__RA_MULTIPLAYER_DEBUG__:{setSoldierPresentation(distance:number,weapon:string,detail:string,pose?:SourcePose):void;soldierSnapshot():Snapshot}};
const out='artifacts/fidelity-review/2026-09-30/current';
for(const map of ['woodlands','barrack'])for(const quality of ['low','high'])test(`${map} ${quality} recovered GI and held guns render with source animation`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`/?map=${map}&quality=${quality}&e2e=1`);await expect(page.locator('#loading')).toHaveCount(0,{timeout:45_000});
  await page.locator('#deploy').click();await page.evaluate(()=>document.dispatchEvent(new Event('pointerlockerror')));
  await expect(page.locator('#pause')).toBeVisible();await page.addStyleTag({content:'#pause{visibility:hidden!important}'});await mkdir(out,{recursive:true});
  const samples:unknown[]=[];
  for(const weapon of ['pistol','shotgun','rifle','launcher','rpg','sniper']){
    const snapshot=await page.evaluate(w=>{const debug=(window as unknown as Review).__RA_MULTIPLAYER_DEBUG__;debug.setSoldierPresentation(4,w,'full',{yaw:.38});return debug.soldierSnapshot();},weapon);
    expect(snapshot).toMatchObject({presentation:'legacy',visibleMeshes:2,original:{bones:25,vertices:742,triangles:832,weapon,alive:true,timeMs:0}});
    for(const scale of snapshot.original.gunWorldScale)expect(scale).toBeCloseTo(1,7);
    await page.screenshot({path:`${out}/source-gi-${map}-${quality}-${weapon}.png`});samples.push({weapon,snapshot});
  }
  const poses:readonly [string,SourcePose][]=[['walk',{sourceWalkSeconds:.5}],['fire',{firing:true}],['death',{sourceDeathSeconds:1}],['removed',{sourceDeathSeconds:3}]];
  for(const [name,pose] of poses){
    const snapshot=await page.evaluate(p=>{const debug=(window as unknown as Review).__RA_MULTIPLAYER_DEBUG__;debug.setSoldierPresentation(4,'rifle','full',{yaw:.38,...p});return debug.soldierSnapshot();},pose);
    if(name==='walk')expect(snapshot.original.timeMs).toBeGreaterThan(0);
    if(name==='fire')expect(snapshot.original.timeMs).toBe(1000);
    if(name==='death'){expect(snapshot.original.alive).toBe(false);expect(snapshot.original.timeMs).toBeCloseTo(2640);expect(snapshot.visibleMeshes).toBe(1);}
    if(name==='removed')expect(snapshot.visibleMeshes).toBe(0);
    await page.screenshot({path:`${out}/source-gi-${map}-${quality}-${name}.png`});samples.push({name,snapshot});
  }
  await writeFile(`${out}/source-gi-${map}-${quality}.json`,JSON.stringify(samples,null,2));expect(errors).toEqual([]);
});
