import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useMqtt, type ConnectionSettings } from '../context/MqttContext';
import { formatRetryCountdown, getConnectionStatusLabel } from '../utils/connectionStatus';

const schemeOptions: Array<Exclude<ConnectionSettings['scheme'], 'mock'>> = ['ws', 'wss'];

const ConnectionSettingsContent: React.FC = () => {
    const { settings, updateSettings, state, connect, disconnect, manualReconnect, connectionUrl } =
        useMqtt();
    const [heartbeat, setHeartbeat] = useState(() => Date.now());
    const lastBrokerSchemeRef = useRef<Exclude<ConnectionSettings['scheme'], 'mock'>>('ws');

    useEffect(() => {
        if (!state.nextRetryTimestamp) {
            return;
        }
        const interval = window.setInterval(() => setHeartbeat(Date.now()), 250);
        return () => window.clearInterval(interval);
    }, [state.nextRetryTimestamp]);

    useEffect(() => {
        if (settings.scheme !== 'mock') {
            lastBrokerSchemeRef.current = settings.scheme;
        }
    }, [settings.scheme]);

    const statusLabel = getConnectionStatusLabel(state);
    const retryCountdown = useMemo(
        () => formatRetryCountdown(state.nextRetryTimestamp, heartbeat),
        [heartbeat, state.nextRetryTimestamp],
    );
    const isConnected = state.status === 'connected';
    const isBusy = state.status === 'connecting' || state.status === 'reconnecting';
    const isMock = settings.scheme === 'mock';

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

    const handleModeSelect = (mode: 'mock' | 'broker') => {
        if (mode === 'mock') {
            updateSettings({ scheme: 'mock' });
            return;
        }
        const nextScheme = lastBrokerSchemeRef.current ?? 'ws';
        updateSettings({ scheme: nextScheme });
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2 text-sm text-gray-300">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-base font-semibold text-gray-100">Connection</span>
                    <span
                        className={
                            isConnected
                                ? 'rounded-full bg-emerald-900 px-3 py-1 text-sm font-medium text-emerald-300'
                                : 'rounded-full bg-gray-800 px-3 py-1 text-sm font-medium text-gray-200'
                        }
                    >
                        {statusLabel}
                    </span>
                    {retryCountdown ? (
                        <span className="text-gray-400">Retrying in {retryCountdown}</span>
                    ) : null}
                    {state.lastError ? (
                        <span className="text-red-400">{state.lastError}</span>
                    ) : null}
                </div>
                <div>
                    <span className="text-gray-400">Mode:</span>{' '}
                    <span className="font-medium text-gray-200">
                        {isMock ? 'Mock transport (in-memory)' : connectionUrl}
                    </span>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-md border border-gray-700 bg-gray-900 p-1 text-xs font-medium text-gray-300">
                    <button
                        type="button"
                        onClick={() => handleModeSelect('broker')}
                        className={`rounded px-3 py-1 transition ${
                            isMock ? 'hover:text-emerald-300' : 'bg-emerald-500 text-gray-900'
                        }`}
                    >
                        MQTT Broker
                    </button>
                    <button
                        type="button"
                        onClick={() => handleModeSelect('mock')}
                        className={`rounded px-3 py-1 transition ${
                            isMock ? 'bg-emerald-500 text-gray-900' : 'hover:text-emerald-300'
                        }`}
                    >
                        Mock Transport
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => connect()}
                    disabled={isBusy}
                    className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    Connect
                </button>
                <button
                    type="button"
                    onClick={() => disconnect()}
                    className="rounded bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-700"
                >
                    Disconnect
                </button>
                <button
                    type="button"
                    onClick={() => manualReconnect()}
                    disabled={isBusy}
                    className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-200 hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    Retry Now
                </button>
            </div>

            {isMock ? (
                <div className="rounded-md border border-gray-700 bg-gray-900/60 px-3 py-4 text-sm text-gray-300">
                    Mock transport bypasses the network and simulates MQTT messages locally. No
                    broker configuration is required.
                </div>
            ) : (
                <form className="grid grid-cols-1 gap-4 md:grid-cols-6">
                    <label className="flex flex-col gap-1 text-sm md:col-span-2">
                        <span className="text-gray-300">Protocol</span>
                        <select
                            value={settings.scheme}
                            onChange={(event) =>
                                handleChange('scheme')(
                                    event as React.ChangeEvent<HTMLSelectElement>,
                                )
                            }
                            className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
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
                            className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-sm md:col-span-2">
                        <span className="text-gray-300">Port</span>
                        <input
                            type="number"
                            value={settings.port}
                            onChange={handleChange('port')}
                            className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-sm md:col-span-3">
                        <span className="text-gray-300">Path</span>
                        <input
                            type="text"
                            value={settings.path}
                            onChange={handleChange('path')}
                            className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-sm md:col-span-3">
                        <span className="text-gray-300">Username</span>
                        <input
                            type="text"
                            value={settings.username}
                            onChange={handleChange('username')}
                            className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-sm md:col-span-3">
                        <span className="text-gray-300">Password</span>
                        <input
                            type="password"
                            value={settings.password}
                            onChange={handleChange('password')}
                            className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                        />
                    </label>
                </form>
            )}
        </div>
    );
};

export default ConnectionSettingsContent;
