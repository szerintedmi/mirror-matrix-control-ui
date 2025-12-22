import React from 'react';

import type { ReflectionSolverError, ReflectionSolverErrorCode } from '../types';

const ERROR_HINTS: Partial<Record<ReflectionSolverErrorCode, string>> = {
    pattern_exceeds_mirrors:
        'Reduce the active pattern tiles or increase the simulated array size so every tile can map to a mirror.',
    invalid_wall_basis:
        'Adjust the wall or world-up vectors so they are not parallel. This re-establishes a stable vertical axis.',
    incoming_alignment: 'Update the Sun vector so it is not zero length before solving.',
    grazing_incidence:
        'Change wall distance/offset until the reflected ray intersects the wall at a non-grazing angle.',
    wall_behind_mirror:
        'Increase the wall distance or reduce the projection offset to keep the wall in front of the mirrors.',
    degenerate_bisector:
        'Nudge the Sun direction or target point so the incoming beam does not perfectly align with the outgoing ray.',
    invalid_target:
        'Reposition the selected pattern tile so it does not overlap the mirror center.',
    degenerate_assignment:
        'Adjust pattern density or array dimensions so each tile can map to a unique mirror without collisions.',
};

interface GeometryStatusPanelProps {
    errors: ReflectionSolverError[];
    onFocusMirror?: (mirrorId: string) => void;
}

const GeometryStatusPanel: React.FC<GeometryStatusPanelProps> = ({ errors, onFocusMirror }) => {
    if (errors.length === 0) {
        return null;
    }

    const perMirror = new Map<string, ReflectionSolverError[]>();
    const globalErrors: ReflectionSolverError[] = [];

    errors.forEach((error) => {
        if (error.mirrorId) {
            const existing = perMirror.get(error.mirrorId) ?? [];
            existing.push(error);
            perMirror.set(error.mirrorId, existing);
            return;
        }
        globalErrors.push(error);
    });

    const renderErrorRow = (error: ReflectionSolverError, idx: number) => (
        <div
            key={`${error.code}-${error.mirrorId ?? 'global'}-${idx}`}
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3"
        >
            <p className="text-sm font-semibold text-amber-100">
                {error.message}
                {error.mirrorId ? ` (Mirror ${error.mirrorId.replace('mirror-', '')})` : ''}
            </p>
            <p className="mt-1 text-xs text-amber-200">
                {ERROR_HINTS[error.code] ?? 'Adjust the geometry parameters and try again.'}
            </p>
        </div>
    );

    return (
        <section className="rounded-xl border border-amber-500/30 bg-gray-900/70 p-4 shadow-inner shadow-amber-500/10">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-sm font-semibold text-amber-100">Solver errors detected</p>
                    <p className="text-xs text-amber-200/90">
                        Preview updates are paused until you resolve the issues below.
                    </p>
                </div>
                <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-100">
                    {errors.length} issue{errors.length === 1 ? '' : 's'}
                </span>
            </div>

            <div className="mt-3 space-y-3">
                {globalErrors.map((error, index) => renderErrorRow(error, index))}

                {Array.from(perMirror.entries()).map(([mirrorId, mirrorErrors]) => (
                    <div
                        key={mirrorId}
                        className="space-y-2 rounded-lg border border-gray-700/60 p-3"
                    >
                        <div className="flex items-center justify-between text-sm font-medium text-gray-200">
                            <span>Mirror {mirrorId.replace('mirror-', '')}</span>
                            {onFocusMirror && (
                                <button
                                    type="button"
                                    className="text-xs font-semibold text-cyan-300 underline-offset-2 hover:text-cyan-200"
                                    onClick={() => onFocusMirror(mirrorId)}
                                >
                                    Focus
                                </button>
                            )}
                        </div>
                        {mirrorErrors.map((error, index) => renderErrorRow(error, index))}
                    </div>
                ))}
            </div>
        </section>
    );
};

export default GeometryStatusPanel;
