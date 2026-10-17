import {describe,it,expect} from 'vitest';
import {isOriginalCowardiceName} from './originalCowardice';
describe('source ASCII Cowardice name comparison',()=>{
  it('matches every combination of ASCII case without changing the literal display cause',()=>{
    const name='cowardice';
    for(let mask=0;mask<1<<name.length;mask++)expect(isOriginalCowardiceName([...name].map((letter,index)=>mask&1<<index?letter.toUpperCase():letter).join(''))).toBe(true);
  });
  it('does not invent trimming or extended-character equivalences',()=>{
    for(const name of ['', 'Cowardice ', ' Cowardice', 'Cowardice2','Cöwardice','Cowardıce'])expect(isOriginalCowardiceName(name)).toBe(false);
  });
});
