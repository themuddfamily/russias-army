global goody, gscore, nom, gosubmit, gmusmode, gkiller

on beginSprite me
  resetactors()
  goody = VOID
  sprite(1).goToFrame(54)
  sprite(1).cursor = 0
  member("rooms").color = rgb(0, 0, 0)
  member("rooms").text = "Our commiserations, Comrade " & nom & ", you are now pieces of Russian history, thanks to " & gkiller & "..." & RETURN & RETURN & "Would you like to submit your score of " & gscore & " points?" & RETURN & RETURN & "Click go to see if you are worthy of Kremlin fame."
  sprite(2).visible = 1
end

on exitFrame me
  vstate = getflash("_root.state")
  case vstate of
    "replay":
      member("rooms").text = VerifyUserName(nom)
      clearGlobals()
      resetall()
      go("lobby")
      gmusmode = EMPTY
      updateStage()
      sprite(1).goToFrame(52)
      setflash("_root.state", "getcodename")
      setflash("_root.codename", member("rooms").text)
    "leapto":
      gotoNetPage("http://www.gamevial.com", "_parent")
      quit()
    "submit":
      gosubmit = 1
    EMPTY:
  end case
  go(the frame)
end
