export type EditorTool = 'place' | 'remove';

export interface TileDraft {
    id: string;
    centerX: number;
    centerY: number;
    createdAt: number;
}

export interface HoverState {
    centerX: number;
    centerY: number;
    row: number;
    col: number;
}
