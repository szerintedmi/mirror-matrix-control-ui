/**
 * Real Adapter Implementations
 *
 * These adapters wrap the actual APIs (motor commands, camera capture, timers)
 * used in production. Tests inject fake implementations via ExecutorAdapters.
 */

import type { MotorCommandApi } from '@/hooks/useMotorCommands';

import type { CameraAdapter, CaptureParams, ClockAdapter, MotorAdapter } from './commands';
import type { CaptureBlobMeasurement } from '../types';

// =============================================================================
// MOTOR ADAPTER
// =============================================================================

/**
 * Real motor adapter wrapping MotorCommandApi from useMotorCommands hook.
 */
export function createMotorAdapter(motorApi: MotorCommandApi): MotorAdapter {
    return {
        async homeAll(macAddresses: string[]): Promise<void> {
            await motorApi.homeAll({ macAddresses });
        },

        async homeTile(
            xMotor: { nodeMac: string; motorIndex: number } | null,
            yMotor: { nodeMac: string; motorIndex: number } | null,
        ): Promise<void> {
            const homePromises: Promise<unknown>[] = [];

            if (xMotor) {
                homePromises.push(
                    motorApi.homeMotor({ mac: xMotor.nodeMac, motorId: xMotor.motorIndex }),
                );
            }
            if (yMotor) {
                homePromises.push(
                    motorApi.homeMotor({ mac: yMotor.nodeMac, motorId: yMotor.motorIndex }),
                );
            }

            if (homePromises.length > 0) {
                await Promise.all(homePromises);
            }
        },

        async moveMotor(mac: string, motorId: number, positionSteps: number): Promise<void> {
            await motorApi.moveMotor({ mac, motorId, positionSteps });
        },
    };
}

// =============================================================================
// CAMERA ADAPTER
// =============================================================================

/**
 * Real camera adapter wrapping the captureMeasurement callback.
 */
export function createCameraAdapter(captureMeasurement: CaptureBlobMeasurement): CameraAdapter {
    return {
        async capture(params: CaptureParams) {
            return captureMeasurement({
                timeoutMs: params.timeoutMs,
                signal: params.signal,
                expectedPosition: params.expectedPosition,
                maxDistance: params.maxDistance,
            });
        },
    };
}

// =============================================================================
// CLOCK ADAPTER
// =============================================================================

/**
 * Create an AbortError for aborted operations.
 */
class AbortError extends Error {
    constructor(message = 'Operation aborted') {
        super(message);
        this.name = 'AbortError';
    }
}

/**
 * Real clock adapter using native timers.
 */
export function createClockAdapter(): ClockAdapter {
    return {
        delay(ms: number, signal?: AbortSignal): Promise<void> {
            return new Promise((resolve, reject) => {
                if (signal?.aborted) {
                    reject(new AbortError());
                    return;
                }

                const timer = setTimeout(() => {
                    signal?.removeEventListener('abort', onAbort);
                    resolve();
                }, ms);

                const onAbort = () => {
                    clearTimeout(timer);
                    signal?.removeEventListener('abort', onAbort);
                    reject(new AbortError());
                };

                signal?.addEventListener('abort', onAbort);
            });
        },

        now(): number {
            return Date.now();
        },
    };
}

// =============================================================================
// COMBINED ADAPTER FACTORY
// =============================================================================

/**
 * Create all adapters for production use.
 */
export function createAdapters(
    motorApi: MotorCommandApi,
    captureMeasurement: CaptureBlobMeasurement,
): {
    motor: MotorAdapter;
    camera: CameraAdapter;
    clock: ClockAdapter;
} {
    return {
        motor: createMotorAdapter(motorApi),
        camera: createCameraAdapter(captureMeasurement),
        clock: createClockAdapter(),
    };
}

// =============================================================================
// FAKE ADAPTERS FOR TESTING
// =============================================================================

/**
 * Recorded motor command for test assertions.
 */
export interface RecordedMotorCommand {
    type: 'homeAll' | 'homeTile' | 'moveMotor';
    args: unknown[];
    timestamp: number;
}

/**
 * Scripted capture result for deterministic testing.
 */
export interface ScriptedCaptureResult {
    measurement: ReturnType<CameraAdapter['capture']> extends Promise<infer T> ? T : never;
    error?: Error;
}

/**
 * Create a fake motor adapter that records all commands.
 * Useful for asserting the exact sequence of motor operations.
 */
export function createFakeMotorAdapter(): MotorAdapter & {
    commands: RecordedMotorCommand[];
    clear(): void;
} {
    const commands: RecordedMotorCommand[] = [];
    let timestamp = 0;

    return {
        commands,

        clear() {
            commands.length = 0;
            timestamp = 0;
        },

        async homeAll(macAddresses: string[]): Promise<void> {
            commands.push({
                type: 'homeAll',
                args: [macAddresses],
                timestamp: timestamp++,
            });
        },

        async homeTile(
            xMotor: { nodeMac: string; motorIndex: number } | null,
            yMotor: { nodeMac: string; motorIndex: number } | null,
        ): Promise<void> {
            commands.push({
                type: 'homeTile',
                args: [xMotor, yMotor],
                timestamp: timestamp++,
            });
        },

        async moveMotor(mac: string, motorId: number, positionSteps: number): Promise<void> {
            commands.push({
                type: 'moveMotor',
                args: [mac, motorId, positionSteps],
                timestamp: timestamp++,
            });
        },
    };
}

/**
 * Create a fake camera adapter that returns scripted results.
 * Push results to the queue; they're consumed in order.
 */
export function createFakeCameraAdapter(): CameraAdapter & {
    results: ScriptedCaptureResult[];
    captureCount: number;
    clear(): void;
} {
    const results: ScriptedCaptureResult[] = [];
    let captureCount = 0;

    return {
        results,
        get captureCount() {
            return captureCount;
        },

        clear() {
            results.length = 0;
            captureCount = 0;
        },

        async capture(_params: CaptureParams): ReturnType<CameraAdapter['capture']> {
            void _params; // Params unused in fake adapter
            captureCount++;
            const result = results.shift();
            if (!result) {
                throw new Error('No scripted capture result available');
            }
            if (result.error) {
                throw result.error;
            }
            return result.measurement;
        },
    };
}

/**
 * Create a fake clock adapter with manual time control.
 * Useful for testing delays without real waiting.
 */
export function createFakeClockAdapter(): ClockAdapter & {
    currentTime: number;
    pendingDelays: Array<{ ms: number; resolve: () => void; reject: (err: Error) => void }>;
    advance(ms: number): void;
    flush(): void;
} {
    let currentTime = 0;
    const pendingDelays: Array<{ ms: number; resolve: () => void; reject: (err: Error) => void }> =
        [];

    return {
        get currentTime() {
            return currentTime;
        },
        pendingDelays,

        delay(ms: number, signal?: AbortSignal): Promise<void> {
            return new Promise((resolve, reject) => {
                if (signal?.aborted) {
                    reject(new AbortError());
                    return;
                }

                const delayEntry = { ms, resolve, reject };
                pendingDelays.push(delayEntry);

                const onAbort = () => {
                    const idx = pendingDelays.indexOf(delayEntry);
                    if (idx >= 0) {
                        pendingDelays.splice(idx, 1);
                    }
                    reject(new AbortError());
                };

                signal?.addEventListener('abort', onAbort);
            });
        },

        now(): number {
            return currentTime;
        },

        /**
         * Advance time and resolve any delays that have elapsed.
         */
        advance(ms: number): void {
            currentTime += ms;
            const toResolve = pendingDelays.filter((d) => d.ms <= ms);
            for (const entry of toResolve) {
                const idx = pendingDelays.indexOf(entry);
                if (idx >= 0) {
                    pendingDelays.splice(idx, 1);
                }
                entry.resolve();
            }
            // Reduce remaining delay times
            for (const entry of pendingDelays) {
                entry.ms -= ms;
            }
        },

        /**
         * Resolve all pending delays immediately.
         */
        flush(): void {
            const toResolve = [...pendingDelays];
            pendingDelays.length = 0;
            for (const entry of toResolve) {
                entry.resolve();
            }
        },
    };
}
