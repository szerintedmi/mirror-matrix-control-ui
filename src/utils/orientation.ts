import type { OrientationState, Vec3 } from '../types';

export type OrientationBasis = 'forward' | 'up';

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

export const degToRad = (value: number): number => (value * Math.PI) / 180;
export const radToDeg = (value: number): number => (value * 180) / Math.PI;

export const normalizeVec3 = (value: Vec3): Vec3 => {
    const length = Math.hypot(value.x, value.y, value.z);
    if (length === 0) {
        return { x: 0, y: 0, z: 0 };
    }
    return { x: value.x / length, y: value.y / length, z: value.z / length };
};

export const dotVec3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const crossVec3 = (a: Vec3, b: Vec3): Vec3 => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
});

export const deriveWallBasis = (
    wallOrientation: OrientationState,
    worldUpOrientation: OrientationState,
): { wallNormal: Vec3; uWall: Vec3; vWall: Vec3 } => {
    const wall = normalizeVec3(wallOrientation.vector);
    const up = normalizeVec3(worldUpOrientation.vector);
    const projection = dotVec3(up, wall);
    const vCandidate = {
        x: up.x - wall.x * projection,
        y: up.y - wall.y * projection,
        z: up.z - wall.z * projection,
    };
    const vLength = Math.hypot(vCandidate.x, vCandidate.y, vCandidate.z);
    const vWall = vLength < 1e-6 ? { x: 0, y: 1, z: 0 } : normalizeVec3(vCandidate);
    const uCandidate = crossVec3(vWall, wall);
    const uLength = Math.hypot(uCandidate.x, uCandidate.y, uCandidate.z);
    const uWall =
        uLength < 1e-6
            ? { x: 1, y: 0, z: 0 }
            : { x: uCandidate.x / uLength, y: uCandidate.y / uLength, z: uCandidate.z / uLength };
    return { wallNormal: wall, uWall, vWall };
};

const anglesToVectorForward = (yawDeg: number, pitchDeg: number): Vec3 => {
    const yaw = degToRad(yawDeg);
    const pitch = degToRad(pitchDeg);
    const sinYaw = Math.sin(yaw);
    const cosYaw = Math.cos(yaw);
    const sinPitch = Math.sin(pitch);
    const cosPitch = Math.cos(pitch);
    return normalizeVec3({
        x: -sinYaw,
        y: cosYaw * sinPitch,
        z: -cosYaw * cosPitch,
    });
};

const anglesToVectorUp = (yawDeg: number, pitchDeg: number): Vec3 => {
    const yaw = degToRad(yawDeg);
    const pitch = degToRad(pitchDeg);
    const sinYaw = Math.sin(yaw);
    const cosYaw = Math.cos(yaw);
    const sinPitch = Math.sin(pitch);
    const cosPitch = Math.cos(pitch);
    return normalizeVec3({
        x: sinYaw,
        y: -cosYaw * sinPitch,
        z: cosYaw * cosPitch,
    });
};

export const anglesToVector = (yawDeg: number, pitchDeg: number, basis: OrientationBasis): Vec3 =>
    basis === 'forward'
        ? anglesToVectorForward(yawDeg, pitchDeg)
        : anglesToVectorUp(yawDeg, pitchDeg);

const vectorToAnglesForward = (vector: Vec3): { yaw: number; pitch: number } => {
    const normalized = normalizeVec3(vector);
    const yaw = radToDeg(
        Math.atan2(-normalized.x, -normalized.z === 0 ? Number.EPSILON : -normalized.z),
    );
    const cosYaw = Math.cos(degToRad(yaw));
    if (Math.abs(cosYaw) < 1e-6) {
        const pitch = normalized.y >= 0 ? 90 : -90;
        return { yaw, pitch };
    }
    const pitch = radToDeg(Math.asin(clamp(normalized.y / cosYaw, -1, 1)));
    return { yaw, pitch };
};

const vectorToAnglesUp = (vector: Vec3): { yaw: number; pitch: number } => {
    const normalized = normalizeVec3(vector);
    const yaw = radToDeg(
        Math.atan2(normalized.x, normalized.z === 0 ? Number.EPSILON : normalized.z),
    );
    const cosYaw = Math.cos(degToRad(yaw));
    if (Math.abs(cosYaw) < 1e-6) {
        const pitch = normalized.y <= 0 ? 90 : -90;
        return { yaw, pitch };
    }
    const pitch = radToDeg(Math.asin(clamp(-normalized.y / cosYaw, -1, 1)));
    return { yaw, pitch };
};

export const vectorToAngles = (
    vector: Vec3,
    basis: OrientationBasis,
): { yaw: number; pitch: number } =>
    basis === 'forward' ? vectorToAnglesForward(vector) : vectorToAnglesUp(vector);

export const withOrientationAngles = (
    orientation: OrientationState,
    yaw: number,
    pitch: number,
    basis: OrientationBasis,
): OrientationState => ({
    ...orientation,
    yaw,
    pitch,
    vector: anglesToVector(yaw, pitch, basis),
});

export const withOrientationVector = (
    orientation: OrientationState,
    vector: Vec3,
    basis: OrientationBasis,
): OrientationState => {
    const normalized = normalizeVec3(vector);
    const { yaw, pitch } = vectorToAngles(normalized, basis);
    return {
        ...orientation,
        yaw,
        pitch,
        vector: normalized,
    };
};

export const cloneOrientationState = (orientation: OrientationState): OrientationState => ({
    ...orientation,
    vector: { ...orientation.vector },
});
