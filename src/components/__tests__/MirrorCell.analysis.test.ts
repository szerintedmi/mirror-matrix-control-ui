import { describe, expect, it } from 'vitest';

import { analyzeMirrorCell } from '../MirrorCell';

import type { DriverStatusSnapshot, MirrorAssignment, Motor } from '../../types';

const createMotor = (nodeMac: string, motorIndex: number): Motor => ({ nodeMac, motorIndex });

const asMap = (
    entries: Array<[string, DriverStatusSnapshot]>,
): Map<string, DriverStatusSnapshot> => new Map(entries);

describe('analyzeMirrorCell', () => {
    it('returns defaults when no motors are assigned', () => {
        const assignment: MirrorAssignment = { x: null, y: null };
        const analysis = analyzeMirrorCell(assignment, new Map());

        expect(analysis.crossDriver).toBe(false);
        expect(analysis.orphanAxis).toBe(false);
        expect(analysis.hasOffline).toBe(false);
        expect(analysis.warningBadges).toEqual([]);
        expect(analysis.variants).toEqual({ x: 'default', y: 'default' });
    });

    it('flags mixed driver assignments', () => {
        const assignment: MirrorAssignment = {
            x: createMotor('mac-1', 0),
            y: createMotor('mac-2', 1),
        };
        const statuses = asMap([
            ['mac-1', { presence: 'ready', staleForMs: 0, brokerDisconnected: false }],
            ['mac-2', { presence: 'ready', staleForMs: 0, brokerDisconnected: false }],
        ]);

        const analysis = analyzeMirrorCell(assignment, statuses);
        const labels = analysis.warningBadges.map((badge) => badge.label);

        expect(analysis.crossDriver).toBe(true);
        expect(labels).toContain('Mixed drivers');
        expect(analysis.variants).toEqual({ x: 'warning', y: 'warning' });
    });

    it('marks orphan axes with informational tone', () => {
        const assignment: MirrorAssignment = {
            x: createMotor('mac-1', 0),
            y: null,
        };
        const statuses = asMap([
            ['mac-1', { presence: 'ready', staleForMs: 0, brokerDisconnected: false }],
        ]);

        const analysis = analyzeMirrorCell(assignment, statuses);
        const labels = analysis.warningBadges.map((badge) => badge.label);

        expect(analysis.orphanAxis).toBe(true);
        expect(labels).toContain('Needs partner');
        expect(analysis.variants).toEqual({ x: 'info', y: 'default' });
    });

    it('surfaces offline drivers as warnings', () => {
        const assignment: MirrorAssignment = {
            x: createMotor('mac-1', 0),
            y: null,
        };
        const statuses = asMap([
            ['mac-1', { presence: 'offline', staleForMs: 5_000, brokerDisconnected: false }],
        ]);

        const analysis = analyzeMirrorCell(assignment, statuses);
        const labels = analysis.warningBadges.map((badge) => badge.label);

        expect(analysis.hasOffline).toBe(true);
        expect(labels[0]).toBe('Driver offline');
        expect(analysis.variants.x).toBe('warning');
    });
});
