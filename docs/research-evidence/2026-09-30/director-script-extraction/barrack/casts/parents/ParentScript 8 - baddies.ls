property pos, rot, speed, lives, bsp, bon, pmod, myname, pmussteps, oldweapon, weapon, gunmod, name, tarpos, tarrot, misses, aiming
global ghvk, gmem, gcam, baddies, goody, players, gmodinc, gsmokes

on new me, data
  misses = 0
  name = data.senderid
  weapon = #rpg
  pos = data.content.pos
  rot = data.content.rot
  tarpos = pos
  tarrot = rot
  pmod = recyclemodel(#GI)
  if pmod = 0 then
    gmodinc = gmodinc + 1
    pmod = gmem.cloneModelFromCastmember("baddy" & gmodinc, "GI", member("baddy"))
  end if
  speed = vector(0, 0, 0)
  pmod.bonesPlayer.playRate = 0
  pmod.transform.scale = vector(0.045, 0.045, 0.045)
  bsp = pmod.boundingSphere[2] * 0.75
  hit = gmem.modelsUnderRay(pos, vector(0, 0, -1), 1, #detailed)
  if hit.count > 0 then
    pos = hit[1].isectPosition + vector(0, 0, bsp)
  end if
  pmod.transform.position = pos + vector(4, 0, 75)
  getwepmod(me)
  lives = 100
  pmussteps = 10
  bon = 0
  baddies.add(me)
  (the actorList).add(me)
  return me
end

on newstuff me, data
  if pmussteps > 0 then
    pmussteps = 10
  else
    pmussteps = 10 - pmussteps
  end if
  tarpos = data.pos
  tarrot = data.rot
end

on getwepmod me
  tmpguns = ["spas12", "pistol", "ak47", "rg6", "rpg", "dragunov"]
  tmptexs = ["spas12", "pistol", "ak47", "rg6", "rpg", "dragunov"]
  if not tmpguns.getOne(weapon) then
    weapon = #ak47
  end if
  if voidp(gmem.model(string(weapon & pmod.name))) then
    gunmod = gmem.cloneModelFromCastmember(string(weapon) & pmod.name, string(weapon), member("gunz"))
    arse = tmpguns.getOne(weapon)
    gunmod.shaderList = shady(tmptexs[arse])
  else
    gunmod = gmem.model(string(weapon) & pmod.name)
  end if
  if not voidp(gunmod) then
    gunmod.parent = gsmokes
  end if
  return gunmod
end

on orientgun me
  moo = pmod.bonesPlayer.bone[23].worldTransform
  gunmod.transform.position = moo.position
  gunmod.transform.rotation = moo.rotation
  gunmod.rotate(vector(0, 170, 10), #self)
  gunmod.translate(vector(0, -3, 0), #self)
end

on stepFrame me
  if not voidp(goody) then
    if aiming > 0 then
      aiming = aiming - 1
    else
      if misses > 0 then
        shoot(me)
      end if
    end if
    if weapon <> oldweapon then
      gunmod.removeFromWorld()
      oldweapon = weapon
      getwepmod(me)
    end if
    orientgun(me)
    pmussteps = pmussteps - 1
    if pmussteps > 0 then
      speed = (tarpos - pos) / pmussteps
      torq = (tarrot - rot) / pmussteps * 2
      pos = pos + speed
      rot = rot + torq
    else
      if pmussteps = -450 then
        lives = -1
        goody.feedback(name & " is disconnected")
      end if
      pos = tarpos
      rot = tarrot
    end if
    pmod.transform.position = pos - vector(0, 0, goody.bsp * 0.59999999999999998)
    pmod.transform.rotation = rot + vector(0, 0, 90)
    bon = bon + (speed.magnitude * 10)
    if bon > 1000 then
      bon = bon - 1000
    end if
    pmod.bonesPlayer.currentTime = bon
    pmod.transform.rotation.x = 0
    if lives < 1 then
      die(me)
    end if
  end if
end

on die me
  bon = 3000
  pmod.bonesPlayer.currentTime = bon
  gunmod.transform.rotation = vector(0, 0, random(36) * 10)
  gunmod.transform.position = pos - vector(0, 0, bsp / 2)
  pickup = script("pickups", "parents").new(#ammo, gunmod.transform.position, weapon, gunmod)
  fadeaway = script("fadeaway", "parents").new(pmod, pos)
  players.deleteOne(me)
  baddies.deleteOne(me)
  (the actorList).deleteOne(me)
end

on hurt me, howbad
  playsound(pos, "hurt")
end

on shoot me
  bon = 2000
  misses = misses - 1
  case weapon of
    #pistol:
      aiming = 8
      playsound(pos, "gunfire")
      muzzle = script("muzzle").new(me)
    #spas12:
      misses = misses - 1
      aiming = 15
      playsound(pos, "spas12wav")
      muzzle = script("muzzle").new(me)
    #ak47:
      aiming = 2
      playsound(pos, "gunfire")
      muzzle = script("muzzle").new(me)
    #dragunov:
      aiming = 2
      playsound(pos, "resniper")
      muzzle = script("muzzle").new(me)
    #none:
  end case
end
