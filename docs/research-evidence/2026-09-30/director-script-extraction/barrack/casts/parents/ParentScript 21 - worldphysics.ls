property phavok, ptimestep, psubsteps, ppaused
global gmem, goody

on new me, npos
  phavok = member("havok")
  turnoff(me)
  ptol = 1
  pscale = 1
  phavok.Initialize(gmem, ptol, pscale)
  phavok.gravity = vector(0.0, 0.0, -400)
  setpause(0)
  setupmodels(me)
  (the actorList).add(me)
  return me
end

on setupmodels me
  repeat with i = 1 to gmem.model.count
    modo = gmem.model[i]
    if modo.name contains "door" then
      next repeat
    end if
    if modo.name contains "baddy" then
      next repeat
    end if
    if modo.name contains "barrel" then
      next repeat
    end if
    modo.addModifier(#meshDeform)
    makefixed(me, modo, 0, 1, 0.10000000000000001, 1)
  end repeat
end

on turnoff me
  if phavok.initialized then
    phavok.shutDown()
  end if
end

on stepFrame me
  if not ppaused then
    phavok.step(0.05, 10)
  end if
end

on setpause flag
  ppaused = flag
end

on makemoveable me, modo, convo, mass, rest, friction
  if voidp(phavok.RigidBody(modo.name)) then
    if not getPos(modo.modifier, #meshDeform) then
      modo.addModifier(#meshDeform)
    end if
    if voidp(friction) then
      friction = 0
    end if
    if voidp(mass) then
      mass = 0
    end if
    if voidp(rest) then
      rest = 0
    end if
    rb = phavok.makeMovableRigidBody(modo.name, mass, value(convo))
    rb.pinned = 0
    rb.restitution = rest
    rb.friction = friction
  else
    rb = phavok.RigidBody(modo.name)
  end if
  return rb
end

on regint me, modo, who
  phavok.registerInterest(modo.name, #all, 0, 0, #hitobj, who)
end

on makedummy me, radius, mass, rest, friction, who
  if voidp(gmem.modelResource(string(radius))) then
    nmr = gmem.newModelResource(string(radius), #sphere, #front)
  else
    nmr = gmem.modelResource(string(radius))
  end if
  if who = goody then
    modo = gmem.newModel("goody dummy", nmr)
  else
    modo = gmem.newModel(who.pmod.name & "dummy", nmr)
  end if
  modo.addModifier(#meshDeform)
  if voidp(friction) then
    friction = 0
  end if
  if voidp(mass) then
    mass = 0
  end if
  if voidp(rest) then
    rest = 0
  end if
  rb = phavok.makeMovableRigidBody(modo.name, mass, 1, #sphere)
  rb.pinned = 0
  rb.restitution = rest
  rb.friction = friction
  regint(me, modo, who)
  modo.removeFromWorld()
  return rb
end

on removethefella me, modo
  phavok.removeInterest(modo.name)
  phavok.deleteRigidBody(modo.name)
end

on makefixed me, modo, convex, restitution, friction
  if voidp(phavok.RigidBody(modo.name)) then
    if not getPos(modo.modifier, #meshDeform) then
      modo.addModifier(#meshDeform)
    end if
    if voidp(friction) then
      friction = 0
    end if
    if voidp(restitution) then
      restitution = 0
    end if
    rb = phavok.makeFixedRigidBody(modo.name, value(convex))
    rb.restitution = restitution
    rb.friction = friction
  else
    rb = phavok.RigidBody(modo.name)
  end if
  return rb
end
