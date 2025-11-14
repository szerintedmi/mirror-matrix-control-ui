import React, { useEffect, useMemo, useState } from 'react';

import AppTopBar, { type AppTopBarBreadcrumb } from './components/AppTopBar';
import ConnectionSettingsContent from './components/ConnectionSettingsContent';
import MobileNavigationDrawer from './components/MobileNavigationDrawer';
import Modal from './components/Modal';
import {
    ArrayConfigIcon,
    CalibrationIcon,
    ConnectionIcon,
    PatternsIcon,
    PlaybackIcon,
    SimulationIcon,
} from './components/NavIcons';
import NavigationRail from './components/NavigationRail';
import { BUILTIN_PATTERNS } from './constants/pattern';
import { DEFAULT_PROJECTION_SETTINGS } from './constants/projection';
import { LogProvider } from './context/LogContext';
import { MqttProvider } from './context/MqttContext';
import { StatusProvider } from './context/StatusContext';
import CalibrationPage from './pages/CalibrationPage';
import ConfiguratorPage from './pages/ConfiguratorPage';
import PatternEditorPage from './pages/PatternEditorPage';
import PatternLibraryPage from './pages/PatternLibraryPage';
import PlaybackPage from './pages/PlaybackPage';
import SimulationPage from './pages/SimulationPage';
import { loadGridState, persistGridState } from './services/gridStorage';
import { loadPatterns, persistPatterns } from './services/patternStorage';
import {
    getInitialProjectionSettings,
    persistProjectionSettings,
} from './services/projectionStorage';
import { validateProjectionSettings } from './utils/geometryValidation';

import type { MirrorConfig, Pattern, ProjectionSettings } from './types';

export type Page =
    | 'library'
    | 'editor'
    | 'playback'
    | 'calibration'
    | 'configurator'
    | 'simulation'
    | 'connection';

export interface NavigationControls {
    navigateTo: (page: Page) => void;
    editPattern: (patternId: string | null) => void;
}

const App: React.FC = () => {
    const [page, setPage] = useState<Page>('playback');
    const [editingPatternId, setEditingPatternId] = useState<string | null>(null);
    const [isRailCollapsed, setIsRailCollapsed] = useState(false);
    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
    const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false);

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
    const [projectionError, setProjectionError] = useState<string | null>(null);
    const [activePatternId, setActivePatternId] = useState<string | null>(
        persistedPatterns[0]?.id ?? null,
    );

    const simulationPatterns = useMemo(() => [...BUILTIN_PATTERNS, ...patterns], [patterns]);

    const navigateTo = (targetPage: Page) => {
        setPage(targetPage);
        setIsMobileNavOpen(false);
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
        setProjectionSettings((prev) => {
            const next = { ...prev, ...patch };
            const validationError = validateProjectionSettings(next);
            if (validationError) {
                setProjectionError(validationError);
                return prev;
            }
            setProjectionError(null);
            persistProjectionSettings(resolvedStorage, next);
            return next;
        });
    };

    const clearProjectionError = () => setProjectionError(null);

    const editPattern = (patternId: string | null) => {
        setEditingPatternId(patternId);
        setPage('editor');
    };

    const navigationControls: NavigationControls = { navigateTo, editPattern };
    const effectiveNavPage: Page = page === 'editor' ? 'library' : page;
    const editingPattern = useMemo(
        () =>
            editingPatternId
                ? (patterns.find((pattern) => pattern.id === editingPatternId) ?? null)
                : null,
        [editingPatternId, patterns],
    );

    const navigationItems = [
        {
            page: 'playback' as const,
            label: 'Playback',
            icon: <PlaybackIcon />,
        },
        {
            page: 'calibration' as const,
            label: 'Calibration',
            icon: <CalibrationIcon />,
        },
        {
            page: 'library' as const,
            label: 'Patterns',
            icon: <PatternsIcon />,
        },
        {
            page: 'simulation' as const,
            label: 'Simulation',
            icon: <SimulationIcon />,
        },
        {
            page: 'configurator' as const,
            label: 'Array Config',
            icon: <ArrayConfigIcon />,
        },
        {
            page: 'connection' as const,
            label: 'Connection',
            icon: <ConnectionIcon />,
        },
    ];

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
            case 'connection':
                return <ConnectionSettingsContent />;
            case 'playback':
                return (
                    <PlaybackPage
                        patterns={patterns}
                        gridSize={gridSize}
                        mirrorConfig={mirrorConfig}
                        projectionSettings={projectionSettings}
                        onUpdateProjection={handleProjectionChange}
                        activePatternId={activePatternId}
                        onSelectPattern={handleSelectPattern}
                        onNavigateSimulation={() => navigateTo('simulation')}
                    />
                );
            case 'calibration':
                return <CalibrationPage gridSize={gridSize} mirrorConfig={mirrorConfig} />;
            case 'editor':
                return (
                    <PatternEditorPage
                        onSave={handleSavePattern}
                        existingPattern={editingPattern}
                        mirrorCount={gridSize.rows * gridSize.cols}
                        defaultCanvasSize={gridSize}
                        onBack={() => setPage('library')}
                    />
                );
            case 'configurator':
                return (
                    <ConfiguratorPage
                        gridSize={gridSize}
                        onGridSizeChange={(rows, cols) => setGridSize({ rows, cols })}
                        mirrorConfig={mirrorConfig}
                        setMirrorConfig={setMirrorConfig}
                    />
                );
            case 'simulation':
                return (
                    <SimulationPage
                        gridSize={gridSize}
                        projectionSettings={projectionSettings}
                        onUpdateProjection={handleProjectionChange}
                        projectionError={projectionError}
                        onClearProjectionError={clearProjectionError}
                        patterns={simulationPatterns}
                        hasUserPatterns={patterns.length > 0}
                        activePatternId={activePatternId}
                        onSelectPattern={handleSelectPattern}
                    />
                );
            case 'library':
            default:
                return (
                    <PatternLibraryPage
                        navigation={navigationControls}
                        patterns={patterns}
                        onDeletePattern={handleDeletePattern}
                        projectionSettings={projectionSettings}
                        activePatternId={activePatternId}
                        onSelectActivePattern={(patternId) => handleSelectPattern(patternId)}
                    />
                );
        }
    };

    const pageTitle = (() => {
        switch (page) {
            case 'library':
                return 'Patterns';
            case 'editor':
                return 'Patterns';
            case 'playback':
                return 'Playback';
            case 'calibration':
                return 'Calibration';
            case 'configurator':
                return 'Array Config';
            case 'simulation':
                return 'Simulation';
            case 'connection':
                return 'Connection';
            default:
                return 'Mirror Matrix';
        }
    })();

    const breadcrumbs: AppTopBarBreadcrumb[] =
        page === 'editor' && editingPattern
            ? [
                  {
                      label: 'Patterns',
                      onClick: () => navigateTo('library'),
                  },
                  {
                      label: editingPattern.name,
                  },
              ]
            : page === 'editor'
              ? [
                    {
                        label: 'Patterns',
                        onClick: () => navigateTo('library'),
                    },
                ]
              : [];

    return (
        <MqttProvider>
            <StatusProvider>
                <LogProvider>
                    <div className="flex h-screen min-h-screen overflow-hidden bg-gray-900 font-sans text-gray-200">
                        <NavigationRail
                            items={navigationItems}
                            activePage={effectiveNavPage}
                            collapsed={isRailCollapsed}
                            onToggleCollapse={() => setIsRailCollapsed((prev) => !prev)}
                            onNavigate={navigateTo}
                        />
                        <MobileNavigationDrawer
                            open={isMobileNavOpen}
                            onClose={() => setIsMobileNavOpen(false)}
                            items={navigationItems}
                            activePage={effectiveNavPage}
                            onNavigate={navigateTo}
                        />
                        <div className="flex h-full flex-1 flex-col overflow-hidden">
                            <AppTopBar
                                onMenuClick={() => setIsMobileNavOpen(true)}
                                onOpenSettings={() => setIsConnectionModalOpen(true)}
                                pageTitle={pageTitle}
                                breadcrumbs={breadcrumbs}
                            />
                            <main
                                data-testid="app-root"
                                className="flex-1 overflow-auto px-4 py-6 md:px-8"
                            >
                                <div className="w-full">{renderPage()}</div>
                            </main>
                        </div>
                        <Modal
                            open={isConnectionModalOpen}
                            onClose={() => setIsConnectionModalOpen(false)}
                            title="Connection Settings"
                        >
                            <ConnectionSettingsContent />
                        </Modal>
                    </div>
                </LogProvider>
            </StatusProvider>
        </MqttProvider>
    );
};

export default App;
