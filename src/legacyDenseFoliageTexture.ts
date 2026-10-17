import * as THREE from 'three';

/** Authored leafy card informed by the sharp Woodland captures. The source has
 * uneven overlapping foliage masses as well as bare trees; its original alpha
 * artwork is not available. This generator does not consume placement randomness.
 */
export function createLegacyDenseFoliageTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  let seed = 72941;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const colors = ['#30492e', '#3d5635', '#496340', '#566d47', '#627651'];
  const branches: { x: number; y: number; tipX: number; tipY: number; bend: number }[] = [];
  // Unequal heights and lengths avoid a repeating pair of horizontal branch ribs.
  for (let i = 0; i < 23; i++) {
    const y = 34 + random() * 187;
    const side = random() < .5 ? -1 : 1;
    const breadth = Math.sin((y - 8) / 250 * Math.PI);
    const length = 20 + breadth * (37 + random() * 53);
    const x = 125 + Math.sin(y * .021) * 5;
    branches.push({ x, y, tipX: x + side * length, tipY: y + 4 + (random() - .5) * 12, bend: (random() - .5) * 12 });
  }
  // Branches remain subordinate to the leaves, with no heavy central ladder.
  ctx.strokeStyle = 'rgba(70, 82, 53, .6)';
  for (const branch of branches) {
    ctx.lineWidth = .45 + random() * .3;
    ctx.beginPath();
    ctx.moveTo(branch.x, branch.y + 8);
    ctx.quadraticCurveTo((branch.x + branch.tipX) / 2, branch.y + branch.bend, branch.tipX, branch.tipY);
    ctx.stroke();
  }
  // Small overlapping clusters form broken masses rather than isolated discs.
  // Gaps between clusters and unequal tips retain the crossed-card silhouette.
  for (const branch of branches) {
    const clusters = 4 + Math.floor(random() * 4);
    for (let cluster = 0; cluster < clusters; cluster++) {
      const t = .18 + cluster / clusters * .76 + random() * .09;
      const centerX = branch.x + (branch.tipX - branch.x) * t;
      const centerY = branch.y + 8 + (branch.tipY - branch.y - 8) * t + (random() - .5) * 10;
      const spreadX = 6 + random() * 9;
      const spreadY = 4 + random() * 6;
      const angle = (branch.tipX > branch.x ? -.35 : .35) + (random() - .5) * .45;
      const leaves = 14 + Math.floor(random() * 14);
      for (let leaf = 0; leaf < leaves; leaf++) {
        const a = random() * Math.PI * 2;
        const radius = Math.sqrt(random());
        const x = centerX + Math.cos(a) * radius * spreadX;
        const y = centerY + Math.sin(a) * radius * spreadY;
        ctx.globalAlpha = .76 + random() * .24;
        ctx.fillStyle = colors[Math.floor(random() * colors.length)];
        ctx.beginPath();
        ctx.ellipse(x, y, 1.6 + random() * 3.2, .7 + random() * 1.3, angle + (random() - .5) * .8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'woodland-irregular-dense-crown';
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
