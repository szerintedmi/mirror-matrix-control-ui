import { useCallback } from 'react';

import { HOME_ACTION, MOVE_ACTION } from '../constants/control';
import { useCommandTracker } from '../context/CommandTrackerContext';
import { useMqtt } from '../context/MqttContext';
import { computeNudgeTargets, normalizeMacForTopic } from '../services/motorControl';
import {
    type CommandCompletionResult,
    type CommandFailure,
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
    const { publish, createCommandId } = useMqtt();
    const { register, cancel } = useCommandTracker();

    const publishCommand = useCallback(
        async ({ mac, action, params, cmdId, expectAck = true }: PublishCommandParams) => {
            const resolvedCmdId = cmdId ?? createCommandId();
            const normalizedMac = normalizeMacForTopic(mac);
            const completionPromise = register(resolvedCmdId, { expectAck, mac: normalizedMac });
            const topic = `devices/${normalizedMac}/cmd`;

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
                cancel(resolvedCmdId, 'error');
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
        [cancel, createCommandId, publish, register],
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
