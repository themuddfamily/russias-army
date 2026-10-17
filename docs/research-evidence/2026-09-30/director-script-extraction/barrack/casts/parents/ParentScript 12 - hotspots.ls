property pmod, anspeed, running, wrd1, wrd2
global gmem, goody, hspots

on new me, modo
  pmod = modo
  wrd1 = word 1 of the name of pmod
  wrd2 = word 2 of the name of pmod
  if wrd1 = "anim" then
    pmod.keyframePlayer.playRate = 0
    pmod.keyframePlayer.loop = 0
    anspeed = 0.5
  else
    if (wrd1 = "lift") or (wrd1 = "door") then
      pmod.keyframePlayer.playRate = 0
      anspeed = 0.5
      pmod.shaderList = shady(wrd1)
    else
      if wrd1 = "animswitch" then
        pmod.shaderList = shady("liftswitch")
      else
        pmod.shaderList = shady(wrd1)
      end if
    end if
  end if
  hspots.add(me)
  (the actorList).add(me)
  running = 0
  return me
end

on stepFrame me
  if not voidp(goody) then
    if running = 0 then
      news = 0
      pickup = 0
      if closetome(pmod.transform.position, 130) then
        case wrd1 of
          "liftswitch":
            findanplay("lift " & wrd2)
            pmod.shader = gmem.shader("liftswitch2")
            news = "Lift activated"
          "animswitch":
            wrd3 = word 3 of the name of pmod
            findanplay("anim " & wrd2)
            pmod.shader = gmem.shader("liftswitch2")
            news = wrd3 & " activated"
          "lift":
            anplay(me)
            news = "Lift activated"
          "door":
            if wrd2 = "open" then
              anplay(me)
            else
              if getVariable(sprite(1), "_root." & wrd2 & "key") = "true" then
                anplay(me)
              else
                if wrd2 = "exit" then
                  anplay(me)
                  sprite(1).buildlevel()
                  goody.pos = vector(0, 0, 400)
                  goody.rot = vector(0, 0, 0)
                else
                  news = "You need the " & wrd2 & " key card!"
                end if
              end if
            end if
        end case
        if not (news = 0) then
          feedback(news)
        end if
        return 1
      end if
    else
      if pmod.keyframePlayer.currentTime > 3200 then
        if word 1 of the name of pmod = "lift" then
          gmem.model("liftswitch " & word 2 of the name of pmod).shader = gmem.shader("liftswitch")
          pmod.keyframePlayer.currentTime = 0
        end if
        pmod.keyframePlayer.playRate = 0
        running = 0
      end if
    end if
  end if
end

on anplay me
  pmod.keyframePlayer.playRate = anspeed
  running = 1
end

on findanplay what
  repeat with hspot in hspots
    if hspot.pmod.name = what then
      anplay(hspot)
      return hspot
    end if
  end repeat
  return 0
end
