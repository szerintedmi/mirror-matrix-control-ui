import React, { useMemo, useRef, useState } from 'react';

import BabylonSimView from '../components/BabylonSimView';
import GeometryDebugPanel from '../components/GeometryDebugPanel';
import GeometryOverlays from '../components/GeometryOverlays';
import GeometryStatusPanel from '../components/GeometryStatusPanel';
import { TILE_PLACEMENT_UNIT } from '../constants/pattern';
import {
    DEFAULT_PROJECTION_SETTINGS,
    MAX_PIXEL_SPACING_M,
    MAX_PROJECTION_OFFSET_M,
    MAX_SLOPE_BLUR_SIGMA_DEG,
    MAX_SUN_ANGULAR_DIAMETER_DEG,
    MAX_WALL_DISTANCE_M,
    MIN_PIXEL_SPACING_M,
    MIN_PROJECTION_OFFSET_M,
    MIN_SLOPE_BLUR_SIGMA_DEG,
    MIN_SUN_ANGULAR_DIAMETER_DEG,
    MIN_WALL_DISTANCE_M,
} from '../constants/projection';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import {
    type OrientationBasis,
    cloneOrientationState,
    withOrientationAngles,
    withOrientationVector,
} from '../utils/orientation';
import { computeProjectionFootprint } from '../utils/projectionGeometry';
import { solveReflection } from '../utils/reflectionSolver';

import type {
    MirrorReflectionSolution,
    OrientationInputMode,
    OrientationState,
    Pattern,
    ProjectionSettings,
    ReflectionSolverResult,
    Vec3,
} from '../types';

interface SimulationPageProps {
    gridSize: { rows: number; cols: number };
    projectionSettings: ProjectionSettings;
    onUpdateProjection: (patch: Partial<ProjectionSettings>) => void;
    projectionError: string | null;
    onClearProjectionError?: () => void;
    patterns: Pattern[];
    hasUserPatterns: boolean;
    activePatternId: string | null;
    onSelectPattern: (patternId: string | null) => void;
}

interface SliderControlProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    unit?: string;
    dataTestId?: string;
    onChange: (value: number) => void;
}

const SliderControl: React.FC<SliderControlProps> = ({
    label,
    value,
    min,
    max,
    step,
    unit,
    dataTestId,
    onChange,
}) => (
    <div className="flex flex-col gap-1">
        <div className="flex justify-between items-baseline">
            <label className="text-sm text-gray-300 font-medium">{label}</label>
            <span className="font-mono text-cyan-300 bg-gray-900 px-2 py-0.5 rounded-md text-sm">
                {value.toFixed(2)}
                {unit}
            </span>
        </div>
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            data-testid={dataTestId}
            onChange={(event) => onChange(Number(event.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
        />
    </div>
);

interface NumberFieldProps {
    label: string;
    value: number;
    min?: number;
    max?: number;
    step?: number;
    suffix?: string;
    dataTestId?: string;
    onChange: (value: number) => void;
}

const NumberField: React.FC<NumberFieldProps> = ({
    label,
    value,
    min,
    max,
    step = 0.01,
    suffix,
    dataTestId,
    onChange,
}) => (
    <label className="flex flex-col gap-1 text-sm text-gray-300">
        <span className="flex items-center justify-between">
            {label}
            <span className="text-xs text-gray-400">
                {value.toFixed(3)}
                {suffix}
            </span>
        </span>
        <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            data-testid={dataTestId}
            onChange={(event) => {
                const nextValue = Number(event.target.value);
                if (Number.isNaN(nextValue)) {
                    return;
                }
                onChange(nextValue);
            }}
            className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />
    </label>
);

interface OrientationControlProps {
    label: string;
    orientation: OrientationState;
    basis: OrientationBasis;
    defaultOrientation: OrientationState;
    dataTestId: string;
    onChange: (orientation: OrientationState) => void;
}

const OrientationControl: React.FC<OrientationControlProps> = ({
    label,
    orientation,
    basis,
    defaultOrientation,
    dataTestId,
    onChange,
}) => {
    const setMode = (mode: OrientationInputMode) => {
        if (orientation.mode === mode) {
            return;
        }
        onChange({
            ...orientation,
            mode,
        });
    };

    const handleAngleChange =
        (field: 'yaw' | 'pitch') =>
        (value: number): void => {
            const next =
                field === 'yaw'
                    ? withOrientationAngles(
                          { ...orientation, mode: 'angles' },
                          value,
                          orientation.pitch,
                          basis,
                      )
                    : withOrientationAngles(
                          { ...orientation, mode: 'angles' },
                          orientation.yaw,
                          value,
                          basis,
                      );
            onChange(next);
        };

    const handleVectorChange =
        (axis: keyof Vec3) =>
        (value: number): void => {
            const nextVector = { ...orientation.vector, [axis]: value };
            const next = withOrientationVector(
                { ...orientation, mode: 'vector' },
                nextVector,
                basis,
            );
            onChange(next);
        };

    const handleReset = () => {
        const base = cloneOrientationState(defaultOrientation);
        base.mode = orientation.mode;
        onChange(base);
    };

    return (
        <div className="border border-gray-700/60 rounded-lg p-3 bg-gray-900/40 space-y-3">
            <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-gray-200">{label}</h4>
                <div className="flex bg-gray-800 rounded-md overflow-hidden text-xs">
                    <button
                        type="button"
                        data-testid={`${dataTestId}-mode-angles`}
                        className={`px-2 py-1 ${
                            orientation.mode === 'angles'
                                ? 'bg-cyan-500 text-gray-900'
                                : 'text-gray-300'
                        }`}
                        onClick={() => setMode('angles')}
                    >
                        Angles
                    </button>
                    <button
                        type="button"
                        data-testid={`${dataTestId}-mode-vector`}
                        className={`px-2 py-1 ${
                            orientation.mode === 'vector'
                                ? 'bg-cyan-500 text-gray-900'
                                : 'text-gray-300'
                        }`}
                        onClick={() => setMode('vector')}
                    >
                        Vector
                    </button>
                </div>
            </div>

            {orientation.mode === 'angles' ? (
                <div className="grid grid-cols-1 gap-3">
                    <SliderControl
                        label="Horizontal (yaw)"
                        value={orientation.yaw}
                        min={-90}
                        max={90}
                        step={0.5}
                        unit="°"
                        dataTestId={`${dataTestId}-yaw`}
                        onChange={handleAngleChange('yaw')}
                    />
                    <SliderControl
                        label="Vertical (pitch)"
                        value={orientation.pitch}
                        min={-90}
                        max={90}
                        step={0.5}
                        unit="°"
                        dataTestId={`${dataTestId}-pitch`}
                        onChange={handleAngleChange('pitch')}
                    />
                </div>
            ) : (
                <div className="grid grid-cols-3 gap-3">
                    {(['x', 'y', 'z'] as Array<keyof Vec3>).map((axis) => (
                        <div key={axis} className="flex flex-col gap-1 text-sm text-gray-300">
                            <span>{axis.toUpperCase()}</span>
                            <input
                                type="number"
                                step={0.01}
                                value={orientation.vector[axis]}
                                data-testid={`${dataTestId}-vector-${axis}`}
                                onChange={(event) => {
                                    const nextValue = Number(event.target.value);
                                    if (Number.isNaN(nextValue)) {
                                        return;
                                    }
                                    handleVectorChange(axis)(nextValue);
                                }}
                                className="bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                            />
                        </div>
                    ))}
                </div>
            )}

            <button
                type="button"
                data-testid={`${dataTestId}-reset`}
                onClick={handleReset}
                className="text-xs text-cyan-300 hover:text-cyan-200 underline underline-offset-2"
            >
                Reset to neutral
            </button>
        </div>
    );
};

type OrientationKey = 'wallOrientation' | 'sunOrientation' | 'worldUpOrientation';

const ORIENTATION_BASIS_MAP: Record<OrientationKey, OrientationBasis> = {
    wallOrientation: 'forward',
    sunOrientation: 'forward',
    worldUpOrientation: 'up',
};

const ORIENTATION_DEFAULTS: Record<OrientationKey, OrientationState> = {
    wallOrientation: cloneOrientationState(DEFAULT_PROJECTION_SETTINGS.wallOrientation),
    sunOrientation: cloneOrientationState(DEFAULT_PROJECTION_SETTINGS.sunOrientation),
    worldUpOrientation: cloneOrientationState(DEFAULT_PROJECTION_SETTINGS.worldUpOrientation),
};

/* eslint-disable react-hooks/refs */
const useStableProjectionSnapshot = (
    solverResult: ReflectionSolverResult,
    debouncedSettings: ProjectionSettings,
): {
    effectiveResult: ReflectionSolverResult;
    effectiveSettings: ProjectionSettings;
    previewIsStale: boolean;
} => {
    const lastResultRef = useRef<ReflectionSolverResult | null>(null);
    const lastSettingsRef = useRef<ProjectionSettings | null>(null);

    if (solverResult.errors.length === 0) {
        lastResultRef.current = solverResult;
        lastSettingsRef.current = debouncedSettings;
        return {
            effectiveResult: solverResult,
            effectiveSettings: debouncedSettings,
            previewIsStale: false,
        };
    }

    const hasStableSnapshot = lastResultRef.current !== null;

    return {
        effectiveResult: lastResultRef.current ?? solverResult,
        effectiveSettings: lastSettingsRef.current ?? debouncedSettings,
        previewIsStale: hasStableSnapshot,
    };
};
/* eslint-enable react-hooks/refs */

const SimulationPage: React.FC<SimulationPageProps> = ({
    gridSize,
    projectionSettings,
    onUpdateProjection,
    projectionError,
    onClearProjectionError,
    patterns,
    hasUserPatterns,
    activePatternId,
    onSelectPattern,
}) => {
    const [selectedMirrorId, setSelectedMirrorId] = useState<string | null | undefined>(undefined);
    const [visualizationToggles, setVisualizationToggles] = useState({
        showRays: true,
        showNormals: true,
        showEllipses: true,
        showIncomingRays: false,
    });

    const activePattern = useMemo(
        () => patterns.find((pattern) => pattern.id === activePatternId) ?? null,
        [patterns, activePatternId],
    );

    const debouncedSettings = useDebouncedValue(projectionSettings, 150);

    const solverResult = useMemo(
        () =>
            solveReflection({
                gridSize,
                projection: debouncedSettings,
                pattern: activePattern,
            }),
        [activePattern, debouncedSettings, gridSize],
    );

    const { effectiveResult, effectiveSettings, previewIsStale } = useStableProjectionSnapshot(
        solverResult,
        debouncedSettings,
    );

    const footprint = useMemo(
        () =>
            computeProjectionFootprint({
                gridSize,
                pattern: activePattern,
                settings: effectiveSettings,
            }),
        [activePattern, effectiveSettings, gridSize],
    );

    const errorMirrorIds = useMemo(() => {
        const ids = new Set<string>();
        solverResult.errors.forEach((error) => {
            if (error.mirrorId) {
                ids.add(error.mirrorId);
            }
        });
        return ids;
    }, [solverResult.errors]);

    const selectedStats = useMemo(() => {
        if (activePattern) {
            const rows = Math.max(1, Math.round(activePattern.canvas.height / TILE_PLACEMENT_UNIT));
            const cols = Math.max(1, Math.round(activePattern.canvas.width / TILE_PLACEMENT_UNIT));
            return {
                rows,
                cols,
                tiles: activePattern.tiles.length,
            };
        }
        return {
            rows: gridSize.rows,
            cols: gridSize.cols,
            tiles: gridSize.rows * gridSize.cols,
        };
    }, [activePattern, gridSize]);

    const resolvedSelectedMirrorId = useMemo(() => {
        if (selectedMirrorId === null) {
            return null;
        }
        const fallback =
            effectiveResult.mirrors.find((mirror) => mirror.patternId) ??
            effectiveResult.mirrors[0] ??
            null;
        if (typeof selectedMirrorId === 'string') {
            return effectiveResult.mirrors.some((mirror) => mirror.mirrorId === selectedMirrorId)
                ? selectedMirrorId
                : (fallback?.mirrorId ?? null);
        }
        return fallback?.mirrorId ?? null;
    }, [effectiveResult, selectedMirrorId]);

    const selectedMirror = useMemo<MirrorReflectionSolution | null>(
        () =>
            effectiveResult.mirrors.find(
                (mirror) => mirror.mirrorId === resolvedSelectedMirrorId,
            ) ?? null,
        [effectiveResult, resolvedSelectedMirrorId],
    );

    const handleToggleMirrorSelection = (mirrorId: string) => {
        setSelectedMirrorId((prev) => (prev === mirrorId ? null : mirrorId));
    };

    const handleFocusMirror = (mirrorId: string) => {
        setSelectedMirrorId(mirrorId);
    };

    const handleToggleChange =
        (key: keyof typeof visualizationToggles) =>
        (event: React.ChangeEvent<HTMLInputElement>) => {
            const { checked } = event.target;
            setVisualizationToggles((prev) => ({ ...prev, [key]: checked }));
        };

    const formattedWidth =
        footprint.projectedWidth !== null ? `${footprint.projectedWidth.toFixed(2)} m` : 'Infinite';
    const formattedHeight =
        footprint.projectedHeight !== null
            ? `${footprint.projectedHeight.toFixed(2)} m`
            : 'Infinite';

    const updateOrientation = (key: OrientationKey) => (next: OrientationState) => {
        onUpdateProjection({ [key]: next });
    };

    const handlePixelSpacingChange = (axis: 'x' | 'y') => (value: number) => {
        onUpdateProjection({
            pixelSpacing: {
                ...projectionSettings.pixelSpacing,
                [axis]: value,
            },
        });
    };

    return (
        <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
            <main className="flex flex-col gap-8 min-h-0 md:flex-row">
                <aside className="w-full md:w-96 bg-gray-800/50 rounded-lg p-6 shadow-lg ring-1 ring-white/10 flex flex-col gap-4 overflow-y-auto flex-shrink-0">
                    <h2 className="text-xl font-semibold text-gray-100">Controls</h2>

                    {projectionError && (
                        <div
                            data-testid="projection-error-banner"
                            className="bg-amber-500/15 border border-amber-400/60 rounded-md p-3 text-amber-100 text-sm flex items-start justify-between gap-3"
                        >
                            <span>{projectionError}</span>
                            {onClearProjectionError && (
                                <button
                                    type="button"
                                    className="text-amber-200 underline underline-offset-2"
                                    onClick={onClearProjectionError}
                                >
                                    Dismiss
                                </button>
                            )}
                        </div>
                    )}

                    <div className="space-y-6">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-200 mb-3">
                                Pattern Source
                            </h3>
                            {!hasUserPatterns && (
                                <p className="mb-2 text-sm text-gray-400">
                                    Using the built-in single pixel is a quick way to align mirrors.
                                    Create and save a pattern in the library when you&rsquo;re ready
                                    to preview custom footprints.
                                </p>
                            )}
                            <select
                                className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 outline-none"
                                value={activePatternId ?? ''}
                                onChange={(event) =>
                                    onSelectPattern(
                                        event.target.value.length > 0 ? event.target.value : null,
                                    )
                                }
                            >
                                <option value="">Full grid (no pattern)</option>
                                {patterns.map((pattern) => (
                                    <option key={pattern.id} value={pattern.id}>
                                        {pattern.name}
                                    </option>
                                ))}
                            </select>
                            <div className="mt-3 text-xs text-gray-400 border border-gray-700/60 rounded-md p-2 bg-gray-900/60 space-y-1">
                                <div className="flex justify-between">
                                    <span>Rows</span>
                                    <span className="font-mono text-cyan-300">
                                        {selectedStats.rows}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Cols</span>
                                    <span className="font-mono text-cyan-300">
                                        {selectedStats.cols}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Tiles</span>
                                    <span className="font-mono text-cyan-300">
                                        {selectedStats.tiles}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-gray-200">
                                Wall & Projection
                            </h3>
                            <SliderControl
                                label="Wall Distance"
                                value={projectionSettings.wallDistance}
                                min={MIN_WALL_DISTANCE_M}
                                max={MAX_WALL_DISTANCE_M}
                                step={0.1}
                                unit="m"
                                dataTestId="projection-wall-distance-slider"
                                onChange={(value) => onUpdateProjection({ wallDistance: value })}
                            />
                            <NumberField
                                label="Projection Offset (H)"
                                value={projectionSettings.projectionOffset}
                                min={MIN_PROJECTION_OFFSET_M}
                                max={MAX_PROJECTION_OFFSET_M}
                                step={0.05}
                                suffix=" m"
                                dataTestId="projection-offset-input"
                                onChange={(value) =>
                                    onUpdateProjection({ projectionOffset: value })
                                }
                            />
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-gray-200">Pixel Spacing</h3>
                            <div className="grid grid-cols-2 gap-3">
                                <NumberField
                                    label="Pₓ"
                                    value={projectionSettings.pixelSpacing.x}
                                    min={MIN_PIXEL_SPACING_M}
                                    max={MAX_PIXEL_SPACING_M}
                                    step={0.001}
                                    suffix=" m"
                                    dataTestId="pixel-spacing-x-input"
                                    onChange={handlePixelSpacingChange('x')}
                                />
                                <NumberField
                                    label="Pᵧ"
                                    value={projectionSettings.pixelSpacing.y}
                                    min={MIN_PIXEL_SPACING_M}
                                    max={MAX_PIXEL_SPACING_M}
                                    step={0.001}
                                    suffix=" m"
                                    dataTestId="pixel-spacing-y-input"
                                    onChange={handlePixelSpacingChange('y')}
                                />
                            </div>
                        </div>

                        <OrientationControl
                            label="Wall Normal"
                            orientation={projectionSettings.wallOrientation}
                            basis={ORIENTATION_BASIS_MAP.wallOrientation}
                            defaultOrientation={ORIENTATION_DEFAULTS.wallOrientation}
                            dataTestId="orientation-wall"
                            onChange={updateOrientation('wallOrientation')}
                        />
                        <OrientationControl
                            label="Sun Direction"
                            orientation={projectionSettings.sunOrientation}
                            basis={ORIENTATION_BASIS_MAP.sunOrientation}
                            defaultOrientation={ORIENTATION_DEFAULTS.sunOrientation}
                            dataTestId="orientation-sun"
                            onChange={updateOrientation('sunOrientation')}
                        />
                        <OrientationControl
                            label="World Up Override"
                            orientation={projectionSettings.worldUpOrientation}
                            basis={ORIENTATION_BASIS_MAP.worldUpOrientation}
                            defaultOrientation={ORIENTATION_DEFAULTS.worldUpOrientation}
                            dataTestId="orientation-world-up"
                            onChange={updateOrientation('worldUpOrientation')}
                        />

                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-gray-200">Sun Disk & Blur</h3>
                            <NumberField
                                label="Sun Angular Diameter"
                                value={projectionSettings.sunAngularDiameterDeg}
                                min={MIN_SUN_ANGULAR_DIAMETER_DEG}
                                max={MAX_SUN_ANGULAR_DIAMETER_DEG}
                                step={0.01}
                                suffix=" °"
                                dataTestId="sun-angular-diameter-input"
                                onChange={(value) =>
                                    onUpdateProjection({ sunAngularDiameterDeg: value })
                                }
                            />
                            <NumberField
                                label="Slope Blur σ"
                                value={projectionSettings.slopeBlurSigmaDeg}
                                min={MIN_SLOPE_BLUR_SIGMA_DEG}
                                max={MAX_SLOPE_BLUR_SIGMA_DEG}
                                step={0.01}
                                suffix=" °"
                                dataTestId="slope-blur-input"
                                onChange={(value) =>
                                    onUpdateProjection({ slopeBlurSigmaDeg: value })
                                }
                            />
                        </div>

                        <div className="pt-2 border-t border-gray-700/50">
                            <h3 className="text-lg font-semibold text-gray-200 mb-3">
                                Projected Pattern Size
                            </h3>
                            <div className="bg-gray-900/70 p-3 rounded-md space-y-2 text-sm">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400">Est. Width:</span>
                                    <span className="font-mono text-cyan-300 text-base">
                                        {formattedWidth}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400">Est. Height:</span>
                                    <span className="font-mono text-cyan-300 text-base">
                                        {formattedHeight}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400">Wall Distance:</span>
                                    <span className="font-mono text-cyan-300 text-base">
                                        {projectionSettings.wallDistance.toFixed(1)} m
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </aside>

                <div className="flex-grow flex flex-col min-h-0 min-w-0 gap-4">
                    <div className="flex flex-col gap-2.5">
                        <BabylonSimView
                            gridSize={gridSize}
                            settings={effectiveSettings}
                            solverResult={effectiveResult}
                            selectedMirrorId={resolvedSelectedMirrorId}
                            errorMirrorIds={errorMirrorIds}
                            debugOptions={visualizationToggles}
                            isPreviewStale={previewIsStale}
                            showIncomingPerMirror={visualizationToggles.showIncomingRays}
                            activePatternId={activePatternId}
                            className="flex-none"
                            heightHint="clamp(340px, 54vh, 600px)"
                        />

                        <div className="flex flex-wrap gap-2.5 text-xs font-medium text-gray-300 sm:text-sm">
                            <label className="inline-flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-gray-600 bg-gray-900"
                                    checked={visualizationToggles.showRays}
                                    onChange={handleToggleChange('showRays')}
                                    data-testid="toggle-rays"
                                />
                                Rays
                            </label>
                            <label className="inline-flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-gray-600 bg-gray-900"
                                    checked={visualizationToggles.showNormals}
                                    onChange={handleToggleChange('showNormals')}
                                    data-testid="toggle-normals"
                                />
                                Normal vectors
                            </label>
                            <label className="inline-flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-gray-600 bg-gray-900"
                                    checked={visualizationToggles.showEllipses}
                                    onChange={handleToggleChange('showEllipses')}
                                    data-testid="toggle-ellipses"
                                />
                                Ellipses
                            </label>
                            <label className="inline-flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-gray-600 bg-gray-900"
                                    checked={visualizationToggles.showIncomingRays}
                                    onChange={handleToggleChange('showIncomingRays')}
                                    data-testid="toggle-incoming-rays"
                                />
                                Incoming rays
                            </label>
                        </div>

                        <GeometryStatusPanel
                            errors={solverResult.errors}
                            onFocusMirror={handleFocusMirror}
                        />
                    </div>

                    <div className="flex flex-col gap-4 xl:flex-row">
                        <div className="min-w-0 xl:flex-[1.6]">
                            <GeometryOverlays
                                mirrors={effectiveResult.mirrors}
                                selectedMirrorId={resolvedSelectedMirrorId}
                                onSelectMirror={handleToggleMirrorSelection}
                                onClearSelection={() => setSelectedMirrorId(null)}
                                errorMirrorIds={errorMirrorIds}
                                projectionSettings={effectiveSettings}
                                gridSize={gridSize}
                            />
                        </div>
                        <div className="min-w-0 xl:flex-1">
                            <GeometryDebugPanel mirror={selectedMirror} isStale={previewIsStale} />
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default SimulationPage;
