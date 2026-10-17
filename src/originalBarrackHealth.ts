/** Recovered goody.writestats selects posterFrame99-health after normalizing
 * its integrity offset. Invalid/fractional native frame behavior is unknown:
 * this browser adapter truncates and clamps to the exported1..100 frames.
 */
export function originalBarrackHealthFrame(health:number):number {
  if(Number.isNaN(health))return 1;
  return Math.max(1,Math.min(100,Math.trunc(99-health)));
}

export function updateOriginalBarrackHealth(health:number):void {
  const image=document.getElementById('barrack-health') as HTMLImageElement|null;
  if(!image||image.tagName!=='IMG')return;
  const frame=originalBarrackHealthFrame(health),value=String(frame);
  if(image.dataset.sourceFrame===value)return;
  image.src=`/assets/original-barrack-health/frame-${value.padStart(3,'0')}.svg`;
  image.dataset.sourceFrame=value;
}
