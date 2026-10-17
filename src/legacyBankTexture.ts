import * as THREE from 'three';

/** Authored angular earth/stone family from the Woodland 15-second frame.
 * Patch dimensions suit a 4m tile; they are not recovered original texture data.
 * The caller owns the returned texture and supplies the bank's slope-aware UVs.
 */
export function createLegacyBankTexture(): THREE.CanvasTexture {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d')!;
  let seed=75193;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  ctx.fillStyle='#877c66';ctx.fillRect(0,0,256,256);
  const palette=['rgba(133,123,102,.80)','rgba(155,145,123,.75)',
    'rgba(112,104,87,.76)','rgba(150,142,119,.78)',
    'rgba(119,112,96,.77)','rgba(143,132,111,.74)'];
  // Broad uneven slabs overlap instead of forming individually outlined stones.
  // Their different tilts and lengths break up the repeated pebble mosaic that
  // was too conspicuous against the sharp source's fractured bank.
  for(let patch=0;patch<26;patch++){
    const x=random()*256,y=random()*256,rx=25+random()*40,ry=10+random()*21;
    const points:Array<[number,number]>=[];
    const rotation=(random()-.5)*1.8,skew=(random()-.5)*.65;
    for(let corner=0;corner<8;corner++){
      const angle=corner*Math.PI*2/8,radius=.72+random()*.42;
      const px=Math.cos(angle)*rx*radius+Math.sin(angle)*ry*skew;
      const py=Math.sin(angle)*ry*radius;
      points.push([px*Math.cos(rotation)-py*Math.sin(rotation),
        px*Math.sin(rotation)+py*Math.cos(rotation)]);
    }
    const color=palette[patch%palette.length];
    // Wrapped copies preserve each coarse rock across both tile seams.
    for(const dx of [-256,0,256])for(const dy of [-256,0,256]){
      const ox=x+dx,oy=y+dy;
      ctx.beginPath();ctx.moveTo(ox+points[0][0],oy+points[0][1]);
      for(let corner=1;corner<points.length;corner++)ctx.lineTo(ox+points[corner][0],oy+points[corner][1]);
      ctx.closePath();
      ctx.fillStyle=color;ctx.fill();
      // Partial fractures leave most slab boundaries embedded in the earth.
      // Never trace the complete perimeter as a regular network of joints.
      ctx.beginPath();ctx.moveTo(ox+points[4][0],oy+points[4][1]);
      for(const corner of [5,6])ctx.lineTo(ox+points[corner][0],oy+points[corner][1]);
      ctx.strokeStyle='rgba(43,42,33,.26)';ctx.lineWidth=1.5;ctx.stroke();
      ctx.beginPath();ctx.moveTo(ox+points[6][0],oy+points[6][1]+1.5);
      ctx.lineTo(ox+points[7][0],oy+points[7][1]+1.5);
      ctx.strokeStyle='rgba(210,203,174,.18)';ctx.lineWidth=1.1;ctx.stroke();
      ctx.beginPath();ctx.moveTo(ox+points[3][0],oy+points[3][1]);
      ctx.lineTo(ox-rx*.14,oy+ry*.07);
      ctx.lineTo(ox+points[0][0]*.42,oy+points[0][1]*.42);
      ctx.strokeStyle='rgba(44,44,35,.15)';ctx.lineWidth=.8;ctx.stroke();
    }
  }
  // Soft earth stains at two scales interrupt the angular faces and quiet their
  // transitions. Every stain is wrapped, including its gradient falloff.
  for(let stain=0;stain<75;stain++){
    const x=random()*256,y=random()*256,radius=stain<18?24+random()*37:5+random()*15;
    for(const dx of [-256,0,256])for(const dy of [-256,0,256]){
      const ox=x+dx,oy=y+dy;
      const wash=ctx.createRadialGradient(ox,oy,0,ox,oy,radius);
      wash.addColorStop(0,stain%3===0?'rgba(181,166,134,.19)':'rgba(58,56,40,.20)');
      wash.addColorStop(1,'rgba(98,90,69,0)');ctx.fillStyle=wash;
      ctx.fillRect(ox-radius,oy-radius,radius*2,radius*2);
    }
  }
  // Fine dirt stays subordinate to the large angular pattern.
  for(let grain=0;grain<5500;grain++){
    ctx.fillStyle=grain%2?'rgba(224,216,184,.06)':'rgba(27,29,20,.07)';
    ctx.fillRect(random()*256,random()*256,1+random()*2,1+random()*2);
  }
  const texture=new THREE.CanvasTexture(canvas);texture.name='woodland-angular-bank-stone';
  texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.repeat.set(1,1);texture.channel=1;texture.anisotropy=4;
  return texture;
}
