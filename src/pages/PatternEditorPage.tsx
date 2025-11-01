import React, { useState, useEffect, useRef } from 'react';
import type { Pattern } from '../types';
import type { NavigationControls } from '../App';

interface PatternEditorPageProps {
    navigation: NavigationControls;
    onSave: (pattern: Pattern) => void;
    existingPattern: Pattern | null;
    mirrorCount: number;
    defaultCanvasSize: { rows: number; cols: number };
}

// A simple hook to observe an element's size using ResizeObserver
const useElementSize = <T extends HTMLElement>(): [
    React.RefObject<T>,
    { width: number; height: number },
] => {
    const ref = useRef<T>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        const resizeObserver = new ResizeObserver((entries) => {
            if (!entries || entries.length === 0) return;
            const { width, height } = entries[0].contentRect;
            setSize({ width, height });
        });

        resizeObserver.observe(element);

        return () => {
            resizeObserver.disconnect();
        };
    }, []);

    return [ref, size];
};

const PatternEditorPage: React.FC<PatternEditorPageProps> = ({
    navigation,
    onSave,
    existingPattern,
    mirrorCount,
    defaultCanvasSize,
}) => {
    const [name, setName] = useState('');
    const [canvasSize, setCanvasSize] = useState(defaultCanvasSize);
    const [litPixels, setLitPixels] = useState<Set<string>>(new Set());
    const [pixelCountError, setPixelCountError] = useState(false);

    // State for drawing/erasing functionality
    const [isDrawing, setIsDrawing] = useState(false);
    const [paintMode, setPaintMode] = useState<'draw' | 'erase' | null>(null);

    const [mainContainerRef, mainContainerSize] = useElementSize<HTMLElement>();

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            if (existingPattern) {
                setName(existingPattern.name);
                setCanvasSize(existingPattern.canvasSize);
                setLitPixels(new Set(existingPattern.litPixels));
            } else {
                setName('New Pattern');
                setCanvasSize(defaultCanvasSize);
                setLitPixels(new Set());
            }
        }, 0);

        return () => window.clearTimeout(timeoutId);
    }, [existingPattern, defaultCanvasSize]);

    useEffect(() => {
        const handleMouseUp = () => {
            setIsDrawing(false);
            setPaintMode(null);
        };
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    const handlePixelInteraction = (row: number, col: number, isStartingClick: boolean) => {
        const key = `${row}-${col}`;
        const isCurrentlyLit = litPixels.has(key);

        if (isStartingClick) {
            setIsDrawing(true);
            const newMode = isCurrentlyLit ? 'erase' : 'draw';
            setPaintMode(newMode);

            const newLitPixels = new Set(litPixels);
            if (newMode === 'erase') {
                newLitPixels.delete(key);
            } else {
                if (newLitPixels.size >= mirrorCount) {
                    setPixelCountError(true);
                    setTimeout(() => setPixelCountError(false), 500);
                    setIsDrawing(false);
                    setPaintMode(null);
                    return;
                }
                newLitPixels.add(key);
            }
            setLitPixels(newLitPixels);
        } else {
            // Mouse enter event
            if (!isDrawing) return;

            const newLitPixels = new Set(litPixels);
            if (paintMode === 'erase') {
                if (isCurrentlyLit) {
                    newLitPixels.delete(key);
                    setLitPixels(newLitPixels);
                }
            } else if (paintMode === 'draw') {
                if (!isCurrentlyLit) {
                    if (newLitPixels.size >= mirrorCount) {
                        setPixelCountError(true);
                        setTimeout(() => setPixelCountError(false), 500);
                        setIsDrawing(false);
                        setPaintMode(null);
                        return;
                    }
                    newLitPixels.add(key);
                    setLitPixels(newLitPixels);
                }
            }
        }
    };

    const handleSave = () => {
        if (!name.trim()) {
            alert('Pattern name cannot be empty.');
            return;
        }
        onSave({
            id: existingPattern?.id || Date.now().toString(),
            name: name.trim(),
            canvasSize,
            litPixels,
        });
    };

    const handleCanvasSizeChange = (axis: 'rows' | 'cols', value: string) => {
        const numValue = Math.max(1, parseInt(value, 10) || 1);
        const newSize = { ...canvasSize, [axis]: numValue };
        setCanvasSize(newSize);

        // Retain pixels that are still within bounds
        const newLitPixels = new Set<string>();
        for (const pixel of litPixels) {
            const [r, c] = pixel.split('-').map(Number);
            if (r < newSize.rows && c < newSize.cols) {
                newLitPixels.add(pixel);
            }
        }
        setLitPixels(newLitPixels);
    };

    const handleShift = (direction: 'up' | 'down' | 'left' | 'right') => {
        const newLitPixels = new Set<string>();
        for (const pixel of litPixels) {
            let [r, c] = pixel.split('-').map(Number);
            if (direction === 'up') r--;
            if (direction === 'down') r++;
            if (direction === 'left') c--;
            if (direction === 'right') c++;

            if (r >= 0 && r < canvasSize.rows && c >= 0 && c < canvasSize.cols) {
                newLitPixels.add(`${r}-${c}`);
            }
        }
        setLitPixels(newLitPixels);
    };

    const handleClear = () => {
        if (
            window.confirm(
                'Are you sure you want to clear all pixels? This action cannot be undone.',
            )
        ) {
            setLitPixels(new Set());
        }
    };

    const usedPixels = litPixels.size;

    const gridStyle: React.CSSProperties = {
        gridTemplateColumns: `repeat(${canvasSize.cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${canvasSize.rows}, minmax(0, 1fr))`,
        visibility: mainContainerSize.width > 0 ? 'visible' : 'hidden',
    };

    if (mainContainerSize.width > 0 && mainContainerSize.height > 0) {
        const canvasRatio = canvasSize.cols / canvasSize.rows;
        const containerRatio = mainContainerSize.width / mainContainerSize.height;

        let width: number;
        let height: number;

        if (containerRatio > canvasRatio) {
            // Limited by height
            height = mainContainerSize.height;
            width = height * canvasRatio;
        } else {
            // Limited by width
            width = mainContainerSize.width;
            height = width / canvasRatio;
        }
        gridStyle.width = `${width}px`;
        gridStyle.height = `${height}px`;
    }

    return (
        <div className="flex flex-col h-screen p-4 sm:p-6 lg:p-8">
            <header className="mb-2 flex-shrink-0">
                <div className="flex flex-wrap justify-between items-center gap-4">
                    <button
                        onClick={() => navigation.navigateTo('library')}
                        className="px-4 py-2 rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors border border-gray-600"
                    >
                        &larr; Back to Library
                    </button>
                    <h1 className="text-2xl sm:text-3xl font-bold text-cyan-400 order-first sm:order-none w-full sm:w-auto text-center sm:text-left">
                        {existingPattern ? 'Edit Pattern' : 'Create New Pattern'}
                    </h1>
                    <button
                        onClick={handleSave}
                        className="px-6 py-2 rounded-md bg-cyan-600 text-white font-semibold hover:bg-cyan-500 transition-colors"
                    >
                        Save Pattern
                    </button>
                </div>
            </header>

            <div className="flex justify-center my-4">
                <div className="text-center bg-gray-800/50 ring-1 ring-white/10 p-3 rounded-lg w-full max-w-xs shadow-md">
                    <p className="text-gray-400 text-sm">Active Pixels</p>
                    <p
                        className={`font-mono text-2xl font-bold mt-1 transition-colors ${pixelCountError ? 'text-red-500' : 'text-cyan-300'}`}
                    >
                        {usedPixels} / {mirrorCount}
                    </p>
                </div>
            </div>

            <div className="flex-grow flex flex-col md:flex-row gap-6 min-h-0">
                {/* Controls Panel */}
                <aside className="w-full md:w-72 lg:w-80 bg-gray-800/50 rounded-lg p-4 ring-1 ring-white/10 flex-shrink-0 flex flex-col gap-6">
                    <div>
                        <label
                            htmlFor="patternName"
                            className="block text-sm font-medium text-gray-300"
                        >
                            Pattern Name
                        </label>
                        <input
                            type="text"
                            id="patternName"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="mt-1 w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                        />
                    </div>
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-gray-300">Canvas Size</h3>
                        <div className="flex items-center gap-2">
                            <label htmlFor="canvasRows" className="font-medium text-gray-400 w-12">
                                Rows:
                            </label>
                            <input
                                type="number"
                                id="canvasRows"
                                value={canvasSize.rows}
                                onChange={(e) => handleCanvasSizeChange('rows', e.target.value)}
                                className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-center text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                                min="1"
                                max="100"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <label htmlFor="canvasCols" className="font-medium text-gray-400 w-12">
                                Cols:
                            </label>
                            <input
                                type="number"
                                id="canvasCols"
                                value={canvasSize.cols}
                                onChange={(e) => handleCanvasSizeChange('cols', e.target.value)}
                                className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-center text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                                min="1"
                                max="100"
                            />
                        </div>
                    </div>

                    <div className="space-y-3 mt-auto">
                        <h3 className="text-sm font-medium text-gray-300">Transform</h3>
                        <div className="grid grid-cols-3 items-center justify-items-center gap-2 p-2 bg-black/20 rounded-md">
                            <div></div>
                            <button
                                onClick={() => handleShift('up')}
                                className="p-2 rounded-md hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
                                aria-label="Shift all pixels up"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-5 w-5"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                >
                                    <path
                                        fillRule="evenodd"
                                        d="M10 18a.75.75 0 01-.75-.75V4.66L7.03 6.91a.75.75 0 01-1.06-1.06l3.5-3.5a.75.75 0 011.06 0l3.5 3.5a.75.75 0 01-1.06 1.06L10.75 4.66v12.59A.75.75 0 0110 18z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                            </button>
                            <div></div>
                            <button
                                onClick={() => handleShift('left')}
                                className="p-2 rounded-md hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
                                aria-label="Shift all pixels left"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-5 w-5"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                >
                                    <path
                                        fillRule="evenodd"
                                        d="M2 10a.75.75 0 01.75-.75h12.59l-2.22-2.22a.75.75 0 111.06-1.06l3.5 3.5a.75.75 0 010 1.06l-3.5 3.5a.75.75 0 11-1.06-1.06l2.22-2.22H2.75A.75.75 0 012 10z"
                                        clipRule="evenodd"
                                        transform="rotate(180 10 10)"
                                    />
                                </svg>
                            </button>
                            <button
                                onClick={handleClear}
                                className="p-2 rounded-full hover:bg-red-800/50 text-gray-300 hover:text-red-400 transition-colors"
                                aria-label="Clear all pixels"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-5 w-5"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                >
                                    <path
                                        fillRule="evenodd"
                                        d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                            </button>
                            <button
                                onClick={() => handleShift('right')}
                                className="p-2 rounded-md hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
                                aria-label="Shift all pixels right"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-5 w-5"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                >
                                    <path
                                        fillRule="evenodd"
                                        d="M2 10a.75.75 0 01.75-.75h12.59l-2.22-2.22a.75.75 0 111.06-1.06l3.5 3.5a.75.75 0 010 1.06l-3.5 3.5a.75.75 0 11-1.06-1.06l2.22-2.22H2.75A.75.75 0 012 10z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                            </button>
                            <div></div>
                            <button
                                onClick={() => handleShift('down')}
                                className="p-2 rounded-md hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
                                aria-label="Shift all pixels down"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-5 w-5"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                >
                                    <path
                                        fillRule="evenodd"
                                        d="M10 2a.75.75 0 01.75.75v12.59l2.22-2.22a.75.75 0 111.06 1.06l-3.5 3.5a.75.75 0 01-1.06 0l-3.5-3.5a.75.75 0 111.06-1.06l2.22 2.22V2.75A.75.75 0 0110 2z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                            </button>
                            <div></div>
                        </div>
                    </div>
                </aside>

                {/* Canvas */}
                <main
                    ref={mainContainerRef}
                    className="flex-grow bg-gray-800/50 rounded-lg ring-1 ring-white/10 grid place-items-center p-4 overflow-hidden"
                >
                    <div
                        onMouseLeave={() => {
                            setIsDrawing(false);
                            setPaintMode(null);
                        }}
                        className="grid gap-px bg-gray-700 cursor-crosshair"
                        style={gridStyle}
                    >
                        {Array.from({ length: canvasSize.rows * canvasSize.cols }).map((_, i) => {
                            const row = Math.floor(i / canvasSize.cols);
                            const col = i % canvasSize.cols;
                            const isLit = litPixels.has(`${row}-${col}`);
                            return (
                                <button
                                    key={`${row}-${col}`}
                                    onMouseDown={() => handlePixelInteraction(row, col, true)}
                                    onMouseEnter={() => handlePixelInteraction(row, col, false)}
                                    className={`w-full h-full transition-colors outline-none focus:ring-2 focus:ring-cyan-400 focus:z-10 ${isLit ? 'bg-cyan-400 hover:bg-cyan-300' : 'bg-gray-800 hover:bg-gray-600'}`}
                                    aria-label={`Pixel at row ${row}, column ${col}. Status: ${isLit ? 'On' : 'Off'}`}
                                />
                            );
                        })}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default PatternEditorPage;
