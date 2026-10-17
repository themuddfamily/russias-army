property pmod, pos, weap, bangtime
global gmem, goody, baddies, gsmokes, gmpismods, gmspasmods, gmakmods, gmodinc

on new me, who
  if who = goody.weaponry then
    weap = goody.weapon
    muzviz = #both
    modo = who.pmod
  else
    weap = who.weapon
    muzviz = #both
    modo = who.gunmod
  end if
  vtype = value("#" & weap & "muzzles")
  pmod = recyclemodel(vtype)
  if pmod = 0 then
    gmodinc = gmodinc + 1
    pmod = gmem.model("mf" & weap).clone("mf" & weap & gmodinc)
  end if
  pmod.shaderList = shady("mfmachinegun")
  pmod.shader.texture.nearFiltering = 1
  pmod.shader.texture.renderFormat = #rgba8888
  pmod.shader.blend = 100
  pmod.visibility = muzviz
  pmod.transform.position = modo.getWorldTransform().position
  pmod.transform.rotation = modo.getWorldTransform().rotation
  bangtime = 1
  pmod.parent = gsmokes
  (the actorList).add(me)
  return me
end

on stepFrame me
  pmod.addToWorld()
  if bangtime = 0 then
    vtype = value("#" & weap & "muzzles")
    storemodel(vtype, pmod)
    (the actorList).deleteOne(me)
  end if
  bangtime = bangtime - 1
end

on hurt me
end
