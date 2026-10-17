property pmod, pos, rot, momentum, bsp, getnormal, jump, weapon, weapons, chambers, keys, weaponry, oldm, Enhancer, pdummy, name, pingserver, myhu, ptyping, ptext, pmousedelta, plives, poldlives, pcheatflick
global ghvk, grecmods, gmem, gcam, glevel, hspots, goody, baddies, tasks, oldkey, gignores, nom, gkiller, gscore, goldscore

on new me, npos, val
  name = nom
  setscore(me, 0)
  weapons = [#rpg: 12, #rg6: 18, #ak47: 140, #pistol: 54, #spas12: 24, #dragunov: 12]
  chambers = [#rpg: 1, #rg6: 6, #ak47: 28, #pistol: 8, #spas12: 6, #dragunov: 30]
  weapon = #rg6
  bsp = 50
  goody = me
  prepare(me, npos, val)
  myhu = 0
  ptyping = 0
  pmousedelta = 0.5
  plives = 102
  poldlives = 100
  pcheatflick = 2
  writestats(me)
end

on prepare me, npos, val
  pos = npos
  pdummy = ghvk.makedummy(bsp / 2.5, 1, 0.10000000000000001, 1, me)
  pdummy.position = pos + vector(4, 0, 25)
  pdummy.linearVelocity = vector(0, 0, 0)
  ghvk.regint(pdummy, me)
  rot = val
  keys = []
  jump = 1
  momentum = vector(0, 0, 0)
  if voidp(Enhancer) then
    Enhancer = new(xtra("enhancer"), "AAENHX-84445-65466-18140")
  end if
  move_cursor(Enhancer, 400, 300)
  oldm = the mouseLoc
  if (the actorList).getOne(me) = 0 then
    (the actorList).add(me)
  end if
  if baddies.getOne(me) = 0 then
    baddies.add(me)
  end if
  buildui(me)
  weaponry = script("weaponry").new(me)
  set the keyDownScript to "goody.keywalk()"
end

on buildui me
  member("hints").text = EMPTY
  member("talk").text = EMPTY
  rec = sprite(1).rect
  mid = point(rec[1] + ((rec[3] - rec[1]) / 2), rec[2] + ((rec[4] - rec[2]) / 2))
  member("UI").posterFrame = 2
  hud1 = texy("UI")
  hud1.nearFiltering = 0
  hud2 = texy("hurtrot")
  hud3 = texy("weapons")
  hud3.nearFiltering = 0
  hud4 = texy("stats")
  hud4.nearFiltering = 0
  hud5 = texy("hints")
  hud5.nearFiltering = 1
  hud6 = texy("talk")
  hud6.nearFiltering = 0
  hud7 = texy("health")
  pmod = gmem.camera[1]
  sprite(1).camera = pmod
  pmod.fieldOfView = 50
  pmod.projection = #perspective
  pmod.transform.position = pos
  pmod.addOverlay(hud1, point(0, 0), 0)
  pmod.addOverlay(hud2, point(336, 236), 0)
  pmod.overlay[2].blend = 0
  pmod.addOverlay(hud3, point(40, 19), 0)
  pmod.addOverlay(hud4, point(rec[3] - 111, 80), 0)
  pmod.addOverlay(hud5, point(40, 510), 0)
  pmod.addOverlay(hud6, point(40, 490), 0)
  pmod.addOverlay(hud7, point(rec[3] - 82, 11), 0)
  feedback(me, "Welcome to Russia Army, comrade " & nom & "!")
end

on feedback me, news
  if not news = 0 then
    playsound()
    arse = news & RETURN & member("hints").text
    member("hints").text = arse.line[1..5]
    member("hints").color = rgb(0, 255, 0)
    member("hints").line[1].color = rgb(255, 255, 0)
  end if
  if not voidp(gmem) then
    if not voidp(gmem.texture("hints")) then
      texy("hints")
    end if
  end if
end

on stepFrame me
  pingserver = pingserver + 1
  if pingserver = 5 then
    getmus()
  end if
  if pingserver = 10 then
    pingserver = 1
    content = [#pos: pos, #rot: rot, #wea: weapon]
    if weaponry.shots > 0 then
      content.addProp(#shots, weaponry.shots)
      weaponry.shots = 0
    end if
    if myhu > 0 then
      content.addProp(#myhu, weaponry.myhu)
      myhu = 0
    end if
    if weaponry.hurts <> [:] then
      content.addProp(#hurts, weaponry.hurts)
      weaponry.hurts = [:]
    end if
    submitmus([#subject: "where", #content: content])
  end if
  momentum.z = momentum.z - 3
  momentum.z = momentum.z * 0.90000000000000002
  if keyPressed(123) then
    rot.z = rot.z + 5
  else
    if keyPressed(124) then
      rot.z = rot.z - 5
    end if
  end if
  if rot.x > 85 then
    rot.x = 85
  else
    if rot.x < -85 then
      rot.x = -85
    end if
  end if
  mousmov = oldm - the mouseLoc
  rot.z = rot.z + (mousmov.locH * pmousedelta)
  rot.x = rot.x + (mousmov.locV * pmousedelta)
  move_cursor(Enhancer, 320, 240)
  oldm = the mouseLoc
  push = vector(0, 0, 0)
  push2 = vector(0, 0, 0)
  forward = -bsp * 2
  vpushrot = vector(0, 0, 0)
  if jump = 0 then
    force = bsp * 2 * pdummy.mass
    if ptyping = 0 then
      if the rightMouseDown or keyPressed(126) or keyPressed("w") or keyPressed("W") then
        push = cosine3D(rot) * -forward
      else
        if keyPressed(125) or keyPressed("s") or keyPressed("S") then
          push = cosine3D(rot) * forward
        end if
      end if
      if keyPressed("d") or keyPressed("D") then
        push2 = cosine3D(rot + vector(0, 0, 90)) * forward
      else
        if keyPressed("A") or keyPressed("A") then
          push2 = cosine3D(rot + vector(0, 0, -90)) * forward
        end if
      end if
      if keyPressed(SPACE) then
        jump = 1
        pdummy.applyImpulse(vector(0, 0, bsp * 5))
      end if
    end if
    if push = vector(0, 0, 0) then
      push = push2
    else
      if push2 = vector(0, 0, 0) then
      else
        push = (push + push2) / 2
      end if
    end if
    getnormal = pmod.getWorldTransform()
    getnormal.position = vector(0, 0, 0)
    getnormal.scale = vector(1, 1, 1)
    pdummy.applyImpulse(push)
    mdrag = vector(pdummy.linearVelocity.x * 0.75, pdummy.linearVelocity.y * 0.75, pdummy.linearVelocity.z)
    pdummy.linearVelocity = mdrag
  end if
  pos = pdummy.position + vector(0, 0, bsp * 1.19999999999999996)
  pmod.transform.position = pos
  pmod.transform.rotation = rot + vector(90, 0, 0)
  placeobject(me)
  jump = 1
  if pmod.overlay[2].blend > 0 then
    pmod.overlay[2].blend = pmod.overlay[2].blend - 4
  end if
  cheatfinder(me)
end

on cheatfinder me
  if (poldlives = (plives - pcheatflick)) and (pcheatflick <> 0) then
    plives = plives - pcheatflick
  else
    die(me, 1000, "Espionage")
  end if
  pcheatflick = -pcheatflick
  poldlives = plives
  plives = plives + pcheatflick
end

on placeobject me
  if not (the keyPressed = oldkey) then
    oldkey = the keyPressed
  end if
end

on keytalk me
  if keyPressed(RETURN) then
    set the keyDownScript to "goody.keywalk()"
    submitmus([#subject: "talk", #content: member("talk").text])
    member("talk").text = EMPTY
    ptyping = 0
    texy("talk")
  else
    if keyPressed(TAB) then
      set the keyDownScript to "goody.keywalk()"
      member("talk").text = EMPTY
      ptyping = 0
      texy("talk")
    else
      if keyPressed(BACKSPACE) then
        if member("talk").char.count > 2 then
          val = member("talk").text.char[1..member("talk").text.char.count - 1]
          member("talk").text = val
        end if
        texy("talk")
      else
        if the keyPressed <> 0 then
          if member("talk").char.count < 40 then
            member("talk").text = member("talk").text & the keyPressed
          end if
          texy("talk")
        end if
      end if
    end if
  end if
  if the keyCode = 53 then
    hurt(me, 1000, "Cowardice")
  end if
end

on keywalk me
  if keyPressed("m") or keyPressed("M") then
    vtex = "Members: "
    repeat with bad in baddies
      vtex = vtex & bad.name & " "
    end repeat
    feedback(me, vtex)
  else
    if keyPressed(TAB) then
      set the keyDownScript to "goody.keytalk()"
      member("talk").text = ">> "
      texy("talk")
      ptyping = 1
    end if
  end if
  if the keyCode = 53 then
    die(me, "Cowardice")
  end if
end

on hitobj me, collisiondetails
  if collisiondetails[4].z > 0.5 then
    jump = 0
  end if
end

on hurt me, howbad, vnom
  bad = getplayer(vnom)
  if bad <> 0 then
    vang = (vectoang(pos, bad.pos).z + rot.z) mod 360
    member("hurtrot").posterFrame = 361 + vang
    gmem.texture("hurtrot").member = member("hurtrot")
    pmod.overlay[2].blend = 100
  end if
  playsound(0, "hurtme", 8)
  setlives(me, -howbad, vnom)
end

on setlives me, liv, nnom
  gkiller = nnom
  plives = plives + liv
  poldlives = poldlives + liv
  writestats(me)
  if (plives + pcheatflick) < 0 then
    plives = 0
    die(me, nnom)
  else
    myhu = myhu + liv
  end if
end

on writestats me
  if not voidp(goody) then
    member("health").posterFrame = 100 - (plives + 1 - pcheatflick)
    member("stats").word[2] = EMPTY & gscore
    member("stats").word[2].color = rgb(255, 255, 0)
    if not voidp(gmem) then
      if not voidp(gmem.texture("health")) then
        gmem.texture("health").member = member("health")
      end if
      if not voidp(gmem.texture("stats")) then
        gmem.texture("stats").member = member("stats")
      end if
    end if
  end if
end

on setscore me, sco
  if sco <> 0 then
    goldscore = goldscore + (sco / 7.29564379999999968)
    gscore = gscore + sco
  else
    goldscore = 0
    gscore = 0
  end if
  writestats()
end

on die me, nnom
  ifuckoff(nnom)
  baddies.deleteOne(me)
  gkiller = nnom
  go("gameover")
end
