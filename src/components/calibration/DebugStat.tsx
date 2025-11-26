import React from 'react';

export interface DebugStatProps {
    label: string;
    value: string;
    formula?: React.ReactNode;
}

/**
 * Displays a single debug statistic with optional formula explanation.
 * Formula strings support backtick-delimited code segments that render
 * as highlighted code spans.
 */
const DebugStat: React.FC<DebugStatProps> = ({ label, value, formula }) => {
    const renderFormula = (content: React.ReactNode) => {
        if (typeof content === 'string') {
            const segments = content.split(/`([^`]+)`/g);
            return segments.map((segment, index) =>
                index % 2 === 1 ? (
                    <code key={`${segment}-${index}`} className="font-mono text-emerald-200">
                        {segment}
                    </code>
                ) : (
                    <span key={index}>{segment}</span>
                ),
            );
        }
        return content;
    };

    return (
        <div className="rounded-md border border-gray-800/70 bg-gray-950/50 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
            <p className="mt-1 font-mono text-base text-gray-100">{value}</p>
            {formula ? (
                <p className="mt-1 text-xs text-gray-400">{renderFormula(formula)}</p>
            ) : null}
        </div>
    );
};

export default DebugStat;
