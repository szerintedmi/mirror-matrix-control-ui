import { MOTOR_MAX_POSITION_STEPS, MOTOR_MIN_POSITION_STEPS } from '../constants/control';

import type { Node } from '../types';

export interface MockMotorState {
    id: number;
    position: number;
    moving: boolean;
    awake: boolean;
    homed: boolean;
    stepsSinceHome: number;
    motionTimer: ReturnType<typeof setTimeout> | null;
}

export interface MockTileDriver {
    mac: string;
    ip: string;
    status: 'ready' | 'offline';
    motors: MockMotorState[];
}

const DEFAULT_TILE_DRIVERS: MockTileDriver[] = [
    {
        mac: 'AA:11:BB:22:CC:33',
        ip: '192.168.1.101',
        status: 'ready',
        motors: Array.from({ length: 6 }, (_, index) => ({
            id: index,
            position: index * 75,
            moving: false,
            awake: true,
            homed: true,
            stepsSinceHome: Math.abs(index * 75),
            motionTimer: null,
        })),
    },
    {
        mac: 'DD:44:EE:55:FF:66',
        ip: '192.168.1.102',
        status: 'ready',
        motors: Array.from({ length: 6 }, (_, index) => ({
            id: index,
            position: index * -60,
            moving: false,
            awake: true,
            homed: index % 2 === 0,
            stepsSinceHome: index % 2 === 0 ? Math.abs(index * -60) : 6_500 + index * 120,
            motionTimer: null,
        })),
    },
    {
        mac: '77:88:99:AA:BB:CC',
        ip: '192.168.1.103',
        status: 'offline',
        motors: Array.from({ length: 4 }, (_, index) => ({
            id: index,
            position: 0,
            moving: false,
            awake: false,
            homed: false,
            stepsSinceHome: 0,
            motionTimer: null,
        })),
    },
];

export const getMockTileDrivers = (): MockTileDriver[] =>
    DEFAULT_TILE_DRIVERS.map((driver) => ({
        ...driver,
        motors: driver.motors.map((motor) => ({ ...motor, motionTimer: null })),
    }));

export const getMockNodes = (): Node[] =>
    DEFAULT_TILE_DRIVERS.filter((driver) => driver.status !== 'offline').map((driver) => ({
        macAddress: driver.mac,
        status: driver.status,
        motors: driver.motors.map((motor) => ({
            nodeMac: driver.mac,
            motorIndex: motor.id,
        })),
    }));

export interface MockTransportMessage {
    topic: string;
    payload: Uint8Array;
}

const encodeJson = (value: unknown): Uint8Array => {
    const text = JSON.stringify(value);
    return new TextEncoder().encode(text);
};

type MessageHandler = (message: MockTransportMessage) => void;

export class MockMqttTransport {
    private readonly tileDrivers: MockTileDriver[];

    private handler: MessageHandler | null = null;

    private interval: ReturnType<typeof setInterval> | null = null;

    constructor(drivers: MockTileDriver[] = getMockTileDrivers()) {
        this.tileDrivers = drivers;
    }

    public connect(handler: MessageHandler): void {
        this.disconnect();
        this.handler = handler;
        this.broadcastStatus();
        this.interval = setInterval(() => this.broadcastStatus(), 5_000);
    }

    public disconnect(): void {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        for (const driver of this.tileDrivers) {
            for (const motor of driver.motors) {
                if (motor.motionTimer) {
                    clearTimeout(motor.motionTimer);
                    motor.motionTimer = null;
                }
                motor.moving = false;
            }
        }
        this.handler = null;
    }

    public publish(topic: string, payload: string): Promise<void> {
        if (!this.handler) {
            return Promise.resolve();
        }

        const macMatch = /devices\/([^/]+)\/cmd/.exec(topic);
        const mac = macMatch?.[1];
        if (!mac) {
            return Promise.resolve();
        }

        const driver = this.tileDrivers.find((entry) => entry.mac === mac);
        if (!driver) {
            return Promise.resolve();
        }

        interface CommandEnvelope {
            cmd_id?: string;
            action?: string;
            params?: Record<string, unknown>;
        }

        let envelope: CommandEnvelope;
        try {
            envelope = JSON.parse(payload) as CommandEnvelope;
        } catch (error) {
            console.warn('Mock transport failed to parse publish payload', error);
            return Promise.resolve();
        }

        const action =
            typeof envelope.action === 'string' ? envelope.action.toUpperCase() : 'UNKNOWN';
        const cmdId = envelope.cmd_id ?? this.generateCommandId();
        const params = envelope.params ?? {};

        switch (action) {
            case 'MOVE':
                this.handleMove(driver, mac, cmdId, params);
                break;
            case 'HOME':
                this.handleHome(driver, mac, cmdId, params);
                break;
            default:
                this.emitAck(mac, cmdId, action, { est_ms: 100 });
                this.emitDone(mac, cmdId, action, { actual_ms: 110 });
                break;
        }

        return Promise.resolve();
    }

    public getNodeSummaries(): Node[] {
        return this.tileDrivers
            .filter((driver) => driver.status !== 'offline')
            .map((driver) => ({
                macAddress: driver.mac,
                status: driver.status,
                motors: driver.motors.map((motor) => ({
                    nodeMac: driver.mac,
                    motorIndex: motor.id,
                })),
            }));
    }

    private broadcastStatus(): void {
        if (!this.handler) {
            return;
        }
        for (const driver of this.tileDrivers) {
            const motorsPayload: Record<string, unknown> = {};
            for (const motor of driver.motors) {
                motorsPayload[motor.id.toString()] = {
                    id: motor.id,
                    position: motor.position,
                    moving: motor.moving,
                    awake: motor.awake,
                    homed: motor.homed,
                    steps_since_home: motor.stepsSinceHome,
                    budget_s: 120,
                    ttfc_s: 0,
                    speed: 4_000,
                    accel: 16_000,
                    est_ms: motor.moving ? 200 : 0,
                    started_ms: 0,
                    actual_ms: 0,
                };
            }
            const payload = {
                node_state: driver.status,
                ip: driver.ip,
                mac: driver.mac,
                motors: motorsPayload,
            };
            this.emit(`devices/${driver.mac}/status`, payload);
        }
    }

    private emit(topic: string, payload: unknown): void {
        if (!this.handler) {
            return;
        }
        this.handler({ topic, payload: encodeJson(payload) });
    }

    private generateCommandId(): string {
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
            return crypto.randomUUID();
        }
        return `cmd-${Math.random().toString(16).slice(2)}`;
    }

    private resolveTargets(driver: MockTileDriver, targetIds: unknown): MockMotorState[] {
        if (targetIds === 'ALL' || targetIds === 'all') {
            return driver.motors.slice();
        }
        if (Array.isArray(targetIds)) {
            const ids = targetIds
                .map((value) =>
                    typeof value === 'number'
                        ? value
                        : typeof value === 'string'
                          ? Number.parseInt(value, 10)
                          : NaN,
                )
                .filter((value) => Number.isFinite(value));
            return driver.motors.filter((motor) => ids.includes(motor.id));
        }
        if (typeof targetIds === 'number') {
            return driver.motors.filter((motor) => motor.id === targetIds);
        }
        if (typeof targetIds === 'string') {
            const parsed = Number.parseInt(targetIds, 10);
            if (Number.isFinite(parsed)) {
                return driver.motors.filter((motor) => motor.id === parsed);
            }
        }
        return [];
    }

    private handleMove(
        driver: MockTileDriver,
        mac: string,
        cmdId: string,
        params: Record<string, unknown>,
    ): void {
        const targetIds = params['target_ids'];
        const position = params['position_steps'];
        if (typeof position !== 'number' || Number.isNaN(position)) {
            this.emitError(mac, cmdId, 'MOVE', 'E03', 'BAD_PARAM');
            return;
        }

        const targets = this.resolveTargets(driver, targetIds);
        if (targets.length === 0) {
            this.emitError(mac, cmdId, 'MOVE', 'E02', 'BAD_ID');
            return;
        }

        if (targets.some((motor) => motor.moving)) {
            this.emitError(mac, cmdId, 'MOVE', 'E04', 'BUSY');
            return;
        }

        const clampedPosition = Math.max(
            MOTOR_MIN_POSITION_STEPS,
            Math.min(MOTOR_MAX_POSITION_STEPS, position),
        );

        targets.forEach((motor) => {
            if (motor.motionTimer) {
                clearTimeout(motor.motionTimer);
                motor.motionTimer = null;
            }
            motor.moving = true;
            motor.awake = true;
        });

        this.emitAck(mac, cmdId, 'MOVE', { est_ms: 220 });

        const duration = 220 + Math.floor(Math.random() * 120);
        const timer = setTimeout(() => {
            targets.forEach((motor) => {
                motor.position = clampedPosition;
                motor.stepsSinceHome = Math.abs(clampedPosition);
                motor.moving = false;
                motor.motionTimer = null;
            });
            this.emitDone(mac, cmdId, 'MOVE', { actual_ms: duration });
        }, duration);

        targets.forEach((motor) => {
            motor.motionTimer = timer;
        });
    }

    private handleHome(
        driver: MockTileDriver,
        mac: string,
        cmdId: string,
        params: Record<string, unknown>,
    ): void {
        const targetIds = params['target_ids'];
        const targets = this.resolveTargets(driver, targetIds);
        if (targets.length === 0) {
            this.emitError(mac, cmdId, 'HOME', 'E02', 'BAD_ID');
            return;
        }

        if (targets.some((motor) => motor.moving)) {
            this.emitError(mac, cmdId, 'HOME', 'E04', 'BUSY');
            return;
        }

        targets.forEach((motor) => {
            if (motor.motionTimer) {
                clearTimeout(motor.motionTimer);
                motor.motionTimer = null;
            }
            motor.moving = true;
            motor.awake = true;
        });

        this.emitAck(mac, cmdId, 'HOME', { est_ms: 360 });

        const duration = 360 + Math.floor(Math.random() * 160);
        const timer = setTimeout(() => {
            targets.forEach((motor) => {
                motor.position = 0;
                motor.stepsSinceHome = 0;
                motor.homed = true;
                motor.moving = false;
                motor.motionTimer = null;
            });
            this.emitDone(mac, cmdId, 'HOME', { actual_ms: duration });
        }, duration);

        targets.forEach((motor) => {
            motor.motionTimer = timer;
        });
    }

    private emitAck(
        mac: string,
        cmdId: string,
        action: string,
        result: Record<string, unknown>,
    ): void {
        this.emit(`devices/${mac}/cmd/resp`, {
            cmd_id: cmdId,
            action,
            status: 'ack',
            result,
        });
    }

    private emitDone(
        mac: string,
        cmdId: string,
        action: string,
        result: Record<string, unknown>,
    ): void {
        this.emit(`devices/${mac}/cmd/resp`, {
            cmd_id: cmdId,
            action,
            status: 'done',
            result,
        });
    }

    private emitError(
        mac: string,
        cmdId: string,
        action: string,
        code: string,
        message: string,
    ): void {
        this.emit(`devices/${mac}/cmd/resp`, {
            cmd_id: cmdId,
            action,
            status: 'error',
            errors: [
                {
                    code,
                    message,
                },
            ],
        });
    }
}
