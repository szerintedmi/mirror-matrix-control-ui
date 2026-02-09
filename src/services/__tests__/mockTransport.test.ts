// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MockMqttTransport, getMockNodes, getMockTileDrivers } from '../mockTransport';

import type { MockTileDriver } from '../mockTransport';

const readDrivers = (instance: MockMqttTransport): MockTileDriver[] =>
    Reflect.get(instance as object, 'tileDrivers') as MockTileDriver[];

const decodePayload = (payload: Uint8Array) =>
    JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;

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
    let transport: MockMqttTransport;
    const messages: Array<{ topic: string; payload: Record<string, unknown> }> = [];

    beforeEach(() => {
        vi.useFakeTimers();
        messages.length = 0;
        transport = new MockMqttTransport(getMockTileDrivers());
        transport.connect((message) => {
            messages.push({ topic: message.topic, payload: decodePayload(message.payload) });
        });
        messages.length = 0; // ignore initial broadcast for most tests
    });

    afterEach(() => {
        transport.disconnect();
        vi.useRealTimers();
        messages.length = 0;
    });

    it('emits status payloads on connect', () => {
        expect(messages).toHaveLength(0);
        vi.advanceTimersByTime(5_000);
        expect(messages.some((entry) => entry.topic.includes('/status'))).toBe(true);
    });

    it('runs MOVE commands and updates motor positions', async () => {
        await transport.publish(
            'devices/AA:11:BB:22:CC:33/cmd',
            JSON.stringify({
                action: 'MOVE',
                cmd_id: 'cmd-move',
                params: { target_ids: 0, position_steps: 480 },
            }),
        );

        const ackMessage = messages.find((entry) => entry.payload.status === 'ack');
        expect(ackMessage).toBeTruthy();

        vi.advanceTimersByTime(400);

        const doneMessage = messages.find((entry) => entry.payload.status === 'done');
        expect(doneMessage).toBeTruthy();

        const drivers = readDrivers(transport);
        const state = drivers[0].motors[0];
        expect(state.position).toBe(480);
        expect(state.stepsSinceHome).toBe(480);
        expect(state.moving).toBe(false);
    });

    it('rejects MOVE commands when a motor is busy', async () => {
        await transport.publish(
            'devices/AA:11:BB:22:CC:33/cmd',
            JSON.stringify({
                action: 'MOVE',
                cmd_id: 'cmd-first',
                params: { target_ids: 0, position_steps: 300 },
            }),
        );

        messages.length = 0;

        await transport.publish(
            'devices/AA:11:BB:22:CC:33/cmd',
            JSON.stringify({
                action: 'MOVE',
                cmd_id: 'cmd-second',
                params: { target_ids: 0, position_steps: 200 },
            }),
        );

        const errorMessage = messages.find((entry) => entry.payload.status === 'error');
        expect(errorMessage).toBeTruthy();
        const errors = Array.isArray(errorMessage?.payload.errors)
            ? (errorMessage?.payload.errors as Array<Record<string, unknown>>)
            : [];
        expect(errors[0]).toMatchObject({ code: 'E04' });

        vi.advanceTimersByTime(400);
    });

    it('homes motors and resets steps since home', async () => {
        // Move first to create non-zero steps
        await transport.publish(
            'devices/DD:44:EE:55:FF:66/cmd',
            JSON.stringify({
                action: 'MOVE',
                cmd_id: 'cmd-prep',
                params: { target_ids: 1, position_steps: 600 },
            }),
        );
        vi.advanceTimersByTime(400);
        messages.length = 0;

        await transport.publish(
            'devices/DD:44:EE:55:FF:66/cmd',
            JSON.stringify({
                action: 'HOME',
                cmd_id: 'cmd-home',
                params: { target_ids: 1 },
            }),
        );

        vi.advanceTimersByTime(600);

        const doneMessage = messages.find((entry) => entry.payload.status === 'done');
        expect(doneMessage).toBeTruthy();

        const drivers = readDrivers(transport);
        const state = drivers[1].motors[1];
        expect(state.homed).toBe(true);
        expect(state.stepsSinceHome).toBe(0);
        expect(state.position).toBe(0);
    });
});
