import { useEffect, useState } from 'react';

export const useDebouncedValue = <T>(value: T, delayMs: number): T => {
    const [debounced, setDebounced] = useState<T>(value);

    useEffect(() => {
        const handle = globalThis.setTimeout(() => {
            setDebounced(value);
        }, delayMs);

        return () => {
            globalThis.clearTimeout(handle);
        };
    }, [value, delayMs]);

    return debounced;
};
