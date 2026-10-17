property it, pnetid
global gscore, goldscore, game, nom, gosubmit

on beginSprite me
  gosubmit = 0
  pnetid = VOID
  game = "russiasarmywood"
  it = 1
end

on mouseEnter me
  cursor(280)
end

on mouseLeave me
  cursor(-1)
end

on exitFrame me
  if it = 2 then
    if netDone(pnetid) then
      inittext = netTextResult(pnetid)
      gotoNetPage("http://www.gamevial.com/halloffame.htm")
      it = 3
    else
      cursor(4)
    end if
  else
    if it = 1 then
      if gosubmit = 1 then
        gosubmit = 0
        it = 2
        if gscore <> (goldscore * 7.29564379999999968) then
          gscore = 0
        end if
        txturl = "http://www.gamevial.com/scoreboard.php"
        yourdata = ["game": game, "score": gscore, "nickname": nom]
        pnetid = getNetText(txturl, yourdata)
      end if
    end if
  end if
end
