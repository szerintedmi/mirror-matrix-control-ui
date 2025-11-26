import React, { useEffect, useMemo, useState } from 'react';

import AppTopBar, { type AppTopBarBreadcrumb } from './components/AppTopBar';
import ConnectionSettingsContent from './components/ConnectionSettingsContent';
import MobileNavigationDrawer from './components/MobileNavigationDrawer';
import Modal from './components/Modal';
import {
    ArrayConfigIcon,
    CalibrationIcon,
    ConnectionIcon,
    PlaybackIcon,
    PatternsIcon,
    LegacyPlaybackIcon,
    SimulationIcon,
} from './components/NavIcons';
import NavigationRail from './components/NavigationRail';
import {
    getEffectiveNavPage,
    getPageTitle,
    NAVIGATION_ITEMS,
    type NavigationIconKey,
} from './constants/navigation';
import { BUILTIN_PATTERNS } from './constants/pattern';
import { DEFAULT_PROJECTION_SETTINGS } from './constants/projection';
import { CalibrationProvider } from './context/CalibrationContext';
import { LogProvider } from './context/LogContext';
import { MqttProvider } from './context/MqttContext';
import { PatternProvider } from './context/PatternContext';
import { StatusProvider } from './context/StatusContext';
import { useGridPersistence } from './hooks/useGridPersistence';
import CalibrationPage from './pages/CalibrationPage';
import ConfiguratorPage from './pages/ConfiguratorPage';
import LegacyPlaybackPage from './pages/LegacyPlaybackPage';
import PatternDesignerPage from './pages/PatternDesignerPage';
import PatternEditorPage from './pages/PatternEditorPage';
import PatternLibraryPage from './pages/PatternLibraryPage';
import PlaybackPage from './pages/PlaybackPage';
// Lazy load SimulationPage to avoid loading BabylonJS during tests
const SimulationPage = React.lazy(() => import('./pages/SimulationPage'));
import { loadLegacyPatterns, persistLegacyPatterns } from './services/legacyPatternStorage';
import {
    getInitialProjectionSettings,
    persistProjectionSettings,
} from './services/projectionStorage';
import { validateProjectionSettings } from './utils/geometryValidation';

import type { LegacyPattern, ProjectionSettings } from './types';

export type Page =
    | 'legacy-patterns'
    | 'legacy-patterns-editor'
    | 'patterns'
    | 'legacy-playback'
    | 'playback'
    | 'calibration'
    | 'configurator'
    | 'simulation'
    | 'connection';

export interface NavigationControls {
    navigateTo: (page: Page) => void;
    editPattern: (patternId: string | null) => void;
}

/**
 * Map icon keys to React icon components.
 */
const NAVIGATION_ICONS: Record<NavigationIconKey, React.ReactNode> = {
    'legacy-playback': <LegacyPlaybackIcon />,
    playback: <PlaybackIcon />,
    calibration: <CalibrationIcon />,
    patterns: <PatternsIcon />,
    simulation: <SimulationIcon />,
    configurator: <ArrayConfigIcon />,
    connection: <ConnectionIcon />,
};

const App: React.FC = () => {
    const [page, setPage] = useState<Page>('legacy-playback');
    const [editingPatternId, setEditingPatternId] = useState<string | null>(null);
    const [isRailCollapsed, setIsRailCollapsed] = useState(false);
    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
    const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false);

    // Grid state and persistence (extracted to hook)
    const {
        gridSize,
        mirrorConfig,
        activeSnapshotName,
        hasUnsavedChanges: hasUnsavedGridChanges,
        snapshotMetadata,
        persistenceStatus,
        canUseStorage,
        storageUnavailableMessage,
        setGridSize,
        setMirrorConfig,
        saveSnapshot: handleSaveSnapshot,
        loadSnapshot: handleLoadSnapshot,
    } = useGridPersistence();

    // Local storage reference for patterns and projection
    const resolvedStorage = useMemo(
        () => (typeof window !== 'undefined' ? window.localStorage : undefined),
        [],
    );

    // Pattern state
    const persistedPatterns = useMemo(() => loadLegacyPatterns(resolvedStorage), [resolvedStorage]);
    const [patterns, setPatterns] = useState<LegacyPattern[]>(persistedPatterns);
    const [activePatternId, setActivePatternId] = useState<string | null>(
        persistedPatterns[0]?.id ?? null,
    );

    // Projection state
    const initialProjectionSettings = useMemo(() => {
        const hydrated = getInitialProjectionSettings(resolvedStorage);
        return hydrated ?? DEFAULT_PROJECTION_SETTINGS;
    }, [resolvedStorage]);
    const [projectionSettings, setProjectionSettings] =
        useState<ProjectionSettings>(initialProjectionSettings);
    const [projectionError, setProjectionError] = useState<string | null>(null);

    const simulationPatterns = useMemo(() => [...BUILTIN_PATTERNS, ...patterns], [patterns]);

    const navigateTo = (targetPage: Page) => {
        setPage(targetPage);
        setIsMobileNavOpen(false);
    };

    useEffect(() => {
        persistLegacyPatterns(resolvedStorage, patterns);
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
        setPage('legacy-patterns-editor');
    };

    const navigationControls: NavigationControls = { navigateTo, editPattern };
    const effectiveNavPage = getEffectiveNavPage(page);
    const editingPattern = useMemo(
        () =>
            editingPatternId
                ? (patterns.find((pattern) => pattern.id === editingPatternId) ?? null)
                : null,
        [editingPatternId, patterns],
    );

    // Build navigation items with icons
    const navigationItems = useMemo(
        () =>
            NAVIGATION_ITEMS.map((item) => ({
                page: item.page,
                label: item.label,
                icon: NAVIGATION_ICONS[item.iconKey],
            })),
        [],
    );

    const handleSavePattern = (pattern: LegacyPattern) => {
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
        setPage('legacy-patterns');
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
            case 'legacy-playback':
                return (
                    <LegacyPlaybackPage
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
            case 'legacy-patterns-editor':
                return (
                    <PatternEditorPage
                        onSave={handleSavePattern}
                        existingPattern={editingPattern}
                        mirrorCount={gridSize.rows * gridSize.cols}
                        defaultCanvasSize={gridSize}
                        onBack={() => setPage('legacy-patterns')}
                    />
                );
            case 'configurator':
                return (
                    <ConfiguratorPage
                        gridSize={gridSize}
                        onGridSizeChange={(rows, cols) => setGridSize({ rows, cols })}
                        mirrorConfig={mirrorConfig}
                        setMirrorConfig={setMirrorConfig}
                        persistenceControls={{
                            canUseStorage,
                            availableSnapshots: snapshotMetadata,
                            activeSnapshotName,
                            hasUnsavedChanges: hasUnsavedGridChanges,
                            onSaveSnapshot: handleSaveSnapshot,
                            onLoadSnapshot: handleLoadSnapshot,
                            status: persistenceStatus,
                            storageUnavailableMessage,
                        }}
                    />
                );
            case 'simulation':
                return (
                    <React.Suspense
                        fallback={<div className="p-8 text-gray-400">Loading simulation...</div>}
                    >
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
                    </React.Suspense>
                );
            case 'patterns':
                return <PatternDesignerPage gridSize={gridSize} mirrorConfig={mirrorConfig} />;
            case 'playback':
                return (
                    <PlaybackPage
                        gridSize={gridSize}
                        mirrorConfig={mirrorConfig}
                        onNavigate={navigateTo}
                    />
                );
            case 'legacy-patterns':
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

    const pageTitle = getPageTitle(page);

    const breadcrumbs: AppTopBarBreadcrumb[] =
        page === 'legacy-patterns-editor' && editingPattern
            ? [
                  {
                      label: 'Patterns',
                      onClick: () => navigateTo('legacy-patterns'),
                  },
                  {
                      label: editingPattern.name,
                  },
              ]
            : page === 'legacy-patterns-editor'
              ? [
                    {
                        label: 'Patterns',
                        onClick: () => navigateTo('legacy-patterns'),
                    },
                ]
              : [];

    return (
        <MqttProvider>
            <StatusProvider>
                <LogProvider>
                    <CalibrationProvider>
                        <PatternProvider>
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
                        </PatternProvider>
                    </CalibrationProvider>
                </LogProvider>
            </StatusProvider>
        </MqttProvider>
    );
};

export default App;
