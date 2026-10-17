/** Director equality folds ASCII case; native extended-character tables vary
 * by platform/version and are not reproduced by this bounded adapter.
 */
export function originalAsciiNamesEqual(a:string,b:string):boolean {
  const fold=(name:string)=>name.replace(/[A-Z]/g,letter=>letter.toLowerCase());
  return fold(a)===fold(b);
}
