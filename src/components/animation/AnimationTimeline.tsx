import React from 'react';

import type { Animation } from '@/types/animation';

interface AnimationTimelineProps {
    animation: Animation | null;
    currentSegment: number | null;
    totalSegments: number | null;
    /** Reserved for future use with scrubbing. */
    progress: number;
}

/**
 * Placeholder component for animation timeline.
 * Will show segment-by-segment timeline with playhead in a future iteration.
 */
const AnimationTimeline: React.FC<AnimationTimelineProps> = (props) => {
    const { animation, currentSegment, totalSegments } = props;
    // progress is reserved for future scrubbing feature
    // Calculate simple segment visualization
    const waypointCounts = animation?.paths.map((p) => p.waypoints.length) ?? [];
    const maxWaypoints = Math.max(...waypointCounts, 2);
    const segmentCount = Math.max(0, maxWaypoints - 1);

    return (
        <div className="flex flex-col gap-3 rounded-lg border border-dashed border-gray-700 bg-gray-900/30 p-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-400">Timeline</h3>
                <span className="rounded bg-amber-600/20 px-2 py-0.5 text-xs text-amber-400">
                    Coming Soon
                </span>
            </div>

            {/* Simple segment indicators */}
            {animation && segmentCount > 0 ? (
                <div className="space-y-2">
                    {/* Segment bars */}
                    <div className="flex gap-1">
                        {Array.from({ length: segmentCount }).map((_, i) => {
                            const isActive = currentSegment === i;
                            const isCompleted = currentSegment !== null && i < currentSegment;

                            return (
                                <div
                                    key={i}
                                    className={`h-6 flex-1 rounded transition-colors ${
                                        isActive
                                            ? 'bg-cyan-500'
                                            : isCompleted
                                              ? 'bg-cyan-700'
                                              : 'bg-gray-700'
                                    }`}
                                    title={`Segment ${i + 1}`}
                                />
                            );
                        })}
                    </div>

                    {/* Labels */}
                    <div className="flex justify-between text-xs text-gray-500">
                        <span>Start</span>
                        <span>{segmentCount} segment(s)</span>
                        <span>End</span>
                    </div>

                    {/* Progress text */}
                    {totalSegments !== null && currentSegment !== null && (
                        <p className="text-center text-sm text-cyan-400">
                            Segment {currentSegment + 1} of {totalSegments}
                        </p>
                    )}
                </div>
            ) : (
                <div className="flex h-20 items-center justify-center">
                    <p className="text-sm text-gray-500">
                        {animation
                            ? 'Add waypoints to paths to see timeline'
                            : 'Select an animation'}
                    </p>
                </div>
            )}

            {/* Future features hint */}
            <div className="mt-2 rounded-md bg-gray-800/50 p-2">
                <p className="text-xs text-gray-500">
                    Future features: Scrubbing, per-segment timing, easing curves, looping controls
                </p>
            </div>
        </div>
    );
};

export default AnimationTimeline;
