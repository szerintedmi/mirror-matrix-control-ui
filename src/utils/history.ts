export interface HistoryStacks<T> {
    past: T[];
    future: T[];
}

export const createHistoryStacks = <T>(): HistoryStacks<T> => ({ past: [], future: [] });

export const pushHistorySnapshot = <T>(
    history: HistoryStacks<T>,
    snapshot: T,
    limit: number,
): HistoryStacks<T> => {
    const nextPast =
        limit > 0 && history.past.length >= limit
            ? [...history.past.slice(history.past.length - limit + 1), snapshot]
            : [...history.past, snapshot];
    return {
        past: nextPast,
        future: [],
    };
};

export const undoHistorySnapshot = <T>(
    history: HistoryStacks<T>,
    current: T,
): { history: HistoryStacks<T>; value: T } => {
    if (history.past.length === 0) {
        return { history, value: current };
    }
    const previous = history.past[history.past.length - 1];
    return {
        history: {
            past: history.past.slice(0, -1),
            future: [current, ...history.future],
        },
        value: previous,
    };
};

export const redoHistorySnapshot = <T>(
    history: HistoryStacks<T>,
    current: T,
): { history: HistoryStacks<T>; value: T } => {
    if (history.future.length === 0) {
        return { history, value: current };
    }
    const [next, ...restFuture] = history.future;
    return {
        history: {
            past: [...history.past, current],
            future: restFuture,
        },
        value: next,
    };
};
