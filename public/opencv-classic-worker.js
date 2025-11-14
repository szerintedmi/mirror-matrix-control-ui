/* eslint-env worker */
/* global importScripts */
'use strict';

const workerCtx = self;

const state = {
    cvReady: false,
    readyPayload: null,
    canvas: null,
    ctx: null,
    detector: null,
    detectorKey: null,
    fallbackLoaded: false,
};

const clamp = (value, min, max) => {
    return Math.min(max, Math.max(min, value));
};

const postStatus = (status, extra) => {
    workerCtx.postMessage({ type: 'STATUS', status, ...extra });
};

postStatus('loading', { stage: 'boot' });

try {
    importScripts('/opencv.js');
    postStatus('loading', { stage: 'importScripts' });
} catch (error) {
    postStatus('error', {
        message: `importScripts(/opencv.js) failed: ${error && error.message ? error.message : String(error)}`,
    });
}

const cv = workerCtx.cv;

const resolveVersion = () => {
    if (!cv) {
        return null;
    }
    if (typeof cv.version === 'string') {
        return cv.version;
    }
    if (cv.version && typeof cv.version === 'object') {
        const parts = ['major', 'minor', 'revision']
            .map((key) => (typeof cv.version[key] === 'number' ? cv.version[key] : null))
            .filter((part) => part !== null);
        if (parts.length) {
            const base = parts.join('.');
            const status = typeof cv.version.status === 'string' ? cv.version.status : '';
            return status ? `${base}-${status}` : base;
        }
    }
    if (typeof cv.VERSION === 'string') {
        return cv.VERSION;
    }
    return null;
};

if (cv) {
    cv.onRuntimeInitialized = () => {
        state.cvReady = true;
        const payload = {
            version: resolveVersion() ?? undefined,
            buildInformation:
                typeof cv.getBuildInformation === 'function' ? cv.getBuildInformation() : undefined,
        };
        state.readyPayload = payload;
        postStatus('ready', payload);
        workerCtx.postMessage({ type: 'READY', ...payload });
    };
} else {
    postStatus('error', { message: 'OpenCV global not found after importScripts' });
}

const supportsNativeBlobDetector = Boolean(cv && typeof cv.SimpleBlobDetector === 'function');

const ensureCanvasContext = (width, height) => {
    if (!state.canvas || state.canvas.width !== width || state.canvas.height !== height) {
        state.canvas = new OffscreenCanvas(width, height);
        state.ctx = state.canvas.getContext('2d', { willReadFrequently: true });
    }
    return state.ctx;
};

const loadFallbackDetector = () => {
    if (state.fallbackLoaded) {
        return workerCtx.SimpleBlobDetectorFallback || null;
    }
    try {
        importScripts('/simple-blob-detector.js');
        state.fallbackLoaded = true;
    } catch (error) {
        postStatus('error', {
            message: `Failed to load blob detector fallback: ${error && error.message ? error.message : String(error)}`,
        });
        state.fallbackLoaded = true;
    }
    return workerCtx.SimpleBlobDetectorFallback || null;
};

const serializeDetectorParams = (params) => {
    return JSON.stringify(params || {});
};

const ensureBlobDetector = (params) => {
    if (!params) {
        return null;
    }
    const key = serializeDetectorParams(params);
    if (state.detector && state.detectorKey === key) {
        return state.detector;
    }
    if (state.detector) {
        state.detector.delete();
        state.detector = null;
    }
    const detectorParams = new cv.SimpleBlobDetector_Params();
    detectorParams.minThreshold = params.minThreshold ?? 10;
    detectorParams.maxThreshold = params.maxThreshold ?? 200;
    detectorParams.thresholdStep = params.thresholdStep ?? 10;
    detectorParams.minDistBetweenBlobs = params.minDistBetweenBlobs ?? 10;

    detectorParams.filterByArea = params.filterByArea ?? true;
    detectorParams.minArea = params.minArea ?? 1500;
    detectorParams.maxArea = params.maxArea ?? 15000;

    detectorParams.filterByCircularity = params.filterByCircularity ?? false;
    detectorParams.minCircularity = params.minCircularity ?? 0.5;

    detectorParams.filterByConvexity = params.filterByConvexity ?? true;
    detectorParams.minConvexity = params.minConvexity ?? 0.6;

    detectorParams.filterByInertia = params.filterByInertia ?? true;
    detectorParams.minInertiaRatio = params.minInertiaRatio ?? 0.6;

    detectorParams.filterByColor = params.filterByColor ?? true;
    detectorParams.blobColor = params.blobColor ?? 255;

    const detector = new cv.SimpleBlobDetector(detectorParams);
    state.detector = detector;
    state.detectorKey = key;
    return detector;
};

const detectBlobsNative = (mat, roiRect, params, minConfidence) => {
    const detector = ensureBlobDetector(params);
    if (!detector) {
        return [];
    }
    const keypoints = new cv.KeyPointVector();
    detector.detect(mat, keypoints);
    const offsetX = roiRect ? roiRect.x : 0;
    const offsetY = roiRect ? roiRect.y : 0;
    const minResponse = Number.isFinite(minConfidence) ? minConfidence : 0;
    const results = [];
    for (let i = 0; i < keypoints.size(); i += 1) {
        const kp = keypoints.get(i);
        if (kp && Number.isFinite(kp.response) && kp.response >= minResponse) {
            results.push({
                x: kp.pt.x + offsetX,
                y: kp.pt.y + offsetY,
                size: kp.size,
                response: kp.response,
            });
        }
    }
    keypoints.delete();
    return results;
};

const detectBlobsFallback = (mat, roiRect, params, minConfidence) => {
    const fallback = loadFallbackDetector();
    if (!fallback) {
        return [];
    }
    const colorInput = new cv.Mat();
    try {
        if (mat.channels() === 1) {
            cv.cvtColor(mat, colorInput, cv.COLOR_GRAY2RGB);
        } else if (mat.channels() === 3) {
            mat.copyTo(colorInput);
        } else {
            cv.cvtColor(mat, colorInput, cv.COLOR_RGBA2RGB);
        }
        const fallbackParams = {
            minRepeatability: params?.minRepeatability ?? 2,
            thresholdStep: params?.thresholdStep ?? 10,
            minThreshold: params?.minThreshold ?? 10,
            maxThreshold: params?.maxThreshold ?? 200,
            minDistBetweenBlobs: params?.minDistBetweenBlobs ?? 10,
            filterByColor: params?.filterByColor ?? true,
            blobColor: params?.blobColor ?? 255,
            filterByArea: params?.filterByArea ?? true,
            minArea: params?.minArea ?? 1500,
            maxArea: params?.maxArea ?? 15000,
            filterByCircularity: params?.filterByCircularity ?? false,
            minCircularity: params?.minCircularity ?? 0.5,
            filterByConvexity: params?.filterByConvexity ?? true,
            minConvexity: params?.minConvexity ?? 0.6,
            filterByInertia: params?.filterByInertia ?? true,
            minInertiaRatio: params?.minInertiaRatio ?? 0.6,
        };
        const keypoints = fallback(colorInput, fallbackParams) || [];
        const offsetX = roiRect ? roiRect.x : 0;
        const offsetY = roiRect ? roiRect.y : 0;
        return keypoints
            .filter(
                (kp) =>
                    !Number.isFinite(minConfidence) ||
                    kp.response === undefined ||
                    kp.response >= minConfidence,
            )
            .map((kp) => ({
                x: kp.pt.x + offsetX,
                y: kp.pt.y + offsetY,
                size: kp.size,
                response: 1,
            }));
    } finally {
        colorInput.delete();
    }
};

const detectBlobs = (mat, roiRect, params, minConfidence) => {
    if (supportsNativeBlobDetector) {
        return detectBlobsNative(mat, roiRect, params, minConfidence);
    }
    return detectBlobsFallback(mat, roiRect, params, minConfidence);
};

const buildRect = (roi, width, height) => {
    const x = clamp(roi.x ?? 0, 0, 1);
    const y = clamp(roi.y ?? 0, 0, 1);
    const roiWidth = clamp(roi.width ?? 1, 0, 1);
    const roiHeight = clamp(roi.height ?? 1, 0, 1);
    const originX = Math.floor(x * width);
    const originY = Math.floor(y * height);
    const maxWidth = Math.max(1, Math.floor(roiWidth * width));
    const maxHeight = Math.max(1, Math.floor(roiHeight * height));
    const limitedWidth = Math.max(1, Math.min(maxWidth, width - originX));
    const limitedHeight = Math.max(1, Math.min(maxHeight, height - originY));
    return new cv.Rect(originX, originY, limitedWidth, limitedHeight);
};

const cleanupMats = (mats) => {
    mats.forEach((mat) => {
        if (mat) {
            mat.delete();
        }
    });
};

const handleProcessFrame = async (payload) => {
    const {
        frame,
        width,
        height,
        brightness = 0,
        contrast = 1,
        roi,
        applyRoi,
        requestId,
        claheClipLimit = 2,
        claheTileGridSize = 8,
        blobParams,
        runDetection,
        minConfidence = 0,
    } = payload;
    const ctx2d = ensureCanvasContext(width, height);
    if (!ctx2d) {
        if (frame && typeof frame.close === 'function') {
            frame.close();
        }
        throw new Error('Unable to create OffscreenCanvas context');
    }
    ctx2d.clearRect(0, 0, width, height);
    ctx2d.drawImage(frame, 0, 0, width, height);
    if (frame && typeof frame.close === 'function') {
        frame.close();
    }

    const imageData = ctx2d.getImageData(0, 0, width, height);
    const src = cv.matFromImageData(imageData);
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const adjusted = new cv.Mat();
    const alpha = Number.isFinite(contrast) ? contrast : 1;
    const beta = Number.isFinite(brightness) ? brightness * 255 : 0;
    cv.convertScaleAbs(gray, adjusted, alpha, beta);

    const claheResult = new cv.Mat();
    const clipLimit = Math.max(0.1, claheClipLimit || 2);
    const grid = Math.max(1, Math.floor(claheTileGridSize || 8));
    const clahe = new cv.CLAHE(clipLimit, new cv.Size(grid, grid));
    clahe.apply(adjusted, claheResult);
    clahe.delete();

    let view = claheResult;
    let roiView = null;
    let appliedRect = null;
    if (applyRoi && roi && roi.enabled) {
        const rect = buildRect(roi, width, height);
        roiView = view.roi(rect);
        view = roiView;
        appliedRect = rect;
    }

    const detectionRect = roi && roi.enabled ? buildRect(roi, width, height) : null;
    const detectionView = detectionRect ? claheResult.roi(detectionRect) : claheResult;
    const keypoints = runDetection
        ? detectBlobs(detectionView, detectionRect, blobParams, minConfidence)
        : [];
    if (detectionRect && detectionView !== claheResult) {
        detectionView.delete();
    }

    const rgba = new cv.Mat();
    cv.cvtColor(view, rgba, cv.COLOR_GRAY2RGBA);

    const output = new ImageData(new Uint8ClampedArray(rgba.data), view.cols, view.rows);
    const bitmap = await createImageBitmap(output);

    workerCtx.postMessage(
        {
            type: 'FRAME_RESULT',
            requestId,
            width: view.cols,
            height: view.rows,
            sourceWidth: width,
            sourceHeight: height,
            appliedRoi: appliedRect
                ? {
                      x: appliedRect.x,
                      y: appliedRect.y,
                      width: appliedRect.width,
                      height: appliedRect.height,
                  }
                : null,
            keypoints,
            frame: bitmap,
        },
        [bitmap],
    );
    cleanupMats([rgba, roiView, claheResult, adjusted, gray, src]);
};

workerCtx.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type !== 'PROCESS_FRAME') {
        return;
    }
    if (!state.cvReady) {
        workerCtx.postMessage({
            type: 'ERROR',
            requestId: data.requestId,
            message: 'OpenCV runtime not ready',
        });
        if (data.frame && typeof data.frame.close === 'function') {
            data.frame.close();
        }
        return;
    }
    handleProcessFrame(data).catch((error) => {
        workerCtx.postMessage({
            type: 'ERROR',
            requestId: data.requestId,
            message: error && error.message ? error.message : String(error),
        });
    });
});
