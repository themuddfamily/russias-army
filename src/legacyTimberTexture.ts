import * as THREE from 'three';

/** Authored weathered timber family from the sharp Woodland 10/11-second shed.
 * Broad vertical stains reproduce the visible surface direction, not original
 * texture data or measured board widths. The caller owns the returned texture.
 */
export function createLegacyTimberTexture(): THREE.CanvasTexture {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d')!;
  let seed=38671;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  ctx.fillStyle='#94958e';ctx.fillRect(0,0,256,256);
  const palette=['#898b84','#adaea5','#747871','#999b93','#b5b5aa','#81857c'];
  // Unequal board tones and wandering, broken streaks are the large pattern.
  // Wrapped stain copies keep their irregular ends continuous across tile seams.
  for(let board=0;board<8;board++){
    const left=board*32;
    ctx.fillStyle=palette[board%palette.length];ctx.fillRect(left,0,32,256);
    for(let stain=0;stain<7;stain++){
      const x=left+3+random()*24,y=random()*256;
      const width=3+random()*10,height=45+random()*150;
      const bends=Array.from({length:6},()=>random()*5-2.5);
      const offsets=Array.from({length:6},()=>.45+random()*.55);
      const shade=stain%3===0?'rgba(214,214,198,.27)':
        stain%3===1?'rgba(43,49,41,.34)':'rgba(65,70,60,.20)';
      for(const dx of [-256,0,256])for(const dy of [-256,0,256]){
        ctx.beginPath();ctx.moveTo(x+dx,y+dy);
        for(let step=0;step<6;step++)ctx.lineTo(x+dx+bends[step],y+dy+height*step/5);
        for(let step=5;step>=0;step--)ctx.lineTo(x+dx+bends[step]+width*offsets[step],y+dy+height*step/5);
        ctx.lineTo(x+dx,y+dy);ctx.fillStyle=shade;ctx.fill();
      }
    }
    // Narrow worn joints remain subordinate to weathering, without black stripes.
    ctx.fillStyle='rgba(42,47,39,.36)';ctx.fillRect(left,0,1.3,256);
    ctx.fillStyle='rgba(217,216,199,.13)';ctx.fillRect(left+1.3,0,1,256);
  }
  // Sparse elongated grain supplies texture without replacing the broad stains.
  for(let grain=0;grain<1100;grain++){
    ctx.fillStyle=grain%2?'rgba(220,219,205,.065)':'rgba(31,36,29,.075)';
    ctx.fillRect(random()*256,random()*256,.5+random(),2+random()*7);
  }
  const texture=new THREE.CanvasTexture(canvas);texture.name='woodland-weathered-vertical-timber';
  texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.repeat.set(2,1);texture.anisotropy=4;
  return texture;
}
