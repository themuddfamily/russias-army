global gmem, grecmods, gshaders, gmodinc

on storemodel ntype, nmod
  vid = ntype
  vmods = grecmods.getaProp(ntype)
  if vmods = 0 then
    grecmods.addProp(ntype, [nmod])
  else
    vmods.add(nmod)
    grecmods.setaProp(ntype, vmods)
  end if
  nmod.removeFromWorld()
end

on recyclemodel ntype
  vmods = grecmods.getaProp(ntype)
  if vmods = 0 then
    grecmods.addProp(ntype, [])
    return 0
  else
    if vmods.count = 0 then
      return 0
    else
      vmod = vmods[1]
      vmod.addToWorld()
      vmods.deleteOne(vmod)
      grecmods.setaProp(ntype, vmods)
      return vmod
    end if
  end if
end

on recycleshader nam
  if gshaders.count = 0 then
    sha = gmem.newShader("shad" & gmodinc, #standard)
    sha.emissive = rgb(255, 255, 255)
    sha.shininess = 0
    gmodinc = gmodinc + 1
  else
    sha = gshaders[1]
    gshaders.deleteAt(1)
  end if
  sha.texture = texy(nam)
  sha.textureTransform.scale = vector(1, 1, 1)
  sha.textureTransform.position = vector(0, 0, 0)
  return sha
end

on storeshader nsha
  gshaders.add(nsha)
end
