import React from 'react';

import type { Animation } from '@/types/animation';

interface AnimationPreviewProps {
    animation: Animation | null;
    gridSize: { rows: number; cols: number };
    currentSegment: number | null;
    isPlaying: boolean;
}

/**
 * Placeholder component for animation preview.
 * Will show animated visualization of paths in a future iteration.
 */
const AnimationPreview: React.FC<AnimationPreviewProps> = ({
    animation,
    gridSize,
    currentSegment,
    isPlaying,
}) => {
    return (
        <div className="flex flex-col gap-3 rounded-lg border border-dashed border-gray-700 bg-gray-900/30 p-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-400">Preview</h3>
                <span className="rounded bg-amber-600/20 px-2 py-0.5 text-xs text-amber-400">
                    Coming Soon
                </span>
            </div>

            <div className="flex aspect-video items-center justify-center rounded-md bg-gray-900/50">
                <div className="text-center">
                    <svg
                        className="mx-auto h-12 w-12 text-gray-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                    </svg>
                    <p className="mt-2 text-sm text-gray-500">Animated preview will appear here</p>
                    <p className="mt-1 text-xs text-gray-600">
                        Shows real-time visualization of mirror movements
                    </p>
                </div>
            </div>

            {animation && (
                <div className="space-y-1 text-xs text-gray-500">
                    <p>
                        <span className="text-gray-400">Animation:</span> {animation.name}
                    </p>
                    <p>
                        <span className="text-gray-400">Mode:</span>{' '}
                        {animation.mode === 'independent' ? 'Independent Paths' : 'Sequential'}
                    </p>
                    <p>
                        <span className="text-gray-400">Paths:</span> {animation.paths.length}
                    </p>
                    <p>
                        <span className="text-gray-400">Grid:</span> {gridSize.rows} x{' '}
                        {gridSize.cols}
                    </p>
                    {isPlaying && currentSegment !== null && (
                        <p className="text-cyan-400">Playing segment {currentSegment + 1}...</p>
                    )}
                </div>
            )}
        </div>
    );
};

export default AnimationPreview;
