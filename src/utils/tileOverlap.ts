export interface TileOverlapRecord {
    id: string;
    count: number;
}

interface CircleLikeTile {
    id: string;
    centerX: number;
    centerY: number;
    radius: number;
    radiusSq: number;
}

interface Point2D {
    x: number;
    y: number;
}

const EPSILON = 1e-6;

const toCircleTile = (tile: {
    id: string;
    centerX: number;
    centerY: number;
    width: number;
    height: number;
}): CircleLikeTile => {
    const radius = Math.max(0, Math.min(tile.width, tile.height) / 2);
    return {
        id: tile.id,
        centerX: tile.centerX,
        centerY: tile.centerY,
        radius,
        radiusSq: radius * radius,
    };
};

const pointInsideTile = (tile: CircleLikeTile, point: Point2D): boolean => {
    const dx = point.x - tile.centerX;
    const dy = point.y - tile.centerY;
    return dx * dx + dy * dy <= tile.radiusSq + EPSILON;
};

const computeCircleIntersections = (
    a: CircleLikeTile,
    b: CircleLikeTile,
    distance: number,
    dx: number,
    dy: number,
): Point2D[] => {
    const r0 = a.radius;
    const r1 = b.radius;
    const aLength = (r0 * r0 - r1 * r1 + distance * distance) / (2 * distance);
    const hSq = r0 * r0 - aLength * aLength;
    if (hSq <= EPSILON) {
        return [];
    }
    const h = Math.sqrt(hSq);
    const xm = a.centerX + (aLength * dx) / distance;
    const ym = a.centerY + (aLength * dy) / distance;
    const rx = (-dy * h) / distance;
    const ry = (dx * h) / distance;

    return [
        { x: xm + rx, y: ym + ry },
        { x: xm - rx, y: ym - ry },
    ];
};

const countTilesCoveringPoint = (tiles: CircleLikeTile[], point: Point2D): number => {
    let count = 0;
    tiles.forEach((tile) => {
        if (pointInsideTile(tile, point)) {
            count += 1;
        }
    });
    return count;
};

export const computeDirectOverlaps = (
    tiles: { id: string; centerX: number; centerY: number; width: number; height: number }[],
): TileOverlapRecord[] => {
    if (tiles.length === 0) {
        return [];
    }

    const circleTiles = tiles.map(toCircleTile);
    const candidatePointsByTile = new Map<string, Point2D[]>();

    circleTiles.forEach((tile) => {
        candidatePointsByTile.set(tile.id, [{ x: tile.centerX, y: tile.centerY }]);
    });

    for (let i = 0; i < circleTiles.length; i += 1) {
        for (let j = i + 1; j < circleTiles.length; j += 1) {
            const tileA = circleTiles[i];
            const tileB = circleTiles[j];
            const dx = tileB.centerX - tileA.centerX;
            const dy = tileB.centerY - tileA.centerY;
            const distance = Math.hypot(dx, dy);
            const r0 = tileA.radius;
            const r1 = tileB.radius;

            const maxRadius = Math.max(r0, r1);
            const minRadius = Math.min(r0, r1);

            if (distance + minRadius <= maxRadius + EPSILON) {
                const inner = r0 <= r1 ? tileA : tileB;
                const outer = inner === tileA ? tileB : tileA;
                candidatePointsByTile.get(outer.id)?.push({
                    x: inner.centerX,
                    y: inner.centerY,
                });
                continue;
            }

            if (distance >= r0 + r1 - EPSILON) {
                continue;
            }

            const intersections = computeCircleIntersections(tileA, tileB, distance, dx, dy);
            intersections.forEach((point) => {
                if (pointInsideTile(tileA, point)) {
                    candidatePointsByTile.get(tileA.id)?.push(point);
                }
                if (pointInsideTile(tileB, point)) {
                    candidatePointsByTile.get(tileB.id)?.push(point);
                }
            });
        }
    }

    return circleTiles.map((tile) => {
        const candidates = candidatePointsByTile.get(tile.id) ?? [
            { x: tile.centerX, y: tile.centerY },
        ];
        let maxCount = 1;
        candidates.forEach((point) => {
            const coverage = countTilesCoveringPoint(circleTiles, point);
            if (coverage > maxCount) {
                maxCount = coverage;
            }
        });
        return { id: tile.id, count: maxCount };
    });
};
