import { describe, expect, it, vi } from 'vitest';

import { handlePatternShortcut, isEditableTarget } from '../patternShortcuts';

const createEvent = (overrides: Partial<KeyboardEvent> = {}): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', {
        key: overrides.key ?? 'p',
        ctrlKey: overrides.ctrlKey,
        metaKey: overrides.metaKey,
        shiftKey: overrides.shiftKey,
        altKey: overrides.altKey,
    });
    Object.defineProperty(event, 'target', {
        value: overrides.target ?? document.createElement('div'),
    });
    return event;
};

describe('patternShortcuts', () => {
    it('identifies editable targets', () => {
        const input = document.createElement('input');
        const span = document.createElement('span');
        span.setAttribute('contenteditable', 'true');
        expect(isEditableTarget(input)).toBe(true);
        expect(isEditableTarget(span)).toBe(true);
        expect(isEditableTarget(document.createElement('div'))).toBe(false);
    });

    it('handles primary shortcuts', () => {
        const callbacks = {
            place: vi.fn(),
            remove: vi.fn(),
            toggleSnap: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
        };
        const eventP = createEvent({ key: 'P' });
        expect(handlePatternShortcut(eventP, callbacks)).toBe(true);
        expect(callbacks.place).toHaveBeenCalled();

        const eventR = createEvent({ key: 'r' });
        callbacks.place.mockClear();
        expect(handlePatternShortcut(eventR, callbacks)).toBe(true);
        expect(callbacks.remove).toHaveBeenCalled();

        const eventS = createEvent({ key: 's' });
        expect(handlePatternShortcut(eventS, callbacks)).toBe(true);
        expect(callbacks.toggleSnap).toHaveBeenCalled();
    });

    it('supports undo/redo combos', () => {
        const callbacks = {
            place: vi.fn(),
            remove: vi.fn(),
            toggleSnap: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
        };

        const undoEvent = createEvent({ key: 'z', metaKey: true });
        expect(handlePatternShortcut(undoEvent, callbacks)).toBe(true);
        expect(callbacks.undo).toHaveBeenCalled();

        const redoShiftZ = createEvent({ key: 'Z', metaKey: true, shiftKey: true });
        expect(handlePatternShortcut(redoShiftZ, callbacks)).toBe(true);
        expect(callbacks.redo).toHaveBeenCalledTimes(1);

        const redoCtrlY = createEvent({ key: 'y', ctrlKey: true });
        expect(handlePatternShortcut(redoCtrlY, callbacks)).toBe(true);
        expect(callbacks.redo).toHaveBeenCalledTimes(2);
    });

    it('ignores editable targets and modifier combos', () => {
        const callbacks = {
            place: vi.fn(),
            remove: vi.fn(),
            toggleSnap: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
        };
        const input = document.createElement('input');
        const event = createEvent({ key: 'p', target: input });
        expect(handlePatternShortcut(event, callbacks)).toBe(false);
        expect(callbacks.place).not.toHaveBeenCalled();

        const metaEvent = createEvent({ key: 'p', metaKey: true });
        expect(handlePatternShortcut(metaEvent, callbacks)).toBe(false);
        expect(callbacks.place).not.toHaveBeenCalled();
    });
});
