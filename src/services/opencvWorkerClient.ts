import type { NormalizedRoi } from '@/types';

export type OpenCvWorkerStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface OpenCvReadyMessage {
    version?: string;
    buildInformation?: string;
}

export interface ProcessFrameParams {
    width: number;
    height: number;
    frame: ImageBitmap;
    brightness: number;
    contrast: number;
    roi: NormalizedRoi;
    applyRoi: boolean;
    claheClipLimit: number;
    claheTileGridSize: number;
    blobParams: BlobDetectorParams;
    runDetection: boolean;
    minConfidence: number;
}

export interface ProcessFrameResult {
    requestId: number;
    width: number;
    height: number;
    sourceWidth: number;
    sourceHeight: number;
    appliedRoi: {
        x: number;
        y: number;
        width: number;
        height: number;
    } | null;
    keypoints: DetectedBlob[];
    frame: ImageBitmap;
}

export interface DetectedBlob {
    x: number;
    y: number;
    size: number;
    response: number;
}

export interface BlobDetectorParams {
    minThreshold: number;
    maxThreshold: number;
    thresholdStep: number;
    minDistBetweenBlobs: number;
    minRepeatability: number;
    filterByArea: boolean;
    minArea: number;
    maxArea: number;
    filterByCircularity: boolean;
    minCircularity: number;
    filterByConvexity: boolean;
    minConvexity: number;
    filterByInertia: boolean;
    minInertiaRatio: number;
    filterByColor: boolean;
    blobColor: number;
}

interface StatusMessage extends OpenCvReadyMessage {
    type: 'STATUS';
    status: OpenCvWorkerStatus;
    message?: string;
    stage?: string;
}

interface ReadyMessage extends OpenCvReadyMessage {
    type: 'READY';
}

interface FrameResultMessage extends ProcessFrameResult {
    type: 'FRAME_RESULT';
}

interface ErrorMessage {
    type: 'ERROR';
    requestId?: number;
    message: string;
}

type WorkerMessage = StatusMessage | ReadyMessage | FrameResultMessage | ErrorMessage;

type StatusListener = (status: OpenCvWorkerStatus, payload?: OpenCvReadyMessage | string) => void;

export class OpenCvWorkerClient {
    private worker: Worker;

    private status: OpenCvWorkerStatus = 'idle';

    private listeners = new Set<StatusListener>();

    private requestId = 0;

    private pending = new Map<
        number,
        {
            resolve: (result: ProcessFrameResult) => void;
            reject: (reason: unknown) => void;
        }
    >();

    private readyResolver: ((payload: OpenCvReadyMessage) => void) | null = null;

    private readyReject: ((reason: unknown) => void) | null = null;

    private readyPromise: Promise<OpenCvReadyMessage> | null = null;

    private readyPayload: OpenCvReadyMessage | null = null;

    constructor() {
        if (typeof Worker === 'undefined') {
            throw new Error('Web Workers are not supported in this environment');
        }
        this.worker = new Worker('/opencv-classic-worker.js', { type: 'classic' });
        this.worker.addEventListener('message', this.handleMessage);
        this.worker.addEventListener('error', this.handleWorkerError);
        this.updateStatus('loading');
    }

    init(): Promise<OpenCvReadyMessage> {
        if (this.readyPayload) {
            return Promise.resolve(this.readyPayload);
        }
        if (!this.readyPromise) {
            this.readyPromise = new Promise<OpenCvReadyMessage>((resolve, reject) => {
                this.readyResolver = resolve;
                this.readyReject = reject;
            });
        }
        return this.readyPromise;
    }

    getStatus(): OpenCvWorkerStatus {
        return this.status;
    }

    getReadyPayload(): OpenCvReadyMessage | null {
        return this.readyPayload;
    }

    onStatus(listener: StatusListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    processFrame(params: ProcessFrameParams): Promise<ProcessFrameResult> {
        if (this.status !== 'ready') {
            return Promise.reject(new Error('OpenCV worker is not ready'));
        }
        const requestId = ++this.requestId;
        const payload = { type: 'PROCESS_FRAME', requestId, ...params } as const;
        this.worker.postMessage(payload, [params.frame]);
        return new Promise<ProcessFrameResult>((resolve, reject) => {
            this.pending.set(requestId, { resolve, reject });
        });
    }

    dispose(): void {
        this.worker.removeEventListener('message', this.handleMessage);
        this.worker.removeEventListener('error', this.handleWorkerError);
        this.worker.terminate();
        this.updateStatus('idle');
        this.pending.forEach(({ reject }) => reject(new Error('Worker disposed')));
        this.pending.clear();
        if (this.readyReject) {
            this.readyReject(new Error('Worker disposed'));
            this.readyReject = null;
        }
        this.readyPromise = null;
        this.readyResolver = null;
        this.readyPayload = null;
    }

    private handleMessage = (event: MessageEvent<WorkerMessage>) => {
        const message = event.data;
        switch (message.type) {
            case 'STATUS':
                this.updateStatus(message.status, message.message ?? message);
                break;
            case 'READY':
                this.readyPayload = {
                    version: message.version,
                    buildInformation: message.buildInformation,
                };
                this.updateStatus('ready', this.readyPayload);
                if (this.readyResolver) {
                    this.readyResolver(this.readyPayload);
                    this.readyResolver = null;
                    this.readyReject = null;
                }
                if (!this.readyPromise) {
                    this.readyPromise = Promise.resolve(this.readyPayload);
                }
                break;
            case 'FRAME_RESULT':
                this.resolveRequest(message.requestId, message);
                break;
            case 'ERROR':
                if (typeof message.requestId === 'number' && this.pending.has(message.requestId)) {
                    const pending = this.pending.get(message.requestId);
                    if (pending) {
                        this.pending.delete(message.requestId);
                        pending.reject(new Error(message.message));
                    }
                } else {
                    this.updateStatus('error', message.message);
                    if (this.readyReject) {
                        this.readyReject(new Error(message.message));
                        this.readyReject = null;
                    }
                }
                break;
            default:
                break;
        }
    };

    private handleWorkerError = (event: ErrorEvent) => {
        this.updateStatus('error', event.message);
        this.pending.forEach(({ reject }) => reject(event));
        this.pending.clear();
        if (this.readyReject) {
            this.readyReject(event.error ?? new Error(event.message));
            this.readyReject = null;
        }
    };

    private resolveRequest(requestId: number, message: FrameResultMessage) {
        const pending = this.pending.get(requestId);
        if (!pending) {
            message.frame.close();
            return;
        }
        this.pending.delete(requestId);
        pending.resolve(message);
    }

    private updateStatus(status: OpenCvWorkerStatus, payload?: OpenCvReadyMessage | string) {
        this.status = status;
        this.listeners.forEach((listener) => listener(status, payload));
    }
}
