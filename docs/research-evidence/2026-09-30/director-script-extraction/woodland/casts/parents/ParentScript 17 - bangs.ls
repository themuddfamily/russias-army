property pmod, pos, bangtime, pname
global gmem, gsmokes, goody, baddies

on new me, npos, typ, nam
  pname = nam
  playsound(npos, "boomnew")
  pmod = recyclemodel(#plane)
  if pmod = 0 then
    pmod = planemakeme()
  end if
  pmod.addToWorld()
  pos = npos
  if typ = "rocket" then
    pmod.shaderList = recycleshader("bangrocket")
    pmod.transform.scale = vector(8, 8, 8)
  else
    if typ = "grenade" then
      pmod.shaderList = recycleshader("banggrenade")
      pmod.transform.scale = vector(7, 7, 7)
    end if
  end if
  pmod.shader.texture.nearFiltering = 1
  pmod.shader.texture.renderFormat = #rgba8888
  pmod.shader.blend = 50
  pmod.shader.textureTransform.scale = vector(4, 4, 4)
  pmod.shader.textureTransform.position = vector(0, 0, 0)
  pmod.transform.position = pos
  bangtime = 16
  pmod.parent = gsmokes
  (the actorList).add(me)
  return me
end

on stepFrame me
  if not voidp(goody) then
    pmod.addToWorld()
    pmod.shader.textureTransform.position.x = pmod.shader.textureTransform.position.x - 1
    if pmod.shader.textureTransform.position.x = -4 then
      pmod.shader.textureTransform.position.x = 0
      pmod.shader.textureTransform.position.y = pmod.shader.textureTransform.position.y + 1
    end if
    dog = goody.pos - pos
    if vector(dog.x, dog.y, 0).magnitude > 0 then
      pmod.pointAt(goody.pos, vector(0, 0, 1))
    end if
    bangtime = bangtime - 1
    if closetome(pos, 250) then
      goody.hurt(5, pname)
    end if
  end if
  if bangtime = 0 then
    storemodel(#plane, pmod)
    storeshader(pmod.shader)
    (the actorList).deleteOne(me)
  end if
end

on hurt me
end
