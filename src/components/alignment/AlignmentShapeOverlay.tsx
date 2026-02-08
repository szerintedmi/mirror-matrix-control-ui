import React, { useEffect, useRef } from 'react';

import type { ShapeAnalysisResult } from '@/services/opencvWorkerClient';

interface AlignmentShapeOverlayProps {
    shapeResult: ShapeAnalysisResult | null;
}

const ECC_GREEN = 1.1;
const ECC_YELLOW = 1.5;

const eccentricityColor = (ecc: number): string => {
    if (ecc < ECC_GREEN) return '#34d399'; // emerald-400
    if (ecc < ECC_YELLOW) return '#fbbf24'; // amber-400
    return '#f87171'; // red-400
};

const AlignmentShapeOverlay: React.FC<AlignmentShapeOverlayProps> = ({ shapeResult }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Size canvas to match frame dimensions; CSS handles display scaling
        const width = shapeResult?.frameSize.width ?? canvas.width;
        const height = shapeResult?.frameSize.height ?? canvas.height;
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, width, height);

        if (!shapeResult?.detected || !shapeResult.contour) return;

        const { contour, contourPoints } = shapeResult;
        const color = eccentricityColor(contour.eccentricity);

        // Draw contour outline (coordinates already in frame-px space)
        if (contourPoints && contourPoints.length > 1) {
            ctx.beginPath();
            ctx.moveTo(contourPoints[0].x, contourPoints[0].y);
            for (let i = 1; i < contourPoints.length; i++) {
                ctx.lineTo(contourPoints[i].x, contourPoints[i].y);
            }
            ctx.closePath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        const cx = contour.centroid.x;
        const cy = contour.centroid.y;

        // Draw centroid crosshair
        const crossSize = 12;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - crossSize, cy);
        ctx.lineTo(cx + crossSize, cy);
        ctx.moveTo(cx, cy - crossSize);
        ctx.lineTo(cx, cy + crossSize);
        ctx.stroke();

        // Draw centroid dot
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fill();

        // Draw principal axis direction line
        if (contour.eccentricity > 1.02) {
            const angleRad = (contour.principalAngle * Math.PI) / 180;
            const lineLen = Math.min(width, height) * 0.1 * Math.min(contour.eccentricity, 3);
            const dx = Math.cos(angleRad) * lineLen;
            const dy = Math.sin(angleRad) * lineLen;

            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(cx - dx, cy - dy);
            ctx.lineTo(cx + dx, cy + dy);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Draw metrics text
        ctx.font = '11px monospace';
        ctx.fillStyle = color;
        const textX = cx + 18;
        let textY = cy - 20;
        ctx.fillText(`Area: ${contour.area.toFixed(0)}`, textX, textY);
        textY += 14;
        ctx.fillText(`Ecc: ${contour.eccentricity.toFixed(3)}`, textX, textY);
        textY += 14;
        ctx.fillText(`Angle: ${contour.principalAngle.toFixed(1)}°`, textX, textY);
    }, [shapeResult]);

    return (
        <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 size-full"
            style={{ zIndex: 10 }}
        />
    );
};

export default AlignmentShapeOverlay;
