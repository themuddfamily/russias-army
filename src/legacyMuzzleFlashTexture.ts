import * as THREE from 'three';

/** Pale soft rays seen in the sharp Woodland still; artwork is authored.
 * Neither flash duration nor world-space size is measured by that image. */
export function createLegacyMuzzleFlashTexture(): THREE.CanvasTexture {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d')!;
  const glow=ctx.createRadialGradient(128,128,0,128,128,115);
  glow.addColorStop(0,'rgba(255,255,248,.95)');
  glow.addColorStop(.18,'rgba(255,255,235,.7)');
  glow.addColorStop(.48,'rgba(255,250,213,.2)');
  glow.addColorStop(1,'rgba(255,250,213,0)');
  ctx.fillStyle=glow;ctx.fillRect(0,0,256,256);
  for(const [angle,length,width] of [[0,118,10],[Math.PI/2,122,8],[.52,90,7],[2.36,94,6]] as const){
    const dx=Math.cos(angle),dy=Math.sin(angle),px=-dy*width,py=dx*width;
    const ray=ctx.createRadialGradient(128,128,1,128,128,length);
    ray.addColorStop(0,'rgba(255,255,249,.95)');ray.addColorStop(.25,'rgba(255,255,235,.65)');ray.addColorStop(1,'rgba(255,250,217,0)');
    ctx.fillStyle=ray;ctx.beginPath();
    ctx.moveTo(128+dx*length,128+dy*length);ctx.lineTo(128+px,128+py);
    ctx.lineTo(128-dx*length,128-dy*length);ctx.lineTo(128-px,128-py);ctx.closePath();ctx.fill();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.name='legacy-pale-muzzle-starburst';texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}
