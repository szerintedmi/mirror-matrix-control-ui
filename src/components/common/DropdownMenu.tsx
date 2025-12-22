import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface DropdownMenuItem {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    variant?: 'default' | 'danger';
    disabled?: boolean;
}

interface DropdownMenuProps {
    items: DropdownMenuItem[];
    triggerClassName?: string;
    menuClassName?: string;
    align?: 'left' | 'right';
}

const DropdownMenu: React.FC<DropdownMenuProps> = ({
    items,
    triggerClassName = '',
    menuClassName = '',
    align = 'right',
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleToggle = useCallback(() => {
        setIsOpen((prev) => !prev);
    }, []);

    const handleItemClick = useCallback((item: DropdownMenuItem) => {
        if (item.disabled) return;
        item.onClick();
        setIsOpen(false);
    }, []);

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    // Close on escape
    useEffect(() => {
        if (!isOpen) return;

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen]);

    return (
        <div ref={containerRef} className="relative inline-block">
            <button
                type="button"
                onClick={handleToggle}
                className={`flex size-7 items-center justify-center rounded-md border border-gray-700 bg-gray-900 text-gray-400 transition hover:border-gray-600 hover:text-gray-200 ${triggerClassName}`}
                aria-haspopup="true"
                aria-expanded={isOpen}
            >
                <svg className="size-4" fill="currentColor" viewBox="0 0 20 20">
                    <circle cx="10" cy="4" r="1.5" />
                    <circle cx="10" cy="10" r="1.5" />
                    <circle cx="10" cy="16" r="1.5" />
                </svg>
            </button>

            {isOpen && (
                <div
                    className={`absolute z-50 mt-1 min-w-[140px] rounded-md border border-gray-700 bg-gray-900 py-1 shadow-lg ${
                        align === 'right' ? 'right-0' : 'left-0'
                    } ${menuClassName}`}
                >
                    {items.map((item, index) => (
                        <button
                            key={index}
                            type="button"
                            onClick={() => handleItemClick(item)}
                            disabled={item.disabled}
                            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition ${
                                item.disabled
                                    ? 'cursor-not-allowed text-gray-600'
                                    : item.variant === 'danger'
                                      ? 'text-rose-300 hover:bg-rose-500/10'
                                      : 'text-gray-300 hover:bg-gray-800'
                            }`}
                        >
                            {item.icon && (
                                <span className="size-3.5 flex-shrink-0">{item.icon}</span>
                            )}
                            <span>{item.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DropdownMenu;
