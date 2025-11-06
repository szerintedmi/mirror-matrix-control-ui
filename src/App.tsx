import React, { useEffect, useMemo, useState } from 'react';

import ConnectionSettingsPanel from './components/ConnectionSettingsPanel';
import { DEFAULT_PROJECTION_SETTINGS } from './constants/projection';
import { MqttProvider } from './context/MqttContext';
import { StatusProvider } from './context/StatusContext';
import ConfiguratorPage from './pages/ConfiguratorPage';
import PatternEditorPage from './pages/PatternEditorPage';
import PatternLibraryPage from './pages/PatternLibraryPage';
import SimulationPage from './pages/SimulationPage';
import { loadGridState, persistGridState } from './services/gridStorage';
import { loadPatterns, persistPatterns } from './services/patternStorage';
import {
    getInitialProjectionSettings,
    persistProjectionSettings,
} from './services/projectionStorage';

import type { MirrorConfig, Pattern, ProjectionSettings } from './types';

// Simple router state
export type Page = 'library' | 'editor' | 'configurator' | 'simulation';

export interface NavigationControls {
    navigateTo: (page: Page) => void;
    editPattern: (patternId: string | null) => void;
}

const App: React.FC = () => {
    const [page, setPage] = useState<Page>('library');
    const [editingPatternId, setEditingPatternId] = useState<string | null>(null);

    // Global state
    const resolvedStorage = useMemo(
        () => (typeof window !== 'undefined' ? window.localStorage : undefined),
        [],
    );
    const persistedState = useMemo(() => loadGridState(resolvedStorage), [resolvedStorage]);

    const [gridSize, setGridSize] = useState(() => ({
        rows: persistedState?.gridSize.rows ?? 8,
        cols: persistedState?.gridSize.cols ?? 8,
    }));
    const persistedPatterns = useMemo(() => loadPatterns(resolvedStorage), [resolvedStorage]);

    const [patterns, setPatterns] = useState<Pattern[]>(persistedPatterns);
    const [mirrorConfig, setMirrorConfig] = useState<MirrorConfig>(
        () => new Map(persistedState?.mirrorConfig ?? []),
    );
    const initialProjectionSettings = useMemo(() => {
        const hydrated = getInitialProjectionSettings(resolvedStorage);
        return hydrated ?? DEFAULT_PROJECTION_SETTINGS;
    }, [resolvedStorage]);
    const [projectionSettings, setProjectionSettings] =
        useState<ProjectionSettings>(initialProjectionSettings);
    const [activePatternId, setActivePatternId] = useState<string | null>(
        persistedPatterns[0]?.id ?? null,
    );

    const navigateTo = (targetPage: Page) => {
        setPage(targetPage);
    };

    useEffect(() => {
        persistGridState(resolvedStorage, {
            gridSize,
            mirrorConfig,
        });
    }, [gridSize, mirrorConfig, resolvedStorage]);

    useEffect(() => {
        persistPatterns(resolvedStorage, patterns);
    }, [patterns, resolvedStorage]);

    useEffect(() => {
        persistProjectionSettings(resolvedStorage, projectionSettings);
    }, [projectionSettings, resolvedStorage]);

    const handleProjectionChange = (patch: Partial<ProjectionSettings>) => {
        setProjectionSettings((prev) => ({
            ...prev,
            ...patch,
        }));
    };

    const editPattern = (patternId: string | null) => {
        setEditingPatternId(patternId);
        setPage('editor');
    };

    const navigationControls: NavigationControls = { navigateTo, editPattern };

    const handleSavePattern = (pattern: Pattern) => {
        setPatterns((prev) => {
            const existingIndex = prev.findIndex((p) => p.id === pattern.id);
            if (existingIndex > -1) {
                const next = [...prev];
                next[existingIndex] = pattern;
                return next;
            }
            return [...prev, pattern];
        });
        setActivePatternId((current) => current ?? pattern.id);
        setPage('library');
    };

    const handleDeletePattern = (patternId: string) => {
        setPatterns((prev) => {
            const next = prev.filter((p) => p.id !== patternId);
            const fallback = next[0]?.id ?? null;
            setActivePatternId((current) => (current === patternId ? fallback : current));
            return next;
        });
    };

    const handleSelectPattern = (patternId: string | null) => {
        setActivePatternId(patternId);
    };

    const renderPage = () => {
        switch (page) {
            case 'editor':
                return (
                    <PatternEditorPage
                        navigation={navigationControls}
                        onSave={handleSavePattern}
                        existingPattern={patterns.find((p) => p.id === editingPatternId) || null}
                        mirrorCount={gridSize.rows * gridSize.cols}
                        defaultCanvasSize={gridSize}
                    />
                );
            case 'configurator':
                return (
                    <ConfiguratorPage
                        navigation={navigationControls}
                        gridSize={gridSize}
                        onGridSizeChange={(rows, cols) => setGridSize({ rows, cols })}
                        mirrorConfig={mirrorConfig}
                        setMirrorConfig={setMirrorConfig}
                    />
                );
            case 'simulation':
                return (
                    <SimulationPage
                        navigation={navigationControls}
                        gridSize={gridSize}
                        projectionSettings={projectionSettings}
                        onUpdateProjection={handleProjectionChange}
                        patterns={patterns}
                        activePatternId={activePatternId}
                        onSelectPattern={handleSelectPattern}
                    />
                );
            case 'library':
            default:
                return (
                    <PatternLibraryPage
                        navigation={navigationControls}
                        gridSize={gridSize}
                        mirrorConfig={mirrorConfig}
                        patterns={patterns}
                        onDeletePattern={handleDeletePattern}
                        projectionSettings={projectionSettings}
                        activePatternId={activePatternId}
                        onSelectActivePattern={(patternId) => handleSelectPattern(patternId)}
                    />
                );
        }
    };

    return (
        <MqttProvider>
            <StatusProvider>
                <div className="min-h-screen bg-gray-900 text-gray-200 font-sans">
                    <ConnectionSettingsPanel />
                    <main data-testid="app-root" className="mx-auto max-w-5xl px-4 py-8">
                        {renderPage()}
                    </main>
                </div>
            </StatusProvider>
        </MqttProvider>
    );
};

export default App;
