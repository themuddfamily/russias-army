export type WatchtowerMaterialSlot = 'steel' | 'panel' | 'dark' | 'snow' | 'glass' | 'accent';

export type WatchtowerPartFeature =
  | 'footing'
  | 'leg'
  | 'brace'
  | 'platform'
  | 'guardRail'
  | 'cabin'
  | 'ladder'
  | 'roof'
  | 'antenna'
  | 'searchlight'
  | 'beacon';

export type WatchtowerVector = readonly [number, number, number];

/**
 * A material-independent box description. Resolve `materialSlot` to a Three.js
 * material and the remaining fields can be passed directly to StaticBoxInstance.
 */
export interface WatchtowerBoxPart {
  readonly name: string;
  readonly feature: WatchtowerPartFeature;
  readonly materialSlot: WatchtowerMaterialSlot;
  readonly size: WatchtowerVector;
  readonly position: WatchtowerVector;
  readonly rotation?: WatchtowerVector;
  readonly castShadow?: boolean;
}

export const WATCHTOWER_TRIANGLES_PER_PART = 12;

function validateCoordinate(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
}

/**
 * Builds a compact, modern observation tower from boxes that can share the
 * arena's existing static instancing pipeline. The tower is 8.9 m tall and its
 * structural frame is symmetric; deliberately asymmetric equipment gives the
 * roofline a readable silhouette.
 */
export function createWatchtowerBlueprint(x: number, z: number): readonly WatchtowerBoxPart[] {
  validateCoordinate(x, 'x');
  validateCoordinate(z, 'z');

  const parts: WatchtowerBoxPart[] = [];
  const add = (
    name: string,
    feature: WatchtowerPartFeature,
    materialSlot: WatchtowerMaterialSlot,
    size: WatchtowerVector,
    localPosition: WatchtowerVector,
    rotation?: WatchtowerVector,
    castShadow?: boolean,
  ): void => {
    parts.push(Object.freeze({
      name,
      feature,
      materialSlot,
      size: Object.freeze([...size]) as unknown as WatchtowerVector,
      position: Object.freeze([x + localPosition[0], localPosition[1], z + localPosition[2]]) as unknown as WatchtowerVector,
      rotation: rotation === undefined
        ? undefined
        : Object.freeze([...rotation]) as unknown as WatchtowerVector,
      castShadow,
    }));
  };

  // Four concrete shoes and a galvanized frame establish the tower's broad,
  // grounded stance. One continuous X is visible on every face.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const corner = `${sx < 0 ? 'west' : 'east'}-${sz < 0 ? 'north' : 'south'}`;
    add(`footing-${corner}`, 'footing', 'dark', [.82, .32, .82], [sx * 1.9, .16, sz * 1.9]);
    add(`leg-${corner}`, 'leg', 'steel', [.26, 5.08, .26], [sx * 1.9, 2.7, sz * 1.9]);
  }
  const braceAngle = Math.atan2(3.8, 4.25);
  const braceLength = Math.hypot(3.8, 4.25);
  for (const [face, faceZ] of [['front', 1.9], ['back', -1.9]] as const) {
    add(`brace-${face}-a`, 'brace', 'steel', [.14, braceLength, .12], [0, 2.7, faceZ], [0, 0, braceAngle]);
    add(`brace-${face}-b`, 'brace', 'steel', [.14, braceLength, .12], [0, 2.7, faceZ], [0, 0, -braceAngle]);
  }
  for (const [face, faceX] of [['left', -1.9], ['right', 1.9]] as const) {
    add(`brace-${face}-a`, 'brace', 'steel', [.12, braceLength, .14], [faceX, 2.7, 0], [braceAngle, 0, 0]);
    add(`brace-${face}-b`, 'brace', 'steel', [.12, braceLength, .14], [faceX, 2.7, 0], [-braceAngle, 0, 0]);
  }

  // Platform and underside frame.
  add('platform-deck', 'platform', 'panel', [5, .24, 5], [0, 5.32, 0]);
  for (const side of [-1, 1]) {
    add(`platform-beam-x-${side}`, 'platform', 'dark', [5.1, .2, .18], [0, 5.15, side * 2.1]);
    add(`platform-beam-z-${side}`, 'platform', 'dark', [.18, .2, 5.1], [side * 2.1, 5.15, 0]);
  }

  // Perimeter rails sit outside the cabin so the upper deck reads clearly at
  // gameplay distances without filling the silhouette with tiny geometry.
  const railPostLocations = [
    [-2.3, -2.3], [0, -2.3], [2.3, -2.3],
    [-2.3, 0], [2.3, 0],
    [-2.3, 2.3], [0, 2.3], [2.3, 2.3],
  ] as const;
  for (let index = 0; index < railPostLocations.length; index++) {
    const [px, pz] = railPostLocations[index];
    add(`guard-post-${index}`, 'guardRail', 'steel', [.1, .92, .1], [px, 5.86, pz]);
  }
  add('guard-top-front', 'guardRail', 'steel', [4.7, .1, .1], [0, 6.3, 2.3]);
  add('guard-top-back', 'guardRail', 'steel', [4.7, .1, .1], [0, 6.3, -2.3]);
  add('guard-top-left', 'guardRail', 'steel', [.1, .1, 4.7], [-2.3, 6.3, 0]);
  add('guard-top-right', 'guardRail', 'steel', [.1, .1, 4.7], [2.3, 6.3, 0]);

  // Glazed cabin with a contrasting rear access door.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(`cabin-post-${sx}-${sz}`, 'cabin', 'steel', [.16, 1.96, .16], [sx * 1.63, 6.34, sz * 1.63]);
  }
  add('cabin-kick-front', 'cabin', 'panel', [3.25, .62, .13], [0, 5.78, 1.65]);
  add('cabin-kick-left', 'cabin', 'panel', [.13, .62, 3.25], [-1.65, 5.78, 0]);
  add('cabin-kick-right', 'cabin', 'panel', [.13, .62, 3.25], [1.65, 5.78, 0]);
  add('cabin-kick-back-left', 'cabin', 'panel', [1.05, .62, .13], [-1.1, 5.78, -1.65]);
  add('cabin-kick-back-right', 'cabin', 'panel', [1.05, .62, .13], [1.1, 5.78, -1.65]);
  add('cabin-access-door', 'cabin', 'accent', [1.02, 1.72, .1], [0, 6.18, -1.72]);
  for (const sx of [-1, 1]) {
    add(`cabin-window-front-${sx}`, 'cabin', 'glass', [1.38, .74, .07], [sx * .79, 6.65, 1.72], undefined, false);
  }
  for (const side of [-1, 1]) for (const sz of [-1, 1]) {
    add(`cabin-window-${side < 0 ? 'left' : 'right'}-${sz}`, 'cabin', 'glass', [.07, .74, 1.38], [side * 1.72, 6.65, sz * .79], undefined, false);
  }
  add('cabin-header-front', 'cabin', 'dark', [3.52, .18, .18], [0, 7.27, 1.68]);
  add('cabin-header-back', 'cabin', 'dark', [3.52, .18, .18], [0, 7.27, -1.68]);
  add('cabin-header-left', 'cabin', 'dark', [.18, .18, 3.52], [-1.68, 7.27, 0]);
  add('cabin-header-right', 'cabin', 'dark', [.18, .18, 3.52], [1.68, 7.27, 0]);

  // Rear service ladder reaches from the footings to the upper deck.
  add('ladder-rail-left', 'ladder', 'steel', [.1, 5.2, .1], [-.43, 2.75, -2.54]);
  add('ladder-rail-right', 'ladder', 'steel', [.1, 5.2, .1], [.43, 2.75, -2.54]);
  for (let rung = 0; rung < 9; rung++) {
    add(`ladder-rung-${rung}`, 'ladder', 'steel', [.96, .08, .1], [0, .65 + rung * .54, -2.54]);
  }

  // A shallow pitched snow roof is more legible than a flat slab and preserves
  // the winter identity of the arena.
  const roofPitch = Math.atan2(.64, 1.82);
  const roofSlope = Math.hypot(1.82, .64);
  add('roof-snow-left', 'roof', 'snow', [roofSlope + .12, .16, 3.94], [-.91, 7.69, 0], [0, 0, roofPitch]);
  add('roof-snow-right', 'roof', 'snow', [roofSlope + .12, .16, 3.94], [.91, 7.69, 0], [0, 0, -roofPitch]);
  add('roof-ridge', 'roof', 'dark', [.18, .16, 4.02], [0, 8.02, 0]);
  add('roof-eave-left', 'roof', 'dark', [.12, .2, 4.02], [-1.82, 7.38, 0]);
  add('roof-eave-right', 'roof', 'dark', [.12, .2, 4.02], [1.82, 7.38, 0]);

  // Roof equipment makes the tower identifiable from across the map.
  add('antenna-mast', 'antenna', 'steel', [.09, .82, .09], [0, 8.45, -.35]);
  add('antenna-array', 'antenna', 'steel', [1.02, .07, .07], [0, 8.55, -.35]);
  add('antenna-tip', 'antenna', 'accent', [.12, .12, .12], [0, 8.9, -.35], undefined, false);

  add('searchlight-base', 'searchlight', 'dark', [.52, .12, .38], [.9, 7.58, 1.5]);
  add('searchlight-yoke-left', 'searchlight', 'steel', [.08, .34, .08], [.72, 7.78, 1.5]);
  add('searchlight-yoke-right', 'searchlight', 'steel', [.08, .34, .08], [1.08, 7.78, 1.5]);
  add('searchlight-body', 'searchlight', 'dark', [.46, .34, .54], [.9, 7.85, 1.72], [-.14, 0, 0]);
  add('searchlight-lens', 'searchlight', 'glass', [.36, .24, .05], [.9, 7.81, 2], [-.14, 0, 0], false);

  add('beacon-stem', 'beacon', 'dark', [.09, .24, .09], [-1.18, 7.75, .72]);
  add('beacon-lamp', 'beacon', 'accent', [.22, .22, .22], [-1.18, 7.96, .72], undefined, false);

  return Object.freeze(parts);
}
