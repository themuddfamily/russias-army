property pos, iam, wrd2, pmod
global gmem, goody, tasks, clues

on new me, nom, npos, val, modo
  if not voidp(modo) then
    pmod = modo
  else
    pmod = 0
  end if
  pos = npos
  iam = nom
  wrd2 = val
  (the actorList).add(me)
  return me
end

on stepFrame me
  if not voidp(goody) then
    news = 0
    pickup = 0
    if closetome(pos, goody.bsp) then
      case iam of
        #key:
          goody.keys.add(wrd2)
          goody.feedback("You have the " & wrd2 & " key.")
          fuckoff(me)
        #health:
          goody.setlives(20)
          goody.feedback("Health up 20 points")
          fuckoff(me)
        #ammo:
          quantities = [#spas12: 12, #ak47: 50, #rg6: 12, #rpg: 12, #pistol: 20, #dragunov: 5]
          howmuch = quantities.getaProp(wrd2)
          getgun(wrd2, howmuch)
          fuckoff(me)
        #task:
          if tasks[1] = me then
            tasks.deleteOne(me)
            goody.feedback(string(wrd2))
            fuckoff(me)
          end if
        #clue:
          clues.deleteOne(me)
          goody.feedback(string(wrd2))
          fuckoff(me)
      end case
      return 1
    end if
  end if
end

on getgun me, howmuch
  if voidp(goody.weapons[wrd2]) then
    news = "You have the " & wrd2 & "!"
    goody.weapons.addProp(symbol(wrd2), howmuch)
    goody.weapon = symbol(wrd2)
  else
    news = "Ammo for the " & wrd2 & "."
    goody.weapons.setaProp(wrd2, goody.weapons.getaProp(wrd2) + howmuch)
    if goody.weapon = VOID then
      goody.weapon = symbol(wrd2)
    end if
  end if
  goody.weaponry.sortweapons()
  goody.weaponry.reload()
  goody.feedback(news)
end

on fuckoff me
  if pmod <> 0 then
    pmod.removeFromWorld()
  end if
  goody.setscore(5)
  (the actorList).deleteOne(me)
end

on hurt me
end
