import * as THREE from 'three';

/** Fine irregular branch cards informed by the sharp Woodland references.
 * Original alpha artwork and tree identities remain unknown. This independent
 * generator changes neither shared tree placement nor the arena RNG sequence.
 */
export function createLegacySparseFoliageTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  let seed = 4639;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const stemX = (y: number) => 128 + Math.sin(y * .019) * 4;
  ctx.strokeStyle = 'rgba(62, 68, 53, .85)';
  ctx.lineWidth = .55;
  ctx.beginPath();
  ctx.moveTo(stemX(250), 250);
  ctx.quadraticCurveTo(135, 191, stemX(132), 132);
  ctx.quadraticCurveTo(121, 71, stemX(20), 20);
  ctx.stroke();
  // Uneven levels, lengths and curved junctions remove the repeating ladder.
  for (let branch = 0; branch < 25; branch++) {
    const y = 30 + random() * 204;
    const side = branch % 2 ? 1 : -1;
    const x = stemX(y);
    const length = 20 + Math.sin((y + 5) / 265 * Math.PI) * (25 + random() * 55);
    const tipX = x + side * length;
    const tipY = Math.max(9, y - 8 - random() * 30);
    ctx.lineWidth = .35 + random() * .25;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + side * length * .45, y - random() * 9, tipX, tipY);
    ctx.stroke();
    const twigs = 3 + Math.floor(random() * 6);
    for (let twig = 0; twig < twigs; twig++) {
      const t = .2 + random() * .74;
      const twigX = x + (tipX - x) * t;
      const twigY = y + (tipY - y) * t;
      const endX = twigX + side * (3 + random() * 16);
      const endY = Math.max(5, twigY - 5 - random() * 22);
      ctx.lineWidth = .3 + random() * .15;
      ctx.beginPath();
      ctx.moveTo(twigX, twigY);
      ctx.quadraticCurveTo(twigX + side * 3, twigY - 6, endX, endY);
      ctx.stroke();
      // Small uneven wisps retain sky gaps instead of filling the branch fan.
      if (random() < .34) {
        const leaves = 3 + Math.floor(random() * 6);
        for (let leaf = 0; leaf < leaves; leaf++) {
          ctx.fillStyle = leaf % 2 ? '#526346' : '#46583d';
          ctx.beginPath();
          ctx.ellipse(endX + (random() - .5) * 8, endY + (random() - .5) * 6,
            .7 + random() * 1.2, .45 + random() * .6, (random() - .5) * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'woodland-sparse-branch-crown';
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
