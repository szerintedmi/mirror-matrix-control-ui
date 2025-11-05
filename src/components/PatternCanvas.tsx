import React, { useId } from 'react';

import { TILE_PLACEMENT_UNIT } from '../constants/pattern';

import type { HoverState, TileDraft, EditorTool } from '../types/patternEditor';

interface PatternCanvasProps {
    canvasSize: { rows: number; cols: number };
    canvasWidth: number;
    canvasHeight: number;
    tiles: TileDraft[];
    overlapCounts: Map<string, number>;
    maxOverlapCount: number;
    hoverState: HoverState | null;
    removeHighlight: { centerX: number; centerY: number } | null;
    activeTool: EditorTool;
    isSnapMode: boolean;
    drawingSurfaceRef: React.MutableRefObject<SVGSVGElement | null>;
    onPointerDown: (event: React.PointerEvent<SVGSVGElement>) => void;
    onPointerMove: (event: React.PointerEvent<SVGSVGElement>) => void;
    onPointerUp: (event: React.PointerEvent<SVGSVGElement>) => void;
    onPointerLeave: () => void;
    onPointerCancel: () => void;
}

const PatternCanvas: React.FC<PatternCanvasProps> = (props) => {
    const {
        canvasSize,
        canvasWidth,
        canvasHeight,
        tiles,
        overlapCounts,
        maxOverlapCount,
        hoverState,
        removeHighlight,
        activeTool,
        isSnapMode,
        drawingSurfaceRef,
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerLeave,
        onPointerCancel,
    } = props;

    const overlapFilterId = useId();
    const baseFillOpacity = maxOverlapCount > 0 ? 1 / maxOverlapCount : 1;
    const maxCompositeAlpha =
        maxOverlapCount > 0 ? 1 - Math.pow(1 - baseFillOpacity, maxOverlapCount) : 1;
    const alphaSlope = maxCompositeAlpha > 0 ? 1 / maxCompositeAlpha : 1;
    const normalizedAlphaSlope = Number.isFinite(alphaSlope) ? alphaSlope : 1;
    const cursorStrokeWidth = 0.5;

    return (
        <div className="relative max-h-full w-full">
            <svg
                ref={drawingSurfaceRef}
                data-testid="pattern-editor-canvas"
                width="100%"
                height="100%"
                viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
                className="w-full h-full touch-none cursor-crosshair"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerLeave}
                onPointerCancel={onPointerCancel}
                onContextMenu={(event) => event.preventDefault()}
            >
                <defs>
                    <filter
                        id={overlapFilterId}
                        x="0"
                        y="0"
                        width="100%"
                        height="100%"
                        filterUnits="objectBoundingBox"
                        colorInterpolationFilters="sRGB"
                    >
                        <feComponentTransfer>
                            <feFuncR type="identity" />
                            <feFuncG type="identity" />
                            <feFuncB type="identity" />
                            <feFuncA type="linear" slope={normalizedAlphaSlope} intercept={0} />
                        </feComponentTransfer>
                    </filter>
                </defs>
                <rect
                    x={0}
                    y={0}
                    width={canvasWidth}
                    height={canvasHeight}
                    fill="rgba(17, 24, 39, 0.85)"
                />
                <g filter={`url(#${overlapFilterId})`}>
                    {tiles.map((tile) => (
                        <circle
                            key={`fill-${tile.id}`}
                            cx={tile.centerX}
                            cy={tile.centerY}
                            r={TILE_PLACEMENT_UNIT / 2}
                            fill="#f8fafc"
                            fillOpacity={baseFillOpacity}
                        />
                    ))}
                </g>
                {Array.from({ length: canvasSize.cols + 1 }).map((_, index) => {
                    const position = index * TILE_PLACEMENT_UNIT;
                    return (
                        <line
                            key={`v-${index}`}
                            x1={position}
                            y1={0}
                            x2={position}
                            y2={canvasHeight}
                            stroke="rgba(148, 163, 184, 0.12)"
                            strokeWidth={0.4}
                            pointerEvents="none"
                        />
                    );
                })}
                {Array.from({ length: canvasSize.rows + 1 }).map((_, index) => {
                    const position = index * TILE_PLACEMENT_UNIT;
                    return (
                        <line
                            key={`h-${index}`}
                            x1={0}
                            y1={position}
                            x2={canvasWidth}
                            y2={position}
                            stroke="rgba(148, 163, 184, 0.12)"
                            strokeWidth={0.4}
                            pointerEvents="none"
                        />
                    );
                })}
                {tiles.map((tile) => (
                    <circle
                        key={`outline-${tile.id}`}
                        cx={tile.centerX}
                        cy={tile.centerY}
                        r={TILE_PLACEMENT_UNIT / 2}
                        fill="none"
                        stroke="rgba(148, 163, 184, 0.35)"
                        strokeWidth={Math.max(TILE_PLACEMENT_UNIT * 0.02, 0.4)}
                    />
                ))}
                {isSnapMode &&
                    tiles.map((tile) => {
                        const count = overlapCounts.get(tile.id) ?? 1;
                        if (count <= 1) {
                            return null;
                        }
                        return (
                            <text
                                key={`count-${tile.id}`}
                                x={tile.centerX}
                                y={tile.centerY + TILE_PLACEMENT_UNIT * 0.1}
                                textAnchor="middle"
                                fontSize={Math.max(TILE_PLACEMENT_UNIT * 0.32, 4)}
                                fill="rgba(15, 23, 42, 0.55)"
                                fontWeight={500}
                            >
                                {count}
                            </text>
                        );
                    })}
                {activeTool === 'place' && hoverState && (
                    <circle
                        cx={hoverState.centerX}
                        cy={hoverState.centerY}
                        r={TILE_PLACEMENT_UNIT / 2}
                        fill="rgba(34, 211, 238, 0.12)"
                        stroke="rgba(34, 211, 238, 0.55)"
                        strokeWidth={cursorStrokeWidth}
                        strokeDasharray={`${TILE_PLACEMENT_UNIT * 0.3} ${TILE_PLACEMENT_UNIT * 0.2}`}
                        pointerEvents="none"
                    />
                )}
                {removeHighlight && (
                    <circle
                        cx={removeHighlight.centerX}
                        cy={removeHighlight.centerY}
                        r={TILE_PLACEMENT_UNIT / 2}
                        fill="rgba(248, 113, 113, 0.08)"
                        stroke="rgba(248, 113, 113, 0.65)"
                        strokeWidth={cursorStrokeWidth}
                        pointerEvents="none"
                    />
                )}
            </svg>
        </div>
    );
};

export default PatternCanvas;
