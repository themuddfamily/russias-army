import {readFileSync} from 'node:fs';
import type {OriginalSoldierCollisionAssets} from '../shared/originalSoldierCollision';

/** Use the same preserved GI mesh and motion tracks as the browser skin. */
export const originalServerSoldierAssets:OriginalSoldierCollisionAssets={
 geometry:JSON.parse(readFileSync(new URL('../public/assets/original-soldier/geometry.json',import.meta.url),'utf8')),
 rigMotion:JSON.parse(readFileSync(new URL('../public/assets/original-soldier/rig-motion.json',import.meta.url),'utf8')),
};
