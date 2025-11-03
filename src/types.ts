export interface Motor {
    nodeMac: string;
    motorIndex: number;
}

export interface MotorTelemetry {
    id: number;
    position: number;
    moving: boolean;
    awake: boolean;
    homed: boolean;
    stepsSinceHome: number;
}

export interface Node {
    macAddress: string;
    status: 'ready' | 'offline';
    motors: Motor[];
}

export interface GridPosition {
    row: number;
    col: number;
}

export interface MirrorAssignment {
    x: Motor | null;
    y: Motor | null;
}

// Map key is a string: `${row}-${col}`
export type MirrorConfig = Map<string, MirrorAssignment>;

export type Axis = 'x' | 'y';

export type DragSource = 'list' | 'grid';

export interface DraggedMotorInfo {
    source: DragSource;
    motor: Motor;
    // Optional: only if source is 'grid'
    position?: GridPosition;
    axis?: Axis;
}

export interface PatternCanvas {
    width: number;
    height: number;
}

export interface PatternTile {
    id: string;
    center: {
        x: number;
        y: number;
    };
    size: {
        width: number;
        height: number;
    };
}

export interface Pattern {
    id: string;
    name: string;
    canvas: PatternCanvas;
    tiles: PatternTile[];
    createdAt: string;
    updatedAt: string;
}

export type DriverPresenceSummary = 'ready' | 'stale' | 'offline';

export interface DriverStatusSnapshot {
    presence: DriverPresenceSummary;
    staleForMs: number;
    brokerDisconnected: boolean;
    motors: Record<number, MotorTelemetry>;
}
