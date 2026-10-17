import {originalResultTimelinePose,originalResultTimelineFrame} from './originalResultTimeline';

/** Recovered frame54 artwork, separate from the Director rooms text.
 * Source placements stay in800x600 coordinates. Browser stretching, rectangular
 * rich-text registration remain presentation adapters.
 * Original Flash actions and the historical score service are never executed.
 */
export interface OriginalResultUi { setEdition(map:'barrack'|'woodlands'):void; resize(width:number,height:number):void; start(time:number):void; advance(time:number):void; }

export function installOriginalResultUi(host:HTMLElement):OriginalResultUi {
  const document=host.ownerDocument;
  const artwork=document.createElement('div');
  artwork.id='original-result-ui';artwork.setAttribute('aria-hidden','true');
  artwork.dataset.sourceFrame='54';artwork.dataset.sourceViewport='800x600';
  const editionImages:HTMLImageElement[]=[];
  for(const [name,depth] of [['background-lower',1],['gameover',25],['emblem',34],['inert-control',37],['border',40]] as const){
    const image=document.createElement('img');image.alt='';image.draggable=false;
    image.dataset.sourceLayer=name;image.dataset.sourceDepth=String(depth);image.style.zIndex=String(depth);
    image.src=`/assets/original-result-ui/${name}${name==='background-lower'||name==='emblem'?'-barrack':''}.svg`;
    if(name==='background-lower'||name==='emblem')editionImages.push(image);
    artwork.append(image);
  }
  host.prepend(artwork);
  const replay=host.querySelector<HTMLButtonElement>('#restart')!;
  replay.setAttribute('aria-label','Replay');
  // Source BUTTONCONDACTION0x0004 sets _root.state on mouse press.
  // Reuse the existing semantic action; suppress its later physical click.
  replay.addEventListener('pointerdown',event=>{
    if(!host.classList.contains('source-result')||event.button!==0||!event.isPrimary)return;
    event.preventDefault();replay.click();
  });
  replay.addEventListener('click',event=>{
    if(host.classList.contains('source-result')&&event.detail>0)event.stopImmediatePropagation();
  },true);
  // Accessible keyboard focus is a browser addition, following the recovered
  // contour instead of an outside HTML outline clipped by the hit polygon.
  const focus=document.createElementNS('http://www.w3.org/2000/svg','svg');
  focus.id='original-replay-focus';focus.setAttribute('viewBox','0 0 800 600');focus.setAttribute('preserveAspectRatio','none');
  const contour=document.createElementNS('http://www.w3.org/2000/svg','polygon');
  contour.setAttribute('points','543.8387580871582,458.54293594360354 633.1615577697754,505.2902656555176 614.6477638244629,540.6656318664551 525.3249641418457,493.91830215454104');
  contour.setAttribute('fill','none');contour.setAttribute('stroke','#fff');contour.setAttribute('stroke-width','2');contour.setAttribute('vector-effect','non-scaling-stroke');focus.append(contour);artwork.append(focus);
  let epoch=0,replayEpoch=0,replayWasUp=true;
  const replayPoses=Array.from({length:15},(_,frame)=>{
    const image=document.createElement('img');image.src=`/assets/original-result-ui/replay-up-pose-${String(frame+1).padStart(2,'0')}.svg`;return image;
  });
  let up:HTMLImageElement|undefined;
  for(const state of ['up','over','down']){
    const image=document.createElement('img');image.alt='';image.draggable=false;
    image.setAttribute('aria-hidden','true');image.className=`original-replay-${state}`;image.style.zIndex='22';image.dataset.sourceDepth='22';
    image.src=`/assets/original-result-ui/replay-${state}.svg`;artwork.append(image);
    if(state==='up')up=image;
  }
  const scroll=document.createElement('div');scroll.id='original-result-scroll';scroll.style.zIndex='16';
  const clip=document.createElement('div');clip.className='original-result-scroll-clip';scroll.append(clip);
  const scrollImages=new Map<number,HTMLImageElement>();
  for(const cid of [83,39]){
    const image=document.createElement('img');image.alt='';image.draggable=false;
    image.src=`/assets/original-result-animation/scroll-content-${cid}.svg`;image.hidden=true;
    clip.append(image);scrollImages.set(cid,image);
  }
  artwork.append(scroll);
  let lastReplay=-1;
  const paint=(time:number)=>{
    const pose=originalResultTimelinePose(time-epoch);
    scroll.dataset.sourceFrame=String(pose.scrollFrame+1);
    const [cid,x,y]=pose.scroll;
    for(const [id,image] of scrollImages){image.hidden=id!==cid;if(id===cid)image.style.transform=`translate(${x}px,${y}px)`;}
    const isUp=!replay.matches(':hover,:active,:focus-visible');
    if(isUp&&!replayWasUp)replayEpoch=time;
    replayWasUp=isUp;
    const frame=originalResultTimelineFrame(time-replayEpoch,15);
    if(up&&frame!==lastReplay){lastReplay=frame;up.src=replayPoses[frame].src;up.dataset.sourceFrame=String(frame+1);}
  };
  const submit=document.createElement('button');submit.id='original-result-submit';submit.type='button';submit.disabled=true;
  submit.setAttribute('aria-label','Historical score submission unavailable');
  const go=document.createElement('img');go.alt='';go.draggable=false;go.src='/assets/original-result-ui/go-up.svg';go.style.zIndex='25';go.dataset.sourceDepth='25';artwork.append(go);
  host.querySelector('.result-disk')!.append(submit);
  return {
    setEdition(map){
      const edition=map==='woodlands'?'woodland':'barrack';artwork.dataset.sourceEdition=edition;
      for(const image of editionImages)image.src=`/assets/original-result-ui/${image.dataset.sourceLayer}-${edition}.svg`;
    },
    resize(width,height){host.style.setProperty('--source-result-scale-x',String(width/800));host.style.setProperty('--source-result-scale-y',String(height/600));},
    start(time){epoch=replayEpoch=time;replayWasUp=true;lastReplay=-1;paint(time);},
    advance(time){if(host.classList.contains('source-result')&&!host.classList.contains('hidden'))paint(time);},
  };
}
