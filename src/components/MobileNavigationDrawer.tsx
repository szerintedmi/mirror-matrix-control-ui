import React from 'react';

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
    activePage: Page;
    onNavigate: (page: Page) => void;
}

const MobileNavigationDrawer: React.FC<MobileNavigationDrawerProps> = ({
    open,
    onClose,
    items,
    activePage,
    onNavigate,
}) => {
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
                        const isActive =
                            item.page === activePage ||
                            (item.page === 'library' && activePage === 'editor');
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
