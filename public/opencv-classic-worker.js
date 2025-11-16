/* eslint-env worker */
/* global importScripts */
'use strict';

const workerCtx = self;

let cvModule = null;

const state = {
    cvReady: false,
    readyPayload: null,
    canvas: null,
    ctx: null,
    detector: null,
    detectorKey: null,
    fallbackLoaded: false,
};

const deleteCvObject = (obj) => {
    if (obj && typeof obj.delete === 'function') {
        obj.delete();
    }
};

const clamp = (value, min, max) => {
    return Math.min(max, Math.max(min, value));
};

const postStatus = (status, extra) => {
    workerCtx.postMessage({ type: 'STATUS', status, ...extra });
};

postStatus('loading', { stage: 'boot' });

const finalizeReady = () => {
    state.cvReady = true;
    const payload = {
        version: resolveVersion() ?? undefined,
        buildInformation:
            typeof cvModule.getBuildInformation === 'function'
                ? cvModule.getBuildInformation()
                : undefined,
        capabilities: {
            hasNativeBlobDetector: supportsNativeBlobDetector(),
            hasJsFallback: true,
        },
    };
    state.readyPayload = payload;
    postStatus('ready', payload);
    workerCtx.postMessage({ type: 'READY', ...payload });
};

const handleLegacyModule = () => {
    if (!cvModule) {
        postStatus('error', { message: 'OpenCV global not found after importScripts' });
        return;
    }
    if (typeof cvModule.onRuntimeInitialized === 'function') {
        const original = cvModule.onRuntimeInitialized;
        cvModule.onRuntimeInitialized = () => {
            try {
                original();
            } catch {
                // ignore original handler errors to avoid swallowing readiness
            }
            finalizeReady();
        };
    } else {
        finalizeReady();
    }
};

try {
    importScripts('/opencv_js.js');
    postStatus('loading', { stage: 'importScripts' });
    const maybeFactory = workerCtx.cv;
    if (typeof maybeFactory === 'function') {
        maybeFactory({
            locateFile(path) {
                if (path.endsWith('.wasm')) {
                    return '/opencv_js.wasm';
                }
                return path;
            },
        })
            .then((module) => {
                cvModule = module;
                workerCtx.cv = module;
                console.info('[opencv-worker] OpenCV ready', {
                    hasSimpleBlobDetector: Boolean(module.SimpleBlobDetector),
                    hasSimpleBlobDetectorParams: Boolean(module.SimpleBlobDetector_Params),
                });
                finalizeReady();
            })
            .catch((error) => {
                postStatus('error', {
                    message: `OpenCV initialization failed: ${
                        error && error.message ? error.message : String(error)
                    }`,
                });
            });
    } else {
        cvModule = workerCtx.cv;
        handleLegacyModule();
    }
} catch (error) {
    postStatus('error', {
        message: `importScripts(/opencv_js.js) failed: ${
            error && error.message ? error.message : String(error)
        }`,
    });
}

const resolveVersion = () => {
    if (!cvModule) {
        return null;
    }
    if (typeof cvModule.version === 'string') {
        return cvModule.version;
    }
    if (cvModule.version && typeof cvModule.version === 'object') {
        const parts = ['major', 'minor', 'revision']
            .map((key) =>
                typeof cvModule.version[key] === 'number' ? cvModule.version[key] : null,
            )
            .filter((part) => part !== null);
        if (parts.length) {
            const base = parts.join('.');
            const status =
                typeof cvModule.version.status === 'string' ? cvModule.version.status : '';
            return status ? `${base}-${status}` : base;
        }
    }
    if (typeof cvModule.VERSION === 'string') {
        return cvModule.VERSION;
    }
    return null;
};

const createBlobDetectorParams = () => {
    if (!cvModule || typeof cvModule.SimpleBlobDetector !== 'function') {
        return null;
    }
    if (typeof cvModule.SimpleBlobDetector_Params === 'function') {
        try {
            return new cvModule.SimpleBlobDetector_Params();
        } catch {
            // Ignore and fall back to cloning default params
        }
    }
    const proto = cvModule.SimpleBlobDetector?.prototype;
    if (proto && typeof proto.getParams === 'function') {
        let templateDetector = null;
        try {
            templateDetector = new cvModule.SimpleBlobDetector();
            if (templateDetector && typeof templateDetector.getParams === 'function') {
                const paramsInstance = templateDetector.getParams();
                if (paramsInstance) {
                    return paramsInstance;
                }
            }
        } catch {
            // Ignore and report unsupported below
        } finally {
            deleteCvObject(templateDetector);
        }
    }
    return null;
};

let nativeBlobDetectorSupported = null;

const supportsNativeBlobDetector = () => {
    if (!cvModule || typeof cvModule.SimpleBlobDetector !== 'function') {
        return false;
    }
    if (nativeBlobDetectorSupported !== null) {
        return nativeBlobDetectorSupported;
    }
    const paramsProbe = createBlobDetectorParams();
    if (paramsProbe) {
        deleteCvObject(paramsProbe);
        nativeBlobDetectorSupported = true;
    } else {
        nativeBlobDetectorSupported = false;
    }
    return nativeBlobDetectorSupported;
};

const ensureCanvasContext = (width, height) => {
    if (!state.canvas || state.canvas.width !== width || state.canvas.height !== height) {
        state.canvas = new OffscreenCanvas(width, height);
        state.ctx = state.canvas.getContext('2d', { willReadFrequently: true });
    }
    return state.ctx;
};

let fallbackNoticeLogged = false;
let nativeWarningLogged = false;

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
    if (!fallbackNoticeLogged) {
        console.info('[opencv-worker] Falling back to JS SimpleBlobDetector implementation');
        fallbackNoticeLogged = true;
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
        deleteCvObject(state.detector);
        state.detector = null;
    }
    const detectorParams = createBlobDetectorParams();
    if (!detectorParams) {
        return null;
    }
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

    let detector = null;
    try {
        detector = new cvModule.SimpleBlobDetector(detectorParams);
    } finally {
        deleteCvObject(detectorParams);
    }
    if (!detector) {
        return null;
    }
    state.detector = detector;
    state.detectorKey = key;
    return detector;
};

const detectBlobsNative = (mat, roiRect, params) => {
    const detector = ensureBlobDetector(params);
    if (!detector) {
        return [];
    }
    const keypoints = new cvModule.KeyPointVector();
    detector.detect(mat, keypoints);
    const offsetX = roiRect ? roiRect.x : 0;
    const offsetY = roiRect ? roiRect.y : 0;
    const results = [];
    for (let i = 0; i < keypoints.size(); i += 1) {
        const kp = keypoints.get(i);
        if (!kp) {
            continue;
        }
        results.push({
            x: kp.pt.x + offsetX,
            y: kp.pt.y + offsetY,
            size: kp.size,
            response: Number.isFinite(kp.response) ? kp.response : 0,
        });
    }
    keypoints.delete();
    return results;
};

const detectBlobsFallback = (mat, roiRect, params) => {
    const fallback = loadFallbackDetector();
    if (!fallback) {
        return [];
    }
    const colorInput = new cvModule.Mat();
    try {
        if (mat.channels() === 1) {
            cvModule.cvtColor(mat, colorInput, cvModule.COLOR_GRAY2RGB);
        } else if (mat.channels() === 3) {
            mat.copyTo(colorInput);
        } else {
            cvModule.cvtColor(mat, colorInput, cvModule.COLOR_RGBA2RGB);
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
        return keypoints.map((kp) => ({
            x: kp.pt.x + offsetX,
            y: kp.pt.y + offsetY,
            size: kp.size,
            response: 1,
        }));
    } finally {
        colorInput.delete();
    }
};

const detectBlobs = (mat, roiRect, params, preferFallback) => {
    if (!preferFallback && supportsNativeBlobDetector()) {
        try {
            return detectBlobsNative(mat, roiRect, params);
        } catch (error) {
            if (!nativeWarningLogged) {
                console.warn(
                    '[opencv-worker] Native SimpleBlobDetector failed, falling back',
                    error,
                );
                nativeWarningLogged = true;
            }
        }
    }
    return detectBlobsFallback(mat, roiRect, params);
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
    return new cvModule.Rect(originX, originY, limitedWidth, limitedHeight);
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
        requestId,
        claheClipLimit = 2,
        claheTileGridSize = 8,
        blobParams,
        runDetection,
        preferFallbackDetector = true,
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
    const src = cvModule.matFromImageData(imageData);
    const gray = new cvModule.Mat();
    cvModule.cvtColor(src, gray, cvModule.COLOR_RGBA2GRAY);

    const adjusted = new cvModule.Mat();
    const alpha = Number.isFinite(contrast) ? contrast : 1;
    const beta = Number.isFinite(brightness) ? brightness * 255 : 0;
    cvModule.convertScaleAbs(gray, adjusted, alpha, beta);

    const claheResult = new cvModule.Mat();
    const clipLimit = Math.max(0.1, claheClipLimit || 2);
    const grid = Math.max(1, Math.floor(claheTileGridSize || 8));
    const clahe = new cvModule.CLAHE(clipLimit, new cvModule.Size(grid, grid));
    clahe.apply(adjusted, claheResult);
    clahe.delete();

    const detectionRect = roi && roi.enabled ? buildRect(roi, width, height) : null;
    const detectionView = detectionRect ? claheResult.roi(detectionRect) : claheResult;
    const keypoints = runDetection
        ? detectBlobs(detectionView, detectionRect, blobParams, Boolean(preferFallbackDetector))
        : [];
    if (detectionRect && detectionView !== claheResult) {
        detectionView.delete();
    }

    const rgba = new cvModule.Mat();
    cvModule.cvtColor(claheResult, rgba, cvModule.COLOR_GRAY2RGBA);

    const output = new ImageData(
        new Uint8ClampedArray(rgba.data),
        claheResult.cols,
        claheResult.rows,
    );
    const bitmap = await createImageBitmap(output);

    workerCtx.postMessage(
        {
            type: 'FRAME_RESULT',
            requestId,
            width: claheResult.cols,
            height: claheResult.rows,
            sourceWidth: width,
            sourceHeight: height,
            keypoints,
            frame: bitmap,
        },
        [bitmap],
    );
    cleanupMats([rgba, claheResult, adjusted, gray, src]);
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
