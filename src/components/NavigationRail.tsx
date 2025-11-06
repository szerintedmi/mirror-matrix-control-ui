import React from 'react';

import type { Page } from '../App';

interface NavigationItem {
    page: Page;
    label: string;
    icon: React.ReactNode;
}

interface NavigationRailProps {
    items: NavigationItem[];
    activePage: Page;
    collapsed: boolean;
    onToggleCollapse: () => void;
    onNavigate: (page: Page) => void;
}

const NavigationRail: React.FC<NavigationRailProps> = ({
    items,
    activePage,
    collapsed,
    onNavigate,
    onToggleCollapse,
}) => {
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
                            const isActive =
                                item.page === activePage ||
                                (item.page === 'library' && activePage === 'editor');
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
