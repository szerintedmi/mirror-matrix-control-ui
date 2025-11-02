import { EventEmitter } from 'events';

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import {
    MirrorMqttClient,
    topicMatchesFilter,
    type ClientFactory,
    type ConnectRequest,
    type ConnectionState,
} from '../mqttClient';

import type { MqttClient as MqttJsClient } from 'mqtt';

class FakeMqttClient extends EventEmitter {
    public subscribe(): void {
        /* noop */
    }

    public unsubscribe(): void {
        /* noop */
    }

    public publish(_topic: string, _payload: string, _options: unknown, cb: (error?: Error | null) => void): void {
        cb(null);
    }

    public end(): void {
        this.emit('end');
    }

    public removeAllListeners(): this {
        return super.removeAllListeners();
    }
}

describe('MirrorMqttClient', () => {
    let fake: FakeMqttClient;
    let factory: ReturnType<typeof vi.fn<ClientFactory>>;
    let client: MirrorMqttClient;

    beforeEach(() => {
        fake = new FakeMqttClient();
        const factoryImpl: ClientFactory = () => fake as unknown as MqttJsClient;
        factory = vi.fn<ClientFactory>(factoryImpl);
        client = new MirrorMqttClient(factory);
    });

    afterEach(() => {
        client.dispose();
        vi.useRealTimers();
    });

    const connectRequest: ConnectRequest = {
        url: 'ws://localhost:9001',
        username: 'mirror',
        password: 'steelthread',
    };

    it('emits connected state when broker connection succeeds', () => {
        const states: ConnectionState[] = [];
        client.onStateChange((state) => {
            states.push(state);
        });

        client.connect(connectRequest);
        fake.emit('connect');

        expect(states.at(-1)?.status).toBe('connected');
        expect(factory).toHaveBeenCalledTimes(1);
    });

    it('schedules reconnect with exponential backoff on error', () => {
        vi.useFakeTimers();
        const states: ConnectionState[] = [];
        client.onStateChange((state) => {
            states.push(state);
        });

        client.connect(connectRequest);
        fake.emit('error', new Error('broker down'));

        const reconnectState = states.at(-1);
        expect(reconnectState?.status).toBe('reconnecting');
        expect(reconnectState?.attempt).toBe(1);
        expect(reconnectState?.nextRetryTimestamp).toBeDefined();

        vi.advanceTimersByTime(2_000);
        expect(factory).toHaveBeenCalledTimes(2);
    });

    it('resets attempts after manual reconnect', () => {
        vi.useFakeTimers();
        const states: ConnectionState[] = [];
        client.onStateChange((state) => {
            states.push(state);
        });

        client.connect(connectRequest);
        fake.emit('error', new Error('broker down'));
        vi.advanceTimersByTime(2_000);
        fake.emit('error', new Error('still down'));

        expect(states.at(-1)?.attempt).toBeGreaterThanOrEqual(2);

        client.manualReconnect();

        const lastState = states.at(-1);
        expect(lastState?.status).toBe('connecting');
        expect(lastState?.attempt).toBe(0);
    });
});

describe('topicMatchesFilter', () => {
    it('matches wildcards correctly', () => {
        expect(topicMatchesFilter('devices/+/status', 'devices/abc/status')).toBe(true);
        expect(topicMatchesFilter('devices/#', 'devices/abc/cmd')).toBe(true);
        expect(topicMatchesFilter('devices/abc/status', 'devices/abc/status')).toBe(true);
        expect(topicMatchesFilter('devices/+/status', 'devices/abc/cmd')).toBe(false);
    });
});
