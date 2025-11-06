import React, { useMemo } from 'react';

import type { ProjectionFootprint, ProjectionSettings } from '../types';

interface ProjectionPreviewProps {
    settings: ProjectionSettings;
    footprint: ProjectionFootprint;
}

const viewBox = { width: 520, height: 240 };

const ProjectionPreview: React.FC<ProjectionPreviewProps> = ({ settings, footprint }) => {
    const metrics = useMemo(() => {
        const maxHorizontal = Math.max(
            footprint.projectedWidth ? footprint.projectedWidth / 2 : 0,
            ...footprint.spots.map((spot) => Math.abs(spot.wallX ?? 0)),
            footprint.arrayWidth / 2,
            0.5,
        );
        const maxVertical = Math.max(
            footprint.projectedHeight ? footprint.projectedHeight / 2 : 0,
            ...footprint.spots.map((spot) => Math.abs(spot.wallY ?? 0)),
            footprint.arrayHeight / 2,
            0.5,
        );

        const depthScale = (viewBox.width * 0.5) / Math.max(settings.wallDistance, 1);
        const horizontalScale = (viewBox.height * 0.35) / maxHorizontal;
        const verticalScale = (viewBox.height * 0.35) / maxVertical;

        const mirrorPlaneX = viewBox.width * 0.25;
        const wallPlaneX = mirrorPlaneX + settings.wallDistance * depthScale;

        return {
            depthScale,
            horizontalScale,
            verticalScale,
            mirrorPlaneX,
            wallPlaneX,
            centerY: viewBox.height / 2,
        };
    }, [footprint, settings.wallDistance]);

    const renderTopView = () => {
        const { horizontalScale, mirrorPlaneX, wallPlaneX, centerY } = metrics;
        const mirrorTop = centerY - (footprint.arrayWidth / 2) * horizontalScale;
        const mirrorBottom = centerY + (footprint.arrayWidth / 2) * horizontalScale;
        const mirrorThickness = 14;

        return (
            <div className="relative w-full h-full bg-gray-900/50 rounded-md border border-gray-700 overflow-hidden">
                <span className="absolute top-2 left-3 text-xs text-gray-500">Top View</span>
                <svg viewBox={`0 0 ${viewBox.width} ${viewBox.height}`} className="w-full h-full">
                    <rect
                        x={mirrorPlaneX - mirrorThickness / 2}
                        y={mirrorTop}
                        width={mirrorThickness}
                        height={mirrorBottom - mirrorTop}
                        rx={6}
                        fill="#0f172a"
                        stroke="#22d3ee"
                        strokeWidth={2}
                    />
                    <line
                        x1={wallPlaneX}
                        y1={0}
                        x2={wallPlaneX}
                        y2={viewBox.height}
                        stroke="#e5e7eb"
                        strokeWidth={3}
                        strokeLinecap="round"
                    />
                    {footprint.spots.map((spot) => {
                        if (spot.wallX === null) {
                            return null;
                        }
                        const y = centerY - spot.wallX * horizontalScale;
                        return (
                            <line
                                key={`ray-top-${spot.id}`}
                                x1={mirrorPlaneX}
                                y1={centerY}
                                x2={wallPlaneX}
                                y2={y}
                                stroke="#fbbf24"
                                strokeWidth={1.5}
                                strokeOpacity={0.4}
                            />
                        );
                    })}
                    {footprint.spots.map((spot) => {
                        if (spot.wallX === null) {
                            return null;
                        }
                        const y = centerY - spot.wallX * horizontalScale;
                        return (
                            <circle
                                key={`spot-top-${spot.id}`}
                                cx={wallPlaneX}
                                cy={y}
                                r={4}
                                fill="#fbbf24"
                                fillOpacity={0.85}
                            />
                        );
                    })}
                </svg>
            </div>
        );
    };

    const renderSideView = () => {
        const { verticalScale, mirrorPlaneX, wallPlaneX, centerY } = metrics;
        const mirrorTop = centerY - (footprint.arrayHeight / 2) * verticalScale;
        const mirrorBottom = centerY + (footprint.arrayHeight / 2) * verticalScale;
        const mirrorThickness = 14;

        return (
            <div className="relative w-full h-full bg-gray-900/50 rounded-md border border-gray-700 overflow-hidden">
                <span className="absolute top-2 left-3 text-xs text-gray-500">Side View</span>
                <svg viewBox={`0 0 ${viewBox.width} ${viewBox.height}`} className="w-full h-full">
                    <line
                        x1={0}
                        y1={centerY + footprint.arrayHeight * verticalScale + 20}
                        x2={viewBox.width}
                        y2={centerY + footprint.arrayHeight * verticalScale + 20}
                        stroke="#4a5568"
                        strokeWidth={1}
                    />
                    <rect
                        x={mirrorPlaneX - mirrorThickness / 2}
                        y={mirrorTop}
                        width={mirrorThickness}
                        height={mirrorBottom - mirrorTop}
                        rx={6}
                        fill="#0f172a"
                        stroke="#22d3ee"
                        strokeWidth={2}
                    />
                    <line
                        x1={wallPlaneX}
                        y1={0}
                        x2={wallPlaneX}
                        y2={viewBox.height}
                        stroke="#e5e7eb"
                        strokeWidth={3}
                        strokeLinecap="round"
                    />
                    {footprint.spots.map((spot) => {
                        if (spot.wallY === null) {
                            return null;
                        }
                        const y = centerY - spot.wallY * verticalScale;
                        return (
                            <line
                                key={`ray-side-${spot.id}`}
                                x1={mirrorPlaneX}
                                y1={centerY}
                                x2={wallPlaneX}
                                y2={y}
                                stroke="#fbbf24"
                                strokeWidth={1.5}
                                strokeOpacity={0.4}
                            />
                        );
                    })}
                    {footprint.spots.map((spot) => {
                        if (spot.wallY === null) {
                            return null;
                        }
                        const y = centerY - spot.wallY * verticalScale;
                        return (
                            <circle
                                key={`spot-side-${spot.id}`}
                                cx={wallPlaneX}
                                cy={y}
                                r={4}
                                fill="#fbbf24"
                                fillOpacity={0.85}
                            />
                        );
                    })}
                </svg>
            </div>
        );
    };

    return (
        <div className="flex flex-col gap-4 w-full h-full">
            {renderTopView()}
            {renderSideView()}
        </div>
    );
};

export default ProjectionPreview;
