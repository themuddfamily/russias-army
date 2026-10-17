property pos, speed, pmod, pdummy, hit, plifetime, pname
global gmem, ghvk, goody, grockmods, gmodinc, baddies

on new me, npos, nrot, nam
  pname = nam
  hit = 0
  rot = nrot
  pos = npos
  playsound(pos, "offrock", 7)
  speed = cosine3D(rot)
  pos = pos + (speed * goody.bsp)
  pmod = recyclemodel(#rocket)
  if pmod = 0 then
    gmodinc = gmodinc + 1
    pmod = gmem.model("rocket").clone("rocket" & gmodinc)
    pmod.transform.position = pos
    pmod.transform.rotation = rot
    pmod.rotate(0, 0, -90, #self)
    pdummy = ghvk.makemoveable(pmod, 1, 0.20000000000000001, 1)
    pdummy.mass = 100
  else
    pdummy = ghvk.phavok.RigidBody(pmod.name)
    pdummy.pinned = 0
    pmod.transform.position = pos
    pmod.transform.rotation = rot
    pmod.rotate(0, 0, -90, #self)
    pdummy.rotation = pmod.transform.axisAngle
  end if
  pmod.addToWorld()
  pdummy.position = pos
  pmod.shaderList = shady("rpg")
  pdummy.linearVelocity = speed * 800
  pdummy.angularVelocity = vector(0, 0, 0)
  ghvk.regint(pmod, me)
  plifetime = 200
  (the actorList).add(me)
  return me
end

on stepFrame me
  if not voidp(goody) then
    plifetime = plifetime - 1
    pdummy.linearVelocity = speed * 800
    pos = pdummy.position
    puff(me, pos)
    repeat with bad in baddies
      if (bad.pos.distanceTo(pos) < (goody.bsp * 0.69999999999999996)) and (bad.name <> pname) then
        hit = 1
        exit repeat
      end if
    end repeat
    if (hit = 1) or (plifetime = 0) or closetome(pos, goody.bsp * 0.69999999999999996) then
      hurt(me)
    end if
  end if
end

on puff me, pos
  vp = script("puff").new(pos)
end

on hurt me
  bang = script("bangs").new(pos, "rocket", pname)
  storemodel(#rocket, pmod)
  pdummy.position = vector(0, 0, -1000)
  pdummy.pinned = 1
  (the actorList).deleteOne(me)
end

on die me
end

on hitobj me, collisiondetails
  hit = 1
end
