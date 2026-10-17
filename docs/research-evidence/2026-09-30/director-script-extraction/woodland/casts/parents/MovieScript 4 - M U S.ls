global players, mus, nom, goody, hspots, gmusmode, gink, gmygroup, ggroupcount, gmaxusers, groomcount, mla, goldtime, gsubmitstamps, goldnom

on sconnect me
  member("rooms").text = EMPTY
  players = []
  gmygroup = "@lobby"
  gink = 0
  gmaxusers = 8
  mus = new(xtra("MultiUser"))
  mla = "77.92.78.30"
  goldnom = "bobub" & reversey(nom)
  mus.connectToNetServer([#logonInfo: [#userID: nom, #password: "password", #movieid: "russiasArmy2"], #remoteAddress: mla, #remoteTCPPort: 1626, #encryptionKey: "kwe123eefw3434mwe"])
  mus.setNetMessageHandler(#incoming, me)
  gmusmode = "start"
end

on reversey nstring
  vstr = EMPTY
  repeat with i = 1 to nstring.length
    vstr = vstr & char (nstring.length - i + 1) of nstring
  end repeat
  return vstr
end

on setflash var, val
  sprite(1).setVariable(var, val)
end

on getflash var
  flv = getVariable(sprite(1), var)
  return flv
end

on submitmus what
  if goldnom = ("bobub" & reversey(nom)) then
    set the floatPrecision to 0
    Msg = mus.sendNetMessage([#recipients: gmygroup, #subject: what.subject, #content: what.content])
  else
    gotoNetPage("http://www.gamevial.com", "_parent")
  end if
end

on incoming me
  if not voidp(mus) then
    Msg = mus.getNetMessage()
    if gmusmode = "game" then
      gamein(Msg)
    else
      lobbyin(Msg)
    end if
  end if
end

on getmus
  err = mus.getNumberWaitingNetMessages()
  if err > 0 then
    mus.checkNetMessages(err)
  end if
end

on gamein Msg
  if not voidp(goody) then
    data = Msg.content
    vsend = Msg.senderid
    vbad = getplayer(vsend)
    if Msg.subject = "talk" then
      wri = vsend & ": " & data
      goody.feedback(wri)
    else
      if vsend <> nom then
        case Msg.subject of
          "doorz":
            repeat with door in hspots
              if string(door.pmod) = data then
                door.anplay()
              end if
            end repeat
          "grenade":
            arse = script("grenades").new(data.pos, data.rot, vsend)
          "rocket":
            arse = script("rockets").new(data.pos, data.rot, vsend)
          "where":
            if vbad <> 0 then
              vbad.newstuff(data)
            else
              vbad = script("baddies").new(Msg)
              players.add(vbad)
              wri = vsend & " has entered the arena."
              goody.feedback(wri)
            end if
            myhurts = data.getaProp(#myhu)
            if myhurts > 0 then
              vbad.hurt(myhurts)
            end if
            shots = data.getaProp(#shots)
            if shots > 0 then
              vbad.misses = shots
            end if
            vbad.weapon = data.wea
            hurts = data.getaProp(#hurts)
            if hurts > 0 then
              dohurts(hurts, vsend)
            end if
          "dead":
            if vbad <> 0 then
              vkiller = data.getaProp(#killer)
              vbad.lives = 0
              if vkiller = nom then
                goody.setscore(30)
              end if
              wri = vkiller & " makes " & vsend & " russian history."
              goody.feedback(wri)
            end if
          "playernames":
            gsubmitlist = data.groupmembers
          EMPTY:
            wri = Msg
        end case
      else
        if Msg.subject = "where" then
          if gsubmitstamps = 0 then
            goldtime = integer(Msg.timeStamp)
          else
            vdtime = integer(Msg.timeStamp) - goldtime
            if (vdtime / gsubmitstamps) < 200 then
              gotoNetPage("http://www.gamevial.com", "_parent")
            end if
          end if
          gsubmitstamps = gsubmitstamps + 1
        end if
      end if
    end if
  end if
end

on dohurts hurts, vnom
  ooch = hurts.getaProp(goody.name)
  if ooch > 0 then
    goody.hurt(ooch, vnom)
  end if
  repeat with vbad in players
    ooch = hurts.getaProp(vbad.name)
    if ooch > 0 then
      vbad.hurt(ooch, vnom)
    end if
  end repeat
end

on getplayer vnom
  player = 0
  if vnom = nom then
    player = goody
  else
    repeat with i = 1 to players.count
      if vnom = players[i].name then
        player = players[i]
        exit repeat
      end if
    end repeat
  end if
  return player
end

on rotinterp rotfromb, rottob, steps
  if voidp(steps) then
    steps = 1
  end if
  rotfrom = rotfromb
  rotto = rottob
  actuallyused = vector(0, 0, 0)
  dx = rotto.x - rotfrom.x
  ds = sqrt(dx * dx)
  if ds > 180 then
    if dx > 0 then
      actuallyused.x = (dx - 360) * steps
    else
      actuallyused.x = (dx + 360) * steps
    end if
  else
    actuallyused.x = dx * steps
  end if
  dy = rotto.y - rotfrom.y
  ds = sqrt(dy * dy)
  if ds > 180 then
    if dy > 0 then
      actuallyused.y = (dy - 360) * steps
    else
      actuallyused.y = (dy + 360) * steps
    end if
  else
    actuallyused.y = dy * steps
  end if
  dz = rotto.z - rotfrom.z
  ds = sqrt(dz * dz)
  if ds > 180 then
    if dz > 0 then
      actuallyused.z = (dz - 360) * steps
    else
      actuallyused.z = (dz + 360) * steps
    end if
  else
    actuallyused.z = dz * steps
  end if
  return actuallyused
end

on lobbyin Msg
  grooms = []
  case Msg.subject of
    "ConnectToNetServer":
      if Msg.errorCode <> 0 then
        nom = nom & random(9)
        mus.connectToNetServer([#logonInfo: [#userID: nom, #password: "password", #movieid: "russiasArmy2"], #remoteAddress: mla, #remoteTCPPort: 1626, #encryptionKey: "kwe123eefw3434mwe"])
      end if
    "checkrooms":
      ggroupcount = Msg.content.groups.count
      if gmusmode = "checkrooms" then
        gmusmode = "getrooms"
      end if
    "showgroupcount":
      vrooms = []
      repeat with i = 1 to groomcount
        vrooms.add("@Woodland" & i)
      end repeat
      vnum = vrooms.getOne(Msg.content.groupName)
      vlistentry = vrooms[vnum] & " "
      repeat with i = vlistentry.char.count to 18
        vlistentry = vlistentry & "."
      end repeat
      if Msg.content.numbermembers < gmaxusers then
        vlistentry = vlistentry & " " & Msg.content.numbermembers & "/" & gmaxusers
      else
        vlistentry = vlistentry & " Full"
      end if
      vsct = member("rooms").scrollTop
      member("rooms").line[vnum] = vlistentry
      member("rooms").scrollTop = vsct
      member("rooms").line[vnum].color = rgb(0, 0, 0)
      setflash("_root.state", "joinrooms")
    EMPTY:
  end case
end

on lobbyframe me
  case gmusmode of
    "start":
      gink = gink + 1
      if gink > 30 then
        gmusmode = "checkrooms"
      end if
    "checkrooms":
      Msg = mus.sendNetMessage([#recipients: "system.movie.getGroups", #subject: "checkrooms", #content: EMPTY])
    "getrooms":
      glist = []
      member("rooms").text = EMPTY
      repeat with i = 1 to groomcount
        glist.add("@Woodland" & i)
      end repeat
      member("rooms").boxType = #fixed
      Msg = mus.sendNetMessage([#recipients: "system.group.getUserCount", #subject: "showgroupcount", #content: glist])
      gmusmode = "joinrooms"
    "joinrooms":
      if not (gmygroup = "@lobby") then
        gmusmode = "game"
      end if
      gsubmitstamps = 0
    "game":
      mus.setNetMessageHandler(0, me)
      mus.setNetMessageHandler(#incoming, me)
    EMPTY:
  end case
end

on VerifyUserName userName
  naughties = "abcdefghijklmnopqrstuvwxyz1234567890"
  vnam = EMPTY
  repeat with i = 1 to userName.length
    if (naughties contains char i of userName) <> 0 then
      vnam = vnam & char i of userName
    end if
  end repeat
  moo = value("#" & vnam)
  vnam = string(moo)
  if (vnam contains ".") or (vnam = "0") then
    vnam = EMPTY
  end if
  if vnam = EMPTY then
    alert("Codename censored, try again.")
  end if
  return vnam
end

on ifuckoff vnom
  if not voidp(goody) and not voidp(mus) then
    set the keyDownScript to EMPTY
    if voidp(vnom) then
      vnom = "Cowardice"
    end if
    submitmus([#subject: "dead", #content: [#weapon: goody.weapon, #killer: vnom]])
    mus.sendNetMessage("system.group.leave", EMPTY, gmygroup)
  end if
end
