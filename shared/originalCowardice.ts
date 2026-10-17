import {originalAsciiNamesEqual} from './originalNameComparison';
/** Director '=' compares ASCII names without case (MX2004 scripting
 * reference, printedp259). Extended-character tables are platform-dependent.
 */
export function isOriginalCowardiceName(name:string):boolean {
  return originalAsciiNamesEqual(name,'cowardice');
}
