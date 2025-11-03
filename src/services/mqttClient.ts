import mqtt, { type IClientOptions, type MqttClient as MqttJsClient } from 'mqtt';

import { MockMqttTransport } from './mockTransport';

export type ConnectionPhase = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface ConnectionState {
    status: ConnectionPhase;
    attempt: number;
    lastError?: string;
    nextRetryTimestamp?: number;
}

export interface ConnectRequest {
    url: string;
    username?: string;
    password?: string;
}

export type MessageHandler = (topic: string, payload: Uint8Array, packet: unknown) => void;

export interface SubscriptionOptions {
    qos?: 0 | 1 | 2;
}

export interface SubscriptionHandle {
    topic: string;
    handler: MessageHandler;
}

export interface PublishOptions {
    qos?: 0 | 1 | 2;
    retain?: boolean;
}

export type ClientFactory = (url: string, options: IClientOptions) => MqttJsClient;

const BASE_RETRY_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 30_000;

const defaultFactory: ClientFactory = (url, options) => mqtt.connect(url, options);

interface InternalSubscription {
    handlers: Set<MessageHandler>;
    options: SubscriptionOptions;
}

const splitTopic = (topic: string): string[] => topic.split('/');

const matchesFilter = (filter: string, topic: string): boolean => {
    if (filter === '#') {
        return true;
    }
    const filterLevels = splitTopic(filter);
    const topicLevels = splitTopic(topic);

    for (let i = 0; i < filterLevels.length; i += 1) {
        const filterLevel = filterLevels[i];
        const topicLevel = topicLevels[i];

        if (filterLevel === '#') {
            return true;
        }

        if (filterLevel === '+') {
            if (topicLevel === undefined) {
                return false;
            }
            continue;
        }

        if (topicLevel === undefined) {
            return false;
        }

        if (filterLevel !== topicLevel) {
            return false;
        }
    }

    return filterLevels.length === topicLevels.length;
};

type StateListener = (state: ConnectionState) => void;

export class MirrorMqttClient {
    private readonly createClient: ClientFactory;

    private client: MqttJsClient | null = null;

    private listeners = new Set<StateListener>();

    private messageListeners = new Map<string, InternalSubscription>();

    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    private currentState: ConnectionState = { status: 'disconnected', attempt: 0 };

    private reconnectAttempts = 0;

    private lastConnectRequest: ConnectRequest | null = null;

    private disposed = false;

    private mockMode = false;

    private mockTransport: MockMqttTransport | null = null;

    constructor(factory: ClientFactory = defaultFactory) {
        this.createClient = factory;
    }

    public getState(): ConnectionState {
        return this.currentState;
    }

    public onStateChange(listener: StateListener): () => void {
        this.listeners.add(listener);
        listener(this.currentState);
        return () => this.listeners.delete(listener);
    }

    public connect(request: ConnectRequest): void {
        this.disposed = false;
        this.clearReconnectTimer();
        this.lastConnectRequest = request;
        this.reconnectAttempts = 0;
        this.mockMode = request.url.startsWith('mock://');
        if (this.mockMode) {
            if (!this.mockTransport) {
                this.mockTransport = new MockMqttTransport();
            }
            this.mockTransport.connect((message) => {
                this.handleMessage(message.topic, message.payload, null);
            });
            this.updateState({ status: 'connected', attempt: 0 });
            return;
        }
        this.updateState({ status: 'connecting', attempt: 0 });
        this.createAndAttachClient(request);
    }

    public manualReconnect(): void {
        if (!this.lastConnectRequest) {
            return;
        }
        this.clearReconnectTimer();
        this.reconnectAttempts = 0;
        if (this.mockMode) {
            this.mockTransport?.disconnect();
            this.updateState({ status: 'connected', attempt: 0 });
            return;
        }
        this.updateState({ status: 'connecting', attempt: 0 });
        this.createAndAttachClient(this.lastConnectRequest);
    }

    public disconnect(): void {
        this.disposed = true;
        this.clearReconnectTimer();
        if (this.client) {
            this.client.removeAllListeners();
            this.client.end(true);
            this.client = null;
        }
        if (this.mockMode) {
            this.mockTransport?.disconnect();
        }
        this.updateState({ status: 'disconnected', attempt: 0 });
    }

    public subscribe(
        topic: string,
        handler: MessageHandler,
        options: SubscriptionOptions = {},
    ): () => void {
        const entry = this.upsertSubscription(topic, options);
        entry.handlers.add(handler);

        if (this.client && this.currentState.status === 'connected') {
            this.client.subscribe(topic, { qos: options.qos ?? 0 }, (error) => {
                if (error) {
                    console.error('Failed to subscribe to topic', topic, error);
                }
            });
        }

        return () => {
            const existing = this.messageListeners.get(topic);
            if (!existing) {
                return;
            }
            existing.handlers.delete(handler);
            if (existing.handlers.size === 0) {
                this.messageListeners.delete(topic);
                if (this.client && this.currentState.status === 'connected') {
                    this.client.unsubscribe(topic, (error) => {
                        if (error) {
                            console.error('Failed to unsubscribe from topic', topic, error);
                        }
                    });
                }
            }
        };
    }

    public publish(topic: string, payload: string, options: PublishOptions = {}): Promise<void> {
        if (this.mockMode) {
            return (
                this.mockTransport?.publish(
                    topic,
                    typeof payload === 'string' ? payload : String(payload),
                ) ?? Promise.resolve()
            );
        }

        if (!this.client || this.currentState.status !== 'connected') {
            return Promise.reject(new Error('MQTT client is not connected'));
        }

        return new Promise((resolve, reject) => {
            this.client?.publish(topic, payload, options, (error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
    }

    public dispose(): void {
        this.disconnect();
        this.listeners.clear();
        this.messageListeners.clear();
    }

    private createAndAttachClient(request: ConnectRequest): void {
        const url = request.url;
        const options: IClientOptions = {
            username: request.username,
            password: request.password,
            reconnectPeriod: 0,
            clean: true,
            keepalive: 60,
        };

        try {
            this.client = this.createClient(url, options);
        } catch (error) {
            console.error('Failed to create MQTT client', error);
            this.scheduleReconnect(
                'disconnected',
                error instanceof Error ? error.message : 'Failed to create client',
            );
            return;
        }

        this.client.on('connect', this.handleConnect);
        this.client.on('reconnect', this.handleReconnectRequest);
        this.client.on('close', this.handleClose);
        this.client.on('end', this.handleEnd);
        this.client.on('error', this.handleError);
        this.client.on('message', this.handleMessage);
    }

    private handleConnect = (): void => {
        this.clearReconnectTimer();
        this.reconnectAttempts = 0;
        this.updateState({ status: 'connected', attempt: 0 });
        this.restoreSubscriptions();
    };

    private handleReconnectRequest = (): void => {
        if (this.currentState.status !== 'reconnecting') {
            this.updateState({ status: 'reconnecting', attempt: this.reconnectAttempts });
        }
    };

    private handleClose = (): void => {
        if (this.disposed) {
            return;
        }
        this.scheduleReconnect('reconnecting', this.currentState.lastError);
    };

    private handleEnd = (): void => {
        if (this.disposed) {
            return;
        }
        this.scheduleReconnect('reconnecting', this.currentState.lastError);
    };

    private handleError = (error: Error): void => {
        if (this.disposed) {
            return;
        }
        this.scheduleReconnect('reconnecting', error.message);
    };

    private handleMessage = (topic: string, payload: Uint8Array, packet: unknown): void => {
        for (const [filter, subscription] of this.messageListeners.entries()) {
            if (matchesFilter(filter, topic)) {
                subscription.handlers.forEach((handler) => {
                    handler(topic, payload, packet);
                });
            }
        }
    };

    private restoreSubscriptions(): void {
        if (!this.client) {
            return;
        }
        for (const [topic, entry] of this.messageListeners.entries()) {
            this.client.subscribe(topic, { qos: entry.options.qos ?? 0 }, (error) => {
                if (error) {
                    console.error('Failed to resubscribe to topic', topic, error);
                }
            });
        }
    }

    private upsertSubscription(topic: string, options: SubscriptionOptions): InternalSubscription {
        const existing = this.messageListeners.get(topic);
        if (existing) {
            return existing;
        }
        const entry: InternalSubscription = {
            handlers: new Set(),
            options,
        };
        this.messageListeners.set(topic, entry);
        return entry;
    }

    private scheduleReconnect(status: ConnectionPhase, errorMessage?: string): void {
        if (this.disposed || !this.lastConnectRequest || this.mockMode) {
            this.updateState({ status: 'disconnected', attempt: 0, lastError: errorMessage });
            return;
        }

        this.clearReconnectTimer();
        this.reconnectAttempts += 1;
        const exponent = this.reconnectAttempts - 1;
        const baseDelay = BASE_RETRY_DELAY_MS * Math.pow(2, Math.max(0, exponent));
        const delay = Math.min(baseDelay, MAX_RETRY_DELAY_MS);
        const nextRetryTimestamp = Date.now() + delay;

        this.updateState({
            status,
            attempt: this.reconnectAttempts,
            lastError: errorMessage,
            nextRetryTimestamp,
        });

        this.reconnectTimer = setTimeout(() => {
            if (!this.lastConnectRequest) {
                return;
            }
            this.updateState({
                status: 'connecting',
                attempt: this.reconnectAttempts,
                lastError: undefined,
            });
            this.createAndAttachClient(this.lastConnectRequest);
        }, delay);
    }

    private clearReconnectTimer(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    private updateState(state: ConnectionState): void {
        this.currentState = state;
        this.listeners.forEach((listener) => listener(state));
    }
}

export const createUuid = (): string => {
    const globalCrypto = globalThis.crypto;
    if (globalCrypto?.randomUUID) {
        return globalCrypto.randomUUID();
    }
    const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
    return template.replace(/[xy]/g, (char) => {
        const rand = Math.floor(Math.random() * 16);
        if (char === 'x') {
            return rand.toString(16);
        }
        const value = (rand & 0x3) | 0x8;
        return value.toString(16);
    });
};

export const topicMatchesFilter = matchesFilter;
