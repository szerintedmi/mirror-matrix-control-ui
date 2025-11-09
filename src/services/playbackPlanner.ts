import { getMirrorAssignment } from '../utils/grid';
import { solveReflection } from '../utils/reflectionSolver';

import type {
    MirrorConfig,
    Pattern,
    PlaybackPlanResult,
    PlaybackMirrorPlan,
    ProjectionSettings,
} from '../types';

export interface PlaybackPlanningParams {
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
    projectionSettings: ProjectionSettings;
    pattern: Pattern | null;
}

const cloneAssignment = (
    plan: PlaybackMirrorPlan['assignment'],
): PlaybackMirrorPlan['assignment'] => ({
    x: plan.x ? { ...plan.x } : null,
    y: plan.y ? { ...plan.y } : null,
});

export const planPlayback = ({
    gridSize,
    mirrorConfig,
    projectionSettings,
    pattern,
}: PlaybackPlanningParams): PlaybackPlanResult => {
    const solverResult = solveReflection({
        gridSize,
        projection: projectionSettings,
        pattern,
    });

    const mirrors: PlaybackMirrorPlan[] = solverResult.mirrors.map((mirror) => {
        const assignment = getMirrorAssignment(mirrorConfig, mirror.row, mirror.col);
        return {
            mirrorId: mirror.mirrorId,
            row: mirror.row,
            col: mirror.col,
            patternId: mirror.patternId,
            yawDeg: typeof mirror.yaw === 'number' ? mirror.yaw : null,
            pitchDeg: typeof mirror.pitch === 'number' ? mirror.pitch : null,
            assignment: cloneAssignment(assignment),
            errors: mirror.errors.slice(),
        };
    });

    return {
        patternId: pattern?.id ?? null,
        mirrors,
        assignments: solverResult.assignments.slice(),
        errors: solverResult.errors.slice(),
    };
};
