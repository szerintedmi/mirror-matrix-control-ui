import { toast } from 'sonner';

import type { CommandErrorContext, CommandErrorDetail } from '@/types/commandError';

import type { ReactNode } from 'react';

// ============================================================================
// Shared Toast Components
// ============================================================================

type ToastVariant = 'error' | 'warning';

const VARIANT_STYLES: Record<
    ToastVariant,
    {
        border: string;
        bg: string;
        title: string;
        text: string;
        accent: string;
        listBorder: string;
    }
> = {
    error: {
        border: 'border-rose-500/50',
        bg: 'bg-rose-950',
        title: 'text-rose-100',
        text: 'text-rose-200/80',
        accent: 'text-rose-300',
        listBorder: 'border-rose-500/40',
    },
    warning: {
        border: 'border-amber-500/50',
        bg: 'bg-amber-950',
        title: 'text-amber-100',
        text: 'text-amber-200/80',
        accent: 'text-amber-300',
        listBorder: 'border-amber-500/40',
    },
};

function DismissButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="flex-none rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
            aria-label="Dismiss"
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="size-4"
            >
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
        </button>
    );
}

interface StyledToastShellProps {
    variant: ToastVariant;
    children: ReactNode;
    onDismiss: () => void;
}

function StyledToastShell({ variant, children, onDismiss }: StyledToastShellProps) {
    const styles = VARIANT_STYLES[variant];
    return (
        <div className={`w-[356px] rounded-lg border ${styles.border} ${styles.bg} p-4 shadow-lg`}>
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">{children}</div>
                <DismissButton onClick={onDismiss} />
            </div>
        </div>
    );
}

// ============================================================================
// Command Error Toast (for motor command failures)
// ============================================================================

interface Props {
    context: CommandErrorContext;
}

function reasonLabel(reason: string): string {
    switch (reason) {
        case 'ack-timeout':
            return 'No response';
        case 'completion-timeout':
            return 'Timed out';
        case 'error':
            return 'Error';
        default:
            return reason;
    }
}

export function CommandErrorToast({ context }: Props) {
    const { title, totalCount, errors } = context;
    const styles = VARIANT_STYLES.error;

    return (
        <div className="text-sm select-text">
            <div className={`font-medium ${styles.title}`}>
                {errors.length}/{totalCount} commands failed: {title}
            </div>

            <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto text-xs text-gray-300">
                {errors.map((e, i) => (
                    <li key={i} className={`border-l-2 ${styles.listBorder} pl-2`}>
                        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                            {e.row !== undefined && e.col !== undefined && (
                                <span className="text-gray-400">
                                    [{e.row},{e.col}]
                                </span>
                            )}
                            <span className="text-gray-400">{e.controller}</span>
                            {e.motorId !== undefined && (
                                <span>
                                    motor {e.motorId}
                                    {e.axis ? ` (${e.axis})` : ''}
                                </span>
                            )}
                        </div>
                        <div className={styles.accent}>
                            <span>{reasonLabel(e.reason)}</span>
                            {e.errorCode && <span className="text-rose-400"> ({e.errorCode})</span>}
                            {e.errorMessage && (
                                <div className={`mt-0.5 ${styles.text}`}>{e.errorMessage}</div>
                            )}
                        </div>
                        <div className="font-mono text-[10px] text-gray-500">cmd: {e.cmdId}</div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function showCommandErrorToast(context: CommandErrorContext): void {
    toast.custom(
        (toastId) => (
            <StyledToastShell variant="error" onDismiss={() => toast.dismiss(toastId)}>
                <CommandErrorToast context={context} />
            </StyledToastShell>
        ),
        {
            duration: Infinity,
            unstyled: true,
        },
    );
}

/**
 * Convenience for single error (e.g., nudge, single home)
 */
export function showSingleCommandErrorToast(title: string, error: CommandErrorDetail): void {
    showCommandErrorToast({
        title,
        totalCount: 1,
        errors: [error],
    });
}

// ============================================================================
// Simple Toast (for non-command errors/warnings)
// ============================================================================

interface SimpleToastContentProps {
    variant: ToastVariant;
    title: string;
    message: string;
}

function SimpleToastContent({ variant, title, message }: SimpleToastContentProps) {
    const styles = VARIANT_STYLES[variant];
    return (
        <div className="text-sm select-text">
            <div className={`font-medium ${styles.title}`}>{title}</div>
            <p className={`mt-1 text-xs ${styles.text}`}>{message}</p>
        </div>
    );
}

/**
 * Simple error toast for non-command errors (e.g., detection failures, validation errors)
 */
export function showSimpleErrorToast(title: string, message: string): void {
    toast.custom(
        (toastId) => (
            <StyledToastShell variant="error" onDismiss={() => toast.dismiss(toastId)}>
                <SimpleToastContent variant="error" title={title} message={message} />
            </StyledToastShell>
        ),
        {
            duration: Infinity,
            unstyled: true,
        },
    );
}

/**
 * Simple warning toast for non-critical issues (e.g., outliers detected, degraded performance)
 */
export function showSimpleWarningToast(title: string, message: string): void {
    toast.custom(
        (toastId) => (
            <StyledToastShell variant="warning" onDismiss={() => toast.dismiss(toastId)}>
                <SimpleToastContent variant="warning" title={title} message={message} />
            </StyledToastShell>
        ),
        {
            duration: Infinity,
            unstyled: true,
        },
    );
}

// ============================================================================
// List Toast (for multiple items - errors or warnings)
// ============================================================================

export interface TileError {
    row: number;
    col: number;
    message: string;
}

interface ListToastContentProps {
    variant: ToastVariant;
    title: string;
    items: TileError[];
    itemLabel?: string;
}

function ListToastContent({ variant, title, items, itemLabel = 'error' }: ListToastContentProps) {
    const styles = VARIANT_STYLES[variant];
    const plural = items.length !== 1 ? 's' : '';

    return (
        <div className="text-sm select-text">
            <div className={`font-medium ${styles.title}`}>
                {items.length} {itemLabel}
                {plural}: {title}
            </div>
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
                {items.map((e, i) => (
                    <li key={i} className={`border-l-2 ${styles.listBorder} pl-2`}>
                        <span className="text-gray-400">
                            [{e.row},{e.col}]
                        </span>{' '}
                        <span className={styles.text}>{e.message}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/**
 * Warning toast with a list of tile items (e.g., outlier tiles)
 */
export function showListWarningToast(title: string, items: TileError[], itemLabel = 'issue'): void {
    toast.custom(
        (toastId) => (
            <StyledToastShell variant="warning" onDismiss={() => toast.dismiss(toastId)}>
                <ListToastContent
                    variant="warning"
                    title={title}
                    items={items}
                    itemLabel={itemLabel}
                />
            </StyledToastShell>
        ),
        {
            duration: Infinity,
            unstyled: true,
        },
    );
}

// ============================================================================
// Accumulating Error Toast
// ============================================================================

interface AccumulatingToastState {
    title: string;
    errors: TileError[];
}

function AccumulatingErrorToastContent({
    state,
    onDismiss,
}: {
    state: AccumulatingToastState;
    onDismiss: () => void;
}) {
    return (
        <StyledToastShell variant="error" onDismiss={onDismiss}>
            <ListToastContent
                variant="error"
                title={state.title}
                items={state.errors}
                itemLabel="error"
            />
        </StyledToastShell>
    );
}

/**
 * Creates an accumulating error toast manager for calibration.
 * Errors are accumulated and displayed in a single toast that updates as new errors arrive.
 */
export function createAccumulatingErrorToast(title: string) {
    const TOAST_ID = `accumulating-error-${title.replace(/\s+/g, '-').toLowerCase()}`;
    const state: AccumulatingToastState = { title, errors: [] };

    const updateToast = () => {
        toast.custom(
            () => (
                <AccumulatingErrorToastContent
                    state={{ ...state }}
                    onDismiss={() => {
                        toast.dismiss(TOAST_ID);
                        state.errors = [];
                    }}
                />
            ),
            {
                id: TOAST_ID,
                duration: Infinity,
                unstyled: true,
            },
        );
    };

    return {
        /** Add an error to the toast. Shows toast on first error, updates on subsequent errors. */
        addError: (error: TileError) => {
            state.errors.push(error);
            updateToast();
        },
        /** Clear all errors and dismiss the toast */
        clear: () => {
            state.errors = [];
            toast.dismiss(TOAST_ID);
        },
        /** Get current error count */
        getErrorCount: () => state.errors.length,
    };
}
