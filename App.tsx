import React, { useState } from 'react';
import type { Pattern } from './types';
import PatternLibraryPage from './pages/PatternLibraryPage';
import PatternEditorPage from './pages/PatternEditorPage';
import ConfiguratorPage from './pages/ConfiguratorPage';
import SimulationPage from './pages/SimulationPage';

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
    const [gridSize, setGridSize] = useState({ rows: 8, cols: 8 });
    const [patterns, setPatterns] = useState<Pattern[]>([]);
    const [wallDistance, setWallDistance] = useState(5);
    const [horizontalAngle, setHorizontalAngle] = useState(0); // Wall angle
    const [verticalAngle, setVerticalAngle] = useState(0); // Wall angle
    const [lightAngleHorizontal, setLightAngleHorizontal] = useState(0);
    const [lightAngleVertical, setLightAngleVertical] = useState(0);


    const navigateTo = (targetPage: Page) => {
        setPage(targetPage);
    };
    
    const editPattern = (patternId: string | null) => {
        setEditingPatternId(patternId);
        setPage('editor');
    };

    const navigationControls: NavigationControls = { navigateTo, editPattern };

    const handleSavePattern = (pattern: Pattern) => {
        setPatterns(prev => {
            const existingIndex = prev.findIndex(p => p.id === pattern.id);
            if (existingIndex > -1) {
                const newPatterns = [...prev];
                newPatterns[existingIndex] = pattern;
                return newPatterns;
            }
            return [...prev, pattern];
        });
        setPage('library');
    };
    
    const handleDeletePattern = (patternId: string) => {
        setPatterns(prev => prev.filter(p => p.id !== patternId));
    };

    const renderPage = () => {
        switch (page) {
            case 'editor':
                return <PatternEditorPage 
                    navigation={navigationControls}
                    onSave={handleSavePattern}
                    existingPattern={patterns.find(p => p.id === editingPatternId) || null}
                    mirrorCount={gridSize.rows * gridSize.cols}
                    defaultCanvasSize={gridSize}
                />;
            case 'configurator':
                return <ConfiguratorPage 
                    navigation={navigationControls}
                    gridSize={gridSize}
                    onGridSizeChange={(rows, cols) => setGridSize({ rows, cols })}
                />;
            case 'simulation':
                return <SimulationPage
                    navigation={navigationControls}
                    gridSize={gridSize}
                    wallDistance={wallDistance}
                    onWallDistanceChange={setWallDistance}
                    horizontalAngle={horizontalAngle}
                    onHorizontalAngleChange={setHorizontalAngle}
                    verticalAngle={verticalAngle}
                    onVerticalAngleChange={setVerticalAngle}
                    lightAngleHorizontal={lightAngleHorizontal}
                    onLightAngleHorizontalChange={setLightAngleHorizontal}
                    lightAngleVertical={lightAngleVertical}
                    onLightAngleVerticalChange={setLightAngleVertical}
                />;
            case 'library':
            default:
                return <PatternLibraryPage 
                    navigation={navigationControls}
                    patterns={patterns}
                    onDeletePattern={handleDeletePattern}
                    wallDistance={wallDistance}
                    horizontalAngle={horizontalAngle}
                    verticalAngle={verticalAngle}
                    lightAngleHorizontal={lightAngleHorizontal}
                    lightAngleVertical={lightAngleVertical}
                />;
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 font-sans">
            {renderPage()}
        </div>
    );
};

export default App;