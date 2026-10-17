/** Recovered MUS.VerifyUserName character filter. ASCII letter casing is
 * retained as a display adapter: native symbol interning/spelling is unproved.
 * No native symbol evaluation or original runtime executes here. */
export const ORIGINAL_CODENAME_REJECTION='Codename censored, try again.';
export function originalCodename(value:string):string {
  const filtered=value.replace(/[^a-zA-Z0-9]/g,'');
  return filtered==='0'?'':filtered;
}
