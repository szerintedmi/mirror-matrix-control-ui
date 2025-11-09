import React from 'react';

import type { MirrorReflectionSolution } from '../types';

interface GeometryDebugPanelProps {
    mirror: MirrorReflectionSolution | null;
    isStale: boolean;
}

const formatValue = (value: number | undefined, digits = 2, suffix = ''): string =>
    value === undefined || Number.isNaN(value) ? '—' : `${value.toFixed(digits)}${suffix}`;

const GeometryDebugPanel: React.FC<GeometryDebugPanelProps> = ({ mirror, isStale }) => {
    return (
        <section className="rounded-xl border border-gray-700/70 bg-gray-900/80 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-gray-100">Debug Metrics</h3>
                {isStale && (
                    <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-100">
                        Preview paused
                    </span>
                )}
            </div>

            {!mirror ? (
                <p className="mt-4 text-sm text-gray-400">
                    Select a mirror from the overlays to inspect yaw/pitch, wall hits, and ellipse
                    measurements.
                </p>
            ) : (
                <div className="mt-4 space-y-4 text-sm text-gray-200">
                    <div>
                        <h4 className="text-xs uppercase tracking-wide text-gray-400">
                            Orientation
                        </h4>
                        <dl className="mt-2 grid grid-cols-2 gap-2">
                            <div>
                                <dt className="text-gray-400">Yaw</dt>
                                <dd className="font-mono text-cyan-300" data-testid="debug-yaw">
                                    {formatValue(mirror.yaw, 2, '°')}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-gray-400">Pitch</dt>
                                <dd className="font-mono text-cyan-300" data-testid="debug-pitch">
                                    {formatValue(mirror.pitch, 2, '°')}
                                </dd>
                            </div>
                        </dl>
                    </div>

                    <div>
                        <h4 className="text-xs uppercase tracking-wide text-gray-400">
                            Wall Hit (world m)
                        </h4>
                        <dl className="mt-2 grid grid-cols-3 gap-2">
                            <div>
                                <dt className="text-gray-400">X</dt>
                                <dd className="font-mono text-cyan-200" data-testid="debug-wall-x">
                                    {formatValue(mirror.wallHit?.x, 3, '')}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-gray-400">Y</dt>
                                <dd className="font-mono text-cyan-200" data-testid="debug-wall-y">
                                    {formatValue(mirror.wallHit?.y, 3, '')}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-gray-400">Z</dt>
                                <dd className="font-mono text-cyan-200" data-testid="debug-wall-z">
                                    {formatValue(mirror.wallHit?.z, 3, '')}
                                </dd>
                            </div>
                        </dl>
                    </div>

                    <div>
                        <h4 className="text-xs uppercase tracking-wide text-gray-400">Ellipse</h4>
                        <dl className="mt-2 grid grid-cols-3 gap-2">
                            <div>
                                <dt className="text-gray-400">Major D</dt>
                                <dd className="font-mono text-cyan-200" data-testid="debug-major">
                                    {formatValue(mirror.ellipse?.majorDiameter, 3, ' m')}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-gray-400">Minor D</dt>
                                <dd className="font-mono text-cyan-200" data-testid="debug-minor">
                                    {formatValue(mirror.ellipse?.minorDiameter, 3, ' m')}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-gray-400">cos θ</dt>
                                <dd
                                    className="font-mono text-cyan-200"
                                    data-testid="debug-incidence"
                                >
                                    {formatValue(mirror.ellipse?.incidenceCosine, 3)}
                                </dd>
                            </div>
                        </dl>
                    </div>

                    {mirror.errors.length > 0 && (
                        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
                            <p className="font-semibold">Mirror warnings</p>
                            <ul className="mt-1 list-disc space-y-1 pl-4">
                                {mirror.errors.map((error, index) => (
                                    <li key={`${error.code}-${error.patternId ?? 'none'}-${index}`}>
                                        {error.message}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
};

export default GeometryDebugPanel;
