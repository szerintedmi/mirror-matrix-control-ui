import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MockMqttTransport, getMockNodes, getMockTileDrivers } from '../mockTransport';

describe('mock transport nodes', () => {
    it('returns deterministic node summaries', () => {
        const first = getMockNodes();
        const second = getMockNodes();

        expect(first).toHaveLength(2); // offline node filtered out
        expect(second).toHaveLength(2);
        expect(first[0]).not.toBe(second[0]);
        expect(first[0].macAddress).toBe('AA:11:BB:22:CC:33');
        expect(first[0].motors).toHaveLength(6);
    });
});

describe('MockMqttTransport messaging', () => {
    const handler = vi.fn();

    beforeEach(() => {
        handler.mockReset();
    });

    it('emits status payloads on connect', () => {
        vi.useFakeTimers();
        const transport = new MockMqttTransport(getMockTileDrivers());
        transport.connect((message) => {
            handler(message.topic, JSON.parse(new TextDecoder().decode(message.payload)));
        });

        expect(handler).toHaveBeenCalled();

        const [topic, payload] = handler.mock.calls[0];
        expect(topic).toMatch(/devices\/.+\/status/);
        expect(payload).toHaveProperty('motors');

        handler.mockReset();
        vi.advanceTimersByTime(1_500);
        expect(handler).toHaveBeenCalled();

        transport.disconnect();
        vi.useRealTimers();
    });

    it('publishes ack and done responses for commands', async () => {
        const transport = new MockMqttTransport(getMockTileDrivers());
        transport.connect((message) => {
            handler(message.topic, JSON.parse(new TextDecoder().decode(message.payload)));
        });

        handler.mockReset();
        await transport.publish('devices/AA:11:BB:22:CC:33/cmd', JSON.stringify({ action: 'MOVE', cmd_id: 'cmd-1' }));

        const topics = handler.mock.calls.map(([topic]) => topic);
        expect(topics).toContain('devices/AA:11:BB:22:CC:33/cmd/resp');

        transport.disconnect();
    });
});
