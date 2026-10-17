import {describe,expect,it} from 'vitest';
import {originalAsciiNamesEqual} from './originalNameComparison';

describe('source ASCII actor-name equality',()=>{
  it('matches ASCII case while preserving punctuation, spaces and display text',()=>{
    for(const [a,b] of [['Comrade','cOMRADE'],['A-1 B','a-1 b'],['Cowardice','COWARDICE']])expect(originalAsciiNamesEqual(a,b)).toBe(true);
    for(const [a,b] of [['A B','AB'],['A ','A'],['A-1','A1'],['OWNER','OTHER']])expect(originalAsciiNamesEqual(a,b)).toBe(false);
  });
  it('does not invent Unicode or native locale equivalences',()=>{
    expect(originalAsciiNamesEqual('Ö','ö')).toBe(false);
    expect(originalAsciiNamesEqual('I','ı')).toBe(false);
    expect(originalAsciiNamesEqual('é','e\u0301')).toBe(false);
    expect(originalAsciiNamesEqual('éA','éa')).toBe(true);
  });
});
