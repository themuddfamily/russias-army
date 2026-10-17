import {ORIGINAL_RESULT_UI_FPS,ORIGINAL_RESULT_SCROLL_FRAMES,ORIGINAL_RESULT_REPLAY_FRAMES} from './originalResultTimelineData';

/** Browser wall-clock projection of authored20fps movieclip frames. Native
 * Flash scheduling/phase and button child reentry are separate proof limits. */
export function originalResultTimelineFrame(seconds:number,count:number):number {
  const elapsed=Number.isFinite(seconds)?Math.max(0,seconds):0;
  return Math.floor(elapsed*ORIGINAL_RESULT_UI_FPS)%count;
}
export function originalResultTimelinePose(seconds:number){
  const scrollFrame=originalResultTimelineFrame(seconds,ORIGINAL_RESULT_SCROLL_FRAMES.length);
  return {scrollFrame,scroll:ORIGINAL_RESULT_SCROLL_FRAMES[scrollFrame],replayFrame:originalResultTimelineFrame(seconds,ORIGINAL_RESULT_REPLAY_FRAMES)};
}
