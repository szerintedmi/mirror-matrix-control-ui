import React, { useMemo } from 'react';

import { MIRROR_PITCH_M } from '../constants/projection';
import { deriveWallBasis, dotVec3 } from '../utils/orientation';

import type { MirrorReflectionSolution, ProjectionSettings, Vec3 } from '../types';

interface GeometryOverlaysProps {
    mirrors: MirrorReflectionSolution[];
    selectedMirrorId: string | null;
    onSelectMirror: (mirrorId: string) => void;
    errorMirrorIds: Set<string>;
    projectionSettings: ProjectionSettings;
    gridSize: { rows: number; cols: number };
}

const VIEW_BOX = 120;

interface PlanPoint {
    id: string;
    x: number;
    y: number;
    label: string;
    isActive: boolean;
}

const buildArrayPlan = (mirrors: MirrorReflectionSolution[]): PlanPoint[] => {
    if (mirrors.length === 0) {
        return [];
    }
    const xs = mirrors.map((mirror) => mirror.center.x);
    const ys = mirrors.map((mirror) => mirror.center.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(maxX - minX, MIRROR_PITCH_M);
    const spanY = Math.max(maxY - minY, MIRROR_PITCH_M);

    return mirrors.map((mirror) => {
        const normalizedX = (mirror.center.x - minX) / spanX;
        const normalizedY = (mirror.center.y - minY) / spanY;
        return {
            id: mirror.mirrorId,
            x: normalizedX * VIEW_BOX,
            y: VIEW_BOX - normalizedY * VIEW_BOX,
            label: `${mirror.row + 1}:${mirror.col + 1}`,
            isActive: Boolean(mirror.patternId),
        } satisfies PlanPoint;
    });
};

const addVec = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scaleVec = (v: Vec3, scalar: number): Vec3 => ({ x: v.x * scalar, y: v.y * scalar, z: v.z * scalar });
const subtractVec = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

const buildWallHits = (
    mirrors: MirrorReflectionSolution[],
    projectionSettings: ProjectionSettings,
    gridSize: { rows: number; cols: number },
): PlanPoint[] => {
    const hits = mirrors.filter((mirror) => mirror.wallHit);
    if (hits.length === 0) {
        return [];
    }
    const { wallNormal, uWall, vWall } = deriveWallBasis(
        projectionSettings.wallOrientation,
        projectionSettings.worldUpOrientation,
    );
    const arrayWidth = gridSize.cols * MIRROR_PITCH_M;
    const arrayHeight = gridSize.rows * MIRROR_PITCH_M;
    const defaultOrigin: Vec3 = {
        x: -arrayWidth / 2 + MIRROR_PITCH_M / 2,
        y: arrayHeight / 2 - MIRROR_PITCH_M / 2,
        z: 0,
    };
    const solverOrigin = mirrors.find((mirror) => mirror.row === 0 && mirror.col === 0)?.center;
    const arrayOrigin = solverOrigin ?? defaultOrigin;
    const wallOrigin = addVec(arrayOrigin, scaleVec(wallNormal, projectionSettings.wallDistance));

    const localHits = hits.map((mirror) => {
        const hit = mirror.wallHit ?? { x: 0, y: 0, z: 0 };
        const delta = subtractVec(hit, wallOrigin);
        const u = dotVec3(delta, uWall);
        const v = dotVec3(delta, vWall);
        return { mirror, u, v };
    });
    const minU = Math.min(...localHits.map((entry) => entry.u));
    const maxU = Math.max(...localHits.map((entry) => entry.u));
    const minV = Math.min(...localHits.map((entry) => entry.v));
    const maxV = Math.max(...localHits.map((entry) => entry.v));
    const spanU = Math.max(maxU - minU, MIRROR_PITCH_M * 2);
    const spanV = Math.max(maxV - minV, MIRROR_PITCH_M * 2);

    return localHits.map(({ mirror, u, v }) => {
        const normalizedX = (u - minU) / spanU;
        const normalizedY = (v - minV) / spanV;
        return {
            id: mirror.mirrorId,
            x: normalizedX * VIEW_BOX,
            y: VIEW_BOX - normalizedY * VIEW_BOX,
            label: mirror.patternId ?? mirror.mirrorId,
            isActive: Boolean(mirror.patternId),
        } satisfies PlanPoint;
    });
};

const GeometryOverlays: React.FC<GeometryOverlaysProps> = ({
    mirrors,
    selectedMirrorId,
    onSelectMirror,
    errorMirrorIds,
    projectionSettings,
    gridSize,
}) => {
    const arrayPlan = useMemo(() => buildArrayPlan(mirrors), [mirrors]);
    const wallHits = useMemo(
        () => buildWallHits(mirrors, projectionSettings, gridSize),
        [mirrors, projectionSettings, gridSize],
    );

    const renderSvgPoint = (point: PlanPoint, dataset: 'array' | 'wall') => {
        const isSelected = point.id === selectedMirrorId;
        const hasError = errorMirrorIds.has(point.id);
        const isInactive = !point.isActive;
        const baseColor = hasError ? '#f87171' : '#38bdf8';
        const fill = isSelected ? '#f97316' : '#1f2937';
        const fillOpacity = isInactive && !isSelected ? 0.25 : 1;
        const strokeOpacity = isInactive && !isSelected ? 0.35 : 1;
        const strokeDasharray = isInactive && !isSelected ? '2 2' : undefined;
        return (
            <g key={`${dataset}-${point.id}`}>
                <circle
                    cx={point.x}
                    cy={point.y}
                    r={isSelected ? 3 : 2.3}
                    fill={fill}
                    fillOpacity={fillOpacity}
                    stroke={baseColor}
                    strokeWidth={isSelected ? 1.8 : hasError ? 1.4 : 1}
                    strokeOpacity={strokeOpacity}
                    strokeDasharray={strokeDasharray}
                    className="cursor-pointer transition-all duration-150"
                    onClick={() => onSelectMirror(point.id)}
                    data-testid={`${dataset}-point-${point.id}`}
                >
                    <title>{`${point.label} (${dataset === 'array' ? 'array' : 'wall'})`}</title>
                </circle>
            </g>
        );
    };

    return (
        <section className="rounded-xl border border-gray-700/70 bg-gray-900/80 p-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-base font-semibold text-gray-100">2D Overlays</h3>
                    <p className="text-xs text-gray-400">
                        Click a mirror to sync with the 3D preview.
                    </p>
                </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Array layout
                    </p>
                    <div className="rounded-lg border border-gray-700/60 bg-gray-950/60 p-3">
                        {arrayPlan.length === 0 ? (
                            <p className="text-xs text-gray-500">No mirrors available.</p>
                        ) : (
                            <svg
                                viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}
                                className="h-48 w-full"
                                role="presentation"
                                data-testid="array-plan"
                            >
                                <rect
                                    x={1}
                                    y={1}
                                    width={VIEW_BOX - 2}
                                    height={VIEW_BOX - 2}
                                    fill="#0f172a"
                                    stroke="#1e293b"
                                    strokeWidth={1}
                                    rx={4}
                                />
                                {arrayPlan.map((point) => renderSvgPoint(point, 'array'))}
                            </svg>
                        )}
                    </div>
                </div>

                <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Wall footprint
                    </p>
                    <div className="rounded-lg border border-gray-700/60 bg-gray-950/60 p-3">
                        {wallHits.length === 0 ? (
                            <p className="text-xs text-gray-500">
                                Solver has not produced wall hits yet. Adjust parameters to
                                continue.
                            </p>
                        ) : (
                            <svg
                                viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}
                                className="h-48 w-full"
                                role="presentation"
                                data-testid="wall-plan"
                            >
                                <rect
                                    x={1}
                                    y={1}
                                    width={VIEW_BOX - 2}
                                    height={VIEW_BOX - 2}
                                    fill="#0f172a"
                                    stroke="#1e293b"
                                    strokeWidth={1}
                                    rx={4}
                                />
                                {wallHits.map((point) => renderSvgPoint(point, 'wall'))}
                            </svg>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default GeometryOverlays;
