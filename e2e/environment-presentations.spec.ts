import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

// Thirteen enhanced fixed-time captures exercise the full post stack serially,
// including elevated and grazing road-review views. SwiftShader needs roughly
// 190 seconds on the CI-sized viewport.
test.setTimeout(360_000);

type EnvironmentPreset = 'facade' | 'warehouse' | 'junction' | 'skyline' | 'road-overlook' | 'road-shoulder' | 'tower' | 'perimeter' | 'yard' | 'security' | 'props' | 'motorpool' | 'sandbags';

interface RenderStats {
  calls: number;
  triangles: number;
  points: number;
  geometries: number;
  textures: number;
}

interface EnvironmentSample {
  width: number;
  height: number;
  visiblePixels: number;
  luminanceRange: number;
  fifthPercentileLuminance: number;
  meanLuminance: number;
  deepBlackPixels: number;
  largestDeepBlackComponent: number;
}

interface BackdropDeltaSample {
  changedPixels: number;
  horizonPixels: number;
  changedColumns: number;
  p90Delta: number;
  horizonConcentration: number;
  abovePixels: number;
  belowPixels: number;
}

interface BackdropAppearanceSample {
  changedPixels: number;
  meanLuminance: number;
  paleRatio: number;
  brightRatio: number;
}

interface FoliageDeltaSample extends BackdropDeltaSample {
  horizontalSpan: number;
  largeComponents: number;
  secondLargestComponent: number;
}

interface PerimeterWallDeltaSample {
  changedPixels: number;
  wallBandPixels: number;
  nearFacePixels: number;
  changedColumns: number;
  horizontalSpan: number;
  p90Delta: number;
  wallConcentration: number;
  abovePixels: number;
  belowPixels: number;
}

interface PerimeterWallAppearanceSample {
  meanLuminance: number;
  tenthPercentileLuminance: number;
  ninetiethPercentileLuminance: number;
  luminanceSpread: number;
  luminanceDeviation: number;
  horizontalGradient: number;
}

type FacadeReviewView = 'front' | 'warehouse' | 'windows' | 'barracks' | 'infirmary';

interface FacadeDeltaSample {
  changedPixels:number;
  facadeBandPixels:number;
  changedColumns:number;
  horizontalSpan:number;
  p90Delta:number;
  facadeConcentration:number;
  skyPixels:number;
  groundPixels:number;
  largeComponents:number;
  visibleMeanLuminance:number;
  visibleTenthPercentile:number;
  deepBlackGrowth:number;
}

interface RenderPipelineState {
  enhanced: boolean;
  passes: string[];
  antialiasing: 'context-msaa' | 'smaa';
}

interface SunShadowState {
  enabled: boolean;
  mapSize: number;
  span: number;
  worldUnitsPerTexel: number;
  snappedCenter: { x: number; y: number; z: number };
  bias: number;
  normalBias: number;
  type: string;
}

interface MilitaryTransportState {
  quality: 'low' | 'high';
  transports: number;
  bodyParts: number;
  shellInstances: number;
  bodyInstances: number;
  drawCalls: number;
  geometries: number;
  textures: number;
  colliders: number;
  trianglesPerTransport: number;
}

interface SandbagBarrierState {
  quality: 'low' | 'high';
  bags: 6;
  drawCalls: 1;
  geometries: 1;
  colliders: 6;
  trianglesPerBag: number;
  submittedTriangles: number;
}

interface RoadSurfaceState {
  quality: 'low' | 'high';
  length: 145;
  nominalWidth: 13;
  nominalArea: 3_601;
  projectedArea: number;
  minimumClearWidth: number;
  maximumSurfaceHeight: number;
  surfaceTriangles: number;
  markingInstances: 92;
  repairInstances: number;
  drawCalls: number;
  geometries: number;
  colliders: 0;
  submittedTriangles: number;
}

interface SnowFieldState {
  quality: 'low' | 'high';
  vertices: number;
  triangles: number;
  drawCalls: 1;
  geometries: 1;
  ownedMaterials: 0;
  ownedTextures: 0;
  colliders: 0;
  maxHeight: 0;
}

interface WinterGroundReliefState {
  quality: 'high';
  patches: 88;
  sastrugiPatches: 64;
  windCrustPatches: 16;
  compactedPatches: 8;
  vertices: 84;
  submittedVertices: 7_392;
  trianglesPerPatch: 108;
  submittedTriangles: 9_504;
  drawCalls: 1;
  geometries: 1;
  ownedGeometries: 1;
  injectedMaterials: 1;
  ownedMaterials: 1;
  ownedTextures: 0;
  exclusions: number;
  colliders: 0;
  perFrameUpdates: 0;
  minHeight: -0.01;
  maxHeight: 0.04;
}

interface FoliageState {
  quality: 'low' | 'high';
  treeCount: 54;
  trunkInstances: 54;
  crownInstances: number;
  snowCapInstances: 54;
  totalInstances: number;
  drawBatches: 3;
  drawCalls: 3;
  geometries: 3;
  ownedGeometries: 3;
  materials: 3;
  ownedMaterials: 3;
  textures: 0;
  colliders: 0;
  uniqueTriangles: number;
  trianglesPerTree: number;
  submittedTriangles: number;
}

interface BuildingFacadeState {
  quality: 'low' | 'high';
  blueprint: {
    buildings: 4;
    entrances: 7;
    parts: 93;
    triangles: 1_116;
    buildingCounts: { 'block-01':18;barracks:25;warehouse:25;infirmary:25 };
    roleCounts: {
      'entrance-jamb':14;'entrance-lintel':7;threshold:7;'drain-grate':7;
      'drain-bar':14;drainpipe:4;'pipe-bracket':8;'pipe-outlet':4;
      conduit:8;'junction-box':4;indicator:4;'roof-flashing':8;'panel-joint':4;
    };
    materialCounts: { concrete:21;dark:46;accent:22;glass:4 };
  };
  authoritativeColliders: 46;
  presentation: null | {
    quality:'high';buildings:4;entrances:7;authoredParts:529;panelModules:170;
    corrugatedRuns:8;corrugatedSegments:628;windows:30;windowParts:240;
    serviceParts:87;weatheringPatches:24;panelTriangles:1_700;
    corrugatedTriangles:1_256;windowTriangles:2_880;serviceTriangles:1_044;
    weatheringTriangles:48;submittedTriangles:6_928;drawCalls:6;geometries:6;
    ownedGeometries:6;injectedMaterials:6;ownedMaterials:6;ownedTextures:0;
    colliders:0;perFrameUpdates:0;
    buildingParts:{'block-01':161;barracks:175;warehouse:81;infirmary:112};
    buildingTriangles:{'block-01':1_742;barracks:1_896;warehouse:2_072;infirmary:1_218};
    windowCounts:{'block-01':9;barracks:9;warehouse:6;infirmary:6};
    panelCounts:{'block-01':65;barracks:72;warehouse:0;infirmary:33};
    materialTriangles:{concrete:1_184;redSteel:732;corrugatedSteel:1_268;dark:3_072;glass:408;accent:264};
  };
}

const EXPECTED_FACADE_BLUEPRINT = {
  buildings:4,entrances:7,parts:93,triangles:1_116,
  buildingCounts:{'block-01':18,barracks:25,warehouse:25,infirmary:25},
  roleCounts:{
    'entrance-jamb':14,'entrance-lintel':7,threshold:7,'drain-grate':7,
    'drain-bar':14,drainpipe:4,'pipe-bracket':8,'pipe-outlet':4,conduit:8,
    'junction-box':4,indicator:4,'roof-flashing':8,'panel-joint':4,
  },
  materialCounts:{concrete:21,dark:46,accent:22,glass:4},
} as const;

interface PerimeterWallState {
  quality: 'low' | 'high';
  blueprint: {
    parts: number;
    triangles: number;
    panels: number;
    posts: 44;
    materialCounts: { concrete:number;dark:number;snow:number;accent:number };
  };
  authoritativeColliders: 4;
  presentation: null | {
    quality: 'high';
    authoredParts: 236;
    panelTriangles: 1_056;
    submittedTriangles: 2_832;
    drawCalls: 4;
    geometries: 4;
    ownedGeometries: 4;
    injectedMaterials: 4;
    ownedMaterials: 4;
    ownedTextures: 0;
    colliders: 0;
    perFrameUpdates: 0;
  };
}

interface ExteriorBackdropState {
  quality: 'low'|'high';
  terrainVertices: number;
  terrainTriangles: number;
  treesPerSide: number;
  treeCount: number;
  treeTrianglesPerInstance: number;
  treeInstances: number;
  forestBatches: 4;
  drawCalls: 5;
  geometries: 2;
  ownedMaterials: 1;
  ownedTextures: 0;
  colliders: 0;
  submittedTriangles: number;
}

const PRESENTATIONS: ReadonlyArray<{
  preset: EnvironmentPreset;
  maximumCalls: number;
  maximumTriangles: number;
}> = [
  // Segmented, feathered shoulder slush replaces a handful of long wedges in
  // the same draw. The modest triangle increase is deliberate visual breakup.
  { preset: 'facade', maximumCalls: 80, maximumTriangles: 23_500 },
  // Recalibrated for the verified shutter/interior and four-building utility
  // pass; these leave narrow headroom above the measured upgraded geometry.
  { preset: 'warehouse', maximumCalls: 62, maximumTriangles: 23_000 },
  { preset: 'junction', maximumCalls: 130, maximumTriangles: 26_500 },
  { preset: 'skyline', maximumCalls: 185, maximumTriangles: 30_000 },
  { preset: 'road-overlook', maximumCalls: 160, maximumTriangles: 28_500 },
  { preset: 'road-shoulder', maximumCalls: 160, maximumTriangles: 28_500 },
  { preset: 'tower', maximumCalls: 150, maximumTriangles: 26_000 },
  { preset: 'perimeter', maximumCalls: 130, maximumTriangles: 24_000 },
  // One shoulder/paint batch sits on the yard frustum boundary; allow the
  // measured 113-call frame plus one call while component draw caps stay exact.
  { preset: 'yard', maximumCalls: 114, maximumTriangles: 29_500 },
  { preset: 'security', maximumCalls: 70, maximumTriangles: 25_000 },
  // The integrated low-tier props frame measures 25,290 triangles after the
  // crowned-road milestone; the road itself remains independently capped at
  // 746 submitted triangles, so this narrow scene allowance cannot mask growth.
  { preset: 'props', maximumCalls: 100, maximumTriangles: 25_500 },
  { preset: 'motorpool', maximumCalls: 110, maximumTriangles: 27_500 },
  { preset: 'sandbags', maximumCalls: 70, maximumTriangles: 24_500 },
];

async function presentEnvironment(page: Page, preset: EnvironmentPreset): Promise<RenderStats> {
  return page.evaluate(async (selectedPreset) => {
    const debug = (window as typeof window & {
      __RA_MULTIPLAYER_DEBUG__?: {
        setEnvironmentPresentation(preset: EnvironmentPreset): void;
        snapshot(): { render: RenderStats };
      };
    }).__RA_MULTIPLAYER_DEBUG__;
    if (!debug) throw new Error('Environment presentation debug hook is unavailable.');

    debug.setEnvironmentPresentation(selectedPreset);
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    return debug.snapshot().render;
  }, preset);
}

async function measureRoadRenderDelta(page: Page): Promise<{ calls: number; triangles: number }> {
  return page.evaluate(async () => {
    const debug = (window as typeof window & {
      __RA_MULTIPLAYER_DEBUG__?: {
        setEnvironmentPresentation(preset: EnvironmentPreset): void;
        setRoadPresentationVisible(visible: boolean): void;
        setRoadPresentationIsolation(isolated: boolean): void;
        snapshot(): { render: RenderStats };
      };
    }).__RA_MULTIPLAYER_DEBUG__;
    if (!debug) throw new Error('Road presentation debug hooks are unavailable.');
    const frame = () => new Promise<RenderStats>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(debug.snapshot().render)));
    });
    debug.setEnvironmentPresentation('road-overlook');
    debug.setRoadPresentationIsolation(true);
    debug.setRoadPresentationVisible(false);
    const hidden = await frame();
    debug.setRoadPresentationVisible(true);
    const visible = await frame();
    debug.setRoadPresentationIsolation(false);
    return {
      calls: visible.calls - hidden.calls,
      triangles: visible.triangles - hidden.triangles,
    };
  });
}

async function capturePresentedCanvas(page: Page, preset: EnvironmentPreset): Promise<Buffer> {
  const dataUrl = await page.evaluate(async (selectedPreset) => {
    const debug = (window as typeof window & {
      __RA_MULTIPLAYER_DEBUG__?: {
        setEnvironmentPresentation(preset: EnvironmentPreset): void;
      };
    }).__RA_MULTIPLAYER_DEBUG__;
    if (!debug) throw new Error('Environment presentation debug hook is unavailable.');

    debug.setEnvironmentPresentation(selectedPreset);
    return new Promise<string>((resolve, reject) => {
      // The game loop was queued before this callback, so one animation frame
      // presents the new camera through the enhanced composer. Capture inside
      // that same frame while the default WebGL buffer is still populated.
      requestAnimationFrame(() => {
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
        if (!canvas) {
          reject(new Error('Environment presentation canvas is unavailable.'));
          return;
        }
        resolve(canvas.toDataURL('image/png'));
      });
    });
  }, preset);

  const separator = dataUrl.indexOf(',');
  if (separator < 0) throw new Error('Environment canvas returned an invalid PNG data URL.');
  return Buffer.from(dataUrl.slice(separator + 1), 'base64');
}

async function sampleScreenshot(page: Page, screenshot: Buffer): Promise<EnvironmentSample> {
  return page.evaluate(async (encodedScreenshot) => {
    const image = new Image();
    image.src = `data:image/png;base64,${encodedScreenshot}`;
    await image.decode();

    const sample = document.createElement('canvas');
    sample.width = 240;
    sample.height = 150;
    const context = sample.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Unable to create environment screenshot sampling context.');
    context.drawImage(image, 0, 0, sample.width, sample.height);

    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    let visiblePixels = 0;
    let minimumLuminance = 255;
    let maximumLuminance = 0;
    let luminanceSum = 0;
    const luminances: number[] = [];
    const deepBlack = new Uint8Array(sample.width * sample.height);
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      if (pixels[index + 3] > 0 && red + green + blue > 24) visiblePixels++;
      const luminance = Math.round(red * .2126 + green * .7152 + blue * .0722);
      const pixel = index / 4;
      luminances.push(luminance);
      luminanceSum += luminance;
      if (luminance <= 8) deepBlack[pixel] = 1;
      minimumLuminance = Math.min(minimumLuminance, luminance);
      maximumLuminance = Math.max(maximumLuminance, luminance);
    }

    luminances.sort((left, right) => left - right);
    const visited = new Uint8Array(deepBlack.length);
    let largestDeepBlackComponent = 0;
    for (let start = 0; start < deepBlack.length; start++) {
      if (!deepBlack[start] || visited[start]) continue;
      const queue = [start]; visited[start] = 1;
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const pixel = queue[cursor];
        const x = pixel % sample.width; const y = Math.floor(pixel / sample.width);
        const neighbours = [pixel - 1, pixel + 1, pixel - sample.width, pixel + sample.width];
        for (const neighbour of neighbours) {
          if (neighbour < 0 || neighbour >= deepBlack.length || visited[neighbour] || !deepBlack[neighbour]) continue;
          const nx = neighbour % sample.width; const ny = Math.floor(neighbour / sample.width);
          if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
          visited[neighbour] = 1; queue.push(neighbour);
        }
      }
      largestDeepBlackComponent = Math.max(largestDeepBlackComponent, queue.length);
    }

    return {
      width: image.width,
      height: image.height,
      visiblePixels,
      luminanceRange: maximumLuminance - minimumLuminance,
      fifthPercentileLuminance: luminances[Math.floor(luminances.length * .05)],
      meanLuminance: luminanceSum / luminances.length,
      deepBlackPixels: deepBlack.reduce((sum, value) => sum + value, 0),
      largestDeepBlackComponent,
    };
  }, screenshot.toString('base64'));
}

async function captureBackdropPair(
  page:Page,
  preset:EnvironmentPreset='skyline',
):Promise<{hidden:Buffer;visible:Buffer}>{
  const capture=async(visible:boolean,prepare:boolean):Promise<string>=>page.evaluate(async({visible,prepare,preset})=>{
    const debug=(window as typeof window&{
      __RA_MULTIPLAYER_DEBUG__?:{
        setEnvironmentPresentation(preset:EnvironmentPreset):void;
        setBackdropPresentationVisible(visible:boolean):void;
      };
    }).__RA_MULTIPLAYER_DEBUG__;
    if(!debug)throw new Error('Backdrop presentation debug hooks are unavailable.');
    if(prepare)debug.setEnvironmentPresentation(preset);
    debug.setBackdropPresentationVisible(visible);
    return new Promise<string>((resolve,reject)=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const canvas=document.querySelector<HTMLCanvasElement>('#game canvas');
      if(!canvas){reject(new Error('Backdrop presentation canvas is unavailable.'));return;}
      resolve(canvas.toDataURL('image/png'));
    })));
  },{visible,prepare,preset});
  const pair={hidden:await capture(false,true),visible:await capture(true,false)};
  const decode=(dataUrl:string):Buffer=>{
    const separator=dataUrl.indexOf(',');
    if(separator<0)throw new Error('Backdrop canvas returned an invalid PNG data URL.');
    return Buffer.from(dataUrl.slice(separator+1),'base64');
  };
  return {hidden:decode(pair.hidden),visible:decode(pair.visible)};
}

async function sampleBackdropAppearance(
  page:Page,
  hidden:Buffer,
  visible:Buffer,
):Promise<BackdropAppearanceSample>{
  return page.evaluate(async({hiddenData,visibleData})=>{
    const width=240;const height=150;
    const decode=async(data:string):Promise<ImageData>=>{
      const image=new Image();image.src=`data:image/png;base64,${data}`;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d',{willReadFrequently:true});
      if(!context)throw new Error('Backdrop appearance sampling canvas is unavailable.');
      context.drawImage(image,0,0,width,height);return context.getImageData(0,0,width,height);
    };
    const [before,after]=await Promise.all([decode(hiddenData),decode(visibleData)]);
    let changedPixels=0;let luminanceSum=0;let palePixels=0;let brightPixels=0;
    for(let pixel=0;pixel<width*height;pixel++){
      const offset=pixel*4;
      const redDelta=before.data[offset]-after.data[offset];
      const greenDelta=before.data[offset+1]-after.data[offset+1];
      const blueDelta=before.data[offset+2]-after.data[offset+2];
      const delta=Math.sqrt(redDelta*redDelta*.2126+greenDelta*greenDelta*.7152+blueDelta*blueDelta*.0722);
      if(delta<8)continue;
      const luminance=after.data[offset]*.2126+after.data[offset+1]*.7152+after.data[offset+2]*.0722;
      changedPixels++;luminanceSum+=luminance;
      if(luminance>=120)palePixels++;
      if(luminance>=145)brightPixels++;
    }
    return {
      changedPixels,
      meanLuminance:changedPixels?luminanceSum/changedPixels:0,
      paleRatio:changedPixels?palePixels/changedPixels:0,
      brightRatio:changedPixels?brightPixels/changedPixels:0,
    };
  },{hiddenData:hidden.toString('base64'),visibleData:visible.toString('base64')});
}

async function sampleBackdropDelta(page:Page,hidden:Buffer,visible:Buffer):Promise<BackdropDeltaSample>{
  return page.evaluate(async({hiddenData,visibleData})=>{
    const width=240;const height=150;
    const decode=async(data:string):Promise<ImageData>=>{
      const image=new Image();image.src=`data:image/png;base64,${data}`;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d',{willReadFrequently:true});
      if(!context)throw new Error('Backdrop sampling canvas is unavailable.');
      context.drawImage(image,0,0,width,height);return context.getImageData(0,0,width,height);
    };
    const [before,after]=await Promise.all([decode(hiddenData),decode(visibleData)]);
    const horizonTop=Math.floor(height*.2);const horizonBottom=Math.ceil(height*.62);
    const aboveBottom=Math.floor(height*.18);const belowTop=Math.ceil(height*.68);
    const columnHits=new Uint16Array(width);const deltas:number[]=[];
    let changedPixels=0;let horizonPixels=0;let abovePixels=0;let belowPixels=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const offset=(y*width+x)*4;
      const red=before.data[offset]-after.data[offset];
      const green=before.data[offset+1]-after.data[offset+1];
      const blue=before.data[offset+2]-after.data[offset+2];
      const delta=Math.sqrt(red*red*.2126+green*green*.7152+blue*blue*.0722);
      if(delta<8)continue;
      changedPixels++;deltas.push(delta);
      if(y>=horizonTop&&y<horizonBottom){horizonPixels++;columnHits[x]++;}
      if(y<aboveBottom)abovePixels++;
      if(y>=belowTop)belowPixels++;
    }
    deltas.sort((left,right)=>left-right);
    return {
      changedPixels,horizonPixels,
      changedColumns:Array.from(columnHits).filter((count)=>count>=2).length,
      p90Delta:deltas.length?deltas[Math.floor((deltas.length-1)*.9)]:0,
      horizonConcentration:changedPixels?horizonPixels/changedPixels:0,
      abovePixels,belowPixels,
    };
  },{hiddenData:hidden.toString('base64'),visibleData:visible.toString('base64')});
}

async function captureFoliagePair(page:Page):Promise<{hidden:Buffer;visible:Buffer}>{
  const capture=async(visible:boolean,prepare:boolean):Promise<string>=>page.evaluate(async({visible,prepare})=>{
    const debug=(window as typeof window&{
      __RA_MULTIPLAYER_DEBUG__?:{
        setEnvironmentPresentation(preset:EnvironmentPreset):void;
        setBackdropPresentationVisible(visible:boolean):void;
        setFoliagePresentationVisible(visible:boolean):void;
      };
    }).__RA_MULTIPLAYER_DEBUG__;
    if(!debug)throw new Error('Foliage presentation debug hooks are unavailable.');
    if(prepare)debug.setEnvironmentPresentation('perimeter');
    // The pale distant forest is intentionally stable context. This pair
    // isolates only the smaller, physically fogged pines around the arena.
    debug.setBackdropPresentationVisible(true);
    debug.setFoliagePresentationVisible(visible);
    return new Promise<string>((resolve,reject)=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const canvas=document.querySelector<HTMLCanvasElement>('#game canvas');
      if(!canvas){reject(new Error('Foliage presentation canvas is unavailable.'));return;}
      resolve(canvas.toDataURL('image/png'));
    })));
  },{visible,prepare});
  let hidden:string;
  let visible:string;
  try {
    hidden=await capture(false,true);
    visible=await capture(true,false);
  } finally {
    await page.evaluate(()=>{
      (window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{
        setFoliagePresentationVisible(visible:boolean):void;
      }}).__RA_MULTIPLAYER_DEBUG__?.setFoliagePresentationVisible(true);
    });
  }
  const decode=(dataUrl:string):Buffer=>{
    const separator=dataUrl.indexOf(',');
    if(separator<0)throw new Error('Foliage canvas returned an invalid PNG data URL.');
    return Buffer.from(dataUrl.slice(separator+1),'base64');
  };
  return {hidden:decode(hidden),visible:decode(visible)};
}

async function sampleFoliageDelta(page:Page,hidden:Buffer,visible:Buffer):Promise<FoliageDeltaSample>{
  return page.evaluate(async({hiddenData,visibleData})=>{
    const width=240;const height=150;
    const decode=async(data:string):Promise<ImageData>=>{
      const image=new Image();image.src=`data:image/png;base64,${data}`;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d',{willReadFrequently:true});
      if(!context)throw new Error('Foliage sampling canvas is unavailable.');
      context.drawImage(image,0,0,width,height);return context.getImageData(0,0,width,height);
    };
    const [before,after]=await Promise.all([decode(hiddenData),decode(visibleData)]);
    const horizonTop=Math.floor(height*.18);const horizonBottom=Math.ceil(height*.66);
    const aboveBottom=Math.floor(height*.12);const belowTop=Math.ceil(height*.72);
    const changed=new Uint8Array(width*height);const columnHits=new Uint16Array(width);const deltas:number[]=[];
    let changedPixels=0;let horizonPixels=0;let abovePixels=0;let belowPixels=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const pixel=y*width+x;const offset=pixel*4;
      const red=before.data[offset]-after.data[offset];
      const green=before.data[offset+1]-after.data[offset+1];
      const blue=before.data[offset+2]-after.data[offset+2];
      const delta=Math.sqrt(red*red*.2126+green*green*.7152+blue*blue*.0722);
      if(delta<8)continue;
      changed[pixel]=1;changedPixels++;deltas.push(delta);
      if(y>=horizonTop&&y<horizonBottom){horizonPixels++;columnHits[x]++;}
      if(y<aboveBottom)abovePixels++;
      if(y>=belowTop)belowPixels++;
    }
    const hitColumns=Array.from(columnHits,(count,index)=>({count,index})).filter(({count})=>count>=2);
    const visited=new Uint8Array(changed.length);const components:number[]=[];
    for(let start=0;start<changed.length;start++){
      if(!changed[start]||visited[start])continue;
      const queue=[start];visited[start]=1;
      for(let cursor=0;cursor<queue.length;cursor++){
        const pixel=queue[cursor];const x=pixel%width;const y=Math.floor(pixel/width);
        const neighbours=[pixel-1,pixel+1,pixel-width,pixel+width];
        for(const neighbour of neighbours){
          if(neighbour<0||neighbour>=changed.length||visited[neighbour]||!changed[neighbour])continue;
          const nx=neighbour%width;const ny=Math.floor(neighbour/width);
          if(Math.abs(nx-x)+Math.abs(ny-y)!==1)continue;
          visited[neighbour]=1;queue.push(neighbour);
        }
      }
      components.push(queue.length);
    }
    components.sort((left,right)=>right-left);deltas.sort((left,right)=>left-right);
    return {
      changedPixels,horizonPixels,changedColumns:hitColumns.length,
      horizontalSpan:hitColumns.length?hitColumns[hitColumns.length-1].index-hitColumns[0].index+1:0,
      p90Delta:deltas.length?deltas[Math.floor((deltas.length-1)*.9)]:0,
      horizonConcentration:changedPixels?horizonPixels/changedPixels:0,
      abovePixels,belowPixels,largeComponents:components.filter((size)=>size>=6).length,
      secondLargestComponent:components[1]??0,
    };
  },{hiddenData:hidden.toString('base64'),visibleData:visible.toString('base64')});
}

async function capturePerimeterWallPair(page:Page):Promise<{
  hidden:Buffer;
  visible:Buffer;
  renderDelta:{calls:number;triangles:number};
}>{
  const result=await page.evaluate(async()=>{
    const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{
      setEnvironmentPresentation(preset:EnvironmentPreset):void;
      setPerimeterWallDetailsVisible(visible:boolean):void;
      snapshot():{render:RenderStats};
    }}).__RA_MULTIPLAYER_DEBUG__;
    if(!debug)throw new Error('Perimeter wall review hooks are unavailable.');
    const capture=async(visible:boolean):Promise<{image:string;render:RenderStats}>=>{
      debug.setPerimeterWallDetailsVisible(visible);
      return new Promise((resolve,reject)=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
        const canvas=document.querySelector<HTMLCanvasElement>('#game canvas');
        if(!canvas){reject(new Error('Perimeter wall review canvas is unavailable.'));return;}
        resolve({image:canvas.toDataURL('image/png'),render:debug.snapshot().render});
      })));
    };
    debug.setEnvironmentPresentation('perimeter');
    try {
      const hidden=await capture(false);
      const visible=await capture(true);
      return {
        hidden:hidden.image,visible:visible.image,
        renderDelta:{calls:visible.render.calls-hidden.render.calls,triangles:visible.render.triangles-hidden.render.triangles},
      };
    } finally {
      debug.setPerimeterWallDetailsVisible(true);
    }
  });
  const decode=(dataUrl:string):Buffer=>{
    const separator=dataUrl.indexOf(',');
    if(separator<0)throw new Error('Perimeter wall canvas returned an invalid PNG data URL.');
    return Buffer.from(dataUrl.slice(separator+1),'base64');
  };
  return {hidden:decode(result.hidden),visible:decode(result.visible),renderDelta:result.renderDelta};
}

async function samplePerimeterWallDelta(
  page:Page,
  hidden:Buffer,
  visible:Buffer,
):Promise<PerimeterWallDeltaSample>{
  return page.evaluate(async({hiddenData,visibleData})=>{
    const width=240;const height=150;
    const decode=async(data:string):Promise<ImageData>=>{
      const image=new Image();image.src=`data:image/png;base64,${data}`;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d',{willReadFrequently:true});
      if(!context)throw new Error('Perimeter wall sampling canvas is unavailable.');
      context.drawImage(image,0,0,width,height);return context.getImageData(0,0,width,height);
    };
    const [before,after]=await Promise.all([decode(hiddenData),decode(visibleData)]);
    const columnHits=new Uint16Array(width);const deltas:number[]=[];
    let changedPixels=0;let wallBandPixels=0;let nearFacePixels=0;let abovePixels=0;let belowPixels=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const offset=(y*width+x)*4;
      const red=before.data[offset]-after.data[offset];
      const green=before.data[offset+1]-after.data[offset+1];
      const blue=before.data[offset+2]-after.data[offset+2];
      const delta=Math.sqrt(red*red*.2126+green*green*.7152+blue*blue*.0722);
      if(delta<8)continue;
      changedPixels++;deltas.push(delta);columnHits[x]++;
      const xNorm=x/width;const yNorm=y/height;
      if(yNorm>=.34&&yNorm<.66)wallBandPixels++;
      if(xNorm<=.66&&yNorm>=.36+.24*xNorm&&yNorm<=.65-.18*xNorm)nearFacePixels++;
      if(yNorm<.30)abovePixels++;
      if(yNorm>.72)belowPixels++;
    }
    const hitColumns=Array.from(columnHits,(count,index)=>({count,index})).filter(({count})=>count>=2);
    deltas.sort((left,right)=>left-right);
    return {
      changedPixels,wallBandPixels,nearFacePixels,changedColumns:hitColumns.length,
      horizontalSpan:hitColumns.length?hitColumns[hitColumns.length-1].index-hitColumns[0].index+1:0,
      p90Delta:deltas.length?deltas[Math.floor((deltas.length-1)*.9)]:0,
      wallConcentration:changedPixels?wallBandPixels/changedPixels:0,
      abovePixels,belowPixels,
    };
  },{hiddenData:hidden.toString('base64'),visibleData:visible.toString('base64')});
}

async function samplePerimeterWallAppearance(
  page:Page,
  visible:Buffer,
):Promise<PerimeterWallAppearanceSample>{
  return page.evaluate(async(encoded)=>{
    const image=new Image();image.src=`data:image/png;base64,${encoded}`;await image.decode();
    const width=240;const height=150;
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    if(!context)throw new Error('Perimeter wall appearance canvas is unavailable.');
    context.drawImage(image,0,0,width,height);const pixels=context.getImageData(0,0,width,height).data;
    const xStart=Math.floor(width*.02);const xEnd=Math.ceil(width*.27);
    const yStart=Math.floor(height*.43);const yEnd=Math.ceil(height*.59);
    const luminances:number[]=[];let sum=0;let gradientSum=0;let gradientCount=0;
    for(let y=yStart;y<yEnd;y++)for(let x=xStart;x<xEnd;x++){
      const offset=(y*width+x)*4;
      const luminance=pixels[offset]*.2126+pixels[offset+1]*.7152+pixels[offset+2]*.0722;
      luminances.push(luminance);sum+=luminance;
      if(x+1<xEnd){
        const next=offset+4;
        const nextLuminance=pixels[next]*.2126+pixels[next+1]*.7152+pixels[next+2]*.0722;
        gradientSum+=Math.abs(nextLuminance-luminance);gradientCount++;
      }
    }
    luminances.sort((left,right)=>left-right);
    const mean=sum/luminances.length;
    const deviation=Math.sqrt(luminances.reduce((total,value)=>total+(value-mean)**2,0)/luminances.length);
    const tenth=luminances[Math.floor((luminances.length-1)*.1)];
    const ninetieth=luminances[Math.floor((luminances.length-1)*.9)];
    return {
      meanLuminance:mean,tenthPercentileLuminance:tenth,ninetiethPercentileLuminance:ninetieth,
      luminanceSpread:ninetieth-tenth,luminanceDeviation:deviation,
      horizontalGradient:gradientCount?gradientSum/gradientCount:0,
    };
  },visible.toString('base64'));
}

async function captureBuildingFacadePair(page:Page,view:FacadeReviewView):Promise<{
  hidden:Buffer;visible:Buffer;renderDelta:{calls:number;triangles:number};
}>{
  const result=await page.evaluate(async(selectedView)=>{
    const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{
      setEnvironmentPresentation(preset:EnvironmentPreset):void;
      setView(x:number,z:number,yaw?:number,pitch?:number):void;
      setBuildingFacadeDetailsVisible(visible:boolean):void;
      snapshot():{render:RenderStats};
    }}).__RA_MULTIPLAYER_DEBUG__;
    if(!debug)throw new Error('Building façade review hooks are unavailable.');
    debug.setEnvironmentPresentation(selectedView==='warehouse'?'warehouse':'facade');
    if(selectedView==='windows')debug.setView(-21,-34,Math.PI,-.02);
    else if(selectedView==='barracks')debug.setView(24,35,0,.02);
    else if(selectedView==='infirmary')debug.setView(-26,38.5,0,.01);
    const capture=async(visible:boolean):Promise<{image:string;render:RenderStats}>=>{
      debug.setBuildingFacadeDetailsVisible(visible);
      return new Promise((resolve,reject)=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
        const canvas=document.querySelector<HTMLCanvasElement>('#game canvas');
        if(!canvas){reject(new Error('Building façade review canvas is unavailable.'));return;}
        resolve({image:canvas.toDataURL('image/png'),render:debug.snapshot().render});
      })));
    };
    try{
      const hidden=await capture(false);const visible=await capture(true);
      return {hidden:hidden.image,visible:visible.image,renderDelta:{
        calls:visible.render.calls-hidden.render.calls,
        triangles:visible.render.triangles-hidden.render.triangles,
      }};
    }finally{debug.setBuildingFacadeDetailsVisible(true);}
  },view);
  const decode=(dataUrl:string):Buffer=>{
    const separator=dataUrl.indexOf(',');
    if(separator<0)throw new Error('Building façade canvas returned an invalid PNG data URL.');
    return Buffer.from(dataUrl.slice(separator+1),'base64');
  };
  return {hidden:decode(result.hidden),visible:decode(result.visible),renderDelta:result.renderDelta};
}

async function sampleBuildingFacadeDelta(page:Page,hidden:Buffer,visible:Buffer):Promise<FacadeDeltaSample>{
  return page.evaluate(async({hiddenData,visibleData})=>{
    const width=240;const height=150;
    const decode=async(data:string):Promise<ImageData>=>{
      const image=new Image();image.src=`data:image/png;base64,${data}`;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d',{willReadFrequently:true});
      if(!context)throw new Error('Building façade sampling canvas is unavailable.');
      context.drawImage(image,0,0,width,height);return context.getImageData(0,0,width,height);
    };
    const [before,after]=await Promise.all([decode(hiddenData),decode(visibleData)]);
    const changed=new Uint8Array(width*height);const columnHits=new Uint16Array(width);const deltas:number[]=[];
    const visibleLuminances:number[]=[];let visibleLuminanceSum=0;
    let changedPixels=0;let facadeBandPixels=0;let skyPixels=0;let groundPixels=0;let deepBlackBefore=0;let deepBlackAfter=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const pixel=y*width+x;const offset=pixel*4;const xNorm=x/width;const yNorm=y/height;
      const beforeLum=before.data[offset]*.2126+before.data[offset+1]*.7152+before.data[offset+2]*.0722;
      const afterLum=after.data[offset]*.2126+after.data[offset+1]*.7152+after.data[offset+2]*.0722;
      if(xNorm>=.03&&xNorm<=.97&&yNorm>=.18&&yNorm<=.68){
        visibleLuminances.push(afterLum);visibleLuminanceSum+=afterLum;
        if(beforeLum<=8)deepBlackBefore++;if(afterLum<=8)deepBlackAfter++;
      }
      const red=before.data[offset]-after.data[offset];const green=before.data[offset+1]-after.data[offset+1];const blue=before.data[offset+2]-after.data[offset+2];
      const delta=Math.sqrt(red*red*.2126+green*green*.7152+blue*blue*.0722);
      if(delta<8)continue;
      changed[pixel]=1;changedPixels++;columnHits[x]++;deltas.push(delta);
      if(xNorm>=.03&&xNorm<=.97&&yNorm>=.18&&yNorm<=.68)facadeBandPixels++;
      if(yNorm<.12)skyPixels++;if(yNorm>.76)groundPixels++;
    }
    const components:number[]=[];const visited=new Uint8Array(changed.length);
    for(let start=0;start<changed.length;start++){
      if(!changed[start]||visited[start])continue;const queue=[start];visited[start]=1;
      for(let cursor=0;cursor<queue.length;cursor++){
        const pixel=queue[cursor];const x=pixel%width;const y=Math.floor(pixel/width);
        for(const neighbour of [pixel-1,pixel+1,pixel-width,pixel+width]){
          if(neighbour<0||neighbour>=changed.length||visited[neighbour]||!changed[neighbour])continue;
          const nx=neighbour%width;const ny=Math.floor(neighbour/width);
          if(Math.abs(nx-x)+Math.abs(ny-y)!==1)continue;visited[neighbour]=1;queue.push(neighbour);
        }
      }
      components.push(queue.length);
    }
    const hitColumns=Array.from(columnHits,(count,index)=>({count,index})).filter(({count})=>count>=2);
    deltas.sort((left,right)=>left-right);visibleLuminances.sort((left,right)=>left-right);
    return {
      changedPixels,facadeBandPixels,changedColumns:hitColumns.length,
      horizontalSpan:hitColumns.length?hitColumns[hitColumns.length-1].index-hitColumns[0].index+1:0,
      p90Delta:deltas.length?deltas[Math.floor((deltas.length-1)*.9)]:0,
      facadeConcentration:changedPixels?facadeBandPixels/changedPixels:0,skyPixels,groundPixels,
      largeComponents:components.filter((size)=>size>=8).length,
      visibleMeanLuminance:visibleLuminances.length?visibleLuminanceSum/visibleLuminances.length:0,
      visibleTenthPercentile:visibleLuminances.length?visibleLuminances[Math.floor((visibleLuminances.length-1)*.1)]:0,
      deepBlackGrowth:deepBlackAfter-deepBlackBefore,
    };
  },{hiddenData:hidden.toString('base64'),visibleData:visible.toString('base64')});
}

test('low-tier environment presentations remain readable and within their render budgets', async ({ page }, testInfo) => {
  const runtimeErrors: string[] = [];
  await page.addInitScript(() => {
    const state = window as typeof window & { __RA_ENVIRONMENT_CONTEXT_LOSSES__: string[] };
    state.__RA_ENVIRONMENT_CONTEXT_LOSSES__ = [];
    document.addEventListener('webglcontextlost', (event) => {
      const status = event as WebGLContextEvent;
      state.__RA_ENVIRONMENT_CONTEXT_LOSSES__.push(status.statusMessage || 'WebGL context lost');
    }, true);
  });
  page.on('pageerror', (error) => runtimeErrors.push(`page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
  });

  await page.goto('/?map=winter&quality=low&e2e=1');
  await expect(page.locator('#loading')).toHaveCount(0, { timeout: 10_000 });
  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible();
  await page.locator('#deploy').click();
  await expect(page.locator('#hud')).toBeVisible();

  // Freeze simulation before applying camera presets so bot movement, weapon
  // sway, and procedural effects cannot perturb captures or render budgets.
  await page.evaluate(() => document.dispatchEvent(new Event('pointerlockerror')));
  await expect(page.locator('#pause')).toBeVisible();
  await page.locator('#pause').evaluate((panel) => { panel.style.display = 'none'; });
  await mkdir('artifacts/environment-review', { recursive: true });

  const lowPipeline = await page.evaluate(() => (
    window as typeof window & {
      __RA_MULTIPLAYER_DEBUG__?: { snapshot(): { renderPipeline: RenderPipelineState; sunShadow: SunShadowState; militaryTransport: MilitaryTransportState; sandbagBarrier: SandbagBarrierState; roadSurface: RoadSurfaceState; snowField: SnowFieldState; winterGroundRelief:WinterGroundReliefState|null; authoritativeColliders:number; foliage:FoliageState; buildingFacade:BuildingFacadeState; perimeterWall:PerimeterWallState; exteriorBackdrop:ExteriorBackdropState } };
    }
  ).__RA_MULTIPLAYER_DEBUG__?.snapshot());
  expect(lowPipeline?.sunShadow).toMatchObject({
    enabled: false,
    mapSize: 2048,
    span: 88,
    worldUnitsPerTexel: 88 / 2048,
    bias: -.00008,
    normalBias: .025,
    type: 'PCFSoftShadowMap',
  });
  expect(lowPipeline?.renderPipeline).toEqual({ enhanced: false, passes: [], antialiasing: 'context-msaa' });
  expect(lowPipeline?.militaryTransport).toMatchObject({
    quality: 'low',
    transports: 1,
    bodyParts: 21,
    shellInstances: 21,
    bodyInstances: 21,
    drawCalls: 2,
    geometries: 2,
    textures: 0,
    colliders: 1,
  });
  expect(lowPipeline?.militaryTransport.trianglesPerTransport).toBeLessThanOrEqual(1_200);
  expect(lowPipeline?.sandbagBarrier).toEqual({
    quality: 'low', bags: 6, drawCalls: 1, geometries: 1, colliders: 6,
    trianglesPerBag: 96, submittedTriangles: 576,
  });
  expect(lowPipeline?.roadSurface).toEqual({
    quality: 'low', length: 145, nominalWidth: 13, nominalArea: 3_601,
    projectedArea: 3_601, minimumClearWidth: 13, maximumSurfaceHeight: .015,
    surfaceTriangles: 10, markingInstances: 92, repairInstances: 0,
    drawCalls: 2, geometries: 2, colliders: 0, submittedTriangles: 746,
  });
  expect(lowPipeline?.snowField).toEqual({
    quality: 'low', vertices: 4, triangles: 2, drawCalls: 1, geometries: 1,
    ownedMaterials: 0, ownedTextures: 0, colliders: 0, maxHeight: 0,
  });
  expect(lowPipeline?.winterGroundRelief).toBeNull();
  expect(lowPipeline?.authoritativeColliders).toBe(95);
  expect(lowPipeline?.foliage).toEqual({
    quality:'low',treeCount:54,trunkInstances:54,crownInstances:216,
    snowCapInstances:54,totalInstances:324,drawBatches:3,drawCalls:3,
    geometries:3,ownedGeometries:3,materials:3,ownedMaterials:3,textures:0,
    colliders:0,uniqueTriangles:55,trianglesPerTree:109,submittedTriangles:5_886,
  });
  expect(lowPipeline?.buildingFacade).toEqual({
    quality:'low',blueprint:EXPECTED_FACADE_BLUEPRINT,authoritativeColliders:46,presentation:null,
  });
  expect(lowPipeline?.perimeterWall).toEqual({
    quality:'low',
    blueprint:{parts:100,triangles:1_200,panels:4,posts:44,materialCounts:{concrete:48,dark:4,snow:44,accent:4}},
    authoritativeColliders:4,presentation:null,
  });
  expect(lowPipeline?.exteriorBackdrop).toEqual({
    quality:'low',terrainVertices:260,terrainTriangles:384,treesPerSide:36,
    treeCount:144,treeTrianglesPerInstance:32,treeInstances:144,forestBatches:4,
    drawCalls:5,geometries:2,ownedMaterials:1,ownedTextures:0,colliders:0,submittedTriangles:4_992,
  });
  expect(await measureRoadRenderDelta(page)).toEqual({ calls: 2, triangles: 746 });

  for (const presentation of PRESENTATIONS) {
    const render = await presentEnvironment(page, presentation.preset);
    const screenshot = await canvas.screenshot({
      path: `artifacts/environment-review/low-${presentation.preset}.png`,
      animations: 'disabled',
    });
    const sample = await sampleScreenshot(page, screenshot);

    await testInfo.attach(`low-environment-${presentation.preset}`, {
      body: screenshot,
      contentType: 'image/png',
    });

    expect.soft(sample.width, `${presentation.preset} capture width`).toBeGreaterThanOrEqual(1_000);
    expect.soft(sample.height, `${presentation.preset} capture height`).toBeGreaterThanOrEqual(600);
    // Dark warehouse cladding intentionally occupies much of that preset.
    // Half of this 96x60 probe still proves a populated frame without treating
    // authored near-black surfaces as missing pixels.
    expect.soft(sample.visiblePixels, `${presentation.preset} should not render a blank canvas`).toBeGreaterThan(3_000);
    expect.soft(sample.luminanceRange, `${presentation.preset} should preserve scene contrast`).toBeGreaterThan(45);
    expect.soft(render.calls, `${presentation.preset} draw-call ceiling`).toBeLessThanOrEqual(presentation.maximumCalls+lowPipeline!.exteriorBackdrop.drawCalls);
    expect.soft(render.triangles, `${presentation.preset} triangle ceiling`).toBeLessThanOrEqual(presentation.maximumTriangles+lowPipeline!.exteriorBackdrop.submittedTriangles);
    expect.soft(render.geometries, `${presentation.preset} geometry ceiling`).toBeLessThanOrEqual(305);
    expect.soft(render.textures, `${presentation.preset} texture ceiling`).toBeLessThanOrEqual(32);
    expect.soft(render.points, `${presentation.preset} particle-point ceiling`).toBeLessThanOrEqual(600);
  }


  const lowBackdropPair=await captureBackdropPair(page);
  const lowBackdropDelta=await sampleBackdropDelta(page,lowBackdropPair.hidden,lowBackdropPair.visible);
  await writeFile('artifacts/environment-review/low-backdrop-hidden.png',lowBackdropPair.hidden);
  await writeFile('artifacts/environment-review/low-backdrop-skyline.png',lowBackdropPair.visible);
  await testInfo.attach('low-backdrop-skyline',{body:lowBackdropPair.visible,contentType:'image/png'});
  // Foreground roofs occlude much of this hero horizon; 80 sampled columns
  // still require a forest contribution across at least one third of the full
  // frame rather than a token cluster in the central opening.
  expect(lowBackdropDelta.changedColumns,`low backdrop horizon coverage ${JSON.stringify(lowBackdropDelta)}`).toBeGreaterThanOrEqual(80);
  expect(lowBackdropDelta.horizonPixels,`low backdrop horizon pixels ${JSON.stringify(lowBackdropDelta)}`).toBeGreaterThanOrEqual(400);
  expect(lowBackdropDelta.p90Delta,'low backdrop visibility').toBeGreaterThanOrEqual(10);
  expect(lowBackdropDelta.horizonConcentration,'low backdrop horizon concentration').toBeGreaterThanOrEqual(.7);
  expect(lowBackdropDelta.abovePixels,'low backdrop sky intrusion').toBeLessThanOrEqual(180);
  expect(lowBackdropDelta.belowPixels,'low backdrop foreground intrusion').toBeLessThanOrEqual(360);

  const contextLosses = await page.evaluate(() => (
    window as typeof window & { __RA_ENVIRONMENT_CONTEXT_LOSSES__: string[] }
  ).__RA_ENVIRONMENT_CONTEXT_LOSSES__);
  expect(contextLosses).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

test('high-tier environment presentations remain readable in the enhanced renderer', async ({ page }, testInfo) => {
  const runtimeErrors: string[] = [];
  await page.addInitScript(() => {
    const state = window as typeof window & { __RA_ENVIRONMENT_CONTEXT_LOSSES__: string[] };
    state.__RA_ENVIRONMENT_CONTEXT_LOSSES__ = [];
    document.addEventListener('webglcontextlost', (event) => {
      const status = event as WebGLContextEvent;
      state.__RA_ENVIRONMENT_CONTEXT_LOSSES__.push(status.statusMessage || 'WebGL context lost');
    }, true);
  });
  page.on('pageerror', (error) => runtimeErrors.push(`page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
  });

  await page.goto('/?map=winter&quality=high&e2e=1');
  await expect(page.locator('#loading')).toHaveCount(0, { timeout: 15_000 });
  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible();
  await page.locator('#deploy').click();
  await expect(page.locator('#hud')).toBeVisible();

  await page.evaluate(() => document.dispatchEvent(new Event('pointerlockerror')));
  await expect(page.locator('#pause')).toBeVisible();
  await page.locator('#pause').evaluate((panel) => { panel.style.display = 'none'; });
  await mkdir('artifacts/environment-review', { recursive: true });

  const highPipeline = await page.evaluate(() => (
    window as typeof window & {
      __RA_MULTIPLAYER_DEBUG__?: { snapshot(): { renderPipeline: RenderPipelineState; sunShadow: SunShadowState; militaryTransport: MilitaryTransportState; sandbagBarrier: SandbagBarrierState; roadSurface: RoadSurfaceState; snowField: SnowFieldState; winterGroundRelief:WinterGroundReliefState|null; authoritativeColliders:number; foliage:FoliageState; buildingFacade:BuildingFacadeState; perimeterWall:PerimeterWallState; exteriorBackdrop:ExteriorBackdropState } };
    }
  ).__RA_MULTIPLAYER_DEBUG__?.snapshot());
  expect(highPipeline?.renderPipeline).toMatchObject({
    enhanced: true,
    passes: ['RenderPass', 'GTAOPass', 'UnrealBloomPass', 'SMAAPass', 'OutputPass'],
    antialiasing: 'smaa',
  });
  expect(highPipeline?.sunShadow).toMatchObject({
    enabled: true,
    mapSize: 2048,
    span: 88,
    worldUnitsPerTexel: 88 / 2048,
    bias: -.00008,
    normalBias: .025,
    type: 'PCFSoftShadowMap',
  });
  expect(highPipeline?.militaryTransport).toMatchObject({
    quality: 'high',
    transports: 1,
    shellInstances: 1,
    bodyInstances: 1,
    drawCalls: 2,
    geometries: 2,
    textures: 0,
    colliders: 1,
  });
  expect(highPipeline?.militaryTransport.bodyParts).toBeGreaterThan(20);
  expect(highPipeline?.militaryTransport.trianglesPerTransport).toBeLessThanOrEqual(1_800);
  expect(highPipeline?.sandbagBarrier).toEqual({
    quality: 'high', bags: 6, drawCalls: 1, geometries: 1, colliders: 6,
    trianglesPerBag: 206, submittedTriangles: 1_236,
  });
  expect(highPipeline?.roadSurface).toEqual({
    quality: 'high', length: 145, nominalWidth: 13, nominalArea: 3_601,
    projectedArea: 3_588, minimumClearWidth: 12.846365, maximumSurfaceHeight: .055,
    surfaceTriangles: 1_664, markingInstances: 92, repairInstances: 12,
    drawCalls: 3, geometries: 3, colliders: 0, submittedTriangles: 2_496,
  });
  expect(highPipeline?.snowField).toEqual({
    quality: 'high', vertices: 2_401, triangles: 4_608, drawCalls: 1, geometries: 1,
    ownedMaterials: 0, ownedTextures: 0, colliders: 0, maxHeight: 0,
  });
  expect(highPipeline?.winterGroundRelief).toEqual({
    quality:'high',patches:88,sastrugiPatches:64,windCrustPatches:16,compactedPatches:8,
    vertices:84,submittedVertices:7_392,trianglesPerPatch:108,submittedTriangles:9_504,
    drawCalls:1,geometries:1,ownedGeometries:1,injectedMaterials:1,ownedMaterials:1,
    ownedTextures:0,exclusions:105,colliders:0,perFrameUpdates:0,minHeight:-.01,maxHeight:.04,
  });
  expect(highPipeline?.authoritativeColliders).toBe(95);
  expect(highPipeline?.foliage).toEqual({
    quality:'high',treeCount:54,trunkInstances:54,crownInstances:54,
    snowCapInstances:54,totalInstances:162,drawBatches:3,drawCalls:3,
    geometries:3,ownedGeometries:3,materials:3,ownedMaterials:3,textures:0,
    colliders:0,uniqueTriangles:172,trianglesPerTree:172,submittedTriangles:9_288,
  });
  expect(highPipeline?.buildingFacade).toEqual({
    quality:'high',blueprint:EXPECTED_FACADE_BLUEPRINT,authoritativeColliders:46,
    presentation:{
      quality:'high',buildings:4,entrances:7,authoredParts:529,panelModules:170,
      corrugatedRuns:8,corrugatedSegments:628,windows:30,windowParts:240,
      serviceParts:87,weatheringPatches:24,panelTriangles:1_700,
      corrugatedTriangles:1_256,windowTriangles:2_880,serviceTriangles:1_044,
      weatheringTriangles:48,submittedTriangles:6_928,drawCalls:6,geometries:6,
      ownedGeometries:6,injectedMaterials:6,ownedMaterials:6,ownedTextures:0,
      colliders:0,perFrameUpdates:0,
      buildingParts:{'block-01':161,barracks:175,warehouse:81,infirmary:112},
      buildingTriangles:{'block-01':1_742,barracks:1_896,warehouse:2_072,infirmary:1_218},
      windowCounts:{'block-01':9,barracks:9,warehouse:6,infirmary:6},
      panelCounts:{'block-01':65,barracks:72,warehouse:0,infirmary:33},
      materialTriangles:{concrete:1_184,redSteel:732,corrugatedSteel:1_268,dark:3_072,glass:408,accent:264},
    },
  });
  expect(highPipeline?.perimeterWall).toEqual({
    quality:'high',
    blueprint:{parts:236,triangles:2_832,panels:88,posts:44,materialCounts:{concrete:144,dark:44,snow:44,accent:4}},
    authoritativeColliders:4,
    presentation:{quality:'high',authoredParts:236,panelTriangles:1_056,submittedTriangles:2_832,
      drawCalls:4,geometries:4,ownedGeometries:4,injectedMaterials:4,ownedMaterials:4,
      ownedTextures:0,colliders:0,perFrameUpdates:0},
  });
  expect(highPipeline?.exteriorBackdrop).toEqual({
    quality:'high',terrainVertices:500,terrainTriangles:768,treesPerSide:40,
    treeCount:160,treeTrianglesPerInstance:84,treeInstances:160,forestBatches:4,
    drawCalls:5,geometries:2,ownedMaterials:1,ownedTextures:0,colliders:0,submittedTriangles:14_208,
  });
  const highRoadDelta = await measureRoadRenderDelta(page);
  expect(highRoadDelta.calls).toBeGreaterThanOrEqual(3);
  expect(highRoadDelta.calls).toBeLessThanOrEqual(6);
  expect(highRoadDelta.triangles).toBeGreaterThanOrEqual(2_496);
  expect(highRoadDelta.triangles).toBeLessThanOrEqual(5_000);

  for (const presentation of PRESENTATIONS) {
    const screenshot = await capturePresentedCanvas(page, presentation.preset);
    await writeFile(`artifacts/environment-review/high-${presentation.preset}.png`, screenshot);
    const sample = await sampleScreenshot(page, screenshot);
    const render = await page.evaluate(() => (
      window as typeof window & {
        __RA_MULTIPLAYER_DEBUG__?: { snapshot(): { render: RenderStats } };
      }
    ).__RA_MULTIPLAYER_DEBUG__?.snapshot().render);

    await testInfo.attach(`high-environment-${presentation.preset}`, {
      body: screenshot,
      contentType: 'image/png',
    });

    expect.soft(sample.width, `${presentation.preset} high-tier capture width`).toBeGreaterThanOrEqual(1_000);
    expect.soft(sample.height, `${presentation.preset} high-tier capture height`).toBeGreaterThanOrEqual(600);
    expect.soft(sample.visiblePixels, `${presentation.preset} high-tier canvas should not be blank`).toBeGreaterThan(5_000);
    expect.soft(sample.luminanceRange, `${presentation.preset} high-tier scene should preserve contrast`).toBeGreaterThan(45);
    if (['road-overlook', 'road-shoulder', 'yard'].includes(presentation.preset)) {
      expect.soft(sample.fifthPercentileLuminance, `${presentation.preset} shadow floor`).toBeGreaterThanOrEqual(24);
      expect.soft(sample.meanLuminance, `${presentation.preset} mean luminance`).toBeGreaterThanOrEqual(95);
      expect.soft(sample.deepBlackPixels, `${presentation.preset} deep-black pixel budget`).toBeLessThanOrEqual(720);
      expect.soft(sample.largestDeepBlackComponent, `${presentation.preset} largest deep-black component`).toBeLessThanOrEqual(540);
    }
    expect.soft(render?.calls, `${presentation.preset} should accumulate all enhanced render passes`).toBeGreaterThan(5);
    expect.soft(render?.triangles, `${presentation.preset} should report world geometry, not only the final pass`).toBeGreaterThan(1_000);
  }


  const contextLosses = await page.evaluate(() => (
    window as typeof window & { __RA_ENVIRONMENT_CONTEXT_LOSSES__: string[] }
  ).__RA_ENVIRONMENT_CONTEXT_LOSSES__);
  expect(contextLosses).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

test('high-tier exterior backdrop materially fills the frozen skyline',async({page},testInfo)=>{
  const runtimeErrors:string[]=[];
  page.on('pageerror',(error)=>runtimeErrors.push(`page: ${error.message}`));
  page.on('console',(message)=>{if(message.type()==='error')runtimeErrors.push(`console: ${message.text()}`);});
  await page.goto('/?map=winter&quality=high&e2e=1');
  await expect(page.locator('#loading')).toHaveCount(0,{timeout:15_000});
  await page.locator('#deploy').click();
  await page.evaluate(()=>document.dispatchEvent(new Event('pointerlockerror')));
  await expect(page.locator('#pause')).toBeVisible();
  await page.locator('#pause').evaluate((panel)=>{panel.style.display='none';});
  await mkdir('artifacts/environment-review',{recursive:true});

  const pair=await captureBackdropPair(page);
  const delta=await sampleBackdropDelta(page,pair.hidden,pair.visible);
  const towerPair=await captureBackdropPair(page,'tower');
  const towerAppearance=await sampleBackdropAppearance(page,towerPair.hidden,towerPair.visible);
  await writeFile('artifacts/environment-review/high-backdrop-hidden.png',pair.hidden);
  await writeFile('artifacts/environment-review/high-backdrop-skyline.png',pair.visible);
  await writeFile('artifacts/environment-review/high-backdrop-tower-hidden.png',towerPair.hidden);
  await writeFile('artifacts/environment-review/high-backdrop-tower.png',towerPair.visible);
  await testInfo.attach('high-backdrop-skyline',{body:pair.visible,contentType:'image/png'});
  await testInfo.attach('high-backdrop-tower',{body:towerPair.visible,contentType:'image/png'});
  // The high tree is deliberately an open, layered crown instead of a solid
  // shell, so its skyline mask is airier while retaining a broad forest band.
  expect(delta.changedColumns,`high backdrop horizon coverage ${JSON.stringify(delta)}`).toBeGreaterThanOrEqual(30);
  expect(delta.horizonPixels,`high backdrop horizon pixels ${JSON.stringify(delta)}`).toBeGreaterThanOrEqual(150);
  expect(delta.p90Delta,'high backdrop visibility').toBeGreaterThanOrEqual(12);
  expect(delta.horizonConcentration,'high backdrop horizon concentration').toBeGreaterThanOrEqual(.7);
  expect(delta.abovePixels,'high backdrop sky intrusion').toBeLessThanOrEqual(180);
  expect(delta.belowPixels,'high backdrop foreground intrusion').toBeLessThanOrEqual(360);
  expect(towerAppearance.changedPixels,`high backdrop tower presence ${JSON.stringify(towerAppearance)}`).toBeGreaterThanOrEqual(500);
  expect(towerAppearance.meanLuminance,`high backdrop tower luminance ${JSON.stringify(towerAppearance)}`).toBeLessThanOrEqual(105);
  expect(towerAppearance.paleRatio,`high backdrop pale-pixel ratio ${JSON.stringify(towerAppearance)}`).toBeLessThanOrEqual(.25);
  expect(towerAppearance.brightRatio,`high backdrop bright-pixel ratio ${JSON.stringify(towerAppearance)}`).toBeLessThanOrEqual(.10);
  expect(runtimeErrors).toEqual([]);
});

test('high-tier arena foliage materially fills the perimeter without foreground spill',async({page},testInfo)=>{
  const runtimeErrors:string[]=[];
  page.on('pageerror',(error)=>runtimeErrors.push(`page: ${error.message}`));
  page.on('console',(message)=>{if(message.type()==='error')runtimeErrors.push(`console: ${message.text()}`);});
  await page.goto('/?map=winter&quality=high&e2e=1');
  await expect(page.locator('#loading')).toHaveCount(0,{timeout:15_000});
  await page.locator('#deploy').click();
  await page.evaluate(()=>document.dispatchEvent(new Event('pointerlockerror')));
  await expect(page.locator('#pause')).toBeVisible();
  await page.locator('#pause').evaluate((panel)=>{panel.style.display='none';});
  await mkdir('artifacts/environment-review',{recursive:true});

  const pair=await captureFoliagePair(page);
  const delta=await sampleFoliageDelta(page,pair.hidden,pair.visible);
  await writeFile('artifacts/environment-review/high-foliage-hidden.png',pair.hidden);
  await writeFile('artifacts/environment-review/high-foliage-perimeter.png',pair.visible);
  await testInfo.attach('high-foliage-perimeter',{body:pair.visible,contentType:'image/png'});
  expect(delta.changedPixels,`high foliage visible pixels ${JSON.stringify(delta)}`).toBeGreaterThanOrEqual(80);
  expect(delta.horizonPixels,`high foliage horizon pixels ${JSON.stringify(delta)}`).toBeGreaterThanOrEqual(70);
  expect(delta.changedColumns,`high foliage column coverage ${JSON.stringify(delta)}`).toBeGreaterThanOrEqual(18);
  expect(delta.horizontalSpan,`high foliage horizontal span ${JSON.stringify(delta)}`).toBeGreaterThanOrEqual(80);
  expect(delta.p90Delta,'high foliage visibility').toBeGreaterThanOrEqual(10);
  expect(delta.horizonConcentration,'high foliage horizon concentration').toBeGreaterThanOrEqual(.75);
  expect(delta.abovePixels,'high foliage sky intrusion').toBeLessThanOrEqual(24);
  expect(delta.belowPixels,'high foliage foreground intrusion').toBeLessThanOrEqual(24);
  expect(delta.largeComponents,'high foliage distributed components').toBeGreaterThanOrEqual(2);
  expect(delta.secondLargestComponent,'high foliage second visible component').toBeGreaterThanOrEqual(6);
  expect(runtimeErrors).toEqual([]);
});

test('high-tier building façades add physical panel, corrugation, and window depth',async({page},testInfo)=>{
  const runtimeErrors:string[]=[];
  page.on('pageerror',(error)=>runtimeErrors.push(`page: ${error.message}`));
  page.on('console',(message)=>{if(message.type()==='error')runtimeErrors.push(`console: ${message.text()}`);});
  await page.goto('/?map=winter&quality=high&e2e=1');
  await expect(page.locator('#loading')).toHaveCount(0,{timeout:15_000});
  await page.locator('#deploy').click();
  await page.evaluate(()=>document.dispatchEvent(new Event('pointerlockerror')));
  await expect(page.locator('#pause')).toBeVisible();
  await page.locator('#pause').evaluate((panel)=>{panel.style.display='none';});
  await mkdir('artifacts/environment-review',{recursive:true});

  const samples:Record<FacadeReviewView,FacadeDeltaSample>={} as Record<FacadeReviewView,FacadeDeltaSample>;
  let aggregateChanged=0;
  for(const view of ['front','warehouse','windows','barracks','infirmary'] as const){
    const pair=await captureBuildingFacadePair(page,view);
    const sample=await sampleBuildingFacadeDelta(page,pair.hidden,pair.visible);
    samples[view]=sample;aggregateChanged+=sample.changedPixels;
    await writeFile(`artifacts/environment-review/high-facade-${view}-hidden.png`,pair.hidden);
    await writeFile(`artifacts/environment-review/high-facade-${view}-visible.png`,pair.visible);
    await testInfo.attach(`high-facade-${view}`,{body:pair.visible,contentType:'image/png'});
    expect(sample.changedPixels,`${view} façade changed pixels ${JSON.stringify(sample)}`).toBeGreaterThanOrEqual(500);
    expect(sample.facadeBandPixels,`${view} façade-band pixels ${JSON.stringify(sample)}`).toBeGreaterThanOrEqual(400);
    expect(sample.changedColumns,`${view} façade changed columns ${JSON.stringify(sample)}`).toBeGreaterThanOrEqual(70);
    expect(sample.horizontalSpan,`${view} façade horizontal span ${JSON.stringify(sample)}`).toBeGreaterThanOrEqual(115);
    expect(sample.p90Delta,`${view} façade contrast ${JSON.stringify(sample)}`).toBeGreaterThanOrEqual(10);
    expect(sample.facadeConcentration,`${view} façade concentration ${JSON.stringify(sample)}`).toBeGreaterThanOrEqual(.65);
    expect(sample.skyPixels,`${view} façade sky spill ${JSON.stringify(sample)}`).toBeLessThanOrEqual(100);
    expect(sample.groundPixels,`${view} façade ground spill ${JSON.stringify(sample)}`).toBeLessThanOrEqual(180);
    expect(sample.largeComponents,`${view} façade distributed relief ${JSON.stringify(sample)}`).toBeGreaterThanOrEqual(1);
    expect(sample.deepBlackGrowth,`${view} façade deep-black growth ${JSON.stringify(sample)}`).toBeLessThanOrEqual(220);
    expect(pair.renderDelta.calls,`${view} façade draw delta`).toBeGreaterThanOrEqual(4);
    // Six base batches plus three shadow-casting structural batches can be
    // resubmitted by the active shadow/composer path at grazing views.
    expect(pair.renderDelta.calls,`${view} façade draw delta`).toBeLessThanOrEqual(18);
    expect(pair.renderDelta.triangles,`${view} façade triangle delta`).toBeGreaterThanOrEqual(6_928);
    expect(pair.renderDelta.triangles,`${view} façade triangle delta`).toBeLessThanOrEqual(20_784);
  }
  expect(aggregateChanged,`aggregate façade coverage ${JSON.stringify(samples)}`).toBeGreaterThanOrEqual(5_000);
  for(const view of ['front','windows','infirmary'] as const){
    expect(samples[view].visibleMeanLuminance,`${view} concrete façade luminance`).toBeGreaterThanOrEqual(35);
    expect(samples[view].visibleMeanLuminance,`${view} concrete façade luminance`).toBeLessThanOrEqual(115);
  }
  for(const view of ['front','windows'] as const)
    expect(samples[view].visibleTenthPercentile,`${view} concrete façade shadow floor`).toBeGreaterThanOrEqual(18);
  // The infirmary's full-width band contains its black sign, open doorway,
  // roof trim and clinic counter; its mean/deep-black-growth gates isolate
  // material failures while retaining a mixed-content shadow floor.
  expect(samples.infirmary.visibleTenthPercentile,'infirmary mixed façade shadow floor').toBeGreaterThanOrEqual(8);
  expect(samples.warehouse.visibleMeanLuminance,'warehouse façade luminance').toBeGreaterThanOrEqual(16);
  expect(samples.warehouse.visibleMeanLuminance,'warehouse façade luminance').toBeLessThanOrEqual(85);
  expect(samples.warehouse.visibleTenthPercentile,'warehouse façade shadow floor').toBeGreaterThanOrEqual(8);
  expect(samples.barracks.visibleMeanLuminance,'barracks façade luminance').toBeGreaterThanOrEqual(16);
  expect(samples.barracks.visibleMeanLuminance,'barracks façade luminance').toBeLessThanOrEqual(85);
  expect(samples.barracks.visibleTenthPercentile,'barracks façade shadow floor').toBeGreaterThanOrEqual(8);
  expect(runtimeErrors).toEqual([]);
});

test('high-tier perimeter wall adds modular relief and coherent weathering',async({page},testInfo)=>{
  const runtimeErrors:string[]=[];
  page.on('pageerror',(error)=>runtimeErrors.push(`page: ${error.message}`));
  page.on('console',(message)=>{if(message.type()==='error')runtimeErrors.push(`console: ${message.text()}`);});
  await page.goto('/?map=winter&quality=high&e2e=1');
  await expect(page.locator('#loading')).toHaveCount(0,{timeout:15_000});
  await page.locator('#deploy').click();
  await page.evaluate(()=>document.dispatchEvent(new Event('pointerlockerror')));
  await expect(page.locator('#pause')).toBeVisible();
  await page.locator('#pause').evaluate((panel)=>{panel.style.display='none';});
  await mkdir('artifacts/environment-review',{recursive:true});

  const pair=await capturePerimeterWallPair(page);
  const delta=await samplePerimeterWallDelta(page,pair.hidden,pair.visible);
  const appearance=await samplePerimeterWallAppearance(page,pair.visible);
  await writeFile('artifacts/environment-review/high-perimeter-details-hidden.png',pair.hidden);
  await writeFile('artifacts/environment-review/high-perimeter-details-visible.png',pair.visible);
  await testInfo.attach('high-perimeter-details-hidden',{body:pair.hidden,contentType:'image/png'});
  await testInfo.attach('high-perimeter-details-visible',{body:pair.visible,contentType:'image/png'});

  expect(delta.changedPixels,`wall changed pixels ${JSON.stringify(delta)}`).toBeGreaterThanOrEqual(300);
  expect(delta.wallBandPixels,`wall-band pixels ${JSON.stringify(delta)}`).toBeGreaterThanOrEqual(250);
  expect(delta.nearFacePixels,`near wall relief pixels ${JSON.stringify(delta)}`).toBeGreaterThanOrEqual(70);
  expect(delta.changedColumns,`wall detail columns ${JSON.stringify(delta)}`).toBeGreaterThanOrEqual(30);
  expect(delta.horizontalSpan,`wall detail span ${JSON.stringify(delta)}`).toBeGreaterThanOrEqual(130);
  expect(delta.p90Delta,`wall detail contrast ${JSON.stringify(delta)}`).toBeGreaterThanOrEqual(12);
  expect(delta.wallConcentration,`wall-band concentration ${JSON.stringify(delta)}`).toBeGreaterThanOrEqual(.8);
  expect(delta.abovePixels,`wall detail sky spill ${JSON.stringify(delta)}`).toBeLessThanOrEqual(40);
  expect(delta.belowPixels,`wall detail ground spill ${JSON.stringify(delta)}`).toBeLessThanOrEqual(120);
  expect(pair.renderDelta.calls,'wall detail draw delta').toBeGreaterThanOrEqual(3);
  expect(pair.renderDelta.calls,'wall detail draw delta').toBeLessThanOrEqual(8);
  expect(pair.renderDelta.triangles,'wall detail triangle delta').toBeGreaterThanOrEqual(1_776);
  // The 1,776 authored detail triangles are also submitted through the active
  // shadow pipeline; keep the measured multi-pass cost bounded.
  expect(pair.renderDelta.triangles,'wall detail triangle delta').toBeLessThanOrEqual(6_000);
  expect(appearance.meanLuminance,`wall mean luminance ${JSON.stringify(appearance)}`).toBeGreaterThanOrEqual(30);
  expect(appearance.meanLuminance,`wall mean luminance ${JSON.stringify(appearance)}`).toBeLessThanOrEqual(90);
  expect(appearance.luminanceSpread,`wall luminance spread ${JSON.stringify(appearance)}`).toBeGreaterThanOrEqual(7.5);
  expect(appearance.luminanceDeviation,`wall luminance deviation ${JSON.stringify(appearance)}`).toBeGreaterThanOrEqual(3.5);
  expect(appearance.horizontalGradient,`wall horizontal gradient ${JSON.stringify(appearance)}`).toBeGreaterThanOrEqual(.35);
  expect(runtimeErrors).toEqual([]);
});

test('high-tier road dressing remains visually coherent with the crowned surface',async({page},testInfo)=>{
  const runtimeErrors:string[]=[];
  page.on('pageerror',(error)=>runtimeErrors.push(`page: ${error.message}`));
  page.on('console',(message)=>{if(message.type()==='error')runtimeErrors.push(`console: ${message.text()}`);});
  await page.goto('/?map=winter&quality=high&e2e=1');
  await expect(page.locator('#loading')).toHaveCount(0,{timeout:15_000});
  await page.locator('#deploy').click();
  await page.evaluate(()=>document.dispatchEvent(new Event('pointerlockerror')));
  await expect(page.locator('#pause')).toBeVisible();
  await page.locator('#pause').evaluate((panel)=>{panel.style.display='none';});
  await mkdir('artifacts/environment-review',{recursive:true});

  const setDressing=async(visible:boolean)=>page.evaluate((nextVisible)=>{
    const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{
      setGroundDressingVisible(visible:boolean):void;
    }}).__RA_MULTIPLAYER_DEBUG__;
    if(!debug)throw new Error('Ground dressing review hook is unavailable.');
    debug.setGroundDressingVisible(nextVisible);
  },visible);
  const setRoadOverlays=async(markings:boolean,repairs:boolean)=>page.evaluate(({nextMarkings,nextRepairs})=>{
    const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{
      setRoadMarkingsVisible(visible:boolean):void;
      setRoadRepairsVisible(visible:boolean):void;
    }}).__RA_MULTIPLAYER_DEBUG__;
    if(!debug)throw new Error('Road overlay review hooks are unavailable.');
    debug.setRoadMarkingsVisible(nextMarkings);
    debug.setRoadRepairsVisible(nextRepairs);
  },{nextMarkings:markings,nextRepairs:repairs});
  await setDressing(false);
  await setRoadOverlays(false,false);
  const bare=await capturePresentedCanvas(page,'road-shoulder');
  await setRoadOverlays(true,false);
  const markingsOnly=await capturePresentedCanvas(page,'road-shoulder');
  await setRoadOverlays(false,true);
  const repairsOnly=await capturePresentedCanvas(page,'road-shoulder');
  await setRoadOverlays(true,true);
  const hidden=await capturePresentedCanvas(page,'road-shoulder');
  await setDressing(true);
  const visible=await capturePresentedCanvas(page,'road-shoulder');
  await writeFile('artifacts/environment-review/high-road-overlays-hidden.png',bare);
  await writeFile('artifacts/environment-review/high-road-markings-only.png',markingsOnly);
  await writeFile('artifacts/environment-review/high-road-repairs-only.png',repairsOnly);
  await writeFile('artifacts/environment-review/high-road-dressing-hidden.png',hidden);
  await writeFile('artifacts/environment-review/high-road-dressing-visible.png',visible);
  await testInfo.attach('high-road-overlays-hidden',{body:bare,contentType:'image/png'});
  await testInfo.attach('high-road-markings-only',{body:markingsOnly,contentType:'image/png'});
  await testInfo.attach('high-road-repairs-only',{body:repairsOnly,contentType:'image/png'});
  await testInfo.attach('high-road-dressing-hidden',{body:hidden,contentType:'image/png'});
  await testInfo.attach('high-road-dressing-visible',{body:visible,contentType:'image/png'});

  const sample=await sampleScreenshot(page,visible);
  expect(sample.fifthPercentileLuminance).toBeGreaterThanOrEqual(24);
  expect(sample.meanLuminance).toBeGreaterThanOrEqual(95);
  expect(sample.deepBlackPixels).toBeLessThanOrEqual(720);
  expect(sample.largestDeepBlackComponent).toBeLessThanOrEqual(540);
  expect(runtimeErrors).toEqual([]);
});
