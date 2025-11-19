// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

import {
    PendingCommandTracker,
    type CommandResponsePayload,
    type CommandFailure,
} from '../pendingCommandTracker';

const createResponse = (
    cmdId: string,
    status: CommandResponsePayload['status'],
): CommandResponsePayload => ({
    cmdId,
    action: 'MOVE',
    status,
});

describe('PendingCommandTracker', () => {
    test('resolves when done response arrives', async () => {
        const tracker = new PendingCommandTracker({
            ackTimeoutMs: 10_000,
            completionTimeoutMs: 10_000,
        });

        const promise = tracker.register('cmd-1');

        tracker.handleResponse(createResponse('cmd-1', 'ack'));
        tracker.handleResponse(createResponse('cmd-1', 'done'));

        await expect(promise).resolves.toMatchObject({
            cmdId: 'cmd-1',
            responses: [{ status: 'ack' }, { status: 'done' }],
        });
    });

    test('rejects when error response arrives', async () => {
        const tracker = new PendingCommandTracker({
            ackTimeoutMs: 10_000,
            completionTimeoutMs: 10_000,
        });
        const promise = tracker.register('cmd-2');
        tracker.handleResponse(createResponse('cmd-2', 'error'));

        await expect(promise).rejects.toMatchObject({
            kind: 'error',
            command: {
                cmdId: 'cmd-2',
            },
        } as CommandFailure);
    });

    test('rejects on ack timeout when expected', async () => {
        vi.useFakeTimers();
        const tracker = new PendingCommandTracker({ ackTimeoutMs: 5, completionTimeoutMs: 20 });
        const promise = tracker.register('cmd-3');

        vi.advanceTimersByTime(6);

        await expect(promise).rejects.toMatchObject({ kind: 'ack-timeout' });
        vi.useRealTimers();
    });

    test('rejects on completion timeout', async () => {
        vi.useFakeTimers();
        const tracker = new PendingCommandTracker({ ackTimeoutMs: 10, completionTimeoutMs: 15 });
        const promise = tracker.register('cmd-4', { expectAck: false });

        vi.advanceTimersByTime(20);

        await expect(promise).rejects.toMatchObject({ kind: 'completion-timeout' });
        vi.useRealTimers();
    });

    test('ignores duplicate resolutions after settled', async () => {
        const tracker = new PendingCommandTracker({
            ackTimeoutMs: 10_000,
            completionTimeoutMs: 10_000,
        });

        const promise = tracker.register('cmd-5');

        tracker.handleResponse(createResponse('cmd-5', 'done'));
        tracker.handleResponse(createResponse('cmd-5', 'done'));

        await expect(promise).resolves.toMatchObject({
            responses: [{ status: 'done' }],
        });
    });
});
