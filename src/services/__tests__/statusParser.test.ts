// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { parseStatusMessage } from '../statusParser';

const encode = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));

describe('parseStatusMessage', () => {
    it('parses a ready payload with motors', () => {
        const payload = {
            node_state: 'ready',
            ip: '192.168.1.8',
            motors: {
                '0': {
                    id: 0,
                    position: 0,
                    moving: false,
                    awake: false,
                    homed: false,
                    steps_since_home: 0,
                    budget_s: 90.0,
                    ttfc_s: 0.0,
                    speed: 4000,
                    accel: 16000,
                    est_ms: 0,
                    started_ms: 0,
                    actual_ms: 0,
                },
                '1': {
                    id: 1,
                    position: 0,
                    moving: false,
                    awake: false,
                    homed: false,
                    steps_since_home: 0,
                    budget_s: 90.0,
                    ttfc_s: 0.0,
                    speed: 4000,
                    accel: 16000,
                    est_ms: 0,
                    started_ms: 0,
                    actual_ms: 0,
                },
            },
        };

        const result = parseStatusMessage('devices/a1b2c3d4e5f6/status', encode(payload));
        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        const { value } = result;
        expect(value.mac).toBe('A1B2C3D4E5F6');
        expect(value.nodeState).toBe('ready');
        expect(value.ip).toBe('192.168.1.8');
        expect(Object.keys(value.motors)).toHaveLength(2);
        expect(value.motors['0']).toMatchObject({
            id: 0,
            moving: false,
            homed: false,
            speed: 4000,
            accel: 16000,
        });
    });

    it('parses an offline payload without motors', () => {
        const payload = {
            node_state: 'offline',
            motors: {},
        };
        const result = parseStatusMessage('devices/AA:11:BB:22:CC:33/status', encode(payload));
        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.value.nodeState).toBe('offline');
        expect(Object.keys(result.value.motors)).toHaveLength(0);
    });

    it('fails when node_state is missing', () => {
        const payload = { motors: {} };
        const result = parseStatusMessage('devices/AA/status', encode(payload));
        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }
        expect(result.error.reason).toBe('schema');
        expect(result.error.message).toContain('node_state');
    });
});
