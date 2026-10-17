property pspr, pmem
global nom, mus, gmusmode, gmygroup, gmaxusers

on exitFrame me
  sprite(2).visible = 0
  if gmusmode = "game" then
  else
    vstate = getflash("_root.state")
    case vstate of
      "verifyname":
        nom = getflash("_root.codename")
        nom = VerifyUserName(nom)
        setflash("_root.codename", nom)
        if nom <> EMPTY then
          setflash("_root.state", "getroom")
        else
          setflash("_root.state", "getcodename")
        end if
      "getroom":
        if gmusmode <> "start" then
          setflash("_root.state", "wait")
          sconnect()
        end if
      "foundrooms":
        jrooms(me)
      "joinrooms":
        jrooms(me)
      "refresh":
        gmusmode = "getrooms"
        setflash("_root.state", "wait")
      "leapto":
        gotoNetPage("http://www.gamevial.com", "_parent")
        quit()
      EMPTY:
    end case
    lobbyframe()
    go(2)
  end if
end

on jrooms me
  sprite(2).visible = 1
  vscroll = getflash("_root.scroll")
  vmem = member("rooms")
  if vscroll = "up" then
    vmem.scrollTop = vmem.scrollTop - 16
  else
    if vscroll = "down" then
      vmem.scrollTop = vmem.scrollTop + 16
    end if
  end if
end
