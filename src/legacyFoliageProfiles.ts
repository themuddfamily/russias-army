/** Positions and X/Y scales are fractions of trunk height; Z scale stays one. */
export interface LegacyCrownCardProfile {
  offset: readonly [number, number, number];
  scale: readonly [number, number, number];
  rotation: readonly [number, number, number];
}

// This indexed hash is independent of the arena's placement/texture generators.
// It changes authored crown proportions without moving shared trees or consuming RNG.
function crownSample(treeIndex: number, salt: number): number {
  let value = Math.imul(treeIndex + 1, 0x45d9f3b) ^ Math.imul(salt + 1, 0x27d4eb2d);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

/**
 * Woodland-only crossed-card crowns. Sharp references show varied broad leafy
 * masses among thin, almost bare branch crowns. Dimensions and assignments here
 * are authored approximations; they do not identify original trees or species.
 * Barrack should retain its existing transforms.
 */
export function woodlandCrownProfiles(treeIndex: number, sparse: boolean): LegacyCrownCardProfile[] {
  const phase = crownSample(treeIndex, 0) * Math.PI;
  const widthVariation = .88 + crownSample(treeIndex, 1) * .25;
  const heightVariation = .9 + crownSample(treeIndex, 2) * .18;
  const broad = !sparse && crownSample(treeIndex, 3) < .42;
  const lean = (crownSample(treeIndex, 4) - .5) * .11;
  const driftAngle = crownSample(treeIndex, 5) * Math.PI * 2;
  const drift = (crownSample(treeIndex, 6) - .5) * .04;
  const count = sparse ? 3 : 6;
  return Array.from({ length: count }, (_, card) => {
    const angle = card * Math.PI / 3 + phase;
    const outer = !sparse && card >= 3;
    const asymmetry = .94 + crownSample(treeIndex, card + 10) * .12;
    const offset = outer ? .10 + crownSample(treeIndex, card + 20) * .055 : .012;
    // Broad crowns retain exposed lower trunks and crossed, irregular sheets;
    // they are wider/shorter branches, rather than round solid foliage blobs.
    const width = sparse ? .63 : outer ? (broad ? .59 : .46) : (broad ? .9 : .75);
    const height = sparse ? .74 : outer ? (broad ? .37 : .46) : (broad ? .54 : .7);
    const center = sparse ? .65 : outer ? (broad ? .59 : .62) : (broad ? .63 : .69);
    return {
      offset: [
        Math.cos(angle) * offset + Math.cos(driftAngle) * drift,
        center + (crownSample(treeIndex, card + 30) - .5) * .035,
        Math.sin(angle) * offset + Math.sin(driftAngle) * drift,
      ],
      scale: [width * widthVariation * asymmetry, height * heightVariation, 1],
      rotation: [outer ? .055 * Math.sin(treeIndex + card) : 0, angle,
        lean + (crownSample(treeIndex, card + 40) - .5) * .055],
    };
  });
}
