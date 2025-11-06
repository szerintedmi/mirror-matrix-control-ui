import type { ConnectionState } from '../services/mqttClient';

const statusLabel: Record<ConnectionState['status'], string> = {
    disconnected: 'Disconnected',
    connecting: 'Connecting…',
    connected: 'Connected',
    reconnecting: 'Reconnecting…',
};

export const getConnectionStatusLabel = (state: ConnectionState): string =>
    statusLabel[state.status] ?? state.status;

export const formatRetryCountdown = (timestamp: number | undefined, now: number): string | null => {
    if (!timestamp) {
        return null;
    }
    const remaining = Math.max(0, timestamp - now);
    if (remaining < 1_000) {
        return `${Math.ceil(remaining / 100)}00 ms`;
    }
    return `${Math.ceil(remaining / 1_000)} s`;
};

export const isConnectionOffline = (state: ConnectionState): boolean =>
    state.status === 'disconnected' || state.status === 'reconnecting';
