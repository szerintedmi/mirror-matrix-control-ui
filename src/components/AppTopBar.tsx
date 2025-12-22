import React, { useEffect, useMemo, useState } from 'react';

import CalibrationProfileDropdown from '@/components/calibration/CalibrationProfileDropdown';
import GlobalMoveDropdown from '@/components/GlobalMoveDropdown';
import type { MirrorConfig } from '@/types';

import { useMqtt } from '../context/MqttContext';
import {
    formatRetryCountdown,
    getConnectionStatusLabel,
    isConnectionOffline,
} from '../utils/connectionStatus';

export interface AppTopBarBreadcrumb {
    label: string;
    onClick?: () => void;
    current?: boolean;
}

interface AppTopBarProps {
    onMenuClick: () => void;
    onOpenSettings: () => void;
    onOpenProfileManagement?: () => void;
    pageTitle: string;
    breadcrumbs?: AppTopBarBreadcrumb[];
    showProfileSelector?: boolean;
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
}

const AppTopBar: React.FC<AppTopBarProps> = ({
    onMenuClick,
    onOpenSettings,
    onOpenProfileManagement,
    pageTitle,
    breadcrumbs = [],
    showProfileSelector = true,
    gridSize,
    mirrorConfig,
}) => {
    const { state, connectionUrl, settings } = useMqtt();
    const [heartbeat, setHeartbeat] = useState(() => Date.now());

    useEffect(() => {
        if (!state.nextRetryTimestamp) {
            return;
        }
        const interval = window.setInterval(() => setHeartbeat(Date.now()), 250);
        return () => window.clearInterval(interval);
    }, [state.nextRetryTimestamp]);

    const statusLabel = getConnectionStatusLabel(state);
    const retryCountdown = useMemo(
        () => formatRetryCountdown(state.nextRetryTimestamp, heartbeat),
        [heartbeat, state.nextRetryTimestamp],
    );
    const offline = isConnectionOffline(state);
    const connectionLabel = useMemo(() => {
        if (settings.scheme === 'mock') {
            return 'mock';
        }
        try {
            const parsed = new URL(connectionUrl);
            return `${parsed.protocol}//${parsed.host}`;
        } catch {
            return connectionUrl;
        }
    }, [connectionUrl, settings.scheme]);

    const showPageTitle = !(breadcrumbs.length > 0 && breadcrumbs[0].label === pageTitle);

    return (
        <header className="sticky top-0 z-40 border-b border-gray-800 bg-gray-950">
            <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-6">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                    <button
                        type="button"
                        className="inline-flex size-10 items-center justify-center rounded-md border border-gray-800 text-gray-300 hover:border-gray-600 hover:text-gray-100 md:hidden"
                        aria-label="Open navigation"
                        onClick={onMenuClick}
                    >
                        <span className="sr-only">Open navigation</span>
                        <svg
                            aria-hidden="true"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="size-6"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M3.75 5.25h16.5M3.75 12h16.5M3.75 18.75h16.5"
                            />
                        </svg>
                    </button>
                    <div className="min-w-0">
                        <nav aria-label="Breadcrumb">
                            <ol className="flex flex-wrap items-center gap-2 text-sm text-gray-300">
                                <li className="font-semibold tracking-wide text-emerald-300 uppercase">
                                    Mirror Matrix
                                </li>
                                {showPageTitle ? (
                                    <>
                                        <li className="text-gray-600">/</li>
                                        <li className="font-semibold text-gray-100">{pageTitle}</li>
                                    </>
                                ) : null}
                                {breadcrumbs.map((crumb, index) => (
                                    <React.Fragment key={`${crumb.label}-${index}`}>
                                        <li className="text-gray-600">/</li>
                                        <li>
                                            {crumb.onClick && !crumb.current ? (
                                                <button
                                                    type="button"
                                                    onClick={crumb.onClick}
                                                    className="rounded border border-transparent px-1.5 py-0.5 text-gray-300 transition hover:border-emerald-400 hover:text-emerald-200"
                                                >
                                                    {crumb.label}
                                                </button>
                                            ) : (
                                                <span
                                                    className={`px-1.5 py-0.5 ${
                                                        crumb.current
                                                            ? 'font-semibold text-gray-100'
                                                            : 'text-gray-500'
                                                    }`}
                                                    title={crumb.label}
                                                >
                                                    {crumb.label}
                                                </span>
                                            )}
                                        </li>
                                    </React.Fragment>
                                ))}
                            </ol>
                        </nav>
                    </div>
                </div>
                <div className="flex flex-1 items-center justify-end gap-3">
                    {showProfileSelector && onOpenProfileManagement && (
                        <>
                            <CalibrationProfileDropdown
                                onOpenManagement={onOpenProfileManagement}
                            />
                            <GlobalMoveDropdown gridSize={gridSize} mirrorConfig={mirrorConfig} />
                        </>
                    )}
                    <button
                        type="button"
                        onClick={onOpenSettings}
                        className={`inline-flex items-center gap-2 rounded-md border px-3 py-1 text-xs font-medium transition ${
                            offline
                                ? 'border-red-500/40 bg-red-900/60 text-red-200 hover:border-red-400'
                                : 'border-emerald-500/30 bg-emerald-900/50 text-emerald-200 hover:border-emerald-400'
                        }`}
                        title={`${statusLabel} · ${connectionUrl}`}
                    >
                        <span
                            className={`size-2.5 rounded-full ${
                                offline ? 'bg-red-400' : 'bg-emerald-400'
                            } ${state.status === 'reconnecting' ? 'animate-pulse' : ''}`}
                        />
                        <span className="max-w-[9rem] truncate text-sm text-inherit">
                            {connectionLabel}
                        </span>
                    </button>
                    <div className="flex flex-col items-end gap-1 text-xs">
                        {retryCountdown ? (
                            <span className="text-gray-400">Retrying in {retryCountdown}</span>
                        ) : null}
                        {state.lastError ? (
                            <span
                                className="max-w-[12rem] truncate text-red-400"
                                title={state.lastError}
                            >
                                {state.lastError}
                            </span>
                        ) : null}
                    </div>
                </div>
            </div>
        </header>
    );
};

export default AppTopBar;
