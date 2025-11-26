import React, { useCallback, useMemo, useState } from 'react';

/**
 * Configuration for an editable input field with draft/canonical value pattern.
 */
export interface UseEditableInputOptions<T> {
    /**
     * Current canonical value from parent state.
     */
    value: T;
    /**
     * Callback when value should be updated in parent state.
     */
    onChange: (value: T) => void;
    /**
     * Format the canonical value for display (e.g., number → string).
     */
    format: (value: T) => string;
    /**
     * Parse and validate draft input string. Return null if invalid.
     */
    parse: (input: string) => T | null;
    /**
     * Validate raw input string for intermediate typing states.
     * Return false to reject keystrokes (e.g., non-numeric chars).
     */
    validateInput?: (input: string) => boolean;
    /**
     * Optional: Transform parsed value before committing (e.g., clamping).
     * Returns [transformedValue, transformedDisplayString].
     */
    transform?: (value: T) => [T, string];
}

/**
 * Return type for useEditableInput hook.
 */
export interface UseEditableInputResult {
    /**
     * Current displayed value (draft when editing, formatted canonical otherwise).
     */
    displayValue: string;
    /**
     * Whether the input is currently in edit mode.
     */
    isEditing: boolean;
    /**
     * Focus handler - call on input focus.
     */
    onFocus: () => void;
    /**
     * Blur handler - call on input blur.
     */
    onBlur: () => void;
    /**
     * Change handler - call on input change.
     */
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Hook for managing editable input fields with draft/canonical value pattern.
 *
 * Handles the common pattern of:
 * - Displaying formatted canonical value when not editing
 * - Switching to draft value on focus
 * - Validating and parsing input during editing
 * - Committing changes on valid input
 * - Resetting to canonical value on blur
 *
 * @example
 * ```tsx
 * const stepDeltaInput = useEditableInput({
 *   value: runnerSettings.deltaSteps,
 *   onChange: (v) => onUpdateSetting('deltaSteps', v),
 *   format: (v) => v.toString(),
 *   parse: (s) => {
 *     const n = Number(s);
 *     return Number.isNaN(n) ? null : Math.round(n);
 *   },
 *   validateInput: (s) => /^\d*$/.test(s),
 * });
 *
 * <input
 *   value={stepDeltaInput.displayValue}
 *   onFocus={stepDeltaInput.onFocus}
 *   onBlur={stepDeltaInput.onBlur}
 *   onChange={stepDeltaInput.onChange}
 * />
 * ```
 */
export function useEditableInput<T>(options: UseEditableInputOptions<T>): UseEditableInputResult {
    const { value, onChange, format, parse, validateInput, transform } = options;

    const [draft, setDraft] = useState('');
    const [isEditing, setIsEditing] = useState(false);

    const canonicalDisplay = useMemo(() => format(value), [format, value]);

    const displayValue = isEditing ? draft : canonicalDisplay;

    const handleFocus = useCallback(() => {
        setIsEditing(true);
        setDraft(canonicalDisplay);
    }, [canonicalDisplay]);

    const handleBlur = useCallback(() => {
        setIsEditing(false);
        setDraft('');
    }, []);

    const handleChange = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            const { value: inputValue } = event.target;

            // Validate raw input if validator provided
            if (validateInput && !validateInput(inputValue)) {
                return;
            }

            setDraft(inputValue);

            // Don't commit empty or incomplete values
            if (inputValue === '' || inputValue.endsWith('.')) {
                return;
            }

            // Parse and validate
            const parsed = parse(inputValue);
            if (parsed === null) {
                return;
            }

            // Apply transform if provided
            if (transform) {
                const [transformed, displayStr] = transform(parsed);
                if (displayStr !== inputValue) {
                    setDraft(displayStr);
                }
                // Only commit if different from current value
                if (transformed !== value) {
                    onChange(transformed);
                }
            } else {
                // Only commit if different from current value
                if (parsed !== value) {
                    onChange(parsed);
                }
            }
        },
        [validateInput, parse, transform, value, onChange],
    );

    return {
        displayValue,
        isEditing,
        onFocus: handleFocus,
        onBlur: handleBlur,
        onChange: handleChange,
    };
}
