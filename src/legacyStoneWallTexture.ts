import * as THREE from 'three';

/** Authored weathered masonry from the sharp Woodland outbuilding views.
 * Broad broken stone patches replace fine stucco-like noise; this is not an
 * extracted original texture. The arena owns and disposes the returned map.
 */
export function createLegacyStoneWallTexture():THREE.CanvasTexture {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d')!;
  let seed=39517;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  ctx.fillStyle='#93978b';ctx.fillRect(0,0,256,256);
  const palette=['#858c80','#a0a596','#737c70','#959e8e','#8b9385','#a7ab9e'];
  for(let stone=0;stone<64;stone++){
    const x=random()*256,y=random()*256,rx=12+random()*29,ry=7+random()*16;
    const points:Array<[number,number]>=[];
    for(let corner=0;corner<7;corner++){
      const angle=corner*Math.PI*2/7,scale=.72+random()*.36;
      points.push([Math.cos(angle)*rx*scale,Math.sin(angle)*ry*scale]);
    }
    for(const dx of [-256,0,256])for(const dy of [-256,0,256]){
      const ox=x+dx,oy=y+dy;
      ctx.beginPath();ctx.moveTo(ox+points[0][0],oy+points[0][1]);
      for(let corner=1;corner<points.length;corner++)ctx.lineTo(ox+points[corner][0],oy+points[corner][1]);
      ctx.closePath();ctx.fillStyle=palette[stone%palette.length];ctx.fill();
      // Broken joints retain irregular weathering rather than red-brick rows.
      ctx.beginPath();ctx.moveTo(ox+points[0][0],oy+points[0][1]);
      for(const corner of [1,2,3])ctx.lineTo(ox+points[corner][0],oy+points[corner][1]);
      ctx.strokeStyle='rgba(54,63,49,.24)';ctx.lineWidth=1.1;ctx.stroke();
      ctx.beginPath();ctx.moveTo(ox+points[4][0],oy+points[4][1]);
      ctx.lineTo(ox+points[5][0],oy+points[5][1]);
      ctx.strokeStyle='rgba(220,224,209,.18)';ctx.lineWidth=.8;ctx.stroke();
    }
  }
  for(let stain=0;stain<85;stain++){
    const x=random()*256,y=random()*256,radius=5+random()*27;
    for(const dx of [-256,0,256])for(const dy of [-256,0,256]){
      const ox=x+dx,oy=y+dy,wash=ctx.createRadialGradient(ox,oy,0,ox,oy,radius);
      wash.addColorStop(0,stain%3===0?'rgba(194,200,180,.22)':'rgba(42,55,37,.22)');
      wash.addColorStop(1,'rgba(99,110,91,0)');ctx.fillStyle=wash;
      ctx.fillRect(ox-radius,oy-radius,radius*2,radius*2);
    }
  }
  for(let grain=0;grain<6500;grain++){
    ctx.fillStyle=grain%2?'rgba(225,228,214,.09)':'rgba(36,45,31,.09)';
    ctx.fillRect(random()*256,random()*256,1+random()*2,1+random()*2);
  }
  const texture=new THREE.CanvasTexture(canvas);texture.name='woodland-weathered-stone-wall';
  texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.repeat.set(1,1);texture.anisotropy=4;
  return texture;
}
