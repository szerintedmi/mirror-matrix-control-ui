import { MIRROR_PITCH_M } from '../constants/projection';

import { degToRad, dotVec3, normalizeVec3, radToDeg } from './orientation';

import type {
    MirrorReflectionSolution,
    Pattern,
    ProjectionSettings,
    ReflectionAssignment,
    ReflectionSolverError,
    ReflectionSolverResult,
    Vec3,
} from '../types';

const EPSILON = 1e-6;

export interface ReflectionSolverParams {
    gridSize: { rows: number; cols: number };
    projection: ProjectionSettings;
    pattern: Pattern | null;
    arrayOrigin?: Vec3;
    wallAnchor?: Vec3;
}

interface PatternTarget {
    id: string;
    normalizedX: number;
    normalizedY: number;
    targetPoint: Vec3;
}

interface MirrorMeta {
    mirrorId: string;
    row: number;
    col: number;
    center: Vec3;
    normalizedX: number;
    normalizedY: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const addVec = (a: Vec3, b: Vec3): Vec3 => ({
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z,
});

const subVec = (a: Vec3, b: Vec3): Vec3 => ({
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
});

const scaleVec = (v: Vec3, scalar: number): Vec3 => ({
    x: v.x * scalar,
    y: v.y * scalar,
    z: v.z * scalar,
});

const lengthVec = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);

const crossVec = (a: Vec3, b: Vec3): Vec3 => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
});

const normalize = (v: Vec3): Vec3 => normalizeVec3(v);

const projectPointOntoPlane = (point: Vec3, planePoint: Vec3, planeNormal: Vec3): Vec3 =>
    addVec(point, scaleVec(planeNormal, dotVec3(subVec(planePoint, point), planeNormal)));

const createMirrorId = (row: number, col: number): string => `mirror-${row}-${col}`;

const createFallbackPatternTiles = (gridSize: { rows: number; cols: number }): PatternTarget[] => {
    const { rows, cols } = gridSize;
    const targets: PatternTarget[] = [];
    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
            const normalizedX = cols > 0 ? (col + 0.5) / cols : 0.5;
            const normalizedY = rows > 0 ? (row + 0.5) / rows : 0.5;
            targets.push({
                id: `fallback-${row}-${col}`,
                normalizedX,
                normalizedY,
                targetPoint: { x: 0, y: 0, z: 0 }, // placeholder, overwritten later
            });
        }
    }
    return targets;
};

const buildPatternTargets = ({
    pattern,
    gridSize,
    uWall,
    vWall,
    patternOrigin,
    spacing,
}: {
    pattern: Pattern | null;
    gridSize: { rows: number; cols: number };
    uWall: Vec3;
    vWall: Vec3;
    patternOrigin: Vec3;
    spacing: { x: number; y: number };
}): PatternTarget[] => {
    const baseTargets =
        pattern && pattern.tiles.length > 0
            ? pattern.tiles.map((tile) => ({
                  id: tile.id,
                  normalizedX: clamp01(
                      pattern.canvas.width > 0 ? tile.center.x / pattern.canvas.width : 0.5,
                  ),
                  normalizedY: clamp01(
                      pattern.canvas.height > 0 ? tile.center.y / pattern.canvas.height : 0.5,
                  ),
                  targetPoint: patternOrigin,
              }))
            : createFallbackPatternTiles(gridSize);

    const cols = Math.max(1, gridSize.cols);
    const rows = Math.max(1, gridSize.rows);
    return baseTargets.map((target) => {
        const offsetU = (target.normalizedX - 0.5) * cols * spacing.x;
        const offsetV = (0.5 - target.normalizedY) * rows * spacing.y;
        const wallPoint = addVec(
            addVec(patternOrigin, scaleVec(uWall, offsetU)),
            scaleVec(vWall, offsetV),
        );
        return {
            ...target,
            targetPoint: wallPoint,
        };
    });
};

const buildAlignedFallbackTargets = ({
    mirrors,
    wallPoint,
    wallNormal,
    vWall,
    projectionOffset,
}: {
    mirrors: MirrorMeta[];
    wallPoint: Vec3;
    wallNormal: Vec3;
    vWall: Vec3;
    projectionOffset: number;
}): PatternTarget[] =>
    mirrors.map((mirror) => {
        const projected = projectPointOntoPlane(mirror.center, wallPoint, wallNormal);
        const targetPoint = addVec(projected, scaleVec(vWall, projectionOffset));
        return {
            id: `fallback-${mirror.row}-${mirror.col}`,
            normalizedX: mirror.normalizedX,
            normalizedY: mirror.normalizedY,
            targetPoint,
        };
    });

const buildMirrorMeta = (gridSize: { rows: number; cols: number }, origin: Vec3): MirrorMeta[] => {
    const mirrors: MirrorMeta[] = [];
    const x0 = origin.x;
    const y0 = origin.y;
    for (let row = 0; row < gridSize.rows; row += 1) {
        for (let col = 0; col < gridSize.cols; col += 1) {
            const center: Vec3 = {
                x: x0 + col * MIRROR_PITCH_M,
                y: y0 - row * MIRROR_PITCH_M,
                z: origin.z,
            };
            mirrors.push({
                mirrorId: createMirrorId(row, col),
                row,
                col,
                center,
                normalizedX: gridSize.cols > 0 ? (col + 0.5) / gridSize.cols : 0.5,
                normalizedY: gridSize.rows > 0 ? (row + 0.5) / gridSize.rows : 0.5,
            });
        }
    }
    if (mirrors.length === 0) {
        // Ensure at least one placeholder mirror so downstream consumers can surface errors gracefully.
        mirrors.push({
            mirrorId: 'mirror-0-0',
            row: 0,
            col: 0,
            center: { x: x0, y: y0, z: origin.z },
            normalizedX: 0.5,
            normalizedY: 0.5,
        });
    }
    return mirrors;
};

const createMirrorSolution = (meta: MirrorMeta): MirrorReflectionSolution => ({
    mirrorId: meta.mirrorId,
    row: meta.row,
    col: meta.col,
    center: meta.center,
    patternId: null,
    errors: [],
});

const createMirrorSolutionsFromMeta = (mirrorMeta: MirrorMeta[]): MirrorReflectionSolution[] =>
    mirrorMeta.map((mirror) => createMirrorSolution(mirror));

const propagateErrorToAll = (
    mirrors: MirrorReflectionSolution[],
    error: ReflectionSolverError,
): ReflectionSolverResult => ({
    mirrors: mirrors.map((mirror) => ({
        ...mirror,
        errors: [
            ...mirror.errors,
            {
                ...error,
                mirrorId: mirror.mirrorId,
            },
        ],
    })),
    assignments: [],
    errors: [error],
});

const assignTargetsToMirrors = (
    mirrors: MirrorMeta[],
    targets: PatternTarget[],
): {
    assignments: Map<string, PatternTarget>;
    orderedAssignments: ReflectionAssignment[];
    errors: ReflectionSolverError[];
} => {
    const assignments = new Map<string, PatternTarget>();
    const orderedAssignments: ReflectionAssignment[] = [];
    const errors: ReflectionSolverError[] = [];

    if (targets.length > mirrors.length) {
        errors.push({
            code: 'pattern_exceeds_mirrors',
            message: `Pattern contains ${targets.length} tiles but only ${mirrors.length} mirrors are available.`,
        });
        return { assignments, orderedAssignments, errors };
    }

    const available = new Set(mirrors.map((_, index) => index));
    const sortedTargets = [...targets].sort((a, b) => {
        if (a.normalizedY !== b.normalizedY) {
            return a.normalizedY - b.normalizedY;
        }
        if (a.normalizedX !== b.normalizedX) {
            return a.normalizedX - b.normalizedX;
        }
        return a.id.localeCompare(b.id);
    });

    for (const target of sortedTargets) {
        let bestIndex: number | null = null;
        let bestCost = Number.POSITIVE_INFINITY;
        for (const index of available) {
            const mirror = mirrors[index];
            const dx = mirror.normalizedX - target.normalizedX;
            const dy = mirror.normalizedY - target.normalizedY;
            const cost = dx * dx + dy * dy;
            if (cost < bestCost - EPSILON) {
                bestCost = cost;
                bestIndex = index;
            } else if (Math.abs(cost - bestCost) <= EPSILON && bestIndex !== null) {
                const bestMirror = mirrors[bestIndex];
                if (
                    mirror.row < bestMirror.row ||
                    (mirror.row === bestMirror.row && mirror.col < bestMirror.col)
                ) {
                    bestIndex = index;
                }
            }
        }

        if (bestIndex === null) {
            errors.push({
                code: 'degenerate_assignment',
                message: 'Unable to assign pattern tile to an available mirror.',
                patternId: target.id,
            });
            continue;
        }

        const mirror = mirrors[bestIndex];
        assignments.set(mirror.mirrorId, target);
        orderedAssignments.push({
            mirrorId: mirror.mirrorId,
            patternId: target.id,
        });
        available.delete(bestIndex);
    }

    return { assignments, orderedAssignments, errors };
};

const solveMirrorReflection = ({
    mirror,
    target,
    wallNormal,
    sunDirection,
    wallPoint,
    uWall,
    vWall,
    thetaEffective,
}: {
    mirror: MirrorMeta;
    target: PatternTarget;
    wallNormal: Vec3;
    sunDirection: Vec3;
    wallPoint: Vec3;
    uWall: Vec3;
    vWall: Vec3;
    thetaEffective: number;
}): {
    yaw?: number;
    pitch?: number;
    normal?: Vec3;
    wallHit?: Vec3;
    ellipse?: MirrorReflectionSolution['ellipse'];
    errors: ReflectionSolverError[];
} => {
    const errors: ReflectionSolverError[] = [];
    const mirrorCenter = mirror.center;
    const direction = subVec(target.targetPoint, mirrorCenter);
    const dirLength = lengthVec(direction);
    if (dirLength < EPSILON) {
        errors.push({
            code: 'invalid_target',
            message: 'Target point coincides with mirror center.',
            mirrorId: mirror.mirrorId,
            patternId: target.id,
        });
        return { errors };
    }
    const rHat = scaleVec(direction, 1 / dirLength);
    const incoming = normalize(sunDirection);
    const bisector = normalize(addVec(rHat, incoming));
    if (lengthVec(bisector) < EPSILON) {
        errors.push({
            code: 'degenerate_bisector',
            message: 'Incoming light aligns with reflected ray, resulting in undefined bisector.',
            mirrorId: mirror.mirrorId,
            patternId: target.id,
        });
        return { errors };
    }

    const nU = dotVec3(bisector, uWall);
    const nV = dotVec3(bisector, vWall);
    const nW = dotVec3(bisector, wallNormal);
    const yaw = Math.atan2(nU, Math.sqrt(Math.max(0, nV * nV + nW * nW)));
    const pitch = Math.atan2(-nV, nW);
    const yawDeg = radToDeg(yaw);
    const pitchDeg = radToDeg(pitch);

    const den = dotVec3(rHat, wallNormal);
    if (Math.abs(den) < EPSILON) {
        errors.push({
            code: 'grazing_incidence',
            message: 'Reflected ray is parallel to the wall plane.',
            mirrorId: mirror.mirrorId,
            patternId: target.id,
        });
        return { errors };
    }
    const tNumerator = dotVec3(subVec(wallPoint, mirrorCenter), wallNormal);
    const t = tNumerator / den;
    if (t <= EPSILON) {
        errors.push({
            code: 'wall_behind_mirror',
            message: 'Wall intersection lies behind the mirror.',
            mirrorId: mirror.mirrorId,
            patternId: target.id,
        });
        return { errors };
    }
    const wallHit = addVec(mirrorCenter, scaleVec(rHat, t));
    const aDirRaw = subVec(rHat, scaleVec(wallNormal, den));
    let aDir = normalize(aDirRaw);
    if (lengthVec(aDir) < EPSILON) {
        aDir = uWall;
    }
    let bDir = normalize(crossVec(wallNormal, aDir));
    if (lengthVec(bDir) < EPSILON) {
        bDir = vWall;
    }
    const incidenceCosine = Math.abs(den);
    const dMinor = 2 * t * Math.tan(thetaEffective / 2);
    const dMajor = incidenceCosine > EPSILON ? dMinor / incidenceCosine : Number.POSITIVE_INFINITY;

    return {
        yaw: yawDeg,
        pitch: pitchDeg,
        normal: bisector,
        wallHit,
        ellipse: {
            majorDiameter: dMajor,
            minorDiameter: dMinor,
            majorAxis: aDir,
            minorAxis: bDir,
            incidenceCosine,
        },
        errors,
    };
};

export const solveReflection = (params: ReflectionSolverParams): ReflectionSolverResult => {
    const { gridSize, projection, pattern } = params;

    const width = gridSize.cols * MIRROR_PITCH_M;
    const height = gridSize.rows * MIRROR_PITCH_M;
    const arrayOrigin = params.arrayOrigin ?? {
        x: -width / 2 + MIRROR_PITCH_M / 2,
        y: height / 2 - MIRROR_PITCH_M / 2,
        z: 0,
    };
    const wallNormal = normalize(projection.wallOrientation.vector);
    const sunDirection = normalize(projection.sunOrientation.vector);
    const worldUp = normalize(projection.worldUpOrientation.vector);
    const alignment = Math.abs(dotVec3(worldUp, wallNormal));

    const mirrorMeta = buildMirrorMeta(gridSize, arrayOrigin);
    const mirrorMetaMap = new Map(mirrorMeta.map((meta) => [meta.mirrorId, meta]));
    const baseSolutions = createMirrorSolutionsFromMeta(mirrorMeta);

    if (lengthVec(projection.sunOrientation.vector) < EPSILON) {
        return propagateErrorToAll(baseSolutions, {
            code: 'incoming_alignment',
            message: 'Sun direction vector cannot be zero.',
        });
    }

    if (alignment >= 0.98) {
        return propagateErrorToAll(baseSolutions, {
            code: 'invalid_wall_basis',
            message:
                'Wall normal is nearly parallel to world up. Adjust the world-up vector to create a stable vertical axis.',
        });
    }

    const vWallCandidate = subVec(worldUp, scaleVec(wallNormal, dotVec3(worldUp, wallNormal)));
    if (lengthVec(vWallCandidate) < EPSILON) {
        return propagateErrorToAll(baseSolutions, {
            code: 'invalid_wall_basis',
            message: 'Unable to derive wall vertical axis from provided vectors.',
        });
    }
    const vWall = normalize(vWallCandidate);
    const uWallCandidate = crossVec(vWall, wallNormal);
    if (lengthVec(uWallCandidate) < EPSILON) {
        return propagateErrorToAll(baseSolutions, {
            code: 'invalid_wall_basis',
            message: 'Unable to derive wall horizontal axis from provided vectors.',
        });
    }
    const uWall = normalize(uWallCandidate);

    const wallPoint =
        params.wallAnchor ?? addVec(arrayOrigin, scaleVec(wallNormal, projection.wallDistance));

    const mirror00 = mirrorMeta[0];
    const projectedOrigin = projectPointOntoPlane(mirror00.center, wallPoint, wallNormal);
    const patternOrigin = addVec(projectedOrigin, scaleVec(vWall, projection.projectionOffset));

    let patternTargets: PatternTarget[];
    if (!pattern || pattern.tiles.length === 0) {
        patternTargets = buildAlignedFallbackTargets({
            mirrors: mirrorMeta,
            wallPoint,
            wallNormal,
            vWall,
            projectionOffset: projection.projectionOffset,
        });
    } else {
        patternTargets = buildPatternTargets({
            pattern,
            gridSize,
            uWall,
            vWall,
            patternOrigin,
            spacing: {
                x: projection.pixelSpacing.x,
                y: projection.pixelSpacing.y,
            },
        });
    }

    const assignmentResult = assignTargetsToMirrors(mirrorMeta, patternTargets);
    const thetaSun = degToRad(projection.sunAngularDiameterDeg);
    const sigma = degToRad(projection.slopeBlurSigmaDeg);
    const thetaEffective = Math.sqrt(thetaSun * thetaSun + 2 * sigma * (2 * sigma));

    const mirrors: MirrorReflectionSolution[] = baseSolutions.map((solution) => {
        const assignedTarget = assignmentResult.assignments.get(solution.mirrorId);
        if (!assignedTarget) {
            return solution;
        }
        const meta = mirrorMetaMap.get(solution.mirrorId);
        if (!meta) {
            return solution;
        }
        const solved = solveMirrorReflection({
            mirror: meta,
            target: assignedTarget,
            wallNormal,
            sunDirection,
            wallPoint,
            uWall,
            vWall,
            thetaEffective,
        });
        return {
            ...solution,
            patternId: assignedTarget.id,
            yaw: solved.yaw,
            pitch: solved.pitch,
            normal: solved.normal,
            wallHit: solved.wallHit,
            ellipse: solved.ellipse,
            errors: solved.errors.map((error) => ({
                ...error,
                mirrorId: solution.mirrorId,
            })),
        };
    });

    const aggregatedErrors = [
        ...assignmentResult.errors,
        ...mirrors.flatMap((mirror) => mirror.errors),
    ];

    return {
        mirrors,
        assignments: assignmentResult.orderedAssignments,
        errors: aggregatedErrors,
    };
};
