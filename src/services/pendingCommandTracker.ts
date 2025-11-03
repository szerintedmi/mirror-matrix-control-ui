import { COMMAND_ACK_TIMEOUT_MS, COMMAND_COMPLETION_TIMEOUT_MS } from '../constants/control';

export type CommandResponseStatus = 'ack' | 'done' | 'error';

export interface CommandResponsePayload {
    cmdId: string;
    action: string;
    status: CommandResponseStatus;
    result?: Record<string, unknown>;
    errors?: Array<{ code?: string; message?: string }>;
    warnings?: Array<{ code?: string; message?: string }>;
}

export type CommandFailureReason = 'ack-timeout' | 'completion-timeout' | 'error';

export interface CommandCompletionResult {
    cmdId: string;
    responses: CommandResponsePayload[];
}

export interface CommandFailure extends Error {
    kind: CommandFailureReason;
    command: CommandCompletionResult;
    errorCode?: string;
}

interface PendingCommand {
    expectAck: boolean;
    responses: CommandResponsePayload[];
    resolve: (result: CommandCompletionResult) => void;
    reject: (failure: CommandFailure) => void;
    ackTimer: ReturnType<typeof setTimeout> | null;
    completionTimer: ReturnType<typeof setTimeout>;
    settled: boolean;
}

interface TrackerOptions {
    ackTimeoutMs?: number;
    completionTimeoutMs?: number;
}

export class PendingCommandTracker {
    private readonly ackTimeoutMs: number;

    private readonly completionTimeoutMs: number;

    private readonly pending = new Map<string, PendingCommand>();

    private disposed = false;

    constructor(options: TrackerOptions = {}) {
        this.ackTimeoutMs = options.ackTimeoutMs ?? COMMAND_ACK_TIMEOUT_MS;
        this.completionTimeoutMs = options.completionTimeoutMs ?? COMMAND_COMPLETION_TIMEOUT_MS;
    }

    public dispose(): void {
        this.disposed = true;
        for (const [cmdId, record] of this.pending.entries()) {
            this.clearTimers(record);
            record.settled = true;
            record.reject(this.createFailure('completion-timeout', cmdId, record.responses));
        }
        this.pending.clear();
    }

    public cancel(cmdId: string, reason: CommandFailureReason = 'error'): void {
        const record = this.pending.get(cmdId);
        if (!record) {
            return;
        }
        this.rejectCommand(record, reason, cmdId);
    }

    public register(
        cmdId: string,
        options: { expectAck?: boolean } = {},
    ): Promise<CommandCompletionResult> {
        if (this.disposed) {
            return Promise.reject(new Error('Tracker has been disposed'));
        }
        if (this.pending.has(cmdId)) {
            return Promise.reject(new Error(`Command ${cmdId} already registered`));
        }

        const expectAck = options.expectAck ?? true;

        return new Promise<CommandCompletionResult>((resolve, reject) => {
            const ackTimer =
                expectAck && this.ackTimeoutMs > 0
                    ? setTimeout(() => {
                          this.failCommand(cmdId, 'ack-timeout');
                      }, this.ackTimeoutMs)
                    : null;

            const completionTimer = setTimeout(() => {
                this.failCommand(cmdId, 'completion-timeout');
            }, this.completionTimeoutMs);

            const pending: PendingCommand = {
                expectAck,
                responses: [],
                resolve,
                reject,
                ackTimer,
                completionTimer,
                settled: false,
            };

            this.pending.set(cmdId, pending);
        });
    }

    public handleResponse(response: CommandResponsePayload): void {
        if (this.disposed) {
            return;
        }
        const record = this.pending.get(response.cmdId);
        if (!record || record.settled) {
            return;
        }

        record.responses.push(response);

        if (response.status === 'ack' && record.ackTimer) {
            clearTimeout(record.ackTimer);
            record.ackTimer = null;
        }

        if (response.status === 'error') {
            this.rejectCommand(record, 'error', response.cmdId);
            return;
        }

        if (response.status === 'done') {
            this.resolveCommand(record, response.cmdId);
        }
    }

    private resolveCommand(record: PendingCommand, cmdId: string): void {
        if (record.settled) {
            return;
        }
        record.settled = true;
        this.clearTimers(record);
        this.pending.delete(cmdId);
        record.resolve({
            cmdId,
            responses: record.responses.slice(),
        });
    }

    private rejectCommand(record: PendingCommand, kind: CommandFailureReason, cmdId: string): void {
        if (record.settled) {
            return;
        }
        record.settled = true;
        this.clearTimers(record);
        this.pending.delete(cmdId);
        const failure = this.createFailure(kind, cmdId, record.responses);
        record.reject(failure);
    }

    private failCommand(cmdId: string, kind: CommandFailureReason): void {
        const record = this.pending.get(cmdId);
        if (!record) {
            return;
        }
        this.rejectCommand(record, kind, cmdId);
    }

    private clearTimers(record: PendingCommand): void {
        if (record.ackTimer) {
            clearTimeout(record.ackTimer);
            record.ackTimer = null;
        }
        clearTimeout(record.completionTimer);
    }

    private createFailure(
        kind: CommandFailureReason,
        cmdId: string,
        responses: CommandResponsePayload[],
    ): CommandFailure {
        const failure = new Error(`Command ${cmdId} failed: ${kind}`) as CommandFailure;
        failure.kind = kind;
        failure.command = {
            cmdId,
            responses: responses.slice(),
        };

        const errorPayload = responses.find((entry) => entry.status === 'error');
        if (errorPayload?.errors && errorPayload.errors.length > 0) {
            failure.errorCode = errorPayload.errors[0]?.code;
            failure.message = errorPayload.errors[0]?.message ?? failure.message;
        }

        return failure;
    }
}
