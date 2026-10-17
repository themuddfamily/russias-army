import * as THREE from 'three';

/** Broad weathered gray roof family from the sharp Woodland stone-building
 * views. This authors mottling; it does not recover original tiles or textures.
 * The caller owns the texture. Its independent seed preserves tree placement.
 */
export function createLegacyRoofTexture(): THREE.CanvasTexture {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d')!;
  let seed=82731;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  ctx.fillStyle='#777977';ctx.fillRect(0,0,256,256);
  for(let i=0;i<190;i++){
    const x=random()*256,y=random()*256,rx=3+random()*16,ry=2+random()*7;
    ctx.fillStyle=i%3===0?'rgba(207,208,202,.18)':i%3===1?'rgba(42,47,44,.16)':'rgba(149,152,147,.18)';
    for(const dx of [-256,0,256])for(const dy of [-256,0,256]){
      ctx.beginPath();ctx.ellipse(x+dx,y+dy,rx,ry,0,0,Math.PI*2);ctx.fill();
    }
  }
  for(let i=0;i<4200;i++){
    ctx.fillStyle=i%2?'rgba(226,227,221,.08)':'rgba(31,36,33,.09)';
    ctx.fillRect(random()*256,random()*256,.5+random()*2,.5+random()*2);
  }
  const texture=new THREE.CanvasTexture(canvas);texture.name='woodland-weathered-gray-roof';
  texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.repeat.set(2,1);texture.anisotropy=4;return texture;
}
