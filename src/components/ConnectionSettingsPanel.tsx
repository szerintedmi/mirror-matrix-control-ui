import React, { useEffect, useMemo, useState } from 'react';

import { useMqtt, type ConnectionSettings } from '../context/MqttContext';

const statusLabel: Record<string, string> = {
    disconnected: 'Disconnected',
    connecting: 'Connecting…',
    connected: 'Connected',
    reconnecting: 'Reconnecting…',
};

const formatCountdown = (ms: number | null): string | null => {
    if (ms === null) {
        return null;
    }
    const clamped = Math.max(0, ms);
    if (clamped < 1_000) {
        return `${Math.ceil(clamped / 100)}00 ms`;
    }
    return `${Math.ceil(clamped / 1_000)} s`;
};

const schemeOptions: ConnectionSettings['scheme'][] = import.meta.env.PROD
    ? ['ws', 'wss']
    : ['ws', 'wss', 'mock'];

const ConnectionSettingsPanel: React.FC = () => {
    const { settings, updateSettings, state, connect, disconnect, manualReconnect, connectionUrl } =
        useMqtt();
    const [heartbeat, setHeartbeat] = useState(() => Date.now());
    const [showDetails, setShowDetails] = useState(false);

    useEffect(() => {
        if (state.status !== 'reconnecting') {
            return;
        }

        const interval = window.setInterval(() => {
            setHeartbeat(Date.now());
        }, 250);

        return () => window.clearInterval(interval);
    }, [state.status]);

    const statusText = statusLabel[state.status] ?? state.status;
    const countdownMs =
        state.status === 'reconnecting' && state.nextRetryTimestamp
            ? Math.max(0, state.nextRetryTimestamp - heartbeat)
            : null;
    const countdownLabel = useMemo(() => formatCountdown(countdownMs), [countdownMs]);
    const isConnecting = state.status === 'connecting';
    const isConnected = state.status === 'connected';

    const handleChange =
        <Key extends keyof ConnectionSettings>(field: Key) =>
        (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
            const value = event.target.value;
            if (field === 'port') {
                const parsed = Number(value);
                if (!Number.isNaN(parsed)) {
                    updateSettings({ port: parsed });
                }
                return;
            }
            updateSettings({ [field]: value } as Pick<ConnectionSettings, Key>);
        };

    const toggleDetails = () => {
        setShowDetails((prev) => !prev);
    };

    const detailToggleLabel = showDetails ? 'Hide Settings' : 'Show Settings';

    return (
        <section className="bg-gray-800 text-gray-100 border-b border-gray-700">
            <div className="mx-auto max-w-5xl px-4 py-4">
                <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold">MQTT Connection</h2>
                        <p className="text-sm text-gray-400">URL: {connectionUrl}</p>
                    </div>
                    <div className="flex flex-col items-start gap-2 text-sm md:flex-row md:items-center md:gap-3">
                        <div className="flex items-center gap-2">
                            <span className="font-medium">Status:</span>
                            <span
                                className={
                                    isConnected
                                        ? 'text-emerald-400'
                                        : state.status === 'reconnecting'
                                          ? 'text-amber-400'
                                          : 'text-gray-300'
                                }
                            >
                                {statusText}
                            </span>
                            {countdownLabel ? (
                                <span className="text-gray-500">Retry in {countdownLabel}</span>
                            ) : null}
                            {state.lastError ? (
                                <span className="text-red-400">{state.lastError}</span>
                            ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => connect()}
                                disabled={isConnecting}
                                className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                Connect
                            </button>
                            <button
                                type="button"
                                onClick={() => disconnect()}
                                disabled={!isConnected && state.status !== 'reconnecting'}
                                className="rounded bg-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                Disconnect
                            </button>
                            <button
                                type="button"
                                onClick={() => manualReconnect()}
                                className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-200 hover:border-emerald-400"
                            >
                                Retry Now
                            </button>
                            <button
                                type="button"
                                onClick={toggleDetails}
                                className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-200 hover:border-emerald-400"
                            >
                                {detailToggleLabel}
                            </button>
                        </div>
                    </div>
                </header>
                {showDetails ? (
                    <form className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-6">
                        <label className="flex flex-col gap-1 text-sm md:col-span-1">
                            <span className="text-gray-300">Scheme</span>
                            <select
                                value={settings.scheme}
                                onChange={(event) =>
                                    handleChange('scheme')(
                                        event as React.ChangeEvent<HTMLSelectElement>,
                                    )
                                }
                                className="rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                            >
                                {schemeOptions.map((option) => (
                                    <option key={option} value={option}>
                                        {option}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="flex flex-col gap-1 text-sm md:col-span-2">
                            <span className="text-gray-300">Host</span>
                            <input
                                type="text"
                                value={settings.host}
                                onChange={handleChange('host')}
                                className="rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-sm md:col-span-1">
                            <span className="text-gray-300">Port</span>
                            <input
                                type="number"
                                value={settings.port}
                                onChange={handleChange('port')}
                                className="rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-sm md:col-span-2">
                            <span className="text-gray-300">Path</span>
                            <input
                                type="text"
                                value={settings.path}
                                onChange={handleChange('path')}
                                className="rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-sm md:col-span-3">
                            <span className="text-gray-300">Username</span>
                            <input
                                type="text"
                                value={settings.username}
                                onChange={handleChange('username')}
                                className="rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-sm md:col-span-3">
                            <span className="text-gray-300">Password</span>
                            <input
                                type="password"
                                value={settings.password}
                                onChange={handleChange('password')}
                                className="rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                            />
                        </label>
                    </form>
                ) : null}
            </div>
        </section>
    );
};

export default ConnectionSettingsPanel;
