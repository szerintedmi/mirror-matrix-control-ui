import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import {
    topicMatchesFilter,
    type ConnectionState,
    type MessageHandler,
    type MirrorMqttClient,
    type PublishOptions,
    type SubscriptionOptions,
} from '../../services/mqttClient';
import { MqttProvider, useMqtt, type ConnectionScheme } from '../MqttContext';
import { StatusProvider, useStatusStore } from '../StatusContext';

// Enable act() support for Vitest's JSDOM environment
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class StatusStubClient {
    private listeners = new Set<(state: ConnectionState) => void>();

    private subscriptions = new Map<string, Set<MessageHandler>>();

    private state: ConnectionState = { status: 'disconnected', attempt: 0 };

    public connect(request: { url: string; username?: string; password?: string }): void {
        void request;
        this.updateState({ status: 'connected', attempt: 0 });
    }

    public disconnect(): void {
        this.updateState({ status: 'disconnected', attempt: 0 });
    }

    public manualReconnect(): void {
        this.updateState({ status: 'connecting', attempt: 0 });
    }

    public onStateChange(listener: (state: ConnectionState) => void): () => void {
        this.listeners.add(listener);
        listener(this.state);
        return () => {
            this.listeners.delete(listener);
        };
    }

    public subscribe(
        topic: string,
        handler: MessageHandler,
        options?: SubscriptionOptions,
    ): () => void {
        void options;
        const existing = this.subscriptions.get(topic) ?? new Set<MessageHandler>();
        existing.add(handler);
        this.subscriptions.set(topic, existing);
        return () => {
            const current = this.subscriptions.get(topic);
            if (!current) {
                return;
            }
            current.delete(handler);
            if (current.size === 0) {
                this.subscriptions.delete(topic);
            }
        };
    }

    public publish(
        topic: string,
        payload: string,
        options?: PublishOptions | undefined,
    ): Promise<void> {
        void topic;
        void payload;
        void options;
        return Promise.resolve();
    }

    public dispose(): void {
        this.listeners.clear();
        this.subscriptions.clear();
    }

    public emit(topic: string, payload: Uint8Array): void {
        for (const [filter, handlers] of this.subscriptions.entries()) {
            if (topicMatchesFilter(filter, topic)) {
                handlers.forEach((handler) => handler(topic, payload, undefined));
            }
        }
    }

    private updateState(next: ConnectionState): void {
        this.state = next;
        this.listeners.forEach((listener) => listener(next));
    }
}

const encode = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));

const createContainer = () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    return { container, root };
};

const destroyContainer = ({ container, root }: ReturnType<typeof createContainer>) => {
    act(() => {
        root.unmount();
    });
    document.body.removeChild(container);
};

const TestConsumer: React.FC = () => {
    const { drivers, counts, schemaError, staleThresholdMs } = useStatusStore();
    const firstDriver = drivers[0];
    return (
        <div
            data-role="state"
            data-drivers={drivers.length}
            data-online={counts.onlineDrivers}
            data-error={schemaError ? 'error' : 'ok'}
            data-presence={firstDriver?.presence ?? ''}
            data-stale={firstDriver ? String(firstDriver.staleForMs) : '0'}
            data-broker-offline={firstDriver?.brokerDisconnected ? '1' : '0'}
            data-stale-threshold={String(staleThresholdMs)}
        />
    );
};

const SchemeSwitcher: React.FC<{ scheme: ConnectionScheme }> = ({ scheme }) => {
    const { updateSettings } = useMqtt();
    return (
        <button
            type="button"
            data-role={`scheme-${scheme}`}
            onClick={() => updateSettings({ scheme })}
        >
            Switch {scheme}
        </button>
    );
};

describe('StatusProvider', () => {
    it('tracks discovered drivers', () => {
        const client = new StatusStubClient();
        const { container, root } = createContainer();

        act(() => {
            root.render(
                <MqttProvider client={client as unknown as MirrorMqttClient}>
                    <StatusProvider>
                        <TestConsumer />
                    </StatusProvider>
                </MqttProvider>,
            );
        });

        act(() => {
            client.emit(
                'devices/AA11/status',
                encode({
                    node_state: 'ready',
                    motors: {
                        '0': {
                            id: 0,
                            position: 5,
                            moving: true,
                            awake: true,
                            homed: true,
                            steps_since_home: 0,
                            budget_s: 90,
                            ttfc_s: 0,
                            speed: 4000,
                            accel: 12000,
                            est_ms: 0,
                            started_ms: 0,
                            actual_ms: 0,
                        },
                    },
                }),
            );
        });

        const stateNode = container.querySelector('[data-role="state"]') as HTMLElement;
        expect(stateNode.dataset.drivers).toBe('1');
        expect(stateNode.dataset.online).toBe('1');
        expect(stateNode.dataset.presence).toBe('ready');

        destroyContainer({ container, root });
    });

    it('marks drivers stale after heartbeat delay and offline on broker disconnect', () => {
        vi.useFakeTimers();
        const client = new StatusStubClient();
        const { container, root } = createContainer();

        act(() => {
            root.render(
                <MqttProvider client={client as unknown as MirrorMqttClient}>
                    <StatusProvider>
                        <TestConsumer />
                    </StatusProvider>
                </MqttProvider>,
            );
        });

        act(() => {
            client.emit(
                'devices/AA11/status',
                encode({
                    node_state: 'ready',
                    motors: {
                        '0': {
                            id: 0,
                            position: 0,
                            moving: false,
                            awake: true,
                            homed: true,
                            steps_since_home: 0,
                            budget_s: 120,
                            ttfc_s: 0,
                            speed: 4000,
                            accel: 16000,
                            est_ms: 0,
                            started_ms: 0,
                            actual_ms: 0,
                        },
                    },
                }),
            );
        });

        const stateNode = container.querySelector('[data-role="state"]') as HTMLElement;
        expect(stateNode.dataset.presence).toBe('ready');

        act(() => {
            vi.advanceTimersByTime(2_100);
        });

        expect(stateNode.dataset.presence).toBe('stale');
        expect(Number(stateNode.dataset.stale)).toBeGreaterThanOrEqual(2_000);

        act(() => {
            client.disconnect();
        });

        expect(stateNode.dataset.presence).toBe('offline');
        expect(stateNode.dataset['brokerOffline']).toBe('1');

        act(() => {
            client.connect({ url: 'mock://', username: undefined, password: undefined });
        });

        expect(stateNode.dataset.presence).toBe('stale');

        destroyContainer({ container, root });
        vi.useRealTimers();
    });

    it('records schema errors but continues processing subsequent valid messages', () => {
        const client = new StatusStubClient();
        const { container, root } = createContainer();
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        act(() => {
            root.render(
                <MqttProvider client={client as unknown as MirrorMqttClient}>
                    <StatusProvider>
                        <TestConsumer />
                    </StatusProvider>
                </MqttProvider>,
            );
        });

        // Send an invalid message (missing node_state)
        act(() => {
            client.emit('devices/AA/status', encode({ motors: {} }));
        });

        const stateNode = container.querySelector('[data-role="state"]') as HTMLElement;
        // Error should be recorded
        expect(stateNode.dataset.error).toBe('error');
        // No valid drivers yet
        expect(stateNode.dataset.drivers).toBe('0');

        // Send a valid message - should be processed despite previous error
        act(() => {
            client.emit(
                'devices/BB/status',
                encode({
                    node_state: 'ready',
                    motors: {},
                }),
            );
        });

        // Valid message should now be processed (behavior changed from halting to continuing)
        expect(stateNode.dataset.drivers).toBe('1');

        destroyContainer({ container, root });
        errorSpy.mockRestore();
    });

    it('filters drivers by active connection scheme', () => {
        const client = new StatusStubClient();
        const { container, root } = createContainer();

        act(() => {
            root.render(
                <MqttProvider client={client as unknown as MirrorMqttClient}>
                    <StatusProvider>
                        <TestConsumer />
                        <SchemeSwitcher scheme="mock" />
                    </StatusProvider>
                </MqttProvider>,
            );
        });

        act(() => {
            client.emit(
                'devices/AA11/status',
                encode({
                    node_state: 'ready',
                    motors: {
                        '0': {
                            id: 0,
                            position: 5,
                            moving: false,
                            awake: true,
                            homed: true,
                            steps_since_home: 0,
                            budget_s: 90,
                            ttfc_s: 0,
                            speed: 4000,
                            accel: 12000,
                            est_ms: 0,
                            started_ms: 0,
                            actual_ms: 0,
                        },
                    },
                }),
            );
        });

        const stateNode = container.querySelector('[data-role="state"]') as HTMLElement;
        expect(stateNode.dataset.drivers).toBe('1');

        const switchButton = container.querySelector(
            '[data-role="scheme-mock"]',
        ) as HTMLButtonElement;

        act(() => {
            switchButton.click();
        });

        expect(stateNode.dataset.drivers).toBe('0');

        act(() => {
            client.emit(
                'devices/AA11/status',
                encode({
                    node_state: 'ready',
                    motors: {
                        '0': {
                            id: 0,
                            position: 10,
                            moving: true,
                            awake: true,
                            homed: true,
                            steps_since_home: 0,
                            budget_s: 90,
                            ttfc_s: 0,
                            speed: 4000,
                            accel: 12000,
                            est_ms: 0,
                            started_ms: 0,
                            actual_ms: 0,
                        },
                    },
                }),
            );
        });

        expect(stateNode.dataset.drivers).toBe('1');

        destroyContainer({ container, root });
    });
});
