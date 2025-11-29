import { useCallback, useEffect, useRef } from 'react';

import { HOME_ACTION, MOVE_ACTION } from '../constants/control';
import { useMqtt } from '../context/MqttContext';
import { computeNudgeTargets, normalizeMacForTopic } from '../services/motorControl';
import {
    PendingCommandTracker,
    type CommandCompletionResult,
    type CommandFailure,
    type CommandResponsePayload,
} from '../services/pendingCommandTracker';

interface PublishCommandParams {
    mac: string;
    action: string;
    params: Record<string, unknown>;
    cmdId?: string;
    expectAck?: boolean;
}

export interface NudgeMotorArgs {
    mac: string;
    motorId: number;
    currentPosition: number;
}

export interface HomeMotorArgs {
    mac: string;
    motorId: number;
}

export interface HomeAllArgs {
    macAddresses: string[];
}

export interface NudgeCommandResult {
    mac: string;
    motorId: number;
    direction: 1 | -1;
    outboundTarget: number;
    returnTarget: number;
    outbound: CommandCompletionResult;
    inbound: CommandCompletionResult;
}

export interface HomeCommandResult {
    mac: string;
    completion: CommandCompletionResult;
}

export interface MoveMotorArgs {
    mac: string;
    motorId: number;
    positionSteps: number;
    cmdId?: string;
    /** Motor speed in steps per second. Firmware range: 500-4000. If omitted, firmware uses default. */
    speedSps?: number;
}

const decoder = new TextDecoder();

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeResponse = (payload: unknown): CommandResponsePayload | null => {
    if (!isRecord(payload)) {
        return null;
    }
    const rawStatus = payload['status'];
    const rawCmdId = payload['cmd_id'];
    if (typeof rawCmdId !== 'string') {
        return null;
    }
    if (typeof rawStatus !== 'string') {
        return null;
    }
    const status = rawStatus.toLowerCase();
    if (status !== 'ack' && status !== 'done' && status !== 'error') {
        return null;
    }

    const action = typeof payload['action'] === 'string' ? payload['action'] : 'UNKNOWN';
    const result = isRecord(payload['result'])
        ? (payload['result'] as Record<string, unknown>)
        : undefined;
    const errors = Array.isArray(payload['errors'])
        ? payload['errors'].filter(isRecord).map((entry) => ({
              code: typeof entry['code'] === 'string' ? entry['code'] : undefined,
              message: typeof entry['message'] === 'string' ? entry['message'] : undefined,
          }))
        : undefined;
    const warnings = Array.isArray(payload['warnings'])
        ? payload['warnings'].filter(isRecord).map((entry) => ({
              code: typeof entry['code'] === 'string' ? entry['code'] : undefined,
              message: typeof entry['message'] === 'string' ? entry['message'] : undefined,
          }))
        : undefined;

    return {
        cmdId: rawCmdId,
        action,
        status,
        result,
        errors,
        warnings,
    };
};

const parseResponsePayload = (payload: Uint8Array): CommandResponsePayload | null => {
    try {
        const text = decoder.decode(payload);
        const parsed = JSON.parse(text);
        return normalizeResponse(parsed);
    } catch (error) {
        console.warn('Failed to decode command response payload', error);
        return null;
    }
};

const isCommandFailure = (value: unknown): value is CommandFailure =>
    Boolean(value) &&
    value instanceof Error &&
    typeof (value as CommandFailure).kind === 'string' &&
    typeof (value as CommandFailure).command === 'object';

export interface MotorCommandApi {
    nudgeMotor: (args: NudgeMotorArgs) => Promise<NudgeCommandResult>;
    homeMotor: (args: HomeMotorArgs) => Promise<HomeCommandResult>;
    homeAll: (args: HomeAllArgs) => Promise<HomeCommandResult[]>;
    moveMotor: (args: MoveMotorArgs) => Promise<CommandCompletionResult>;
}

export const useMotorCommands = (): MotorCommandApi => {
    const { publish, subscribe, createCommandId } = useMqtt();
    const trackerRef = useRef<PendingCommandTracker | null>(null);

    const ensureTracker = useCallback((): PendingCommandTracker => {
        if (trackerRef.current === null) {
            trackerRef.current = new PendingCommandTracker();
        }
        return trackerRef.current;
    }, []);

    useEffect(() => {
        const tracker = ensureTracker();
        const unsubscribe = subscribe(
            'devices/+/cmd/resp',
            (_topic, payload) => {
                const parsed = parseResponsePayload(payload);
                if (parsed) {
                    tracker.handleResponse(parsed);
                }
            },
            { qos: 1 },
        );
        return () => {
            unsubscribe();
        };
    }, [ensureTracker, subscribe]);

    useEffect(
        () => () => {
            trackerRef.current?.dispose();
            trackerRef.current = null;
        },
        [],
    );

    const publishCommand = useCallback(
        async ({ mac, action, params, cmdId, expectAck = true }: PublishCommandParams) => {
            const tracker = ensureTracker();
            const resolvedCmdId = cmdId ?? createCommandId();
            const completionPromise = tracker.register(resolvedCmdId, { expectAck });
            const topic = `devices/${normalizeMacForTopic(mac)}/cmd`;

            try {
                await publish(
                    topic,
                    JSON.stringify({
                        cmd_id: resolvedCmdId,
                        action,
                        params,
                    }),
                    { qos: 1 },
                );
            } catch (error) {
                tracker.cancel(resolvedCmdId, 'error');
                throw error;
            }

            try {
                return await completionPromise;
            } catch (error) {
                if (isCommandFailure(error)) {
                    throw error;
                }
                throw error;
            }
        },
        [createCommandId, ensureTracker, publish],
    );

    const nudgeMotor = useCallback(
        async ({ mac, motorId, currentPosition }: NudgeMotorArgs): Promise<NudgeCommandResult> => {
            const { direction, outboundTarget, returnTarget } = computeNudgeTargets({
                currentPosition,
            });
            const baseId = createCommandId();
            const outbound = await publishCommand({
                mac,
                action: MOVE_ACTION,
                params: {
                    target_ids: motorId,
                    position_steps: outboundTarget,
                },
                cmdId: `${baseId}-out`,
            });

            const inbound = await publishCommand({
                mac,
                action: MOVE_ACTION,
                params: {
                    target_ids: motorId,
                    position_steps: returnTarget,
                },
                cmdId: `${baseId}-return`,
            });

            return {
                mac,
                motorId,
                direction,
                outboundTarget,
                returnTarget,
                outbound,
                inbound,
            };
        },
        [createCommandId, publishCommand],
    );

    const homeMotor = useCallback(
        async ({ mac, motorId }: HomeMotorArgs): Promise<HomeCommandResult> => {
            const completion = await publishCommand({
                mac,
                action: HOME_ACTION,
                params: { target_ids: motorId },
            });
            return {
                mac,
                completion,
            };
        },
        [publishCommand],
    );

    const homeAll = useCallback(
        async ({ macAddresses }: HomeAllArgs): Promise<HomeCommandResult[]> => {
            const uniqueMacs = Array.from(
                new Set(macAddresses.map((mac) => normalizeMacForTopic(mac))),
            );
            const results = await Promise.all(
                uniqueMacs.map(async (mac) => {
                    const completion = await publishCommand({
                        mac,
                        action: HOME_ACTION,
                        params: { target_ids: 'ALL' },
                    });
                    return {
                        mac,
                        completion,
                    };
                }),
            );
            return results;
        },
        [publishCommand],
    );

    const moveMotor = useCallback(
        async ({
            mac,
            motorId,
            positionSteps,
            cmdId,
            speedSps,
        }: MoveMotorArgs): Promise<CommandCompletionResult> => {
            const completion = await publishCommand({
                mac,
                action: MOVE_ACTION,
                params: {
                    target_ids: motorId,
                    position_steps: positionSteps,
                    ...(speedSps !== undefined && { speed: speedSps }),
                },
                cmdId,
            });
            return completion;
        },
        [publishCommand],
    );

    return {
        nudgeMotor,
        homeMotor,
        homeAll,
        moveMotor,
    };
};
