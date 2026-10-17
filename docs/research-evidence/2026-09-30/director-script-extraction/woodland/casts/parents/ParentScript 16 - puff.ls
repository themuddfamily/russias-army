property pmod, myscale, pos, inc
global gmem, goody, gsmokes

on new me, npos
  pos = npos
  pmod = recyclemodel(#plane)
  if pmod = 0 then
    pmod = planemakeme()
  end if
  pmod.shaderList = recycleshader("pufft")
  pmod.shader.emissive = rgb(255, 255, 255)
  pmod.shader.blend = 50
  pmod.transform.scale = vector(0.01, 0.01, 0.01)
  pmod.transform.position = pos + vector(0, 0, goody.bsp * 0.20000000000000001)
  if not voidp(goody) then
    pmod.pointAt(goody.pmod)
  end if
  pmod.rotate(vector(0, 0, random(36) * 10), #self)
  myscale = 0
  inc = 6
  pmod.parent = gsmokes
  (the actorList).add(me)
  return me
end

on stepFrame me
  myscale = myscale + inc
  pmod.shader.blend = 100 - (myscale * 0.55000000000000004)
  pmod.transform.scale = myscale * vector(1, 1, 1) * 0.02
  if myscale > 180 then
    hurt(me)
  end if
end

on hit me
end

on hurt me
  storemodel(#plane, pmod)
  storeshader(pmod.shader)
  (the actorList).deleteOne(me)
  me = VOID
end
