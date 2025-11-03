export type StatusParseErrorReason = 'topic' | 'decode' | 'schema';

export interface StatusParseError {
    reason: StatusParseErrorReason;
    message: string;
    cause?: unknown;
}

export interface NormalizedMotorStatus {
    id: number;
    position: number;
    moving: boolean;
    awake: boolean;
    homed: boolean;
    stepsSinceHome: number;
    budgetSeconds: number;
    ttfcSeconds: number;
    speed: number;
    accel: number;
    estMs: number;
    startedMs: number;
    actualMs: number;
    raw: Record<string, unknown>;
}

export interface NormalizedStatusMessage {
    mac: string;
    nodeState: string;
    ip?: string;
    motors: Record<string, NormalizedMotorStatus>;
    raw: Record<string, unknown>;
}

export type StatusParseResult =
    | { ok: true; value: NormalizedStatusMessage }
    | { ok: false; error: StatusParseError };

const STATUS_TOPIC_REGEX = /^devices\/([^/]+)\/status$/i;

const decoder = new TextDecoder();

const toFiniteNumber = (value: unknown, fallback = 0): number => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Number(value);
        if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return fallback;
};

const toBoolean = (value: unknown): boolean => {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        return value !== 0;
    }
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
            return true;
        }
        if (normalized === 'false' || normalized === '0' || normalized === 'no') {
            return false;
        }
    }
    return Boolean(value);
};

const normalizeMac = (mac: string): string => mac.trim().toUpperCase();

export const parseStatusMessage = (topic: string, payload: Uint8Array): StatusParseResult => {
    const match = STATUS_TOPIC_REGEX.exec(topic);
    if (!match) {
        return {
            ok: false,
            error: {
                reason: 'topic',
                message: `Topic "${topic}" does not match expected status pattern`,
            },
        };
    }

    const mac = normalizeMac(match[1]);

    let jsonText: string;
    try {
        jsonText = decoder.decode(payload);
    } catch (error) {
        return {
            ok: false,
            error: {
                reason: 'decode',
                message: 'Unable to decode status payload as UTF-8',
                cause: error,
            },
        };
    }

    let parsedValue: unknown;
    try {
        parsedValue = JSON.parse(jsonText);
    } catch (error) {
        return {
            ok: false,
            error: {
                reason: 'decode',
                message: 'Unable to parse status payload as JSON',
                cause: error,
            },
        };
    }

    if (!parsedValue || typeof parsedValue !== 'object') {
        return {
            ok: false,
            error: {
                reason: 'schema',
                message: 'Status payload must be an object',
            },
        };
    }

    const parsed = parsedValue as Record<string, unknown>;

    const nodeState = parsed['node_state'];
    if (typeof nodeState !== 'string') {
        return {
            ok: false,
            error: {
                reason: 'schema',
                message: 'Status payload missing string "node_state"',
            },
        };
    }

    const ipValue = parsed['ip'];
    const ip = typeof ipValue === 'string' && ipValue.trim().length > 0 ? ipValue : undefined;

    const motorsValue = parsed['motors'];
    if (!motorsValue || typeof motorsValue !== 'object') {
        return {
            ok: false,
            error: {
                reason: 'schema',
                message: 'Status payload missing "motors" object',
            },
        };
    }

    const motors: Record<string, NormalizedMotorStatus> = {};
    for (const [key, rawMotor] of Object.entries(motorsValue as Record<string, unknown>)) {
        if (!rawMotor || typeof rawMotor !== 'object') {
            return {
                ok: false,
                error: {
                    reason: 'schema',
                    message: `Motor entry "${key}" must be an object`,
                },
            };
        }
        const motor = rawMotor as Record<string, unknown>;
        const idSource = motor['id'];
        const derivedId =
            typeof idSource === 'number' && Number.isFinite(idSource)
                ? idSource
                : Number.parseInt(key, 10);
        if (!Number.isFinite(derivedId)) {
            return {
                ok: false,
                error: {
                    reason: 'schema',
                    message: `Motor entry "${key}" missing numeric "id"`,
                },
            };
        }

        motors[key] = {
            id: derivedId,
            position: toFiniteNumber(motor['position']),
            moving: toBoolean(motor['moving']),
            awake: toBoolean(motor['awake']),
            homed: toBoolean(motor['homed']),
            stepsSinceHome: toFiniteNumber(motor['steps_since_home']),
            budgetSeconds: toFiniteNumber(motor['budget_s']),
            ttfcSeconds: toFiniteNumber(motor['ttfc_s']),
            speed: toFiniteNumber(motor['speed']),
            accel: toFiniteNumber(motor['accel']),
            estMs: toFiniteNumber(motor['est_ms']),
            startedMs: toFiniteNumber(motor['started_ms']),
            actualMs: toFiniteNumber(motor['actual_ms']),
            raw: motor,
        };
    }

    return {
        ok: true,
        value: {
            mac,
            nodeState,
            ip,
            motors,
            raw: parsed as Record<string, unknown>,
        },
    };
};
