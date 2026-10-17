property pmod, pos, bangtime
global gmem, goody, gsmokes

on new me, npos, nnor
  pmod = recyclemodel(#plane)
  if pmod = 0 then
    pmod = planemakeme()
  end if
  if goody.weapon = #spas12 then
    pmod.shaderList = shady("decalspas")
    pmod.transform.scale = vector(1, 1, 1) * 0.5
  else
    pmod.shaderList = shady("decal")
    pmod.transform.scale = vector(1, 1, 1) * 0.40000000000000002
  end if
  pmod.shader.texture.nearFiltering = 1
  pmod.shader.texture.renderFormat = #rgba8888
  pmod.shader.blend = 40
  oldpos = npos
  pmod.transform.position = oldpos + nnor
  pmod.pointAt(oldpos)
  pmod.rotate(180, 0, 0, #self)
  bangtime = 80
  pmod.parent = gsmokes
  (the actorList).add(me)
  return me
end

on stepFrame me
  pmod.addToWorld()
  if bangtime = 0 then
    storemodel(#plane, pmod)
    (the actorList).deleteOne(me)
  end if
  bangtime = bangtime - 1
end

on hurt me
end
