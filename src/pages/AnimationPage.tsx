import React, { useCallback, useMemo, useState } from 'react';

import {
    AnimationMirrorAssignments,
    AnimationModeSelector,
    AnimationPathEditor,
    AnimationPathLibrary,
    AnimationPlaybackControls,
    AnimationPreview,
    AnimationSequentialConfig,
    AnimationTimeline,
} from '@/components/animation';
import CalibrationProfileSelector from '@/components/calibration/CalibrationProfileSelector';
import Modal from '@/components/Modal';
import { useAnimationContext } from '@/context/AnimationContext';
import { useCalibrationContext } from '@/context/CalibrationContext';
import { useAnimationPlayback } from '@/hooks/useAnimationPlayback';
import { loadGridState } from '@/services/gridStorage';
import type { MirrorConfig } from '@/types';
import type {
    Animation,
    AnimationMode,
    AnimationPath,
    IndependentModeConfig,
    SequentialModeConfig,
} from '@/types/animation';

interface AnimationPageProps {
    gridSize?: { rows: number; cols: number };
    mirrorConfig?: MirrorConfig;
}

interface CreateAnimationModalState {
    open: boolean;
    name: string;
    mode: AnimationMode;
}

interface RenameModalState {
    open: boolean;
    animationId: string;
    name: string;
}

const AnimationPage: React.FC<AnimationPageProps> = ({
    gridSize: propsGridSize,
    mirrorConfig: propsMirrorConfig,
}) => {
    // Load grid config from storage if not provided via props
    const resolvedStorage = useMemo(
        () => (typeof window !== 'undefined' ? window.localStorage : undefined),
        [],
    );
    const [gridSnapshot] = useState(() => loadGridState(resolvedStorage));

    const gridSize = useMemo(
        () => propsGridSize ?? gridSnapshot?.gridSize ?? { rows: 4, cols: 4 },
        [propsGridSize, gridSnapshot],
    );
    const mirrorConfig = useMemo(
        () => propsMirrorConfig ?? new Map(gridSnapshot?.mirrorConfig ?? []),
        [propsMirrorConfig, gridSnapshot],
    );

    // Context
    const {
        animations,
        selectedAnimationId,
        selectedAnimation,
        selectAnimation,
        createAnimation,
        saveAnimation,
        deleteAnimation,
        renameAnimation,
        createPath,
        updatePath,
        deletePath,
    } = useAnimationContext();

    const {
        profiles: calibrationProfiles,
        selectedProfileId: selectedCalibrationProfileId,
        selectProfile: selectCalibrationProfile,
        selectedProfile: selectedCalibrationProfile,
    } = useCalibrationContext();

    // Playback
    const {
        playAnimation,
        stopAnimation,
        playbackState,
        currentSegment,
        totalSegments,
        progress,
        isPlaying,
    } = useAnimationPlayback({ gridSize, mirrorConfig });

    // Local state
    const [selectedPathId, setSelectedPathId] = useState<string | null>(null);
    const [showBounds, setShowBounds] = useState(false);
    const [createModalState, setCreateModalState] = useState<CreateAnimationModalState>({
        open: false,
        name: '',
        mode: 'independent',
    });
    const [renameModalState, setRenameModalState] = useState<RenameModalState>({
        open: false,
        animationId: '',
        name: '',
    });

    // Derived
    const selectedPath = useMemo(
        () => selectedAnimation?.paths.find((p) => p.id === selectedPathId) ?? null,
        [selectedAnimation, selectedPathId],
    );

    const canPlay = useMemo(() => {
        if (!selectedAnimation) return false;
        if (selectedAnimation.paths.length === 0) return false;
        // Check if any path has at least 2 waypoints
        return selectedAnimation.paths.some((p) => p.waypoints.length >= 2);
    }, [selectedAnimation]);

    // Calculate calibration tile bounds for the path editor
    const calibrationTileBounds = useMemo(() => {
        if (!selectedCalibrationProfile) {
            return [];
        }
        return Object.entries(selectedCalibrationProfile.tiles)
            .map(([id, tile]) => {
                if (!tile.inferredBounds) {
                    return null;
                }
                return {
                    id,
                    xMin: tile.inferredBounds.x.min,
                    xMax: tile.inferredBounds.x.max,
                    yMin: tile.inferredBounds.y.min,
                    yMax: tile.inferredBounds.y.max,
                };
            })
            .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    }, [selectedCalibrationProfile]);

    const canShowBounds = Boolean(selectedCalibrationProfile) && calibrationTileBounds.length > 0;

    // Handlers
    const handleOpenCreateModal = () => {
        setCreateModalState({ open: true, name: '', mode: 'independent' });
    };

    const handleCloseCreateModal = () => {
        setCreateModalState({ open: false, name: '', mode: 'independent' });
    };

    const handleCreateAnimation = () => {
        const name = createModalState.name.trim() || `Animation ${animations.length + 1}`;
        const anim = createAnimation(name, createModalState.mode);
        selectAnimation(anim.id);
        setSelectedPathId(null);
        handleCloseCreateModal();
    };

    const handleOpenRenameModal = (anim: Animation) => {
        setRenameModalState({ open: true, animationId: anim.id, name: anim.name });
    };

    const handleCloseRenameModal = () => {
        setRenameModalState({ open: false, animationId: '', name: '' });
    };

    const handleRenameAnimation = () => {
        if (renameModalState.animationId && renameModalState.name.trim()) {
            renameAnimation(renameModalState.animationId, renameModalState.name.trim());
        }
        handleCloseRenameModal();
    };

    const handleDeleteAnimation = (id: string) => {
        if (confirm('Delete this animation?')) {
            deleteAnimation(id);
            if (selectedAnimationId === id) {
                setSelectedPathId(null);
            }
        }
    };

    const handleModeChange = (mode: AnimationMode) => {
        if (!selectedAnimation) return;
        saveAnimation({
            ...selectedAnimation,
            mode,
            independentConfig: mode === 'independent' ? { assignments: [] } : undefined,
            sequentialConfig:
                mode === 'sequential'
                    ? { pathId: '', offsetMs: 100, orderBy: 'row-major' }
                    : undefined,
        });
    };

    const handleCreatePath = (name: string) => {
        if (!selectedAnimationId) return;
        const path = createPath(selectedAnimationId, name);
        if (path) {
            setSelectedPathId(path.id);
        }
    };

    const handleDeletePath = (pathId: string) => {
        if (!selectedAnimationId) return;
        deletePath(selectedAnimationId, pathId);
        if (selectedPathId === pathId) {
            setSelectedPathId(null);
        }
    };

    const handleRenamePath = (pathId: string, name: string) => {
        if (!selectedAnimation) return;
        const path = selectedAnimation.paths.find((p) => p.id === pathId);
        if (path) {
            updatePath(selectedAnimationId!, { ...path, name });
        }
    };

    const handleUpdatePath = useCallback(
        (path: AnimationPath) => {
            if (!selectedAnimationId) return;
            updatePath(selectedAnimationId, path);
        },
        [selectedAnimationId, updatePath],
    );

    const handleIndependentConfigChange = (config: IndependentModeConfig) => {
        if (!selectedAnimation) return;
        saveAnimation({ ...selectedAnimation, independentConfig: config });
    };

    const handleSequentialConfigChange = (config: SequentialModeConfig) => {
        if (!selectedAnimation) return;
        saveAnimation({ ...selectedAnimation, sequentialConfig: config });
    };

    const handlePlay = async () => {
        if (!selectedAnimation || !selectedCalibrationProfile) return;
        await playAnimation(selectedAnimation, selectedCalibrationProfile);
    };

    const handleSpeedChange = (speedSps: number) => {
        if (!selectedAnimation) return;
        saveAnimation({ ...selectedAnimation, defaultSpeedSps: speedSps });
    };

    return (
        <div className="flex h-full flex-col gap-4 overflow-hidden p-4">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <h1 className="text-xl font-bold text-gray-100">Animations</h1>
                <div className="flex items-center gap-4">
                    <CalibrationProfileSelector
                        profiles={calibrationProfiles}
                        selectedProfileId={selectedCalibrationProfileId ?? ''}
                        onSelect={selectCalibrationProfile}
                        label=""
                        placeholder="Select calibration..."
                        selectClassName="min-w-[12rem]"
                    />
                </div>
            </div>

            <div className="flex flex-1 gap-4 overflow-hidden">
                {/* Left Panel: Animation Library */}
                <div className="flex w-72 flex-none flex-col gap-4 overflow-y-auto rounded-lg bg-gray-900/50 p-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-gray-200">Library</h2>
                        <button
                            type="button"
                            onClick={handleOpenCreateModal}
                            className="rounded-md bg-cyan-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-cyan-500"
                        >
                            New
                        </button>
                    </div>

                    <div className="flex-1 space-y-1 overflow-y-auto">
                        {animations.length === 0 ? (
                            <p className="py-8 text-center text-sm text-gray-500">
                                No animations yet.
                                <br />
                                Click &quot;New&quot; to create one.
                            </p>
                        ) : (
                            animations.map((anim) => (
                                <button
                                    type="button"
                                    key={anim.id}
                                    onClick={() => {
                                        selectAnimation(anim.id);
                                        setSelectedPathId(null);
                                    }}
                                    className={`group flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left ${
                                        selectedAnimationId === anim.id
                                            ? 'bg-cyan-600/20 ring-1 ring-cyan-500'
                                            : 'bg-gray-800 hover:bg-gray-750'
                                    }`}
                                >
                                    <div>
                                        <p className="text-sm font-medium text-gray-200">
                                            {anim.name}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                            {anim.mode === 'independent'
                                                ? 'Independent'
                                                : 'Sequential'}{' '}
                                            &bull; {anim.paths.length} path(s)
                                        </p>
                                    </div>
                                    <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleOpenRenameModal(anim);
                                            }}
                                            className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                                            title="Rename"
                                        >
                                            <svg
                                                className="h-4 w-4"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                                />
                                            </svg>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteAnimation(anim.id);
                                            }}
                                            className="rounded p-1 text-gray-400 hover:bg-red-900/50 hover:text-red-400"
                                            title="Delete"
                                        >
                                            <svg
                                                className="h-4 w-4"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                />
                                            </svg>
                                        </button>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Main Content */}
                {selectedAnimation ? (
                    <div className="flex flex-1 gap-4 overflow-hidden">
                        {/* Center: Path Editor & Config */}
                        <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
                            {/* Mode Selector */}
                            <div className="rounded-lg bg-gray-900/50 p-4">
                                <AnimationModeSelector
                                    mode={selectedAnimation.mode}
                                    onChange={handleModeChange}
                                    disabled={isPlaying}
                                />
                            </div>

                            {/* Paths */}
                            <div className="rounded-lg bg-gray-900/50 p-4">
                                <AnimationPathLibrary
                                    paths={selectedAnimation.paths}
                                    selectedPathId={selectedPathId}
                                    onSelectPath={setSelectedPathId}
                                    onCreatePath={handleCreatePath}
                                    onDeletePath={handleDeletePath}
                                    onRenamePath={handleRenamePath}
                                    disabled={isPlaying}
                                />
                            </div>

                            {/* Path Editor Canvas */}
                            <div className="rounded-lg bg-gray-900/50 p-4">
                                <AnimationPathEditor
                                    path={selectedPath}
                                    allPaths={selectedAnimation.paths}
                                    selectedPathId={selectedPathId}
                                    onUpdatePath={handleUpdatePath}
                                    disabled={isPlaying}
                                    tileBounds={calibrationTileBounds}
                                    showBounds={showBounds}
                                    onShowBoundsChange={setShowBounds}
                                    canShowBounds={canShowBounds}
                                />
                            </div>

                            {/* Mode-specific config */}
                            <div className="rounded-lg bg-gray-900/50 p-4">
                                {selectedAnimation.mode === 'independent' ? (
                                    <AnimationMirrorAssignments
                                        config={selectedAnimation.independentConfig}
                                        paths={selectedAnimation.paths}
                                        gridSize={gridSize}
                                        onChange={handleIndependentConfigChange}
                                        disabled={isPlaying}
                                    />
                                ) : (
                                    <AnimationSequentialConfig
                                        config={selectedAnimation.sequentialConfig}
                                        paths={selectedAnimation.paths}
                                        gridSize={gridSize}
                                        onChange={handleSequentialConfigChange}
                                        disabled={isPlaying}
                                    />
                                )}
                            </div>

                            {/* Speed Control */}
                            <div className="rounded-lg bg-gray-900/50 p-4">
                                <div className="flex flex-col gap-2">
                                    <label
                                        htmlFor="playback-speed-slider"
                                        className="text-sm font-medium text-gray-300"
                                    >
                                        Playback Speed
                                    </label>
                                    <div className="flex items-center gap-3">
                                        <input
                                            id="playback-speed-slider"
                                            type="range"
                                            min={500}
                                            max={4000}
                                            step={100}
                                            value={selectedAnimation.defaultSpeedSps}
                                            onChange={(e) =>
                                                handleSpeedChange(parseInt(e.target.value, 10))
                                            }
                                            disabled={isPlaying}
                                            className="flex-1"
                                        />
                                        <div className="w-24 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-center text-sm text-gray-200">
                                            {selectedAnimation.defaultSpeedSps} sps
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        Motor speed in steps per second (500-4000)
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Right Panel: Preview & Playback */}
                        <div className="flex w-80 flex-none flex-col gap-4 overflow-y-auto">
                            <AnimationPlaybackControls
                                onPlay={handlePlay}
                                onStop={stopAnimation}
                                playbackState={playbackState}
                                progress={progress}
                                currentSegment={currentSegment}
                                totalSegments={totalSegments}
                                hasAnimation={Boolean(selectedAnimation)}
                                hasCalibration={Boolean(selectedCalibrationProfile)}
                                canPlay={canPlay}
                            />

                            <AnimationTimeline
                                animation={selectedAnimation}
                                currentSegment={currentSegment}
                                totalSegments={totalSegments}
                                progress={progress}
                            />

                            <AnimationPreview
                                animation={selectedAnimation}
                                gridSize={gridSize}
                                currentSegment={currentSegment}
                                isPlaying={isPlaying}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-1 items-center justify-center">
                        <div className="text-center">
                            <svg
                                className="mx-auto h-16 w-16 text-gray-600"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.5}
                                    d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
                                />
                            </svg>
                            <p className="mt-4 text-lg font-medium text-gray-400">
                                Select an animation or create a new one
                            </p>
                            <button
                                type="button"
                                onClick={handleOpenCreateModal}
                                className="mt-4 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500"
                            >
                                Create Animation
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Create Animation Modal */}
            <Modal
                open={createModalState.open}
                onClose={handleCloseCreateModal}
                title="Create Animation"
                hideCloseButton
                disableOverlayClose
            >
                <form
                    className="space-y-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleCreateAnimation();
                    }}
                >
                    <div>
                        <label
                            htmlFor="create-animation-name"
                            className="text-sm font-medium text-gray-200"
                        >
                            Name
                        </label>
                        <input
                            id="create-animation-name"
                            type="text"
                            value={createModalState.name}
                            onChange={(e) =>
                                setCreateModalState((s) => ({ ...s, name: e.target.value }))
                            }
                            placeholder="My Animation"
                            /* eslint-disable-next-line jsx-a11y/no-autofocus */
                            autoFocus
                            className="mt-1 w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-cyan-500 focus:outline-none"
                        />
                    </div>

                    <AnimationModeSelector
                        mode={createModalState.mode}
                        onChange={(mode) => setCreateModalState((s) => ({ ...s, mode }))}
                    />

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={handleCloseCreateModal}
                            className="rounded-md border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 hover:border-gray-500"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500"
                        >
                            Create
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Rename Animation Modal */}
            <Modal
                open={renameModalState.open}
                onClose={handleCloseRenameModal}
                title="Rename Animation"
                hideCloseButton
                disableOverlayClose
            >
                <form
                    className="space-y-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleRenameAnimation();
                    }}
                >
                    <div>
                        <label
                            htmlFor="rename-animation-name"
                            className="text-sm font-medium text-gray-200"
                        >
                            Name
                        </label>
                        <input
                            id="rename-animation-name"
                            type="text"
                            value={renameModalState.name}
                            onChange={(e) =>
                                setRenameModalState((s) => ({ ...s, name: e.target.value }))
                            }
                            /* eslint-disable-next-line jsx-a11y/no-autofocus */
                            autoFocus
                            className="mt-1 w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-cyan-500 focus:outline-none"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={handleCloseRenameModal}
                            className="rounded-md border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 hover:border-gray-500"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!renameModalState.name.trim()}
                            className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500"
                        >
                            Rename
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default AnimationPage;
