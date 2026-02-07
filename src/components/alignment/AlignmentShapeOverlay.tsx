import React, { useEffect } from 'react';

import type { ShapeAnalysisResult } from '@/services/opencvWorkerClient';

interface AlignmentShapeOverlayProps {
    canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
    shapeResult: ShapeAnalysisResult | null;
    visible: boolean;
    renderCanvas?: boolean;
}

const getOverlayColor = (eccentricity: number): string => {
    if (eccentricity > 1.5) {
        return 'rgba(248, 113, 113, 0.95)';
    }
    if (eccentricity > 1.1) {
        return 'rgba(250, 204, 21, 0.95)';
    }
    return 'rgba(74, 222, 128, 0.95)';
};

const drawCrosshair = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 8, y);
    ctx.lineTo(x + 8, y);
    ctx.moveTo(x, y - 8);
    ctx.lineTo(x, y + 8);
    ctx.stroke();
};

const AlignmentShapeOverlay: React.FC<AlignmentShapeOverlayProps> = ({
    canvasRef,
    shapeResult,
    visible,
    renderCanvas = true,
}) => {
    const contourColor = shapeResult?.contour
        ? getOverlayColor(shapeResult.contour.eccentricity)
        : 'rgba(148, 163, 184, 0.85)';

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }
        const context = canvas.getContext('2d');
        if (!context) {
            return;
        }

        const width = shapeResult?.frameSize.width ?? canvas.width;
        const height = shapeResult?.frameSize.height ?? canvas.height;
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        context.clearRect(0, 0, canvas.width, canvas.height);
        if (!visible || !shapeResult?.detected || !shapeResult.contour) {
            return;
        }

        const contour = shapeResult.contour;
        context.strokeStyle = contourColor;
        context.fillStyle = contourColor;
        context.lineWidth = 2;

        const points = shapeResult.contourPoints ?? [];
        if (points.length > 1) {
            context.beginPath();
            context.moveTo(points[0].x, points[0].y);
            for (let index = 1; index < points.length; index += 1) {
                context.lineTo(points[index].x, points[index].y);
            }
            context.closePath();
            context.stroke();
        }

        drawCrosshair(context, contour.centroid.x, contour.centroid.y, contourColor);

        const axisLength = Math.min(canvas.width, canvas.height) * 0.18;
        const dx = Math.cos(contour.principalAngle) * axisLength;
        const dy = Math.sin(contour.principalAngle) * axisLength;
        context.beginPath();
        context.moveTo(contour.centroid.x - dx, contour.centroid.y - dy);
        context.lineTo(contour.centroid.x + dx, contour.centroid.y + dy);
        context.stroke();

        context.fillStyle = 'rgba(15, 23, 42, 0.75)';
        context.fillRect(10, 10, 220, 58);
        context.fillStyle = contourColor;
        context.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
        context.fillText(`Area: ${contour.area.toFixed(0)} px²`, 16, 28);
        context.fillText(`Eccentricity: ${contour.eccentricity.toFixed(2)}`, 16, 44);
        context.fillText(
            `Angle: ${((contour.principalAngle * 180) / Math.PI).toFixed(1)}°`,
            16,
            60,
        );
    }, [canvasRef, contourColor, shapeResult, visible]);

    if (!renderCanvas) {
        return null;
    }

    return (
        <canvas
            ref={(node) => {
                canvasRef.current = node;
            }}
            className="pointer-events-none absolute inset-0 size-full object-contain"
        />
    );
};

export default AlignmentShapeOverlay;
