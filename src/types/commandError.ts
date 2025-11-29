import type { Axis } from '../types';

export interface CommandErrorDetail {
    // Required fields
    cmdId: string;
    controller: string; // MAC address
    reason: 'ack-timeout' | 'completion-timeout' | 'error' | 'unknown';

    // Optional fields (available for motor-specific commands)
    motorId?: number;
    row?: number;
    col?: number;
    axis?: Axis;
    errorCode?: string;
    errorMessage?: string;
}

export interface CommandErrorContext {
    title: string; // e.g., "Pattern playback", "Homing"
    totalCount: number; // Total commands attempted
    errors: CommandErrorDetail[];
}
