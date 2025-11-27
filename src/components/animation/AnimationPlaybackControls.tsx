import React from 'react';

import type { AnimationPlaybackState } from '@/types/animation';

interface AnimationPlaybackControlsProps {
    onPlay: () => void;
    onStop: () => void;
    playbackState: AnimationPlaybackState;
    progress: number;
    currentSegment: number | null;
    totalSegments: number | null;
    hasAnimation: boolean;
    hasCalibration: boolean;
    canPlay: boolean;
}

const AnimationPlaybackControls: React.FC<AnimationPlaybackControlsProps> = ({
    onPlay,
    onStop,
    playbackState,
    progress,
    currentSegment,
    totalSegments,
    hasAnimation,
    hasCalibration,
    canPlay,
}) => {
    const isPlaying = playbackState === 'playing';
    const isCompleted = playbackState === 'completed';
    const isError = playbackState === 'error';
    const isStopped = playbackState === 'stopped';

    const getStatusText = (): string => {
        if (isPlaying && currentSegment !== null && totalSegments !== null) {
            return `Playing segment ${currentSegment + 1} of ${totalSegments}`;
        }
        if (isCompleted) return 'Completed';
        if (isError) return 'Error occurred';
        if (isStopped) return 'Stopped';
        if (!hasAnimation) return 'Select an animation';
        if (!hasCalibration) return 'Select a calibration profile';
        if (!canPlay) return 'Animation needs paths with waypoints';
        return 'Ready to play';
    };

    const getStatusColor = (): string => {
        if (isPlaying) return 'text-cyan-400';
        if (isCompleted) return 'text-green-400';
        if (isError) return 'text-red-400';
        if (isStopped) return 'text-amber-400';
        return 'text-gray-400';
    };

    return (
        <div className="flex flex-col gap-4 rounded-lg bg-gray-800/50 p-4">
            <h3 className="text-sm font-semibold text-gray-200">Playback</h3>

            {/* Progress Bar */}
            <div className="space-y-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-700">
                    <div
                        className="h-full bg-cyan-500 transition-all duration-300"
                        style={{ width: `${progress * 100}%` }}
                    />
                </div>
                <p className={`text-xs ${getStatusColor()}`}>{getStatusText()}</p>
            </div>

            {/* Controls */}
            <div className="flex gap-2">
                {isPlaying ? (
                    <button
                        type="button"
                        onClick={onStop}
                        className="flex flex-1 items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
                    >
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                            <rect x="6" y="6" width="12" height="12" rx="1" />
                        </svg>
                        Stop
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={onPlay}
                        disabled={!canPlay || !hasAnimation || !hasCalibration}
                        className="flex flex-1 items-center justify-center gap-2 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500"
                    >
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                        Play
                    </button>
                )}
            </div>

            {/* Warnings */}
            {!hasCalibration && hasAnimation && (
                <p className="text-xs text-amber-400">
                    Select a calibration profile to enable playback.
                </p>
            )}
        </div>
    );
};

export default AnimationPlaybackControls;
