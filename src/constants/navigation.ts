import type { Page } from '@/App';

/**
 * Page titles for display in the app top bar.
 */
export const PAGE_TITLES: Record<Page, string> = {
    'legacy-patterns': 'Patterns (legacy)',
    'legacy-patterns-editor': 'Patterns (legacy)',
    patterns: 'Patterns',
    'legacy-playback': 'Playback (legacy)',
    playback: 'Playback',
    animation: 'Animation',
    calibration: 'Calibration',
    alignment: 'Alignment',
    configurator: 'Array Config',
    simulation: 'Simulation',
    connection: 'Connection',
};

/**
 * Navigation item definition for the navigation rail and mobile drawer.
 */
export interface NavigationItem {
    page: Page;
    label: string;
    iconKey: NavigationIconKey;
}

/**
 * Keys for navigation icons - icons are rendered by the component using NavIcons.
 */
export type NavigationIconKey =
    | 'legacy-playback'
    | 'playback'
    | 'animation'
    | 'calibration'
    | 'alignment'
    | 'patterns'
    | 'simulation'
    | 'configurator'
    | 'connection';

/**
 * Main navigation items (shown in the primary navigation).
 * Order: Animation, Playback, Patterns, Calibration, Array Config, Connection
 */
export const NAVIGATION_ITEMS: NavigationItem[] = [
    {
        page: 'animation',
        label: 'Animation',
        iconKey: 'animation',
    },
    {
        page: 'playback',
        label: 'Playback',
        iconKey: 'playback',
    },
    {
        page: 'patterns',
        label: 'Patterns',
        iconKey: 'patterns',
    },
    {
        page: 'calibration',
        label: 'Calibration',
        iconKey: 'calibration',
    },
    {
        page: 'alignment',
        label: 'Alignment',
        iconKey: 'alignment',
    },
    {
        page: 'configurator',
        label: 'Array Config',
        iconKey: 'configurator',
    },
    {
        page: 'connection',
        label: 'Connection',
        iconKey: 'connection',
    },
];

/**
 * Legacy navigation items (shown in a collapsed submenu).
 */
export const LEGACY_NAVIGATION_ITEMS: NavigationItem[] = [
    {
        page: 'legacy-playback',
        label: 'Playback (legacy)',
        iconKey: 'legacy-playback',
    },
    {
        page: 'legacy-patterns',
        label: 'Patterns (legacy)',
        iconKey: 'patterns',
    },
    {
        page: 'simulation',
        label: 'Simulation (legacy)',
        iconKey: 'simulation',
    },
];

/**
 * Get the effective navigation page for highlighting in the nav rail.
 * Maps editor pages to their parent pages.
 */
export function getEffectiveNavPage(page: Page): Page {
    if (page === 'legacy-patterns-editor') {
        return 'legacy-patterns';
    }
    return page;
}

/**
 * Get the page title for display in the top bar.
 */
export function getPageTitle(page: Page): string {
    return PAGE_TITLES[page] ?? 'Mirror Matrix';
}
