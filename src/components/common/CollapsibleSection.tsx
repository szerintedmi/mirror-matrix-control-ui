import React, { useState } from 'react';

interface CollapsibleSectionProps {
    /** Title displayed in the header */
    title: string;
    /** Optional icon to show before the title */
    icon?: React.ReactNode;
    /** Summary text shown when collapsed (optional) */
    collapsedSummary?: string;
    /** Whether the section starts expanded (default: false) */
    defaultExpanded?: boolean;
    /** Content to render when expanded */
    children: React.ReactNode;
    /** Additional header content (e.g., buttons, badges) placed before the chevron */
    headerActions?: React.ReactNode;
    /** Additional CSS classes for the outer container */
    className?: string;
}

/**
 * A collapsible section with consistent styling across the calibration UI.
 * Based on the CalibrationSettingsPanel design pattern.
 */
const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
    title,
    icon,
    collapsedSummary,
    defaultExpanded = false,
    children,
    headerActions,
    className = '',
}) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    return (
        <section className={`rounded-lg border border-gray-800 bg-gray-950 shadow-lg ${className}`}>
            <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex w-full items-center justify-between gap-3 p-3 text-left transition hover:bg-gray-900/50"
            >
                <div className="flex items-center gap-2">
                    {icon && <span className="size-4 text-gray-400">{icon}</span>}
                    <span className="text-sm font-medium text-gray-200">{title}</span>
                </div>
                <div className="flex items-center gap-3">
                    {!isExpanded && collapsedSummary && (
                        <span className="text-xs text-gray-500">{collapsedSummary}</span>
                    )}
                    {headerActions}
                    <svg
                        className={`size-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
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
                </div>
            </button>

            {isExpanded && <div className="border-t border-gray-800 p-4">{children}</div>}
        </section>
    );
};

export default CollapsibleSection;
