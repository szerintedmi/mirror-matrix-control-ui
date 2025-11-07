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
