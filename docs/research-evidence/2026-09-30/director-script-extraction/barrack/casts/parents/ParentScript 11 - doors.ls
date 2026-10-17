property pmod, phavmod, anspeed, running, wrd1, wrd2, saidit
global ghvk, gmem, hspots, goody

on new me, modo
  pmod = modo
  phavmod = ghvk.makemoveable(pmod, 0, 1, 1)
  phavmod.pinned = 1
  pmod.keyframePlayer.playRate = 0
  wrd2 = word 2 of the name of pmod
  anspeed = 1
  running = 0
  hspots.add(me)
  saidit = 0
  (the actorList).add(me)
  return me
end

on stepFrame me
  if not voidp(goody) then
    if running = 0 then
      if closetome(pmod.transform.position, goody.bsp * 2) then
        if wrd2 = "open" then
          submitmus([#subject: "doorz", #content: string(pmod)])
          anplay(me)
        else
          if goody.keys.getOne(wrd2) > 0 then
            submitmus([#subject: "doorz", #content: string(pmod)])
            anplay(me)
          else
            if saidit = 0 then
              saidit = 1
              goody.feedback("You need the " & wrd2 & " key!")
            end if
          end if
        end if
      end if
    else
      if pmod.keyframePlayer.currentTime > 1600 then
        pmod.keyframePlayer.playRate = 0
        (the actorList).deleteOne(me)
        hspots.deleteOne(me)
        running = 0
      end if
    end if
  end if
end

on anplay me
  playsound(pmod.transform.position, "door")
  ghvk.removethefella(pmod)
  pmod.keyframePlayer.playRate = anspeed
  running = 1
end
