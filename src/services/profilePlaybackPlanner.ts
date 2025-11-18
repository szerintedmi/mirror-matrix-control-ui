import { getMirrorAssignment } from '../utils/grid';

import type {
    Pattern,
    CalibrationProfile,
    TileCalibrationResults,
    LegacyPlaybackMirrorPlan,
    LegacyPlaybackPlanResult,
    MirrorConfig,
} from '../types';

export interface ProfilePlaybackParams {
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
    profile: CalibrationProfile | null;
    pattern: Pattern | null;
}

const cloneAssignment = (
    plan: LegacyPlaybackMirrorPlan['assignment'],
): LegacyPlaybackMirrorPlan['assignment'] => ({
    x: plan.x ? { ...plan.x } : null,
    y: plan.y ? { ...plan.y } : null,
});

const getTileKey = (row: number, col: number): string => `${row}-${col}`;

const isTileCalibrated = (
    tile: TileCalibrationResults | undefined,
): tile is TileCalibrationResults =>
    Boolean(
        tile &&
            tile.status === 'completed' &&
            tile.adjustedHome &&
            tile.stepToDisplacement.x !== null &&
            tile.stepToDisplacement.y !== null,
    );

export const planProfilePlayback = ({
    gridSize,
    mirrorConfig,
    profile,
    pattern,
}: ProfilePlaybackParams): LegacyPlaybackPlanResult => {
    if (!profile || !pattern) {
        return {
            patternId: pattern?.id ?? null,
            mirrors: [],
            assignments: [],
            errors: [],
        };
    }

    const totalMirrors = gridSize.rows * gridSize.cols;
    if (pattern.points.length > totalMirrors) {
        return {
            patternId: pattern.id,
            mirrors: [],
            assignments: [],
            errors: [
                {
                    code: 'pattern_exceeds_mirrors',
                    message: 'Pattern has more points than available mirrors.',
                },
            ],
        };
    }

    const mirrors: LegacyPlaybackMirrorPlan[] = [];
    const assignments: { mirrorId: string; patternId: string }[] = [];

    let patternIndex = 0;
    for (let row = 0; row < gridSize.rows; row += 1) {
        for (let col = 0; col < gridSize.cols; col += 1) {
            const patternPoint = pattern.points[patternIndex] ?? null;
            const key = getTileKey(row, col);
            const tile = profile.tiles[key];
            const assignment = getMirrorAssignment(mirrorConfig, row, col);

            const mirrorId = key;
            if (!patternPoint) {
                mirrors.push({
                    mirrorId,
                    row,
                    col,
                    patternId: null,
                    yawDeg: null,
                    pitchDeg: null,
                    assignment: cloneAssignment(assignment),
                    errors: [],
                });
                continue;
            }

            const errors: LegacyPlaybackMirrorPlan['errors'] = [];
            if (!isTileCalibrated(tile)) {
                errors.push({
                    code: 'invalid_target',
                    message: 'Tile is not calibrated for calibration-based playback.',
                    mirrorId,
                    patternId: patternPoint.id,
                });
            }

            mirrors.push({
                mirrorId,
                row,
                col,
                patternId: patternPoint.id,
                yawDeg: null,
                pitchDeg: null,
                assignment: cloneAssignment(assignment),
                errors,
            });

            if (errors.length === 0) {
                assignments.push({
                    mirrorId,
                    patternId: patternPoint.id,
                });
            }

            patternIndex += 1;
        }
    }

    return {
        patternId: pattern.id,
        mirrors,
        assignments,
        errors: mirrors.flatMap((mirror) => mirror.errors),
    };
};
