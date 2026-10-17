import json,math
from pathlib import Path
base=Path(__file__).parent
j=json.loads((base/'feasibility.json').read_text());scale=json.loads((base/'replay.json').read_text())['scale'];B=j['radius']+j['contactDistance'];out=[]
for r in j['results']:
 h=r['hinge'];dy=r['floorRay']['point']['y']+j['radius']+60*scale-h['y']
 if r['name']=='door open 08':
  jamb=next(t['vertices']for t in r['sourceTriangles']if t['kind']=='jamb');door=next(t['vertices']for t in r['sourceTriangles']if t['kind']=='closedPanel')
  # Most permissive coordinates over finite triangle vertices; no floor skin.
  horizontalTriggerRadius=math.sqrt(j['triggerDistance']**2-dy**2)
  wallEnd=max(p['z']for p in jamb)
  maximumEndOvershoot=max(0,h['z']+horizontalTriggerRadius-wallEnd)
  finiteWallClearance=math.sqrt(B*B-maximumEndOvershoot**2)
  tangentMin=h['x']-max(p['x']for p in jamb)+finiteWallClearance
  normalMin=min(p['z']for p in door)+B-h['z']
  horizontalSquared=tangentMin**2+normalMin**2
  extra={'horizontalTriggerRadius':horizontalTriggerRadius,'finiteWallEndZ':wallEnd,'maximumFeasibleCandidateOvershootPastWallEnd':maximumEndOvershoot,'finiteWallClearanceAtWorstOvershoot':finiteWallClearance,'jambTangentMinimum':tangentMin,'closedPanelNormalMinimum':normalMin,'constraint':'local aperture, jamb plane and closed panel plane; outward08side-1'}
 else:
  # The jamb is a finite vertical edge: use its circle, not an infinite plane.
  n=r['normal'];t=r['tangent'];edge=r['sweepTowardHinge']['witnessB'];d=r['doorRay']['point']
  project=lambda p,v:sum((p[k]-h[k])*v[k]for k in ('x','z'))
  en=project(edge,n);et=project(edge,t);normalMin=project(d,n)+B
  tangentMin=et+math.sqrt(B*B-(normalMin-en)**2)
  # Minimise n²+(et+sqrt(B²-(n-en)²))² on [normalMin,en+B].
  # The only interior stationary point is the radial maximum, not a minimum.
  endpointAtNormalMin=normalMin**2+tangentMin**2
  endpointAtEdgeCap=(en+B)**2+et**2
  horizontalSquared=min(endpointAtNormalMin,endpointAtEdgeCap)
  extra={'edgeNormal':en,'edgeTangent':et,'closedPanelNormalMinimum':normalMin,'edgeCircleTangentMinimumAtPanel':tangentMin,'edgeCircleNormalInterval':[normalMin,en+B],'endpointHorizontalSquared':[endpointAtNormalMin,endpointAtEdgeCap],'interiorStationaryPoint':'radial maximum','constraint':'local aperture on positive-tangent side of vertical jamb edge; outward09side+1'}
 lower=math.sqrt(dy*dy+horizontalSquared)
 # 0.0001m numerical enclosure is deliberately favourable to feasibility;
 # maxsource-plane tilt over trigger ball is below0.00002m.
 conservative=lower-.0001
 out.append({'name':r['name'],'eyeVerticalMinimumNoFloorSkin':dy,'clearanceRadius':B,**extra,'eyeHingeDistanceLowerBound':lower,'conservativeLowerBound':conservative,'triggerDistance':j['triggerDistance'],'strictProximityFeasibleInLocalAperture':conservative<j['triggerDistance']})
(base/'feasibility-bounds.json').write_text(json.dumps({'scope':'Continuous local floor/panel/jamb aperture bounds, not global map reachability. Sphere sweeps enforce R+T for lateral approach; floor bound allows zero skin and is more permissive than actual resting physics.', 'results':out},indent=2)+'\n')
