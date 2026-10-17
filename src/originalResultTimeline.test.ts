import {describe,it,expect} from 'vitest';
import {originalResultTimelinePose} from './originalResultTimeline';

describe('authored result movieclip timing',()=>{
  it('retains the50ms discrete scroll placements and independent15-frame Replay cycle',()=>{
    expect(originalResultTimelinePose(0)).toEqual({scrollFrame:0,scroll:[83,801,.05],replayFrame:0});
    expect(originalResultTimelinePose(.049)).toEqual(originalResultTimelinePose(0));
    expect(originalResultTimelinePose(.05)).toEqual({scrollFrame:1,scroll:[83,798,.05],replayFrame:1});
    expect(originalResultTimelinePose(.75).replayFrame).toBe(0);
    expect(originalResultTimelinePose(.75).scrollFrame).toBe(15);
  });
  it('preserves the anomalous authored final welcome caption before restarting result text',()=>{
    const last=originalResultTimelinePose(39.95);
    expect(last.scrollFrame).toBe(799);expect(last.scroll).toEqual([39,-1589,.05]);
    expect(originalResultTimelinePose(40)).toEqual({scrollFrame:0,scroll:[83,801,.05],replayFrame:5});
    expect(originalResultTimelinePose(80).scroll).toEqual([83,801,.05]);
  });
  it('begins in the source first pose when there is no elapsed clock time',()=>{
    for(const time of [-1,NaN,Infinity])expect(originalResultTimelinePose(time)).toEqual(originalResultTimelinePose(0));
  });
});
