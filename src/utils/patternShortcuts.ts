export interface ShortcutCallbacks {
    place(): void;
    remove(): void;
    toggleSnap(): void;
    undo(): void;
    redo(): void;
}

const EDITABLE_TAGS = new Set(['input', 'textarea', 'select']);

export const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) {
        return false;
    }
    if (target.isContentEditable || target.getAttribute('contenteditable') === 'true') {
        return true;
    }
    return EDITABLE_TAGS.has(target.tagName.toLowerCase());
};

export const handlePatternShortcut = (
    event: KeyboardEvent,
    callbacks: ShortcutCallbacks,
): boolean => {
    if (isEditableTarget(event.target) || event.defaultPrevented) {
        return false;
    }

    const key = event.key.toLowerCase();
    const hasMeta = event.metaKey || event.ctrlKey;

    if (hasMeta && !event.altKey) {
        if (key === 'z') {
            if (event.shiftKey) {
                callbacks.redo();
            } else {
                callbacks.undo();
            }
            return true;
        }
        if (!event.shiftKey && key === 'y') {
            callbacks.redo();
            return true;
        }
    }

    if (hasMeta || event.altKey) {
        return false;
    }

    if (key === 'p') {
        callbacks.place();
        return true;
    }
    if (key === 'r') {
        callbacks.remove();
        return true;
    }
    if (key === 's') {
        callbacks.toggleSnap();
        return true;
    }
    return false;
};
