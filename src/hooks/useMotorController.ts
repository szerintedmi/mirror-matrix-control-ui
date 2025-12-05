import { useCallback } from 'react';

import { showSingleCommandErrorToast } from '../components/common/StyledToast';
import { extractCommandErrorDetail } from '../utils/commandErrors';

import { useCommandFeedback } from './useCommandFeedback';
import { useMotorCommands } from './useMotorCommands';

import type { Motor, MotorTelemetry } from '../types';

export interface MotorControllerApi {
    feedback: ReturnType<typeof useCommandFeedback>['feedback'];
    nudge: () => Promise<void>;
    home: () => Promise<void>;
    begin: ReturnType<typeof useCommandFeedback>['begin'];
    resetFeedback: () => void;
}

export const useMotorController = (
    motor: Motor | null,
    telemetry?: MotorTelemetry,
): MotorControllerApi => {
    const feedbackApi = useCommandFeedback();
    const { nudgeMotor, homeMotor } = useMotorCommands();

    const nudge = useCallback(async () => {
        if (!motor) {
            feedbackApi.fail('No motor assigned to this control');
            return;
        }
        if (!telemetry) {
            feedbackApi.fail('Live telemetry unavailable for this motor');
            return;
        }

        feedbackApi.begin('Sending nudge…');
        try {
            const result = await nudgeMotor({
                mac: motor.nodeMac,
                motorId: motor.motorIndex,
                currentPosition: telemetry.position,
            });
            const directionLabel = result.direction > 0 ? '+500' : '-500';
            feedbackApi.succeed(`Nudge ${directionLabel} complete`);
        } catch (error) {
            const details = extractCommandErrorDetail(error, {
                controller: motor.nodeMac,
                motorId: motor.motorIndex,
            });
            feedbackApi.fail(details.errorMessage ?? 'Command failed', details.errorCode);
            showSingleCommandErrorToast('Nudge failed', details);
        }
    }, [feedbackApi, motor, nudgeMotor, telemetry]);

    const home = useCallback(async () => {
        if (!motor) {
            feedbackApi.fail('No motor assigned to this control');
            return;
        }
        feedbackApi.begin('Homing…');
        try {
            await homeMotor({
                mac: motor.nodeMac,
                motorId: motor.motorIndex,
            });
            feedbackApi.succeed('Home command sent');
        } catch (error) {
            const details = extractCommandErrorDetail(error, {
                controller: motor.nodeMac,
                motorId: motor.motorIndex,
            });
            feedbackApi.fail(details.errorMessage ?? 'Command failed', details.errorCode);
            showSingleCommandErrorToast('Home failed', details);
        }
    }, [feedbackApi, homeMotor, motor]);

    return {
        feedback: feedbackApi.feedback,
        nudge,
        home,
        begin: feedbackApi.begin,
        resetFeedback: feedbackApi.reset,
    };
};
