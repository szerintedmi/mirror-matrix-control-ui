import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
    loadLastSelectedPatternId,
    loadPatterns,
    persistLastSelectedPatternId,
    persistPatterns,
} from '@/services/patternStorage';
import type { Pattern } from '@/types';

interface PatternContextType {
    patterns: Pattern[];
    selectedPatternId: string | null;
    selectedPattern: Pattern | null;
    selectPattern: (patternId: string | null) => void;
    addPattern: (pattern: Pattern) => void;
    updatePattern: (pattern: Pattern) => void;
    deletePattern: (patternId: string) => void;
    refreshPatterns: () => void;
}

const PatternContext = createContext<PatternContextType | null>(null);

export const usePatternContext = () => {
    const context = useContext(PatternContext);
    if (!context) {
        throw new Error('usePatternContext must be used within a PatternProvider');
    }
    return context;
};

export const PatternProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const resolvedStorage = useMemo(
        () => (typeof window !== 'undefined' ? window.localStorage : undefined),
        [],
    );

    const [patterns, setPatterns] = useState<Pattern[]>(() => loadPatterns(resolvedStorage));
    const [selectedPatternId, setSelectedPatternId] = useState<string | null>(() => {
        const lastId = loadLastSelectedPatternId(resolvedStorage);
        const all = loadPatterns(resolvedStorage);
        return all.some((p) => p.id === lastId) ? (lastId as string) : null;
    });

    const selectedPattern = useMemo(
        () => patterns.find((p) => p.id === selectedPatternId) ?? null,
        [patterns, selectedPatternId],
    );

    const refreshPatterns = useCallback(() => {
        const next = loadPatterns(resolvedStorage);
        setPatterns(next);
    }, [resolvedStorage]);

    const handlePersist = useCallback(
        (nextPatterns: Pattern[]) => {
            setPatterns(nextPatterns);
            persistPatterns(resolvedStorage, nextPatterns);
        },
        [resolvedStorage],
    );

    const selectPattern = useCallback(
        (patternId: string | null) => {
            setSelectedPatternId(patternId);
            persistLastSelectedPatternId(resolvedStorage, patternId);
        },
        [resolvedStorage],
    );

    const addPattern = useCallback(
        (pattern: Pattern) => {
            const next = [...patterns, pattern];
            handlePersist(next);
            selectPattern(pattern.id);
        },
        [patterns, handlePersist, selectPattern],
    );

    const updatePattern = useCallback(
        (updated: Pattern) => {
            const next = patterns.map((p) => (p.id === updated.id ? updated : p));
            handlePersist(next);
        },
        [patterns, handlePersist],
    );

    const deletePattern = useCallback(
        (patternId: string) => {
            const next = patterns.filter((p) => p.id !== patternId);
            handlePersist(next);
            if (selectedPatternId === patternId) {
                selectPattern(next[0]?.id ?? null);
            }
        },
        [patterns, handlePersist, selectedPatternId, selectPattern],
    );

    // Sync with external changes (optional, but good for multi-tab)
    useEffect(() => {
        const handleStorage = (event: StorageEvent) => {
            if (event.key === 'mirror:calibration-patterns') {
                refreshPatterns();
            }
        };
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, [refreshPatterns]);

    const value = useMemo(
        () => ({
            patterns,
            selectedPatternId,
            selectedPattern,
            selectPattern,
            addPattern,
            updatePattern,
            deletePattern,
            refreshPatterns,
        }),
        [
            patterns,
            selectedPatternId,
            selectedPattern,
            selectPattern,
            addPattern,
            updatePattern,
            deletePattern,
            refreshPatterns,
        ],
    );

    return <PatternContext.Provider value={value}>{children}</PatternContext.Provider>;
};
