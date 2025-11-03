import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import {
    MirrorMqttClient,
    type ConnectionState,
    createUuid,
    type MessageHandler,
    type PublishOptions,
    type SubscriptionOptions,
} from '../services/mqttClient';

export type ConnectionScheme = 'ws' | 'wss' | 'mock';

export interface ConnectionSettings {
    scheme: ConnectionScheme;
    host: string;
    port: number;
    path: string;
    username: string;
    password: string;
}

const DEFAULT_SETTINGS: ConnectionSettings = {
    scheme: 'ws',
    host: 'localhost',
    port: 9001,
    path: '/',
    username: 'mirror',
    password: 'steelthread',
};

export const MQTT_SETTINGS_STORAGE_KEY = 'mirror:mqtt:settings';

const isScheme = (value: unknown): value is ConnectionScheme =>
    value === 'ws' || value === 'wss' || value === 'mock';

const ensureLeadingSlash = (path: string): string => {
    if (!path) {
        return '/';
    }
    return path.startsWith('/') ? path : `/${path}`;
};

const buildUrl = (settings: ConnectionSettings): string =>
    `${settings.scheme}://${settings.host}:${settings.port}${ensureLeadingSlash(settings.path)}`;

const normalizeSettings = (settings: ConnectionSettings): ConnectionSettings => {
    const trimmedHost = settings.host.trim();
    const trimmedPath = settings.path.trim();
    const port = Number.isFinite(settings.port) ? settings.port : DEFAULT_SETTINGS.port;

    return {
        scheme: isScheme(settings.scheme) ? settings.scheme : DEFAULT_SETTINGS.scheme,
        host: trimmedHost.length > 0 ? trimmedHost : DEFAULT_SETTINGS.host,
        port,
        path: ensureLeadingSlash(trimmedPath),
        username: settings.username,
        password: settings.password,
    };
};

const mergeWithDefaults = (partial: Partial<ConnectionSettings>): ConnectionSettings =>
    normalizeSettings({ ...DEFAULT_SETTINGS, ...partial });

const loadStoredSettings = (storage: Storage | undefined): ConnectionSettings => {
    if (!storage) {
        return DEFAULT_SETTINGS;
    }

    const raw = storage.getItem(MQTT_SETTINGS_STORAGE_KEY);
    if (!raw) {
        return DEFAULT_SETTINGS;
    }

    try {
        const parsed = JSON.parse(raw) as Partial<ConnectionSettings>;
        if (!parsed || typeof parsed !== 'object') {
            return DEFAULT_SETTINGS;
        }
        return mergeWithDefaults(parsed);
    } catch (error) {
        console.warn('Failed to parse stored MQTT settings, falling back to defaults', error);
        return DEFAULT_SETTINGS;
    }
};

const persistSettings = (storage: Storage | undefined, settings: ConnectionSettings): void => {
    if (!storage) {
        return;
    }
    try {
        storage.setItem(MQTT_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
        console.warn('Failed to persist MQTT settings', error);
    }
};

export interface MqttContextValue {
    settings: ConnectionSettings;
    updateSettings: (partial: Partial<ConnectionSettings>) => void;
    replaceSettings: (next: ConnectionSettings) => void;
    state: ConnectionState;
    connect: () => void;
    disconnect: () => void;
    manualReconnect: () => void;
    createCommandId: () => string;
    connectionUrl: string;
    subscribe: (
        topic: string,
        handler: MessageHandler,
        options?: SubscriptionOptions,
    ) => () => void;
    publish: (topic: string, payload: string, options?: PublishOptions) => Promise<void>;
}

const MqttContext = createContext<MqttContextValue | undefined>(undefined);

interface ProviderProps {
    children: React.ReactNode;
    client?: MirrorMqttClient;
    storage?: Storage;
}

export const MqttProvider: React.FC<ProviderProps> = ({
    children,
    client: providedClient,
    storage,
}) => {
    const resolvedStorage =
        storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    const shouldDisposeClient = !providedClient;
    const [client] = useState(() => providedClient ?? new MirrorMqttClient());
    const [settings, setSettings] = useState<ConnectionSettings>(() =>
        loadStoredSettings(resolvedStorage),
    );
    const [state, setState] = useState<ConnectionState>({ status: 'disconnected', attempt: 0 });
    const manualDisconnectRef = useRef(false);

    useEffect(() => {
        const unsubscribe = client.onStateChange((nextState) => {
            setState(nextState);
        });
        return () => {
            unsubscribe();
            if (shouldDisposeClient) {
                client.dispose();
            }
        };
    }, [client, shouldDisposeClient]);

    useEffect(() => {
        persistSettings(resolvedStorage, settings);
    }, [resolvedStorage, settings]);

    const connectUsingSettings = useCallback(() => {
        client.connect({
            url: buildUrl(settings),
            username: settings.username,
            password: settings.password,
        });
    }, [client, settings]);

    useEffect(() => {
        if (manualDisconnectRef.current) {
            return;
        }
        connectUsingSettings();
    }, [connectUsingSettings]);

    const updateSettings = useCallback((partial: Partial<ConnectionSettings>) => {
        setSettings((prev) => mergeWithDefaults({ ...prev, ...partial }));
    }, []);

    const replaceSettings = useCallback((next: ConnectionSettings) => {
        setSettings(mergeWithDefaults(next));
    }, []);

    const connect = useCallback(() => {
        manualDisconnectRef.current = false;
        connectUsingSettings();
    }, [connectUsingSettings]);

    const disconnect = useCallback(() => {
        manualDisconnectRef.current = true;
        client.disconnect();
    }, [client]);

    const manualReconnect = useCallback(() => {
        manualDisconnectRef.current = false;
        client.manualReconnect();
    }, [client]);

    const createCommandId = useCallback(() => createUuid(), []);

    const subscribe = useCallback(
        (topic: string, handler: MessageHandler, options?: SubscriptionOptions) =>
            client.subscribe(topic, handler, options),
        [client],
    );

    const publish = useCallback(
        (topic: string, payload: string, options?: PublishOptions) =>
            client.publish(topic, payload, options),
        [client],
    );

    const connectionUrl = useMemo(() => buildUrl(settings), [settings]);

    const value: MqttContextValue = useMemo(
        () => ({
            settings,
            updateSettings,
            replaceSettings,
            state,
            connect,
            disconnect,
            manualReconnect,
            createCommandId,
            connectionUrl,
            subscribe,
            publish,
        }),
        [
            connect,
            connectionUrl,
            createCommandId,
            disconnect,
            manualReconnect,
            publish,
            replaceSettings,
            settings,
            state,
            subscribe,
            updateSettings,
        ],
    );

    return <MqttContext.Provider value={value}>{children}</MqttContext.Provider>;
};

export const useMqtt = (): MqttContextValue => {
    const context = useContext(MqttContext);
    if (!context) {
        throw new Error('useMqtt must be used within an MqttProvider');
    }
    return context;
};

export const getDefaultConnectionSettings = (): ConnectionSettings => ({ ...DEFAULT_SETTINGS });
