#!/usr/bin/env python3
"""Enumerate source-only doorway/tank labels and check synthetic observability.

No historical camera fit. Consistent synthetic observations avoid spurious
numerical rank from incompatible/noisy image line measurements.
"""
from pathlib import Path
import hashlib,json,math
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/research-evidence/2026-10-02/interior-13s-line-rank'


def record(path):
    data=path.read_bytes()
    return {'path':str(path.relative_to(ROOT)),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}


def line(points):
    a,b=np.c_[points,np.ones(2)]
    result=np.cross(a,b)
    return result/np.linalg.norm(result[:2])


def project(points,parameters,free_bank=False):
    yaw,pitch=parameters[:2]
    bank=parameters[2] if free_bank else 0.
    offset=3 if free_bank else 2
    position=parameters[offset:offset+3];stretch=np.exp(parameters[offset+3])
    forward=np.array([-np.sin(yaw)*np.cos(pitch),np.sin(pitch),-np.cos(yaw)*np.cos(pitch)])
    right=np.array([np.cos(yaw),0.,-np.sin(yaw)]);up=np.cross(right,forward)
    rolled_right=right*np.cos(bank)+up*np.sin(bank);rolled_up=up*np.cos(bank)-right*np.sin(bank)
    camera=(points-position)@np.array([rolled_right,-rolled_up,forward]).T
    fy=574/(2*np.tan(np.deg2rad(25)))
    if np.any(camera[:,2]<=0):raise ValueError('Synthetic point behind camera')
    return camera[:,:2]/camera[:,2,None]*[fy*stretch,fy]+[640,287]


def rank_case(points,parameters,free_bank):
    synthetic=project(points,parameters,free_bank)
    coefficients=[line(synthetic[:2]),line(synthetic[2:4])]
    def residual(p):
        predicted=project(points,p,free_bank)
        return np.concatenate([*[np.c_[predicted[i:i+2],np.ones(2)]@coefficients[i//2]for i in [0,2]],predicted[4]-synthetic[4]])
    step=1e-5
    jacobian=np.column_stack([(residual(parameters+np.eye(len(parameters))[i]*step)-residual(parameters-np.eye(len(parameters))[i]*step))/(2*step)for i in range(len(parameters))])
    # Normalize columns to compare angles, coordinates and log stretch without
    # assigning an arbitrary unit-dependent rank to the observation problem.
    column_norms=np.linalg.norm(jacobian,axis=0)
    normalized=np.divide(jacobian,column_norms,out=np.zeros_like(jacobian),where=column_norms>0)
    singular=np.linalg.svd(normalized,compute_uv=False)
    numerical_rank=int(sum(singular>singular[0]*1e-7))
    return {'parameters':parameters.tolist(),'observations':synthetic.tolist(),'zeroResidualMaximum':float(max(abs(residual(parameters)))),'normalizedJacobianSingularValues':singular.tolist(),'relativeRankThreshold':1e-7,'numericalRank':numerical_rank,'rankThresholdSweep':{str(t):int(sum(singular>singular[0]*t))for t in [1e-9,1e-7,1e-5,1e-3]},'parameterCount':len(parameters),'minimumNullity':len(parameters)-numerical_rank}


def main():
    inventory_path=ROOT/'docs/research-evidence/2026-10-02/interior-approach-textures/woodland-13s-source-boundary-inventory.json'
    match_path=ROOT/'docs/research-evidence/2026-10-02/interior-13s-tank-search/camera-input-eligibility.json'
    inventory=json.loads(inventory_path.read_text());matches=json.loads(match_path.read_text())
    for source in inventory['sources']:
        if record(ROOT/source['path'])!=source:raise ValueError('Source changed')
    tank=matches['distinctiveTankMatches'][0]
    if tank['role']!='fit' or len(tank['sourceCandidates'])!=4:raise ValueError('Measured tank alternatives changed')
    edges=inventory['sourceDoorJambCandidates'];cases=[]
    observed_lines=[o for o in inventory['imageObservations']if 'segmentPixels'in o]
    for left in edges:
        for right in edges:
            if left['component']!=right['component']:continue
            gap=np.linalg.norm(np.array(left['positions'][0][:2])-right['positions'][0][:2])
            if not 90<gap<110:continue
            for candidate in tank['sourceCandidates']:
                points=np.array(left['worldPositions']+right['worldPositions']+[candidate['worldPoint']])
                midpoint=(points[0]+points[2])/2;direction=points[4]-midpoint;direction[1]=0;direction/=np.linalg.norm(direction)
                position=midpoint-2*direction;position[1]+=1.72
                yaw=np.arctan2(-direction[0],-direction[2]);pitch=.12
                upright=np.r_[yaw,pitch,position,np.log(1.03)]
                bank=np.r_[yaw,pitch,.07,position,np.log(1.03)]
                # A few decoded endpoints differ horizontally by tiny float
                # amounts. Preserve exact data/model, and separately verify
                # the ideal parallel-vertical structural observation bound.
                ideal=points.copy();ideal[1,[0,2]]=ideal[0,[0,2]];ideal[3,[0,2]]=ideal[2,[0,2]]
                deviations=[float(np.linalg.norm(points[i+1,[0,2]]-points[i,[0,2]]))for i in [0,2]]
                cases.append({'id':f'{left["id"]}-left_{right["id"]}-right_tank-{candidate["face"]}','component':left['component'],'leftEdge':left,'rightEdge':right,'sourceDoorGap':float(gap),'tankSourceCandidate':candidate,'tankMeasuredPixel':tank['pixel'],'tankOriginalRole':tank['role'],'historicalImageLineCoefficients':[line(np.array(o['segmentPixels'])).tolist()for o in observed_lines],'lineEndpointMeaning':'Image samples locate lines, not source endpoints','sourceEndpointHorizontalDeviationWorld':deviations,'syntheticUprightRank':rank_case(ideal,upright,False),'syntheticFreeBankRank':rank_case(ideal,bank,True),'exactSourceSyntheticUprightRank':rank_case(points,upright,False),'exactSourceSyntheticFreeBankRank':rank_case(points,bank,True)})
    if len(cases)!=64:raise ValueError('Expected all64 ordered opposite-jamb/cap hypotheses')
    if any(c['syntheticUprightRank']['numericalRank']>5 or c['syntheticFreeBankRank']['numericalRank']>6 for c in cases):raise ValueError('Structural rank exceeded')
    OUT.mkdir(parents=True,exist_ok=True)
    data={'generator':record(Path(__file__)),'inputs':[record(inventory_path),record(match_path)],'originalRuntimeExecuted':False,'historicalCameraFitAttempted':False,'sourceOnlyHypothesisEnumeration':True,'hypothesisCount':len(cases),'allEightJambEdgesRetained':True,'allFourMeasuredTankAlternativesRetained':True,'sourceOnlyPairRule':'Same component; opposite sides have source horizontal gap90..110. Both image left/right assignments and inner/outer combinations retained.','idealParallelStructuralObservationCount':{'upright':5,'freeBank':6},'structuralParameterCount':{'uprightWithHorizontalStretch':6,'freeBankWithHorizontalStretch':7},'syntheticPurpose':'Consistent synthetic projections verify local model observability only, not a historical pose or source-label likelihood. Exact decoded geometry and an ideal parallel-line diagnostic are both retained. The ideal diagnostic aligns upper/lower horizontal coordinates only; no production/source geometry is changed.','finiteDifferenceStep':1e-5,'cases':cases,'limits':['Actual image lines are approximate retrospective measurements, not uniquely identified source edges.','Tank descriptor point has4 source alternatives and retains fit role; no heldout point is invented.','No source label is ranked, selected or rejected by historical image residual.','Ideal parallel infinite vertical lines plus one point do not supply a unique camera when horizontal stretch is free.','Tiny nonparallel decoded endpoints can technically supply additional weak numerical rank; exact-source spectra and threshold sensitivity are reported rather than hidden.','Source FOV50 and centered principal point remain explicit; optional camera bank is diagnostic.','A fit to noisy incompatible lines can show spurious extra numerical rank; structural and consistent synthetic rank are the relevant bounds.','Rank is local; full global ambiguity and conditioning may be worse.','A new independent finite-endpoint or other line-family constraint requires semantic proof, not photographed texture edges.','V12/V14 remain open; no native lighting claim.']}
    path=OUT/'source-doorway-line-rank.json';path.write_text(json.dumps(data,indent=2)+'\n')
    print(json.dumps({'hypotheses':len(cases),'uprightRanks':sorted({c['syntheticUprightRank']['numericalRank']for c in cases}),'freeBankRanks':sorted({c['syntheticFreeBankRank']['numericalRank']for c in cases}),'noHistoricalFit':True}))


if __name__=='__main__':main()
