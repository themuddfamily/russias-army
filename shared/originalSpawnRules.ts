/** Zero-based adapter for explore.buildlevel's uniform random(vstarts.count). */
export function originalSpawnIndex(count:number,randomFraction:number):number {
 if(!Number.isSafeInteger(count)||count<1)throw new RangeError('Source spawn count must be a positive safe integer.');
 if(!Number.isFinite(randomFraction)||randomFraction<0||randomFraction>=1)throw new RangeError('Source spawn random fraction must be in [0,1).');
 return Math.floor(randomFraction*count);
}
