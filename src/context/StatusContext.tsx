import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type PropsWithChildren,
} from 'react';

import { STEPS_SINCE_HOME_CRITICAL, STEPS_SINCE_HOME_WARNING } from '../constants/control';
import {
    parseStatusMessage,
    type NormalizedStatusMessage,
    type StatusParseError,
} from '../services/statusParser';

import { useMqtt, type ConnectionScheme } from './MqttContext';

import type { ConnectionState } from '../services/mqttClient';

const STALE_THRESHOLD_MS = 2_000;
const HEARTBEAT_TICK_MS = 500;

const createRecordKey = (source: ConnectionScheme, topicMac: string): string =>
    `${source}:${topicMac}`;

interface TileDriverRecord {
    mac: string;
    topicMac: string;
    snapshot: NormalizedStatusMessage;
    firstSeenAt: number;
    lastSeenAt: number;
    isNew: boolean;
    acknowledgedAt?: number;
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
    discoveryCount: number;
    acknowledgeDriver: (mac: string) => void;
    acknowledgeAll: () => void;
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

export const StatusProvider: React.FC<PropsWithChildren> = ({ children }) => {
    const { subscribe, state: connectionState, settings } = useMqtt();
    const [records, setRecords] = useState<Map<string, TileDriverRecord>>(new Map());
    const [schemaError, setSchemaError] = useState<StatusParseError | null>(null);
    const [heartbeat, setHeartbeat] = useState(() => Date.now());

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
            if (schemaError) {
                return;
            }
            const result = parseStatusMessage(topic, payload);
            if (!result.ok) {
                console.error('Failed to parse MQTT status payload', result.error);
                setSchemaError(result.error);
                return;
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
                    isNew: true,
                    source: activeSource,
                });
                return next;
            });
        },
        [activeSource, schemaError],
    );

    useEffect(() => {
        if (schemaError) {
            return;
        }
        const unsubscribe = subscribe('devices/+/status', handleStatusMessage, { qos: 0 });
        return () => {
            unsubscribe();
        };
    }, [handleStatusMessage, schemaError, subscribe]);

    const acknowledgeDriver = useCallback(
        (mac: string) => {
            setRecords((prev) => {
                let targetKey: string | null = null;
                let targetRecord: TileDriverRecord | undefined;

                for (const [key, record] of prev.entries()) {
                    if (record.mac === mac && record.source === activeSource) {
                        targetKey = key;
                        targetRecord = record;
                        break;
                    }
                }

                if (!targetKey || !targetRecord || !targetRecord.isNew) {
                    return prev;
                }

                const next = new Map(prev);
                next.set(targetKey, {
                    ...targetRecord,
                    isNew: false,
                    acknowledgedAt: Date.now(),
                });
                return next;
            });
        },
        [activeSource],
    );

    const acknowledgeAll = useCallback(() => {
        setRecords((prev) => {
            let mutated = false;
            const next = new Map(prev);
            for (const [key, record] of next.entries()) {
                if (record.source !== activeSource || !record.isNew) {
                    continue;
                }
                mutated = true;
                next.set(key, {
                    ...record,
                    isNew: false,
                    acknowledgedAt: Date.now(),
                });
            }
            return mutated ? next : prev;
        });
    }, [activeSource]);

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
            .sort((a, b) => {
                if (a.isNew !== b.isNew) {
                    return a.isNew ? -1 : 1;
                }
                return a.firstSeenAt - b.firstSeenAt;
            });
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

    const discoveryCount = useMemo(
        () => drivers.filter((record) => record.isNew).length,
        [drivers],
    );

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
            discoveryCount,
            acknowledgeDriver,
            acknowledgeAll,
            schemaError,
            brokerConnected,
            connectionState,
            latestActivityAt,
            staleThresholdMs: STALE_THRESHOLD_MS,
        }),
        [
            acknowledgeAll,
            acknowledgeDriver,
            brokerConnected,
            connectionState,
            counts,
            discoveryCount,
            drivers,
            latestActivityAt,
            schemaError,
        ],
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
