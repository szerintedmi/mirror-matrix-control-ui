export interface PatternPoint {
    x: number;
    y: number;
}

export const calculateMaxOverlapCount = (points: PatternPoint[], blobRadius: number): number => {
    if (points.length === 0) {
        return 0;
    }

    let maxOverlaps = 0;
    // Use a small epsilon for float comparisons if needed, but for simple overlap check:
    // Two squares overlap if |x1 - x2| < width && |y1 - y2| < height
    // Here width = height = 2 * blobRadius
    const threshold = blobRadius * 2;

    for (let i = 0; i < points.length; i++) {
        let overlaps = 0;
        for (let j = 0; j < points.length; j++) {
            const dx = Math.abs(points[i].x - points[j].x);
            const dy = Math.abs(points[i].y - points[j].y);

            // Check for intersection (strict inequality for overlap area > 0)
            // If they just touch, it's usually not considered an overlap for intensity accumulation
            // unless we want to count touching edges. Let's assume strict overlap.
            if (dx < threshold && dy < threshold) {
                overlaps++;
            }
        }
        if (overlaps > maxOverlaps) {
            maxOverlaps = overlaps;
        }
    }
    return maxOverlaps;
};
