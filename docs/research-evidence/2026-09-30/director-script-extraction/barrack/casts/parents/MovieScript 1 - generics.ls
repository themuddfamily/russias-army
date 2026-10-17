global gmem, goody, gscore, glevel, Enhancer, mousmov, baddies, hspots, tasks, clues, grecmods, gshaders, gmodinc, groomcount

on getnormal modo, norm
  wtf = modo.getWorldTransform()
  wtf.scale = vector(1, 1, 1)
  wtf.position = vector(0, 0, 0)
  vnormal = wtf * norm
  return vnormal
end

on resetall
  the romanLingo = 1
  mus = VOID
  clearGlobals()
  groomcount = 51
  resetactors()
  set the floatPrecision to 2
  glevel = 1
end

on resetactors
  set the keyDownScript to EMPTY
  member("rooms").scrollTop = 0
  gmodinc = 0
  grecmods = [:]
  gshaders = []
  the actorList = []
  baddies = []
  hspots = []
  tasks = []
  clues = []
end

on prepareMovie me
  the actorList = []
  glevel = 1
  bad = member("baddy")
  bad.resetWorld()
  member("gunz").resetWorld()
  repeat with i = 1 to bad.model.count
    md = bad.model[i]
    nom = md.name
    flog = bad.newTexture(nom, #fromCastMember, member(nom))
    md.shaderList = bad.newShader(nom, #standard)
    md.shader.texture = flog
    md.shader.emissive = rgb(200, 200, 200)
    md.shader.specular = rgb(0, 0, 0)
  end repeat
end

on cosine3D rotsend
  bob = vector(0, 0, 0)
  bob.x = -(rotsend.z * PI / 180).sin * 1
  bob.y = (rotsend.z * PI / 180).cos * 1
  bob.z = (rotsend.x * PI / 180).sin * 1
  bob.x = (rotsend.x * PI / 180).cos * bob.x
  bob.y = (rotsend.x * PI / 180).cos * bob.y
  return bob
end

on vectoang vpos1, vpos2
  delta = vpos1 - vpos2
  if delta.magnitude > 0 then
    rad = atan(delta.x, delta.y)
    ang1 = rad / (PI / 180)
    leng = vector(delta.x, delta.y, 0).magnitude
    rad = atan(delta.z, leng)
    ang2 = rad / (PI / 180)
    return vector(ang2, 0, ang1)
  else
    return vector(0, 0, 0)
  end if
end

on playsound pos, what, chan
  mem = member(string(what))
  cam = gmem.camera[1]
  ear = cam.transform.position
  vlear = ear + getnormal(cam, vector(-5, 0, 0))
  vrear = ear + getnormal(cam, vector(5, 0, 0))
  if pos = 0 then
    pos = ear
  end if
  numvol = 200 - integer(pos.distanceTo(ear) * 0.04)
  vpan = (float(vlear.distanceTo(pos)) - vrear.distanceTo(pos)) * 10
  if numvol > 1 then
    if voidp(chan) then
      repeat with chan = 1 to 8
        if not soundBusy(chan) then
          puppetSound(chan, 0)
          sound(chan).play([#member: mem, #loopCount: 1])
          sound(chan).volume = numvol
          sound(chan).pan = vpan
          exit repeat
        end if
      end repeat
    else
      puppetSound(chan, 0)
      sound(chan).play([#member: mem, #loopCount: 1])
      sound(chan).volume = numvol
      sound(chan).pan = vpan
    end if
  end if
  return 1
end

on shady whatty
  if voidp(gmem.shader(whatty)) then
    shadster = gmem.newShader(whatty, #standard)
  else
    shadster = gmem.shader(whatty)
  end if
  shadster.texture = texy(whatty)
  shadster.emissive = rgb(255, 255, 255)
  shadster.specular = rgb(0, 0, 0)
  return shadster
end

on texy whatty
  vmem = member(whatty, "textures")
  if not voidp(member("whatty")) then
    if voidp(gmem.texture(whatty)) then
      tex = gmem.newTexture(whatty, #fromCastMember, vmem)
    else
      tex = gmem.texture(whatty)
      tex.member = vmem
    end if
    tex.renderFormat = #rgba8888
    return tex
  else
    alert(whatty & " aint there...")
    return gmem.texture[1]
  end if
end

on closetome vpos, diam
  if not voidp(goody) then
    if goody.pos.distanceTo(vpos) < diam then
      return 1
    end if
  end if
  return 0
end

on planemakeme
  if voidp(gmem.modelResource("plane")) then
    nmr = gmem.newModelResource("plane", #plane, #front)
    nmr.width = goody.bsp
    nmr.length = goody.bsp
  else
    nmr = gmem.modelResource("plane")
  end if
  gmodinc = gmodinc + 1
  p = gmem.newModel("plane" & gmodinc, nmr)
  return p
end

on startMovie
  resetall()
  if the moviePath contains "http://www.gamevial.com" then
  else
    if the moviePath contains "http://gamevial.com" then
    else
      gotoNetPage("http://www.gamevial.com")
    end if
  end if
  set the exitLock to 1
end
