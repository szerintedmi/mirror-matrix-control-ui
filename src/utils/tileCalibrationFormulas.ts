import { formatDecimal } from '@/components/calibration/calibrationMetricsFormatters';
import { MOTOR_MAX_POSITION_STEPS, MOTOR_MIN_POSITION_STEPS } from '@/constants/control';

import type { TileMetrics } from './tileCalibrationCalculations';

/**
 * All generated formula strings for displaying calculation explanations.
 */
export interface TileFormulas {
    adjustedHomeXFormula: string;
    adjustedHomeYFormula: string;
    offsetXFormula: string;
    offsetYFormula: string;
    alignmentStepsFormulaX: string;
    alignmentStepsFormulaY: string;
    perStepFormulaX: string;
    perStepFormulaY: string;
    measuredShiftFormulaX: string;
    measuredShiftFormulaY: string;
    stepScaleFormulaX: string;
    stepScaleFormulaY: string;
    sizeDeltaFormula: string;
    sizeAfterStepFormula: string;
}

/**
 * Generate all formula strings based on computed metrics.
 */
export function generateTileFormulas(metrics: TileMetrics, deltaSteps: number): TileFormulas {
    const {
        home,
        adjustedHome,
        homeOffset,
        perStepX,
        perStepY,
        fallbackStepScaleX,
        fallbackStepScaleY,
        axisStepScale,
        measuredShiftX,
        measuredShiftY,
        sizeDeltaAtStepTest,
        sizeAfterStep,
    } = metrics;

    // Adjusted home formulas
    const adjustedHomeXFormula =
        adjustedHome && home && homeOffset
            ? `\`home.x - homeOffset.dx = ${formatDecimal(home.x)} - ${formatDecimal(
                  homeOffset.dx,
                  { digits: 4, signed: true },
              )}\``
            : '`home.x - homeOffset.dx`';

    const adjustedHomeYFormula =
        adjustedHome && home && homeOffset
            ? `\`home.y - homeOffset.dy = ${formatDecimal(home.y)} - ${formatDecimal(
                  homeOffset.dy,
                  { digits: 4, signed: true },
              )}\``
            : '`home.y - homeOffset.dy`';

    // Offset formulas
    const offsetXFormula =
        homeOffset && home && adjustedHome
            ? `\`home.x - adjustedHome.x = ${formatDecimal(home.x)} - ${formatDecimal(adjustedHome.x)}\``
            : '`home.x - adjustedHome.x`';

    const offsetYFormula =
        homeOffset && home && adjustedHome
            ? `\`home.y - adjustedHome.y = ${formatDecimal(home.y)} - ${formatDecimal(adjustedHome.y)}\``
            : '`home.y - adjustedHome.y`';

    // Alignment steps formulas
    const alignmentStepsFormulaX =
        homeOffset && perStepX
            ? `\`convertNormalizedToSteps(-homeOffset.dx, stepToDisplacement.x, ${MOTOR_MIN_POSITION_STEPS}, ${MOTOR_MAX_POSITION_STEPS})\``
            : '`convertNormalizedToSteps(-homeOffset.dx, stepToDisplacement.x, minSteps, maxSteps)`';

    const alignmentStepsFormulaY =
        homeOffset && perStepY
            ? `\`convertNormalizedToSteps(-homeOffset.dy, stepToDisplacement.y, ${MOTOR_MIN_POSITION_STEPS}, ${MOTOR_MAX_POSITION_STEPS})\``
            : '`convertNormalizedToSteps(-homeOffset.dy, stepToDisplacement.y, minSteps, maxSteps)`';

    // Per-step formulas
    const perStepFormulaX =
        perStepX && measuredShiftX
            ? `\`Δnorm_x ÷ deltaSteps = ${formatDecimal(measuredShiftX, {
                  digits: 4,
                  signed: true,
              })} ÷ ${deltaSteps}\``
            : '`Δnorm_x ÷ deltaSteps`';

    const perStepFormulaY =
        perStepY && measuredShiftY
            ? `\`Δnorm_y ÷ deltaSteps = ${formatDecimal(measuredShiftY, {
                  digits: 4,
                  signed: true,
              })} ÷ ${deltaSteps}\``
            : '`Δnorm_y ÷ deltaSteps`';

    // Measured shift formulas
    const measuredShiftFormulaX =
        perStepX && measuredShiftX
            ? `\`stepToDisplacement.x × deltaSteps = ${formatDecimal(perStepX, {
                  digits: 6,
              })} × ${deltaSteps}\``
            : '`stepToDisplacement.x × deltaSteps`';

    const measuredShiftFormulaY =
        perStepY && measuredShiftY
            ? `\`stepToDisplacement.y × deltaSteps = ${formatDecimal(perStepY, {
                  digits: 6,
              })} × ${deltaSteps}\``
            : '`stepToDisplacement.y × deltaSteps`';

    // Step scale formulas
    const stepScaleFormulaX =
        axisStepScale?.x !== undefined && axisStepScale?.x !== null
            ? '`axes.x.stepScale`'
            : fallbackStepScaleX && perStepX
              ? `\`1 ÷ stepToDisplacement.x = 1 ÷ ${formatDecimal(perStepX, { digits: 6 })}\``
              : '`1 ÷ stepToDisplacement.x`';

    const stepScaleFormulaY =
        axisStepScale?.y !== undefined && axisStepScale?.y !== null
            ? '`axes.y.stepScale`'
            : fallbackStepScaleY && perStepY
              ? `\`1 ÷ stepToDisplacement.y = 1 ÷ ${formatDecimal(perStepY, { digits: 6 })}\``
              : '`1 ÷ stepToDisplacement.y`';

    // Size delta formula
    const sizeDeltaFormula =
        sizeDeltaAtStepTest !== null && home?.size !== undefined && home?.size !== null
            ? `\`size_after_step - home.size = ${formatDecimal(sizeAfterStep, {
                  digits: 4,
              })} - ${formatDecimal(home.size)}\``
            : '`size_after_step - home.size`';

    // Size after step formula
    const sizeAfterStepFormula =
        sizeDeltaAtStepTest !== null && home?.size !== undefined && home?.size !== null
            ? `\`home.size + sizeDeltaAtStepTest = ${formatDecimal(home.size)} + ${formatDecimal(
                  sizeDeltaAtStepTest,
                  { digits: 4, signed: true },
              )}\``
            : '`home.size + sizeDeltaAtStepTest`';

    return {
        adjustedHomeXFormula,
        adjustedHomeYFormula,
        offsetXFormula,
        offsetYFormula,
        alignmentStepsFormulaX,
        alignmentStepsFormulaY,
        perStepFormulaX,
        perStepFormulaY,
        measuredShiftFormulaX,
        measuredShiftFormulaY,
        stepScaleFormulaX,
        stepScaleFormulaY,
        sizeDeltaFormula,
        sizeAfterStepFormula,
    };
}
