export const formatRelativeTime = (timestamp: number | null | undefined): string => {
    if (!timestamp) {
        return '—';
    }
    const diffMs = Date.now() - timestamp;
    if (diffMs < 1_000) {
        return 'just now';
    }
    if (diffMs < 60_000) {
        const seconds = Math.round(diffMs / 1_000);
        return `${seconds}s ago`;
    }
    if (diffMs < 3_600_000) {
        const minutes = Math.round(diffMs / 60_000);
        return `${minutes}m ago`;
    }
    return new Date(timestamp).toLocaleTimeString();
};
