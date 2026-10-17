import {describe,expect,it} from 'vitest';
import {originalCodename} from './originalCodename';
describe('source codename filtering',()=>{
  it.each([['A B!0','AB0'],[' Comrade-7_é😀 ','Comrade7'],['1234567890','1234567890'],['Cowardice','Cowardice'],['0',''],['! é😀',''],['','']])('filters %s to %s',(input,expected)=>expect(originalCodename(input)).toBe(expected));
});
