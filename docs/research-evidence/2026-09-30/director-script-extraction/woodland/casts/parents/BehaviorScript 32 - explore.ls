property unit
global ghvk, gcam, gmem, gspr, shadster, baddies, goody, glevel, gsmokes

on beginSprite me
  buildlevel(me)
end

on buildlevel me
  gspr = sprite(me.spriteNum)
  gspr.cursor = 200
  glevel = 2
  resetactors()
  gmem = member("level" & glevel)
  gspr.member = gmem
  gmem.resetWorld()
  ghvk = script("worldphysics").new()
  gsmokes = gmem.newGroup("smokes")
  repeat with i = 1 to gmem.shader.count
    dog = gmem.shader[i]
    if (dog.name contains "efault") or (dog.name contains "grass") or (dog.name contains "floor") then
      next repeat
    end if
    if not voidp(gmem.texture(dog.name)) then
      gmem.deleteTexture(dog.name)
    end if
    tex = texy(dog.name)
    dog.texture = tex
    dog.emissive = rgb(255, 255, 255)
  end repeat
  gtrees = ["syccamore", "spindlybirchleaves", "rowanbranch", "othertrees", "birch", "outerfencing"]
  repeat with vtree in gtrees
    vtreem = gmem.model(vtree)
    vtreem.visibility = #both
    vtreem.parent = gsmokes
  end repeat
  gmem.deleteLight(gmem.light[1].name)
  flsha = shady("floortop2")
  gmem.model("floor").shaderList[1] = flsha
  flsha.textureModeList[1] = #wrapPlanar
  flsha.textureList[2] = texy("noise")
  flsha.textureModeList[2] = #wrapPlanar
  flsha.textureTransformList[2].scale = vector(0.005, 0.005, 0.005)
  vstarts = []
  vstarts.add([vector(166, 4016, 914), vector(1, 0, -1259)])
  vstarts.add([vector(-3414, -2975, -236), vector(1, 0, -1159)])
  vstarts.add([vector(2613, -1584, -373), vector(1, 0, -1004)])
  vstarts.add([vector(5548, -5578, 628), vector(-10, 0, -1416)])
  vstarts.add([vector(615, -6591, 556), vector(-10, 0, -1086)])
  vstarts.add([vector(2096, -4255, 326), vector(-10, 0, -1056)])
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
