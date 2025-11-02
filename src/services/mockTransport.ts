import type { Node } from '../types';

export interface MockMotorState {
    id: number;
    basePosition: number;
    awake: boolean;
    homed: boolean;
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
            basePosition: index * 75,
            awake: true,
            homed: true,
        })),
    },
    {
        mac: 'DD:44:EE:55:FF:66',
        ip: '192.168.1.102',
        status: 'ready',
        motors: Array.from({ length: 6 }, (_, index) => ({
            id: index,
            basePosition: index * -60,
            awake: true,
            homed: index % 2 === 0,
        })),
    },
    {
        mac: '77:88:99:AA:BB:CC',
        ip: '192.168.1.103',
        status: 'offline',
        motors: Array.from({ length: 4 }, (_, index) => ({
            id: index,
            basePosition: 0,
            awake: false,
            homed: false,
        })),
    },
];

export const getMockTileDrivers = (): MockTileDriver[] =>
    DEFAULT_TILE_DRIVERS.map((driver) => ({
        ...driver,
        motors: driver.motors.map((motor) => ({ ...motor })),
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

    private tick = 0;

    constructor(drivers: MockTileDriver[] = getMockTileDrivers()) {
        this.tileDrivers = drivers;
    }

    public connect(handler: MessageHandler): void {
        this.disconnect();
        this.handler = handler;
        this.broadcastStatus();
        this.interval = setInterval(() => this.broadcastStatus(), 1_500);
    }

    public disconnect(): void {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.handler = null;
    }

    public publish(topic: string, payload: string): Promise<void> {
        if (!this.handler) {
            return Promise.resolve();
        }

        try {
            const parsed = JSON.parse(payload) as { cmd_id?: string; action?: string };
            const cmdId =
                parsed.cmd_id ??
                (typeof crypto !== 'undefined' && 'randomUUID' in crypto
                    ? crypto.randomUUID()
                    : `cmd-${Math.random().toString(16).slice(2)}`);
            const ack = {
                cmd_id: cmdId,
                action: parsed.action ?? 'UNKNOWN',
                status: 'ack',
                result: { est_ms: 250 },
            };
            const done = {
                cmd_id: cmdId,
                action: parsed.action ?? 'UNKNOWN',
                status: 'done',
                result: { actual_ms: 275 },
            };
            const macMatch = /devices\/([^/]+)\/cmd/.exec(topic);
            const mac = macMatch?.[1];
            if (mac) {
                this.emit(`devices/${mac}/cmd/resp`, ack);
                this.emit(`devices/${mac}/cmd/resp`, done);
            }
        } catch (error) {
            console.warn('Mock transport failed to parse publish payload', error);
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
        this.tick += 1;
        for (const driver of this.tileDrivers) {
            const motorsPayload: Record<string, unknown> = {};
            for (const motor of driver.motors) {
                const oscillationPhase = this.tick % 4;
                const offset = oscillationPhase < 2 ? motor.basePosition : -motor.basePosition;
                motorsPayload[motor.id.toString()] = {
                    id: motor.id,
                    position: offset,
                    moving: oscillationPhase % 2 === 0,
                    awake: motor.awake,
                    homed: motor.homed,
                    steps_since_home: motor.homed ? 0 : Math.abs(offset) + 500,
                    budget_s: 120,
                    ttfc_s: 0,
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
}
