property pmod, pos, bangtime
global gmem, goody, baddies, gsmokes

on new me, npos
  pmod = recyclemodel(#plane)
  if pmod = 0 then
    pmod = planemakeme()
  end if
  pmod.transform.scale = vector(2, 2, 2)
  pmod.shaderList = shady("spatter")
  pmod.shader.texture.nearFiltering = 1
  pmod.shader.texture.renderFormat = #rgba8888
  pmod.shader.blend = 50
  pmod.shader.textureTransform.scale = vector(3, 3, 3)
  pmod.shader.textureTransform.position = vector(1, 1, 0)
  pos = npos
  pmod.transform.position = pos
  bangtime = 8
  pmod.parent = gsmokes
  (the actorList).add(me)
  return me
end

on stepFrame me
  if not voidp(goody) then
    pmod.shader.textureTransform.position.x = pmod.shader.textureTransform.position.x - 1
    if pmod.shader.textureTransform.position.x = -3 then
      pmod.shader.textureTransform.position.x = 0
      pmod.shader.textureTransform.position.y = pmod.shader.textureTransform.position.y + 1
    end if
    pmod.pointAt(goody.pos, vector(0, 0, 1))
    if bangtime < 1 then
      storemodel(#plane, pmod)
      (the actorList).deleteOne(me)
    end if
    bangtime = bangtime - 4
  end if
end

on hurt me
end
