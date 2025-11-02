import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import {
    MqttProvider,
    MQTT_SETTINGS_STORAGE_KEY,
    useMqtt,
    type ConnectionSettings,
} from '../MqttContext';

import type { ConnectionState, MirrorMqttClient } from '../../services/mqttClient';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class StubMqttClient {
    private listeners = new Set<(state: ConnectionState) => void>();

    private state: ConnectionState = { status: 'disconnected', attempt: 0 };

    public onStateChange(listener: (state: ConnectionState) => void): () => void {
        this.listeners.add(listener);
        listener(this.state);
        return () => {
            this.listeners.delete(listener);
        };
    }

    public connect(): void {
        this.updateState({ status: 'connected', attempt: 0 });
    }

    public disconnect(): void {
        this.updateState({ status: 'disconnected', attempt: 0 });
    }

    public manualReconnect(): void {
        this.updateState({ status: 'connecting', attempt: 0 });
    }

    public dispose(): void {
        this.listeners.clear();
    }

    private updateState(next: ConnectionState): void {
        this.state = next;
        this.listeners.forEach((listener) => listener(next));
    }
}

class MemoryStorage implements Storage {
    private store = new Map<string, string>();

    public readonly clearMock = vi.fn(() => {
        this.store.clear();
    });

    public readonly getItemMock = vi.fn((key: string) => this.store.get(key) ?? null);

    public readonly keyMock = vi.fn((index: number) => Array.from(this.store.keys())[index] ?? null);

    public readonly removeItemMock = vi.fn((key: string) => {
        this.store.delete(key);
    });

    public readonly setItemMock = vi.fn((key: string, value: string) => {
        this.store.set(key, value);
    });

    constructor(initial: Record<string, string> = {}) {
        Object.entries(initial).forEach(([key, value]) => {
            this.store.set(key, value);
        });
    }

    public get length(): number {
        return this.store.size;
    }

    public clear(): void {
        this.clearMock();
    }

    public getItem(key: string): string | null {
        return this.getItemMock(key);
    }

    public key(index: number): string | null {
        return this.keyMock(index);
    }

    public removeItem(key: string): void {
        this.removeItemMock(key);
    }

    public setItem(key: string, value: string): void {
        this.setItemMock(key, value);
    }
}

const createStorage = (initial: Record<string, string> = {}): MemoryStorage => new MemoryStorage(initial);

const stubClient = (): MirrorMqttClient => new StubMqttClient() as unknown as MirrorMqttClient;

describe('MqttProvider storage integration', () => {
    it('hydrates settings from storage on mount', () => {
        const storedSettings: Partial<ConnectionSettings> = {
            scheme: 'mock',
            host: 'broker.local',
            port: 1884,
            path: 'control',
            username: 'persistUser',
            password: 'persistPass',
        };
        const storage = createStorage({
            [MQTT_SETTINGS_STORAGE_KEY]: JSON.stringify(storedSettings),
        });

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        const TestComponent: React.FC = () => {
            const { settings } = useMqtt();
            return (
                <div
                    data-role="settings"
                    data-scheme={settings.scheme}
                    data-host={settings.host}
                    data-path={settings.path}
                />
            );
        };

        act(() => {
            root.render(
                <MqttProvider storage={storage} client={stubClient()}>
                    <TestComponent />
                </MqttProvider>,
            );
        });

        const node = container.querySelector('[data-role="settings"]') as HTMLElement;
        expect(node.dataset.scheme).toBe('mock');
        expect(node.dataset.host).toBe('broker.local');
        expect(node.dataset.path).toBe('/control');

        act(() => {
            root.unmount();
        });
        document.body.removeChild(container);
    });

    it('persists updates to storage when settings change', () => {
        const storage = createStorage();

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        const TestComponent: React.FC = () => {
            const { settings, updateSettings } = useMqtt();
            return (
                <div>
                    <span data-role="host">{settings.host}</span>
                    <button
                        data-role="update"
                        type="button"
                        onClick={() => updateSettings({ host: 'perma.local', path: 'persist' })}
                    >
                        Update
                    </button>
                </div>
            );
        };

        act(() => {
            root.render(
                <MqttProvider storage={storage} client={stubClient()}>
                    <TestComponent />
                </MqttProvider>,
            );
        });

        const button = container.querySelector('[data-role="update"]') as HTMLButtonElement;

        act(() => {
            button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const hostLabel = container.querySelector('[data-role="host"]') as HTMLElement;
        expect(hostLabel.textContent).toBe('perma.local');

        const setItemCalls = storage.setItemMock.mock.calls;
        const lastCall = setItemCalls.at(-1);
        expect(lastCall).toBeDefined();
        const payload = lastCall?.[1];
        expect(payload).toBeDefined();
        const parsed = JSON.parse(String(payload));
        expect(parsed.host).toBe('perma.local');
        expect(parsed.path).toBe('/persist');

        act(() => {
            root.unmount();
        });
        document.body.removeChild(container);
    });
});
