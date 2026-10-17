property pos, speed, bsp, pmod, pdummy, howlong, pname
global gmem, ghvk, gmodinc

on new me, npos, nrot, nam
  pname = nam
  rot = nrot
  pos = npos
  playsound(pos, "grenade1", 7)
  howlong = 60
  speed = cosine3D(rot)
  pmod = recyclemodel(#grenade)
  if pmod = 0 then
    gmodinc = gmodinc + 1
    pmod = gmem.model("grenade").clone("grenade" & gmodinc)
    pmod.transform.position = pos
    pmod.pointAt(pos + speed, vector(0, 0, 1))
    pmod.transform.rotation.z = pmod.transform.rotation.z - 90
    pdummy = ghvk.makemoveable(pmod, 1, 1, 0.20000000000000001, 0.5)
  else
    pdummy = ghvk.phavok.RigidBody(pmod.name)
    pdummy.pinned = 0
    pmod.transform.position = pos
    pmod.pointAt(pos + speed, vector(0, 0, 1))
    pmod.transform.rotation.z = pmod.transform.rotation.z - 90
    pdummy.rotation = pmod.transform.axisAngle
  end if
  pmod.addToWorld()
  pdummy.position = pos
  pdummy.angularVelocity = vector(0, 0, 0)
  pdummy.linearVelocity = speed * 1300
  ghvk.regint(pmod, me)
  (the actorList).add(me)
  return me
end

on stepFrame me
  howlong = howlong - 1
  pos = pmod.transform.position
  if howlong > 1 then
  else
    hurt(me)
  end if
end

on hurt me
  bang = script("bangs").new(pos, "grenade", pname)
  storemodel(#grenade, pmod)
  pdummy.position = vector(0, 0, -1000)
  pdummy.pinned = 1
  (the actorList).deleteOne(me)
end

on hitobj me, collisiondetails
  pdummy.linearVelocity = pdummy.linearVelocity * 0.84999999999999998
end
