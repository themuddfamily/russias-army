property inc, ptog
global gmem, goody

on new me, npos
  ptog = "open"
  member("UI").posterFrame = 1
  texy("UI")
  inc = 35
  goody.pmod.fieldOfView = inc
  (the actorList).add(me)
  return me
end

on stepFrame me
  if not voidp(goody) then
    if inc > 8 then
      inc = inc - 0.75
      goody.pmousedelta = goody.pmousedelta * 0.93000000000000005
      goody.pmod.fieldOfView = inc
    end if
    if inc < 30 then
      if _key.shiftDown then
        if ptog = "open" then
          ptog = "zoomed"
        else
          if ptog = "zoomdone" then
            ptog = "zoomed"
          end if
        end if
      else
        if ptog = "zoom" then
          ptog = "zoomdone"
        else
          if ptog = "zoomed" then
            hurt(me)
          end if
        end if
      end if
    end if
    if not (goody.weapon = #dragunov) or (goody.ptyping = 1) then
      hurt(me)
    end if
  end if
end

on hit me
end

on hurt me
  goody.weaponry.zoomonce = 1
  member("UI").posterFrame = 2
  texy("UI")
  goody.pmod.fieldOfView = 50
  goody.pmousedelta = 0.5
  (the actorList).deleteOne(me)
  me = VOID
end
