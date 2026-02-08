import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type PropsWithChildren,
} from 'react';
import { toast } from 'sonner';

import { STEPS_SINCE_HOME_CRITICAL, STEPS_SINCE_HOME_WARNING } from '../constants/control';
import {
    parseStatusMessage,
    type NormalizedStatusMessage,
    type StatusParseError,
} from '../services/statusParser';

import { useMqtt, type ConnectionScheme } from './MqttContext';

import type { ConnectionState } from '../services/mqttClient';

const STALE_THRESHOLD_MS = 8_000;
const HEARTBEAT_TICK_MS = 500;

const createRecordKey = (source: ConnectionScheme, topicMac: string): string =>
    `${source}:${topicMac}`;

interface TileDriverRecord {
    mac: string;
    topicMac: string;
    snapshot: NormalizedStatusMessage;
    firstSeenAt: number;
    lastSeenAt: number;
    source: ConnectionScheme;
}

export type DriverPresence = 'ready' | 'stale' | 'offline';

export interface DriverView extends TileDriverRecord {
    presence: DriverPresence;
    staleForMs: number;
    brokerDisconnected: boolean;
}

export interface StatusCounts {
    totalDrivers: number;
    onlineDrivers: number;
    offlineDrivers: number;
    totalMotors: number;
    movingMotors: number;
    homedMotors: number;
    unhomedMotors: number;
    needsHomeWarningMotors: number;
    needsHomeCriticalMotors: number;
}

export interface StatusContextValue {
    drivers: DriverView[];
    counts: StatusCounts;
    schemaError: StatusParseError | null;
    brokerConnected: boolean;
    connectionState: ConnectionState;
    latestActivityAt: number | null;
    staleThresholdMs: number;
}

const defaultCounts: StatusCounts = {
    totalDrivers: 0,
    onlineDrivers: 0,
    offlineDrivers: 0,
    totalMotors: 0,
    movingMotors: 0,
    homedMotors: 0,
    unhomedMotors: 0,
    needsHomeWarningMotors: 0,
    needsHomeCriticalMotors: 0,
};

const StatusContext = createContext<StatusContextValue | undefined>(undefined);

// Extract MAC from topic like "devices/abc123/status"
const extractMacFromTopic = (topic: string): string => {
    const match = /^devices\/([^/]+)\/status$/i.exec(topic);
    return match?.[1]?.toUpperCase() ?? 'unknown';
};

export const StatusProvider: React.FC<PropsWithChildren> = ({ children }) => {
    const { subscribe, state: connectionState, settings } = useMqtt();
    const [records, setRecords] = useState<Map<string, TileDriverRecord>>(new Map());
    const [schemaError, setSchemaError] = useState<StatusParseError | null>(null);
    const [heartbeat, setHeartbeat] = useState(() => Date.now());

    // Track recent error toasts to avoid spam (keyed by MAC)
    const recentErrorToastsRef = useRef<Map<string, number>>(new Map());
    const ERROR_TOAST_DEBOUNCE_MS = 10_000; // Don't repeat toast for same device within 10s

    const activeSource = settings.scheme;
    const brokerConnected = connectionState.status === 'connected';
    const recordCount = records.size;

    useEffect(() => {
        if (recordCount === 0) {
            return;
        }
        const timer = setInterval(() => {
            setHeartbeat(Date.now());
        }, HEARTBEAT_TICK_MS);
        return () => clearInterval(timer);
    }, [recordCount]);

    const handleStatusMessage = useCallback(
        (topic: string, payload: Uint8Array) => {
            const result = parseStatusMessage(topic, payload);
            if (!result.ok) {
                const topicMac = extractMacFromTopic(topic);
                console.error('Failed to parse MQTT status payload', topic, result.error);

                // Update schema error for debugging (but don't block)
                setSchemaError(result.error);

                // Show toast with debouncing per device
                const now = Date.now();
                const lastToastTime = recentErrorToastsRef.current.get(topicMac) ?? 0;
                if (now - lastToastTime > ERROR_TOAST_DEBOUNCE_MS) {
                    recentErrorToastsRef.current.set(topicMac, now);
                    toast.error(`Status parse error from ${topicMac}`, {
                        description: result.error.message,
                        duration: 5000,
                        id: `parse-error-${topicMac}`,
                    });
                }
                return; // Skip this message, but continue processing future messages
            }

            const { value } = result;
            const now = Date.now();
            const recordKey = createRecordKey(activeSource, value.topicMac);

            setRecords((prev) => {
                const next = new Map(prev);
                const existing = next.get(recordKey);
                if (existing) {
                    next.set(recordKey, {
                        ...existing,
                        mac: value.mac,
                        snapshot: value,
                        lastSeenAt: now,
                        source: activeSource,
                    });
                    return next;
                }

                next.set(recordKey, {
                    mac: value.mac,
                    topicMac: value.topicMac,
                    snapshot: value,
                    firstSeenAt: now,
                    lastSeenAt: now,
                    source: activeSource,
                });
                return next;
            });
        },
        [activeSource],
    );

    useEffect(() => {
        const unsubscribe = subscribe('devices/+/status', handleStatusMessage, { qos: 0 });
        return () => {
            unsubscribe();
        };
    }, [handleStatusMessage, subscribe]);

    const drivers = useMemo<DriverView[]>(() => {
        const dedupedByTopic = new Map<string, TileDriverRecord>();
        for (const record of records.values()) {
            if (record.source !== activeSource) {
                continue;
            }
            const existing = dedupedByTopic.get(record.topicMac);
            if (!existing || record.lastSeenAt >= existing.lastSeenAt) {
                dedupedByTopic.set(record.topicMac, record);
            }
        }
        const sortable = Array.from(dedupedByTopic.values());
        if (sortable.length === 0) {
            return [];
        }
        return sortable
            .map((record) => {
                const elapsedMs = heartbeat - record.lastSeenAt;
                const staleForMs = Math.max(0, elapsedMs);
                const deviceOffline = record.snapshot.nodeState === 'offline';
                const presence: DriverPresence = brokerConnected
                    ? deviceOffline
                        ? 'offline'
                        : staleForMs >= STALE_THRESHOLD_MS
                          ? 'stale'
                          : 'ready'
                    : 'offline';

                return {
                    ...record,
                    presence,
                    staleForMs,
                    brokerDisconnected: !brokerConnected,
                };
            })
            .sort((a, b) => a.firstSeenAt - b.firstSeenAt);
    }, [activeSource, brokerConnected, heartbeat, records]);

    const counts = useMemo<StatusCounts>(() => {
        if (drivers.length === 0) {
            return defaultCounts;
        }

        let onlineDrivers = 0;
        let offlineDrivers = 0;
        let totalMotors = 0;
        let movingMotors = 0;
        let homedMotors = 0;
        let unhomedMotors = 0;
        let needsHomeWarningMotors = 0;
        let needsHomeCriticalMotors = 0;

        for (const record of drivers) {
            const isOnline = record.presence !== 'offline';
            if (isOnline) {
                onlineDrivers += 1;
            } else {
                offlineDrivers += 1;
            }
            for (const motor of Object.values(record.snapshot.motors)) {
                totalMotors += 1;
                if (isOnline && motor.moving) {
                    movingMotors += 1;
                }
                if (motor.homed) {
                    homedMotors += 1;
                } else {
                    unhomedMotors += 1;
                }

                if (motor.stepsSinceHome >= STEPS_SINCE_HOME_CRITICAL) {
                    needsHomeCriticalMotors += 1;
                } else if (motor.stepsSinceHome >= STEPS_SINCE_HOME_WARNING) {
                    needsHomeWarningMotors += 1;
                }
            }
        }

        return {
            totalDrivers: drivers.length,
            onlineDrivers,
            offlineDrivers,
            totalMotors,
            movingMotors,
            homedMotors,
            unhomedMotors,
            needsHomeWarningMotors,
            needsHomeCriticalMotors,
        };
    }, [drivers]);

    const latestActivityAt = useMemo(() => {
        if (drivers.length === 0) {
            return null;
        }
        return drivers.reduce(
            (max, record) => Math.max(max, record.lastSeenAt),
            drivers[0].lastSeenAt,
        );
    }, [drivers]);

    const value = useMemo<StatusContextValue>(
        () => ({
            drivers,
            counts,
            schemaError,
            brokerConnected,
            connectionState,
            latestActivityAt,
            staleThresholdMs: STALE_THRESHOLD_MS,
        }),
        [brokerConnected, connectionState, counts, drivers, latestActivityAt, schemaError],
    );

    return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
};

export const useStatusStore = (): StatusContextValue => {
    const context = useContext(StatusContext);
    if (!context) {
        throw new Error('useStatusStore must be used within a StatusProvider');
    }
    return context;
};
