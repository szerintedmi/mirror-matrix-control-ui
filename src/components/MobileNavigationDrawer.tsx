import React, { useState } from 'react';

import type { Page } from '../App';

interface NavigationItem {
    page: Page;
    label: string;
    icon: React.ReactNode;
}

interface MobileNavigationDrawerProps {
    open: boolean;
    onClose: () => void;
    items: NavigationItem[];
    legacyItems?: NavigationItem[];
    activePage: Page;
    onNavigate: (page: Page) => void;
}

const MobileNavigationDrawer: React.FC<MobileNavigationDrawerProps> = ({
    open,
    onClose,
    items,
    legacyItems = [],
    activePage,
    onNavigate,
}) => {
    const [legacyExpanded, setLegacyExpanded] = useState(false);
    const isLegacyPageActive = legacyItems.some((item) => item.page === activePage);
    if (!open) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true">
            <div className="relative h-full w-72 flex-shrink-0 bg-gray-950 px-5 py-6 shadow-lg">
                <div className="mb-6 flex items-center justify-between">
                    <span className="text-sm font-semibold uppercase tracking-wide text-gray-400">
                        Navigation
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded border border-gray-700 px-3 py-1 text-sm text-gray-400 hover:border-gray-500 hover:text-gray-200"
                    >
                        Close
                    </button>
                </div>
                <ul className="flex flex-col gap-2">
                    {items.map((item) => {
                        const isActive = item.page === activePage;
                        return (
                            <li key={item.page}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onNavigate(item.page);
                                        onClose();
                                    }}
                                    className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm font-medium ${
                                        isActive
                                            ? 'border-emerald-400 bg-gray-800 text-emerald-300'
                                            : 'border-transparent text-gray-300 hover:bg-gray-800 hover:text-gray-100'
                                    }`}
                                >
                                    <span
                                        className={`flex h-9 w-9 items-center justify-center rounded-md bg-gray-800 ${
                                            isActive ? 'text-emerald-300' : 'text-gray-300'
                                        }`}
                                    >
                                        {item.icon}
                                    </span>
                                    <span>{item.label}</span>
                                </button>
                            </li>
                        );
                    })}

                    {/* Legacy submenu */}
                    {legacyItems.length > 0 && (
                        <li className="mt-2 border-t border-gray-800 pt-2">
                            <button
                                type="button"
                                onClick={() => setLegacyExpanded(!legacyExpanded)}
                                className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm font-medium ${
                                    isLegacyPageActive && !legacyExpanded
                                        ? 'border-emerald-400/50 bg-gray-800/50 text-emerald-300'
                                        : 'border-transparent text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                                }`}
                            >
                                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-gray-800 text-gray-500">
                                    <svg
                                        className={`h-4 w-4 transition-transform ${legacyExpanded ? 'rotate-90' : ''}`}
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M9 5l7 7-7 7"
                                        />
                                    </svg>
                                </span>
                                <span>Legacy</span>
                            </button>

                            {legacyExpanded && (
                                <ul className="ml-4 mt-1 flex flex-col gap-1 border-l border-gray-800 pl-2">
                                    {legacyItems.map((item) => {
                                        const isActive = item.page === activePage;
                                        return (
                                            <li key={item.page}>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        onNavigate(item.page);
                                                        onClose();
                                                    }}
                                                    className={`flex w-full items-center gap-3 rounded-md border px-3 py-1.5 text-left text-xs font-medium ${
                                                        isActive
                                                            ? 'border-emerald-400 bg-gray-800 text-emerald-300'
                                                            : 'border-transparent text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                                                    }`}
                                                >
                                                    <span
                                                        className={`flex h-7 w-7 items-center justify-center rounded-md bg-gray-800 ${
                                                            isActive
                                                                ? 'text-emerald-300'
                                                                : 'text-gray-400'
                                                        }`}
                                                    >
                                                        {item.icon}
                                                    </span>
                                                    <span>{item.label}</span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </li>
                    )}
                </ul>
            </div>
            <button
                type="button"
                aria-label="Close navigation overlay"
                className="flex-1 bg-black/50"
                onClick={onClose}
            />
        </div>
    );
};

export default MobileNavigationDrawer;
