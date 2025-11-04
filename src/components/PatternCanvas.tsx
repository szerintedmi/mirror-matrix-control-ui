import React from 'react';

import { TILE_PLACEMENT_UNIT } from '../constants/pattern';

import type { HoverState, TileDraft, EditorTool } from '../types/patternEditor';
import type { CanvasCoverageResult } from '../utils/patternIntensity';

interface PatternCanvasProps {
    canvasSize: { rows: number; cols: number };
    canvasWidth: number;
    canvasHeight: number;
    tiles: TileDraft[];
    coverage: CanvasCoverageResult;
    heatmapTexture: string | null;
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
        coverage,
        heatmapTexture,
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
                <rect x={0} y={0} width={canvasWidth} height={canvasHeight} fill="rgba(17, 24, 39, 0.85)" />
                {heatmapTexture && (
                    <image
                        x={0}
                        y={0}
                        width={canvasWidth}
                        height={canvasHeight}
                        preserveAspectRatio="none"
                        xlinkHref={heatmapTexture}
                        style={{ imageRendering: 'pixelated' }}
                    />
                )}
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
                {isSnapMode &&
                    coverage.cells.map((cell) => {
                        if (cell.count <= 1) {
                            return null;
                        }
                        const x = cell.col * TILE_PLACEMENT_UNIT;
                        const y = cell.row * TILE_PLACEMENT_UNIT;
                        return (
                            <text
                                key={`count-${cell.row}-${cell.col}`}
                                x={x + TILE_PLACEMENT_UNIT / 2}
                                y={y + TILE_PLACEMENT_UNIT / 2 + TILE_PLACEMENT_UNIT * 0.1}
                                textAnchor="middle"
                                fontSize={Math.max(TILE_PLACEMENT_UNIT * 0.32, 4)}
                                fill="rgba(15, 23, 42, 0.55)"
                                pointerEvents="none"
                                fontWeight={500}
                            >
                                {cell.count}
                            </text>
                        );
                    })}
                {activeTool === 'place' && hoverState && (
                    <rect
                        x={hoverState.centerX - TILE_PLACEMENT_UNIT / 2}
                        y={hoverState.centerY - TILE_PLACEMENT_UNIT / 2}
                        width={TILE_PLACEMENT_UNIT}
                        height={TILE_PLACEMENT_UNIT}
                        fill="rgba(34, 211, 238, 0.12)"
                        stroke="rgba(34, 211, 238, 0.55)"
                        strokeWidth={Math.max(TILE_PLACEMENT_UNIT * 0.14, 0.6)}
                        strokeDasharray={`${TILE_PLACEMENT_UNIT * 0.3} ${TILE_PLACEMENT_UNIT * 0.2}`}
                        pointerEvents="none"
                        rx={TILE_PLACEMENT_UNIT * 0.18}
                        ry={TILE_PLACEMENT_UNIT * 0.18}
                    />
                )}
                {removeHighlight && (
                    <rect
                        x={removeHighlight.centerX - TILE_PLACEMENT_UNIT / 2}
                        y={removeHighlight.centerY - TILE_PLACEMENT_UNIT / 2}
                        width={TILE_PLACEMENT_UNIT}
                        height={TILE_PLACEMENT_UNIT}
                        fill="rgba(248, 113, 113, 0.08)"
                        stroke="rgba(248, 113, 113, 0.65)"
                        strokeWidth={Math.max(TILE_PLACEMENT_UNIT * 0.14, 0.6)}
                        pointerEvents="none"
                        rx={TILE_PLACEMENT_UNIT * 0.18}
                        ry={TILE_PLACEMENT_UNIT * 0.18}
                    />
                )}
                {tiles.length === 0 && (
                    <text
                        x={canvasWidth / 2}
                        y={canvasHeight / 2}
                        textAnchor="middle"
                        fill="rgba(148, 163, 184, 0.55)"
                        fontSize={Math.max(TILE_PLACEMENT_UNIT * 1.4, 12)}
                        pointerEvents="none"
                        fontWeight={500}
                    >
                        Click or drag to place tiles
                    </text>
                )}
            </svg>
        </div>
    );
};

export default PatternCanvas;
