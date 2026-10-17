property pmod, hit, pos
global gmem, ghvk

on new me, modo
  pmod = modo
  modo.transform.position = modo.transform.position + vector(0, 0, 10)
  pos = modo.transform.position
  pdummy = ghvk.makemoveable(pmod, 1, 1, 0.20000000000000001, 1)
  pdummy.pinned = 0
  hit = 0
  lives = 1
  (the actorList).add(me)
  return me
end

on stepFrame me
  if hit = 1 then
    ghvk.removethefella(pmod)
    pos = pmod.transform.position
    bang = script("bangs").new(pos, "barrel")
    gmem.deleteModel(pmod.name)
    (the actorList).deleteOne(me)
  end if
end

on hurt me, howbad
  hit = 1
end
