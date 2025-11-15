export type SnapshotPersistenceAction = 'save' | 'load';

export interface SnapshotPersistenceStatus {
    action: SnapshotPersistenceAction;
    tone: 'success' | 'error';
    message: string;
    timestamp: number;
}
