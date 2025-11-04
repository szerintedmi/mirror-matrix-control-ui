import { useMemo } from 'react';

import type { CanvasRasterField } from '../utils/patternIntensity';

const HEATMAP_RGB = { r: 248, g: 250, b: 252 };

export const useHeatmapImage = (raster: CanvasRasterField | null): string | null =>
    useMemo(() => {
        if (typeof window === 'undefined') {
            return null;
        }
        if (!raster || raster.litPixels === 0) {
            return null;
        }
        const canvas = document.createElement('canvas');
        canvas.width = raster.width;
        canvas.height = raster.height;
        const context = canvas.getContext('2d');
        if (!context) {
            return null;
        }
        const imageData = context.createImageData(raster.width, raster.height);
        const { data } = imageData;
        const { intensities } = raster;
        for (let index = 0; index < intensities.length; index += 1) {
            const alpha = intensities[index];
            const offset = index * 4;
            if (alpha <= 0) {
                data[offset + 3] = 0;
                continue;
            }
            data[offset] = HEATMAP_RGB.r;
            data[offset + 1] = HEATMAP_RGB.g;
            data[offset + 2] = HEATMAP_RGB.b;
            data[offset + 3] = Math.round(alpha * 255);
        }
        context.putImageData(imageData, 0, 0);
        return canvas.toDataURL('image/png');
    }, [raster]);
