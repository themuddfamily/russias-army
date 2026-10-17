#!/usr/bin/env python3
"""Fit a reconstructed camera to manually identified preserved-image landmarks.

Reads packaged geometry only. Never loads or runs the original game. Heldout
landmarks are excluded from optimization. Recording stretch is a nuisance
parameter, not evidence of the original sprite/camera rectangle.
"""
import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from scipy.optimize import least_squares


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def world_points(scene, landmarks, scale):
    nodes = {n['name'].lower(): n for n in scene['nodes']}
    matrices = {}

    def matrix(name, visiting=()):
        name = name.lower()
        if name in visiting:
            raise ValueError('Cyclic scene parent')
        if name not in matrices:
            node = nodes[name]
            local = np.array(node['matrix'], dtype=float).reshape((4, 4), order='F')
            parent = node['parent'].lower()
            matrices[name] = (np.eye(4) if parent in ('', 'world') else matrix(parent, visiting + (name,))) @ local
        return matrices[name]

    points = []
    for landmark in landmarks:
        node = nodes[landmark['node'].lower()]
        mesh = next(m for m in scene['meshes'] if m['resource'] == node['resource'] and m['part'] == landmark.get('part', 0))
        if 'vertex' in landmark:
            local = mesh['positions'][landmark['vertex']]
        else:
            weights = np.array(landmark['barycentric'], dtype=float)
            if weights.shape != (3,) or not np.all(np.isfinite(weights)) or np.any(weights < -1e-8) or abs(sum(weights) - 1) > 1e-8:
                raise ValueError('Invalid source triangle barycentric weights')
            vertices = np.array([mesh['positions'][index] for index in mesh['faces'][landmark['face']]], dtype=float)
            local = weights @ vertices
        source = (matrix(node['name']) @ np.array([*local, 1.]))[:3]
        points.append([source[0] * scale, source[2] * scale, -source[1] * scale])
    return np.array(points, dtype=float)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('landmarks', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--fit-vertical-crop', action='store_true', help='Diagnostic only: estimate centered vertical recording scale; source FOV remains50')
    parser.add_argument('--upright', action='store_true', help='Constrain camera roll to zero, matching source yaw/pitch controls')
    parser.add_argument('--fixed-horizontal-stretch', type=float, help='Diagnostic fixed capture stretch; e.g. image aspect divided by native sprite aspect')
    args = parser.parse_args()
    if args.fixed_horizontal_stretch is not None and (not np.isfinite(args.fixed_horizontal_stretch) or args.fixed_horizontal_stretch <= 0):
        raise ValueError('Fixed horizontal stretch must be finite and positive')
    data = json.loads(args.landmarks.read_text())
    scene_path, reference = Path(data['scene']), Path(data['reference'])
    scene = json.loads(scene_path.read_text())
    for key, path in [('sceneSha256', scene_path), ('referenceSha256', reference)]:
        if key in data and data[key] != digest(path):
            raise ValueError(f'Input hash mismatch: {key}')
    landmarks = data['landmarks']
    if any(p.get('role', 'fit') not in ('fit', 'heldout') for p in landmarks):
        raise ValueError('Landmark role must be fit or heldout')
    points = world_points(scene, landmarks, data['scale'])
    pixels = np.array([p['pixel'] for p in landmarks], dtype=float)
    training = np.array([p.get('role', 'fit') == 'fit' for p in landmarks])
    if sum(training) < 6 or sum(~training) < 3:
        raise ValueError('Need at least six fit and three heldout landmarks')
    width, height = data['imageSize']
    fov = data.get('verticalFovDegrees', 50)
    if fov != 50:
        raise ValueError('This source comparison preserves vertical FOV50')
    fy = height / (2 * np.tan(np.deg2rad(fov / 2)))
    cx, cy = data.get('principalPoint', [width / 2, height / 2])
    if [cx, cy] != [width / 2, height / 2]:
        raise ValueError('This comparison currently assumes a centered principal point')
    uncertainty = np.array([p.get('uncertaintyPixels', 2) for p in landmarks], dtype=float)
    if not np.all(uncertainty > 0):
        raise ValueError('Uncertainty must be positive')

    stretch_index = 5 if args.upright else 6
    free_stretch = args.fixed_horizontal_stretch is None
    zoom_index = stretch_index + int(free_stretch)

    def recording_stretch(parameters):
        return np.exp(parameters[stretch_index]) if free_stretch else args.fixed_horizontal_stretch

    def pose(parameters):
        if not args.upright:
            return parameters[:3], parameters[3:6]
        yaw, pitch = parameters[:2]
        forward = np.array([-np.sin(yaw) * np.cos(pitch), np.sin(pitch), -np.cos(yaw) * np.cos(pitch)])
        right = np.array([np.cos(yaw), 0., -np.sin(yaw)])
        up = np.cross(right, forward)
        rotation = np.array([right, -up, forward])
        return cv2.Rodrigues(rotation)[0].ravel(), -rotation @ parameters[2:5]

    def intrinsics(stretch, zoom=1.):
        return np.array([[fy * zoom * stretch, 0, cx], [0, fy * zoom, cy], [0, 0, 1.]])

    def project(parameters):
        rvec, tvec = pose(parameters)
        zoom = np.exp(parameters[zoom_index]) if args.fit_vertical_crop else 1.
        return cv2.projectPoints(points, rvec, tvec, intrinsics(recording_stretch(parameters), zoom), None)[0][:, 0]

    def residual(parameters):
        return ((project(parameters)[training] - pixels[training]) / uncertainty[training, None]).ravel()

    candidates = []
    # Deterministic broad recording-stretch initializations, all fitted with
    # the same training landmarks. Heldout points cannot choose the solution.
    for stretch in ([.6, .8, 1., 1.25, 1.5, 1.75, 2.] if free_stretch else [args.fixed_horizontal_stretch]):
        ok, rvec, tvec = cv2.solvePnP(points[training], pixels[training], intrinsics(stretch), None, flags=cv2.SOLVEPNP_EPNP)
        if not ok:
            continue
        start = np.r_[rvec.ravel(), tvec.ravel()]
        if args.upright:
            rotation = cv2.Rodrigues(rvec)[0]
            forward = rotation.T[:, 2]
            position = -rotation.T @ tvec.ravel()
            start = np.r_[np.arctan2(-forward[0], -forward[2]), np.arcsin(np.clip(forward[1], -1, 1)), position]
        lower, upper = np.full(stretch_index, -np.inf), np.full(stretch_index, np.inf)
        if free_stretch:
            start = np.r_[start, np.log(stretch)]
            lower, upper = np.r_[lower, np.log(.4)], np.r_[upper, np.log(2.5)]
        if args.fit_vertical_crop:
            start = np.r_[start, 0.]
            lower, upper = np.r_[lower, np.log(.4)], np.r_[upper, np.log(2.5)]
        fit = least_squares(residual, start, bounds=(lower, upper), max_nfev=2000, xtol=1e-12, ftol=1e-12, gtol=1e-12)
        rvec, tvec = pose(fit.x)
        rotation = cv2.Rodrigues(rvec)[0]
        depths = (rotation @ points.T + tvec[:, None])[2]
        if fit.success and np.all(depths[training] > 0):
            candidates.append(fit)
    if not candidates:
        raise ValueError('No converged solution with all training landmarks in front of camera')
    fit = min(candidates, key=lambda item: float(np.sum(residual(item.x) ** 2)))
    rvec, tvec = pose(fit.x)
    rotation = cv2.Rodrigues(rvec)[0]
    position = -rotation.T @ tvec
    # OpenCV camera axes right/down/forward -> Three right/up/backward.
    camera_basis = rotation.T @ np.diag([1., -1., -1.])
    predicted = project(fit.x)
    errors = np.linalg.norm(predicted - pixels, axis=1)
    depths = (rotation @ points.T + tvec[:, None])[2]
    stretch = float(recording_stretch(fit.x))
    zoom = float(np.exp(fit.x[zoom_index])) if args.fit_vertical_crop else 1.
    result = {
        'status': 'diagnostic-fit-not-native-camera-proof',
        'landmarks': str(args.landmarks), 'landmarksSha256': digest(args.landmarks),
        'scene': str(scene_path), 'sceneSha256': digest(scene_path),
        'reference': str(reference), 'referenceSha256': digest(reference),
        'imageSize': [width, height], 'verticalFovDegrees': fov,
        'principalPoint': [cx, cy], 'horizontalRecordingStretch': stretch,
        'verticalRecordingScale': zoom, 'rollConstrained': args.upright,
        'fitVerticalCrop': args.fit_vertical_crop,
        'fixedHorizontalStretch': args.fixed_horizontal_stretch,
        'browserHookCompatible': not args.fit_vertical_crop,
        'effectiveCameraAspect': width / (height * stretch),
        'position': position.tolist(), 'target': (position - camera_basis[:, 2]).tolist(),
        'up': camera_basis[:, 1].tolist(),
        'worldCameraBasisColumnMajor': camera_basis.flatten(order='F').tolist(),
        'cvRotationVector': rvec.tolist(), 'cvTranslation': tvec.tolist(),
        'fitRmsPixels': float(np.sqrt(np.mean(errors[training] ** 2))),
        'heldoutRmsPixels': float(np.sqrt(np.mean(errors[~training] ** 2))),
        'heldoutMaxPixels': float(np.max(errors[~training])),
        'heldoutBehindCameraCount': int(np.sum(depths[~training] <= 0)),
        'points': [{**p, 'world': world.tolist(), 'projectedPixel': projection.tolist(), 'errorPixels': float(error)} for p, world, projection, error in zip(landmarks, points, predicted, errors)],
        'limits': ['Manually identified correspondences may be wrong.', 'Vertical FOV is source-backed; principal point and recording stretch are explicit assumptions.', 'Optional vertical recording scale is a crop hypothesis, not a native FOV/zoom change; the existing browser hook only reproduces full-height fits.', 'Heldout points do not participate in optimization or candidate selection.', 'A single frame cannot establish native camera rectangle, recording crop or rasterization.'],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: result[k] for k in ['fitRmsPixels', 'heldoutRmsPixels', 'heldoutMaxPixels', 'horizontalRecordingStretch', 'position']}))


if __name__ == '__main__':
    main()
