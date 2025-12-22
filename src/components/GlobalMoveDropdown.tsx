import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { showCommandErrorToast } from '@/components/common/StyledToast';
import { DEFAULT_STAGING_POSITION } from '@/constants/calibration';
import { MOTOR_MAX_POSITION_STEPS, MOTOR_MIN_POSITION_STEPS } from '@/constants/control';
import { useCalibrationContext } from '@/context/CalibrationContext';
import { useCommandFeedback } from '@/hooks/useCommandFeedback';
import { useMotorCommands } from '@/hooks/useMotorCommands';
import { computePoseTargets, type StagingConfig } from '@/services/calibration';
import type { CalibrationRunSummary } from '@/services/calibration/types';
import { profileToRunSummary } from '@/services/calibrationProfileStorage';
import type { MirrorConfig, Motor } from '@/types';
import type { CommandErrorDetail } from '@/types/commandError';
import { extractCommandErrorDetail } from '@/utils/commandErrors';

interface AxisTargetCommand {
    key: string;
    motor: Motor;
    steps: number;
}

interface TileAssignment {
    key: string;
    row: number;
    col: number;
    x: Motor | null;
    y: Motor | null;
}

const clampAxisSteps = (value: number): number => {
    if (!Number.isFinite(value)) {
        return 0;
    }
    const rounded = Math.round(value);
    return Math.min(MOTOR_MAX_POSITION_STEPS, Math.max(MOTOR_MIN_POSITION_STEPS, rounded));
};

const computeAxisTargetSteps = (
    displacement: number,
    perStep: number | null | undefined,
): number | null => {
    if (perStep === null || perStep === undefined) {
        return null;
    }
    if (!Number.isFinite(perStep) || Math.abs(perStep) < 1e-6) {
        return null;
    }
    const rawSteps = displacement / perStep;
    if (!Number.isFinite(rawSteps)) {
        return null;
    }
    return clampAxisSteps(rawSteps);
};

const buildUniqueAxisTargets = (
    tiles: TileAssignment[],
    resolveSteps: (entry: TileAssignment, axis: 'x' | 'y') => number | null,
): AxisTargetCommand[] => {
    const axisMap = new Map<string, AxisTargetCommand>();
    tiles.forEach((entry) => {
        (['x', 'y'] as const).forEach((axis) => {
            const motor = entry[axis];
            if (!motor) {
                return;
            }
            const steps = resolveSteps(entry, axis);
            if (steps === null) {
                return;
            }
            const key = `${motor.nodeMac}:${motor.motorIndex}`;
            if (!axisMap.has(key)) {
                axisMap.set(key, { key, motor, steps: clampAxisSteps(steps) });
            }
        });
    });
    return Array.from(axisMap.values());
};

const buildCalibratedAxisTargets = (
    summary: CalibrationRunSummary | null,
    tiles: TileAssignment[],
): AxisTargetCommand[] => {
    if (!summary?.gridBlueprint) {
        return [];
    }
    return buildUniqueAxisTargets(tiles, (entry, axis) => {
        const result = summary.tiles[entry.key];
        if (!result || result.status !== 'completed' || !result.homeOffset) {
            return null;
        }
        const perStep =
            axis === 'x'
                ? (result.stepToDisplacement?.x ?? null)
                : (result.stepToDisplacement?.y ?? null);
        const displacement = axis === 'x' ? -result.homeOffset.dx : -result.homeOffset.dy;
        return computeAxisTargetSteps(displacement, perStep);
    });
};

const buildPhysicalAxisTargets = (tiles: TileAssignment[]): AxisTargetCommand[] =>
    buildUniqueAxisTargets(tiles, () => 0);

const buildStagingAxisTargets = (
    tiles: TileAssignment[],
    config: StagingConfig,
): AxisTargetCommand[] =>
    buildUniqueAxisTargets(tiles, (entry, axis) => {
        const targets = computePoseTargets({ row: entry.row, col: entry.col }, 'aside', config);
        return axis === 'x' ? targets.x : targets.y;
    });

interface GlobalMoveDropdownProps {
    gridSize: { rows: number; cols: number };
    mirrorConfig: MirrorConfig;
}

const GlobalMoveDropdown: React.FC<GlobalMoveDropdownProps> = ({ gridSize, mirrorConfig }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const { moveMotor, homeAll } = useMotorCommands();
    const calibratedHomeFeedback = useCommandFeedback();
    const physicalHomeFeedback = useCommandFeedback();
    const stagingFeedback = useCommandFeedback();
    const homeAllFeedback = useCommandFeedback();

    const { selectedProfile } = useCalibrationContext();

    // Build tile assignments from mirrorConfig
    const tileAssignments = useMemo<TileAssignment[]>(() => {
        const assignments: TileAssignment[] = [];
        for (let row = 0; row < gridSize.rows; row++) {
            for (let col = 0; col < gridSize.cols; col++) {
                const key = `${row}-${col}`;
                const config = mirrorConfig.get(key);
                assignments.push({
                    key,
                    row,
                    col,
                    x: config?.x ?? null,
                    y: config?.y ?? null,
                });
            }
        }
        return assignments;
    }, [gridSize, mirrorConfig]);

    // Get profile summary from selected profile
    const profileSummary = useMemo<CalibrationRunSummary | null>(() => {
        if (!selectedProfile) {
            return null;
        }
        return profileToRunSummary(selectedProfile);
    }, [selectedProfile]);

    // Use arrayRotation from profile, default to 0
    const arrayRotation = selectedProfile?.arrayRotation ?? 0;

    const stagingConfig: StagingConfig = useMemo(
        () => ({
            gridSize,
            arrayRotation,
            stagingPosition: DEFAULT_STAGING_POSITION,
        }),
        [gridSize, arrayRotation],
    );

    const calibratedAxisTargets = useMemo(
        () => buildCalibratedAxisTargets(profileSummary, tileAssignments),
        [profileSummary, tileAssignments],
    );
    const physicalAxisTargets = useMemo(
        () => buildPhysicalAxisTargets(tileAssignments),
        [tileAssignments],
    );
    const stagingAxisTargets = useMemo(
        () => buildStagingAxisTargets(tileAssignments, stagingConfig),
        [tileAssignments, stagingConfig],
    );

    const hasAnyMotors = tileAssignments.some((t) => t.x !== null || t.y !== null);

    // Collect unique MAC addresses for home all
    const uniqueMacAddresses = useMemo(() => {
        const macs = new Set<string>();
        tileAssignments.forEach((t) => {
            if (t.x) macs.add(t.x.nodeMac);
            if (t.y) macs.add(t.y.nodeMac);
        });
        return Array.from(macs);
    }, [tileAssignments]);

    const calibratedButtonDisabled =
        calibratedAxisTargets.length === 0 || calibratedHomeFeedback.feedback.state === 'pending';
    const physicalButtonDisabled =
        physicalAxisTargets.length === 0 || physicalHomeFeedback.feedback.state === 'pending';
    const stagingButtonDisabled =
        stagingAxisTargets.length === 0 || stagingFeedback.feedback.state === 'pending';
    const homeAllButtonDisabled =
        uniqueMacAddresses.length === 0 || homeAllFeedback.feedback.state === 'pending';

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const executeMove = useCallback(
        async (
            targets: AxisTargetCommand[],
            feedback: ReturnType<typeof useCommandFeedback>,
            label: string,
            beginMsg: string,
            successMsg: string,
        ) => {
            if (!targets.length) {
                feedback.fail('No motors available for this action.');
                return;
            }
            feedback.begin(beginMsg);
            setIsOpen(false);

            const settled = await Promise.allSettled(
                targets.map((target) =>
                    moveMotor({
                        mac: target.motor.nodeMac,
                        motorId: target.motor.motorIndex,
                        positionSteps: target.steps,
                    }),
                ),
            );

            const errors: CommandErrorDetail[] = [];
            settled.forEach((result, index) => {
                if (result.status === 'rejected') {
                    const target = targets[index];
                    errors.push(
                        extractCommandErrorDetail(result.reason, {
                            controller: target.motor.nodeMac,
                            motorId: target.motor.motorIndex,
                        }),
                    );
                }
            });

            if (errors.length > 0) {
                feedback.fail(`${errors.length} motors failed`);
                showCommandErrorToast({
                    title: label,
                    totalCount: targets.length,
                    errors,
                });
            } else {
                feedback.succeed(successMsg);
            }
        },
        [moveMotor],
    );

    const handleCalibratedHome = useCallback(() => {
        if (!profileSummary?.gridBlueprint) {
            calibratedHomeFeedback.fail('Load a calibration profile first.');
            return;
        }
        executeMove(
            calibratedAxisTargets,
            calibratedHomeFeedback,
            'Calibrated home',
            'Moving to calibrated home…',
            'Calibrated home applied.',
        );
    }, [calibratedAxisTargets, calibratedHomeFeedback, profileSummary, executeMove]);

    const handlePhysicalHome = useCallback(() => {
        executeMove(
            physicalAxisTargets,
            physicalHomeFeedback,
            'Physical home',
            'Moving to physical home…',
            'Physical home applied.',
        );
    }, [executeMove, physicalAxisTargets, physicalHomeFeedback]);

    const handleStaging = useCallback(() => {
        executeMove(
            stagingAxisTargets,
            stagingFeedback,
            'Stage position',
            'Moving to stage position…',
            'Stage position applied.',
        );
    }, [executeMove, stagingAxisTargets, stagingFeedback]);

    const handleHomeAll = useCallback(async () => {
        if (uniqueMacAddresses.length === 0) {
            homeAllFeedback.fail('No motors available for homing.');
            return;
        }
        homeAllFeedback.begin('Homing all motors…');
        setIsOpen(false);

        try {
            await homeAll({ macAddresses: uniqueMacAddresses });
            homeAllFeedback.succeed('All motors homed.');
        } catch (error) {
            const detail = extractCommandErrorDetail(error);
            homeAllFeedback.fail(detail.errorMessage ?? 'Home all failed.');
        }
    }, [uniqueMacAddresses, homeAll, homeAllFeedback]);

    const activeFeedback = useMemo(() => {
        const feedbacks = [
            calibratedHomeFeedback.feedback,
            physicalHomeFeedback.feedback,
            stagingFeedback.feedback,
            homeAllFeedback.feedback,
        ];
        // Show the most recently updated feedback (by timestamp)
        return feedbacks
            .filter((f) => f.state !== 'idle' && f.message && f.timestamp)
            .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))[0];
    }, [
        calibratedHomeFeedback.feedback,
        physicalHomeFeedback.feedback,
        stagingFeedback.feedback,
        homeAllFeedback.feedback,
    ]);

    // Don't render if no motors are configured
    if (!hasAnyMotors) {
        return null;
    }

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-1.5 rounded-md border border-gray-600 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-200 transition hover:bg-gray-700"
            >
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                    />
                </svg>
                Move
                <svg
                    className={`size-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                    />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute top-full right-0 z-50 mt-1 min-w-[180px] rounded-md border border-gray-700 bg-gray-900 py-1 shadow-lg">
                    <button
                        type="button"
                        onClick={handleCalibratedHome}
                        disabled={calibratedButtonDisabled}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-200 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Move all calibrated tiles to their aligned home positions"
                    >
                        <span
                            className={`size-2 rounded-full ${calibratedAxisTargets.length > 0 ? 'bg-emerald-500' : 'bg-gray-600'}`}
                        />
                        To calibrated home
                    </button>
                    <button
                        type="button"
                        onClick={handlePhysicalHome}
                        disabled={physicalButtonDisabled}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-200 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Move every motor back to its mechanical zero"
                    >
                        <span className="size-2 rounded-full bg-gray-400" />
                        To physical home
                    </button>
                    <button
                        type="button"
                        onClick={handleStaging}
                        disabled={stagingButtonDisabled}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-200 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Move tiles to staging position based on calibration settings"
                    >
                        <span className="size-2 rounded-full bg-sky-500" />
                        To stage position
                    </button>

                    {/* Divider */}
                    <div className="my-1 border-t border-gray-700" />

                    <button
                        type="button"
                        onClick={handleHomeAll}
                        disabled={homeAllButtonDisabled}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-200 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Run homing sequence on all motor controllers"
                    >
                        <svg
                            className="size-4 text-orange-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                            />
                        </svg>
                        Home all motors
                    </button>
                </div>
            )}

            {activeFeedback && activeFeedback.message && (
                <div
                    className={`absolute top-full right-0 mt-1 rounded px-2 py-1 text-[10px] whitespace-nowrap ${
                        activeFeedback.state === 'error'
                            ? 'bg-rose-900/80 text-rose-200'
                            : activeFeedback.state === 'pending'
                              ? 'bg-amber-900/80 text-amber-200'
                              : 'bg-emerald-900/80 text-emerald-200'
                    }`}
                >
                    {activeFeedback.message}
                </div>
            )}
        </div>
    );
};

export default GlobalMoveDropdown;
