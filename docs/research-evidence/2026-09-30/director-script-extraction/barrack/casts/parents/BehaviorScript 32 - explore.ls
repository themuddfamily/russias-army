property unit
global ghvk, gcam, gmem, gspr, shadster, baddies, goody, Enhancer, glevel, gsmokes

on beginSprite me
  buildlevel(me)
end

on buildlevel me
  gspr = sprite(me.spriteNum)
  gspr.cursor = 200
  glevel = 1
  resetactors()
  gmem = member("level" & glevel)
  gspr.member = gmem
  gmem.resetWorld()
  ghvk = script("worldphysics").new()
  gsmokes = gmem.newGroup("smokes")
  repeat with i = 1 to gmem.shader.count
    dog = gmem.shader[i]
    if (dog.name contains "efault") or (dog.name contains "grass") then
      next repeat
    end if
    if not voidp(gmem.texture(dog.name)) then
      gmem.deleteTexture(dog.name)
    end if
    tex = texy(dog.name)
    dog.texture = tex
    dog.emissive = rgb(255, 255, 255)
  end repeat
  gtrees = ["outerfencing"]
  repeat with vtree in gtrees
    vtreem = gmem.model(vtree)
    vtreem.visibility = #both
    vtreem.parent = gsmokes
  end repeat
  gmem.deleteLight(gmem.light[1].name)
  flsha = shady("floortop")
  gmem.model("floor").shaderList = flsha
  flsha.textureModeList[1] = #wrapPlanar
  flsha.textureList[2] = texy("noise")
  flsha.textureModeList[2] = #wrapPlanar
  flsha.textureTransformList[2].scale = vector(0.005, 0.005, 0.005)
  vstarts = []
  vstarts.add([vector(296, -563, 87), vector(1, 0, -1264)])
  vstarts.add([vector(-5018, 2835, 87), vector(-1, 0, -1532)])
  vstarts.add([vector(-3996, -5565, 87), vector(1, 0, -1872)])
  vstarts.add([vector(3810, -1686, 411), vector(4, 0, -2210)])
  vstarts.add([vector(3072, 2157, 489), vector(-2, 0, -2377)])
  vstarts.add([vector(-197, -2748, 559), vector(-2, 0, -2544)])
  vstart = random(vstarts.count)
  pos = vstarts[vstart][1]
  rot = vstarts[vstart][2]
  script("goody", "parents").new(pos, rot)
  repeat with i = 1 to gmem.model.count
    thisone = gmem.model[i]
    what = word 1 of the name of thisone
    whatty = word 2 of the name of thisone
    case what of
      "lift":
        hspot = script("hotspots", "parents").new(thisone)
      "anim":
        hspot = script("hotspots", "parents").new(thisone)
      "animswitch":
        hspot = script("hotspots", "parents").new(thisone)
        shady("liftswitch2")
      "liftswitch":
        hspot = script("hotspots", "parents").new(thisone)
        shady("liftswitch2")
      "door":
        hspot = script("doors", "parents").new(thisone)
      "barrel":
        barrel = script("barrels", "parents").new(thisone)
      EMPTY:
    end case
  end repeat
  makeland(gmem.model("floor").boundingSphere[2])
end

on makeland mwid
  mazwid = mwid
  rad = mazwid * 0.94999999999999996
  sky = gmem.newModelResource("sky", #cylinder, #back)
  sky.topRadius = rad
  sky.bottomRadius = rad
  sky.height = 2000
  sky.topCap = 0
  sky.bottomCap = 0
  sky = gmem.newModel("sky", sky)
  sky.transform.position = vector(0, 0, 1000)
  sky.transform.rotation = vector(90, 0, 0)
  sk = shady("sky")
  sk.texture.nearFiltering = 0
  sk.texture.quality = #low
  sk.texture.renderFormat = #rgba8888
  sk.textureTransform.scale = vector(0.10000000000000001, 1.01000000000000001, 1.01000000000000001)
  sk.emissive = rgb(255, 255, 255)
  sky.shaderList = sk
  gmem.bgColor = member("sky").image.getPixel(0, 0)
end
