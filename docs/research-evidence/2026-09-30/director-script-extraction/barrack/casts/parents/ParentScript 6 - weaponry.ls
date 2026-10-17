property pos, pmod, ticker, guntarpos, gunpos, recoilpos, loadpos, muzzleflare, waitgun, poldwaitgun, pwaits, chamber, chambers, shots, hurts, zoomonce
global gmem, ghvk, baddies, goody, gcam, gsmokes, nom

on new me, who
  shots = 0
  setuprockets(me)
  sortweapons(me)
  setupmods(me)
  whichgun(me)
  ticker = 1
  muzzleflare = 70
  hurts = [:]
  zoomonce = 1
  waitgun = 0
  pwaits = [#pistol: 8, #spas12: 15, #ak47: 2, #rg6: 10, #rpg: 10, #dragunov: 50]
  waitgun = pwaits.getaProp(goody.weapon)
  poldwaitgun = 0
  (the actorList).add(me)
  return me
end

on stepFrame me
  if not voidp(goody) then
    gun(me)
    choosegun(me)
    arse = goody.pdummy.linearVelocity.magnitude
    ticker = ticker + (arse * 0.05)
    if not voidp(goody.weapon) then
      wave = -(ticker * PI / 180).sin * arse * 0.003
      bob = -(ticker * PI / 180).sin * arse * 0.002
      if bob > 0 then
        bob = -bob
      end if
      gunpos = gunpos + ((guntarpos - gunpos) * 0.10000000000000001)
      pmod.transform.position = vector(wave, bob, 0) + gunpos
    end if
  end if
end

on whichgun me
  pmod = 0
  choice = [#pistol, #spas12, #ak47, #rg6, #rpg, #dragunov]
  whichone = choice.getOne(goody.weapon)
  modchoice = ["pistol", "spas12", "ak47", "rg6", "rpg", "dragunov"]
  repeat with i = 1 to modchoice.count
    if i = whichone then
      if not voidp(gmem.model(modchoice[i])) then
        pmod = gmem.model(modchoice[i])
        pmod.transform.rotation = vector(-90, -90, 0)
        pmod.parent = goody.pmod
        if goody.weapon = #ak47 then
          chamber = 28
          guntarpos = vector(3, -10, 2)
          loadpos = vector(-12, -20, 5)
          recoilpos = vector(3, -10, 7)
        else
          if goody.weapon = #spas12 then
            chamber = 6
            guntarpos = vector(3, -10, -4)
            loadpos = vector(-12, -20, 5)
            recoilpos = vector(3, -10, 5)
          else
            if goody.weapon = #rpg then
              chamber = 1
              guntarpos = vector(5, -13, -20)
              loadpos = vector(-12, -20, 5)
              recoilpos = vector(5, -13, 15)
              gmem.model("rocket").parent = pmod
            else
              if goody.weapon = #rg6 then
                chamber = 6
                guntarpos = vector(6, -8, -10)
                loadpos = vector(-12, -20, 5)
                recoilpos = vector(6, -8, 10)
              else
                if goody.weapon = #pistol then
                  chamber = 8
                  guntarpos = vector(5, -9, -10)
                  loadpos = vector(-12, -20, 5)
                  recoilpos = vector(5, -10, -2)
                else
                  if goody.weapon = #dragunov then
                    chamber = 28
                    guntarpos = vector(6, -12, -12)
                    loadpos = vector(-12, -20, 5)
                    recoilpos = vector(6, -12, 9)
                  else
                    chamber = 6
                    guntarpos = vector(3, -5, -3)
                    loadpos = vector(-12, -10, 5)
                    recoilpos = vector(3, -5, -0)
                  end if
                end if
              end if
            end if
          end if
        end if
      end if
      next repeat
    end if
    if not voidp(gmem.model(modchoice[i])) then
      gmem.model(modchoice[i]).removeFromWorld()
    end if
  end repeat
end

on reload me
  vweap = goody.weapon
  vneeded = chamber - goody.chambers.getaProp(vweap)
  vthere = goody.weapons.getaProp(vweap)
  if vthere > 0 then
    if vthere >= vneeded then
      vgiven = vneeded
    else
      vgiven = vthere
    end if
    goody.weapons.setaProp(vweap, vthere - vgiven)
    goody.chambers.setaProp(vweap, goody.chambers.getaProp(vweap) + vgiven)
  else
    if goody.chambers.getaProp(goody.weapon) > 0 then
    else
      goody.weapon = VOID
      repeat with i = 1 to 6
        if checkweapon(me, i) then
          exit repeat
        end if
      end repeat
      return 0
    end if
  end if
  gunpos = loadpos
  reloadwav(me)
  poldwaitgun = waitgun + 20
  sortweapons(me)
  return 1
end

on gun me
  if not voidp(goody.weapon) then
    bullets = goody.chambers.getaProp(goody.weapon)
    gmem.model("rocket").removeFromWorld()
    if (goody.weapon = #rpg) and (bullets > 0) then
      gmem.model("rocket").parent = pmod
    end if
    if goody.ptyping = 0 then
      if keyPressed("r") or keyPressed("R") then
        reload(me)
      end if
      if goody.weapon = #dragunov then
        if _key.shiftDown and (zoomonce = 1) then
          sniper = script("sniper").new(me)
          zoomonce = 0
        end if
      end if
      bullets = goody.chambers.getaProp(goody.weapon)
      vDeltaWait = waitgun - poldwaitgun
      vthiswait = pwaits.getaProp(goody.weapon)
      if vDeltaWait > (vthiswait * 2) then
        poldwaitgun = waitgun
        vDeltaWait = 0
      else
        if vDeltaWait <= vthiswait then
          waitgun = waitgun + 1
        end if
      end if
      if vDeltaWait >= vthiswait then
        if (goody.weapon = #rpg) and (bullets = 0) then
          reload(me)
        end if
        if the mouseDown or the controlDown then
          coords = point(320, 200)
          if bullets > 0 then
            howmuch = 1
            gunpos = recoilpos
            waitgun = poldwaitgun
            case goody.weapon of
              #pistol:
                playsound(0, "gunfire", 6)
                bullettest(me, coords)
              #spas12:
                playsound(0, "spas12wav", 6)
                coords = point(310, 190)
                bullettest(me, coords)
                coords = point(330, 210)
                bullettest(me, coords)
                goody.rot.x = goody.rot.x + 6
              #ak47:
                bullettest(me, coords)
                playsound(0, "gunfire", 6)
              #rg6:
                rock = script("grenades").new(goody.pos, goody.rot, nom)
                submitmus([#subject: "grenade", #content: [#pos: goody.pos, #rot: goody.rot]])
              #rpg:
                reload(me)
                rock = script("rockets").new(goody.pos, goody.rot, nom)
                submitmus([#subject: "rocket", #content: [#pos: goody.pos, #rot: goody.rot]])
              #dragunov:
                playsound(0, "resniper", 6)
                bullettest(me, coords)
                goody.rot.x = goody.rot.x + 2
            end case
            goody.rot.x = goody.rot.x + 1
            goody.rot.z = goody.rot.z + ((random(3) - 2) * 0.5)
            goody.chambers.setaProp(goody.weapon, bullets - 1)
          else
            reload(me)
          end if
          sortweapons(me)
        end if
      else
      end if
    end if
  end if
end

on bullettest me, coords
  gsmokes.removeFromWorld()
  pains = [#pistol: 12, #spas12: 18, #ak47: 6, #dragunov: 36]
  h = pains.getaProp(goody.weapon)
  badname = EMPTY
  shot = cosine3D(goody.rot)
  shoot = gmem.modelsUnderRay(goody.pos, shot, 1, #detailed)
  if shoot.count > 0 then
    blood = 0
    wheretoshow = shoot[1].isectPosition - (shot * goody.bsp / 2)
    repeat with bad in baddies
      if shoot[1].model = bad.pmod then
        if not voidp(bad) then
          if bad.getaProp(#name) <> 0 then
            badname = bad.name
            blood = 1
          end if
          exit repeat
        end if
      end if
    end repeat
    shots = shots + 1
    if blood = 1 then
      bad.hurt(h)
      moo = value("#" & badname)
      arse = hurts.getaProp(moo)
      if arse <> 0 then
        hurts.setaProp(moo, arse + h)
      else
        hurts.addProp(moo, h)
      end if
      bang = script("blood").new(wheretoshow)
    else
      bang = script("miss").new(shoot[1].isectPosition, shoot[1].isectNormal)
    end if
  end if
  muzzle = script("muzzle").new(me)
  gsmokes.addToWorld()
end

on sortweapons me
  choice = [#pistol, #spas12, #ak47, #rg6, #rpg, #dragunov]
  member("weapons").text = EMPTY
  repeat with i = 1 to goody.weapons.count
    vweap = choice[i]
    addstring = string(i) & ": " & vweap
    moo = addstring.length
    repeat with len = moo to 12
      addstring = addstring & SPACE
    end repeat
    cham = goody.chambers.getaProp(vweap) & " / " & goody.weapons.getaProp(vweap)
    member("weapons").text = member("weapons").text & addstring & cham & RETURN
  end repeat
  repeat with i = 1 to member("weapons").line.count
    lin = member("weapons").line[i]
    if lin contains string(goody.weapon) then
      member("weapons").line[i].color = rgb(255, 255, 0)
      next repeat
    end if
    member("weapons").line[i].color = rgb(255, 0, 0)
  end repeat
  gmem.texture("weapons").member = member("weapons")
  whichgun()
end

on choosegun me
  if goody.ptyping = 0 then
    if keyPressed("1") then
      dog = 1
    else
      if keyPressed("2") then
        dog = 2
      else
        if keyPressed("3") then
          dog = 3
        else
          if keyPressed("4") then
            dog = 4
          else
            if keyPressed("5") then
              dog = 5
            else
              if keyPressed("6") then
                dog = 6
              end if
            end if
          end if
        end if
      end if
    end if
    if (dog > 0) and (dog <= 6) then
      if checkweapon(me, dog) then
        gunpos = loadpos
      end if
    end if
  end if
end

on setupmods me
  tmpguns = ["spas12", "pistol", "ak47", "rg6", "rpg", "dragunov"]
  tmptexs = ["spas12", "pistol", "ak47", "rg6", "rpg", "dragunov"]
  repeat with i = 1 to tmpguns.count
    gun = gmem.cloneModelFromCastmember(tmpguns[i], tmpguns[i], member("gunz"))
    gun.shaderList = shady(tmptexs[i])
    gun.removeFromWorld()
  end repeat
  tmpguns = ["mfspas12", "mfpistol", "mfak47", "mfdragunov"]
  repeat with i = 1 to tmpguns.count
    mf = gmem.cloneModelFromCastmember(tmpguns[i], tmpguns[i], member("gunz"))
    mf.visibility = #both
    mf.removeFromWorld()
  end repeat
end

on setuprockets me
  if voidp(gmem.model("grenade")) then
    grenade = gmem.cloneModelFromCastmember("grenade", "rg6grenade", member("gunz"))
    grenade.shaderList = shady("rg6")
    grenade.removeFromWorld()
  end if
  if voidp(gmem.model("rocket")) then
    rocket = gmem.cloneModelFromCastmember("rocket", "rpgrocket", member("gunz"))
    rocket.shaderList = shady("rpg")
    rocket.removeFromWorld()
  end if
end

on hurt me
end

on reloadwav me
  vsons = [#pistol: "repistol", #spas12: "repistol", #ak47: "reak47", #rg6: "rerg6", #rpg: "rerg6", #dragunov: "reak47"]
  vson = vsons.getaProp(goody.weapon)
  playsound(0, vson, 6)
end

on checkweapon me, choice
  choices = [#pistol, #spas12, #ak47, #rg6, #rpg, #dragunov]
  if (goody.weapons.getaProp(choices[choice]) > 0) or (goody.chambers.getaProp(choices[choice]) > 0) then
    goody.weapon = choices[choice]
    sortweapons(me)
    gunpos = loadpos
    return 1
  end if
end
