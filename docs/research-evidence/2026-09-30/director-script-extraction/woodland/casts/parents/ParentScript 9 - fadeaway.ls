property pos, tarpos, bsp, speed, bon, pmod
global ghvk, gmem, gcam, gsoldiers

on new me, modo, npos
  pmod = modo
  pos = npos
  playsound(pos, "hurt")
  tarpos = pos
  bsp = pmod.boundingSphere[2] * 0.75
  pmod.removeFromWorld()
  bon = 0
  hit = gmem.modelsUnderRay(pos, vector(0, 0, -1), 1, #detailed)
  if hit.count > 0 then
    tarpos = hit[1].isectPosition + vector(0, 0, bsp)
  end if
  speed = vector(0, 0, -bsp) / 300
  pmod.transform.position = pos
  pmod.addToWorld()
  (the actorList).add(me)
  return me
end

on stepFrame me
  bon = bon + 8
  pmod.transform.position = pmod.transform.position + (speed * 8)
  pmod.bonesPlayer.currentTime = bon + 2400
  if bon > 600 then
    storemodel(#GI, pmod)
    (the actorList).deleteOne(me)
  end if
end

on hurt me, howbad
end
