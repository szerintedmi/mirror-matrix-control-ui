export interface DesignerCoordinate {
    x: number;
    y: number;
}

export type PatternEditMode = 'placement' | 'erase';

export type HoverValidationStatus =
    | { valid: true }
    | { valid: false; reason: 'outside_bounds' | 'over_capacity' }
    | { valid: false; reason: 'area_occupied'; occupiedTileIds: string[] };
