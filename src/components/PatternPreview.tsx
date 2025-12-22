import React from 'react';

import type { Pattern } from '@/types';
import { centeredDeltaToView, centeredToView } from '@/utils/coordinates';

interface PatternPreviewProps {
    pattern: Pattern;
    className?: string;
    blobRadius?: number;
}

const DEFAULT_PREVIEW_BLOB_RADIUS = 0.08; // Slightly larger for visibility in small thumbnails

const PatternPreview: React.FC<PatternPreviewProps> = ({
    pattern,
    className = 'w-10 h-10',
    blobRadius = DEFAULT_PREVIEW_BLOB_RADIUS,
}) => {
    // Simplified overlap logic for preview - just use a fixed opacity
    const baseFillOpacity = 0.8;

    return (
        <div className={`relative aspect-square bg-gray-900 select-none ${className}`}>
            <svg viewBox="0 0 1 1" preserveAspectRatio="xMidYMid meet" className="size-full">
                <rect x={0} y={0} width={1} height={1} fill="rgb(15,23,42)" />
                {/* Grid lines */}
                <line
                    x1={0}
                    y1={centeredToView(0)}
                    x2={1}
                    y2={centeredToView(0)}
                    stroke="rgba(148, 163, 184, 0.25)"
                    strokeWidth={0.02}
                />
                <line
                    x1={centeredToView(0)}
                    y1={0}
                    x2={centeredToView(0)}
                    y2={1}
                    stroke="rgba(148, 163, 184, 0.25)"
                    strokeWidth={0.02}
                />

                {pattern.points.map((point) => {
                    const viewX = centeredToView(point.x);
                    const viewY = centeredToView(point.y);
                    const halfSize = centeredDeltaToView(blobRadius);
                    const size = halfSize * 2;
                    return (
                        <rect
                            key={`preview-${point.id}`}
                            x={viewX - halfSize}
                            y={viewY - halfSize}
                            width={size}
                            height={size}
                            fill="#f8fafc"
                            fillOpacity={baseFillOpacity}
                        />
                    );
                })}
            </svg>
        </div>
    );
};

export default PatternPreview;
