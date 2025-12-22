import React from 'react';

import PatternPreview from '@/components/PatternPreview';
import type { Pattern } from '@/types';

interface SequencePreviewProps {
    patternIds: string[];
    patterns: Pattern[];
    className?: string;
}

const SequencePreview: React.FC<SequencePreviewProps> = ({
    patternIds,
    patterns,
    className = '',
}) => {
    const patternMap = new Map(patterns.map((p) => [p.id, p]));
    const previewPatterns = patternIds
        .slice(0, 4)
        .map((id) => patternMap.get(id))
        .filter((p): p is Pattern => Boolean(p));

    if (previewPatterns.length === 0) {
        return (
            <div
                className={`flex items-center justify-center bg-gray-900/50 text-xs text-gray-500 ${className}`}
            >
                Empty
            </div>
        );
    }

    return (
        <div className={`flex gap-1 overflow-hidden ${className}`}>
            {previewPatterns.map((pattern, index) => (
                <div
                    key={`${pattern.id}-${index}`}
                    className="relative aspect-square h-full flex-shrink-0"
                >
                    <PatternPreview
                        pattern={pattern}
                        className="size-full rounded-sm border border-gray-700/50"
                    />
                    {index < patternIds.length - 1 && index === previewPatterns.length - 1 && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-[10px] font-bold text-white">
                            +{patternIds.length - previewPatterns.length}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

export default SequencePreview;
