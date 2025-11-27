import React, { useState } from 'react';

import type { Page } from '../App';

interface NavigationItem {
    page: Page;
    label: string;
    icon: React.ReactNode;
}

interface NavigationRailProps {
    items: NavigationItem[];
    legacyItems?: NavigationItem[];
    activePage: Page;
    collapsed: boolean;
    onToggleCollapse: () => void;
    onNavigate: (page: Page) => void;
}

const NavigationRail: React.FC<NavigationRailProps> = ({
    items,
    legacyItems = [],
    activePage,
    collapsed,
    onNavigate,
    onToggleCollapse,
}) => {
    const [legacyExpanded, setLegacyExpanded] = useState(false);
    const isLegacyPageActive = legacyItems.some((item) => item.page === activePage);
    const widthClass = collapsed ? 'w-20' : 'w-64';

    return (
        <aside
            className={`hidden h-full flex-shrink-0 overflow-hidden border-r border-gray-800 bg-gray-950 md:flex ${widthClass}`}
        >
            <nav className="flex h-full w-full flex-col justify-between overflow-y-auto py-6">
                <div className="flex flex-col gap-2 px-4">
                    <div className="flex items-center justify-between pb-6">
                        <span className="text-sm font-semibold uppercase tracking-wide text-gray-400">
                            {collapsed ? 'Nav' : 'Navigation'}
                        </span>
                        <button
                            type="button"
                            onClick={onToggleCollapse}
                            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
                            className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-400 hover:border-gray-500 hover:text-gray-200"
                        >
                            {collapsed ? '>' : '<'}
                        </button>
                    </div>
                    <ul className="flex flex-col gap-1">
                        {items.map((item) => {
                            const isActive = item.page === activePage;
                            return (
                                <li key={item.page}>
                                    <button
                                        type="button"
                                        onClick={() => onNavigate(item.page)}
                                        className={`group flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors ${
                                            isActive
                                                ? 'border-emerald-400 bg-gray-800 text-emerald-300'
                                                : 'border-transparent text-gray-300 hover:bg-gray-800 hover:text-gray-100'
                                        }`}
                                    >
                                        <span
                                            className={`flex h-9 w-9 items-center justify-center rounded-md bg-gray-800 ${
                                                isActive
                                                    ? 'text-emerald-300'
                                                    : 'text-gray-300 group-hover:bg-gray-700 group-hover:text-emerald-300'
                                            }`}
                                        >
                                            {item.icon}
                                        </span>
                                        {collapsed ? null : <span>{item.label}</span>}
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
                                    className={`group flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors ${
                                        isLegacyPageActive && !legacyExpanded
                                            ? 'border-emerald-400/50 bg-gray-800/50 text-emerald-300'
                                            : 'border-transparent text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                                    }`}
                                >
                                    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-gray-800 text-gray-500 group-hover:text-gray-300">
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
                                    {collapsed ? null : <span>Legacy</span>}
                                </button>

                                {legacyExpanded && (
                                    <ul className="ml-4 mt-1 flex flex-col gap-1 border-l border-gray-800 pl-2">
                                        {legacyItems.map((item) => {
                                            const isActive = item.page === activePage;
                                            return (
                                                <li key={item.page}>
                                                    <button
                                                        type="button"
                                                        onClick={() => onNavigate(item.page)}
                                                        className={`group flex w-full items-center gap-3 rounded-md border px-3 py-1.5 text-left text-xs font-medium transition-colors ${
                                                            isActive
                                                                ? 'border-emerald-400 bg-gray-800 text-emerald-300'
                                                                : 'border-transparent text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                                                        }`}
                                                    >
                                                        <span
                                                            className={`flex h-7 w-7 items-center justify-center rounded-md bg-gray-800 ${
                                                                isActive
                                                                    ? 'text-emerald-300'
                                                                    : 'text-gray-400 group-hover:bg-gray-700 group-hover:text-emerald-300'
                                                            }`}
                                                        >
                                                            {item.icon}
                                                        </span>
                                                        {collapsed ? null : (
                                                            <span>{item.label}</span>
                                                        )}
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
                <div className="px-4">
                    <button
                        type="button"
                        onClick={onToggleCollapse}
                        className="w-full rounded-md border border-gray-700 px-3 py-2 text-xs font-medium text-gray-400 hover:border-gray-500 hover:text-gray-200"
                    >
                        {collapsed ? 'Expand' : 'Collapse'}
                    </button>
                </div>
            </nav>
        </aside>
    );
};

export default NavigationRail;
