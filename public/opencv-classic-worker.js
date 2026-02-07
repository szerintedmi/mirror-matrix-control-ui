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

const buildRectData = (roi, width, height) => {
    const x = clamp(roi.x ?? 0, 0, 1);
    const y = clamp(roi.y ?? 0, 0, 1);
    const roiWidth = clamp(roi.width ?? 1, 0, 1);
    const roiHeight = clamp(roi.height ?? 1, 0, 1);
    const originX = Math.floor(x * width);
    const originY = Math.floor(y * height);
    const maxWidth = Math.max(1, Math.floor(roiWidth * width));
    const maxHeight = Math.max(1, Math.floor(roiHeight * height));
    return {
        x: originX,
        y: originY,
        width: Math.max(1, Math.min(maxWidth, width - originX)),
        height: Math.max(1, Math.min(maxHeight, height - originY)),
    };
};

const buildRect = (roi, width, height) => {
    const rect = buildRectData(roi, width, height);
    return new cvModule.Rect(rect.x, rect.y, rect.width, rect.height);
};

const cleanupMats = (mats) => {
    mats.forEach((mat) => {
        if (mat) {
            mat.delete();
        }
    });
};

const normalizeAdaptiveThreshold = (adaptiveThreshold) => {
    const method =
        adaptiveThreshold?.method === 'MEAN'
            ? cvModule.ADAPTIVE_THRESH_MEAN_C
            : cvModule.ADAPTIVE_THRESH_GAUSSIAN_C;
    const thresholdType =
        adaptiveThreshold?.thresholdType === 'BINARY_INV'
            ? cvModule.THRESH_BINARY_INV
            : cvModule.THRESH_BINARY;
    const rawBlockSize = Number.isFinite(adaptiveThreshold?.blockSize)
        ? Math.floor(adaptiveThreshold.blockSize)
        : 51;
    const normalizedBlock = Math.max(3, rawBlockSize % 2 === 0 ? rawBlockSize + 1 : rawBlockSize);
    const c = Number.isFinite(adaptiveThreshold?.C) ? adaptiveThreshold.C : 10;
    return {
        method,
        thresholdType,
        blockSize: normalizedBlock,
        c,
    };
};

const normalizeShapeFiltering = (filtering) => {
    const rawMaxContourAreaRatio = Number.isFinite(filtering?.maxContourAreaRatio)
        ? filtering.maxContourAreaRatio
        : 0.65;
    const rawBackgroundBlurKernelSize = Number.isFinite(filtering?.backgroundBlurKernelSize)
        ? Math.floor(filtering.backgroundBlurKernelSize)
        : 31;
    const rawBackgroundGain = Number.isFinite(filtering?.backgroundGain)
        ? filtering.backgroundGain
        : 1.5;
    const rawContourMergeMaxContours = Number.isFinite(filtering?.contourMergeMaxContours)
        ? Math.floor(filtering.contourMergeMaxContours)
        : 4;
    const rawContourMergeDistancePx = Number.isFinite(filtering?.contourMergeDistancePx)
        ? filtering.contourMergeDistancePx
        : 120;
    const rawContourMergeMinAreaRatio = Number.isFinite(filtering?.contourMergeMinAreaRatio)
        ? filtering.contourMergeMinAreaRatio
        : 0.08;
    return {
        enableSmoothing: filtering?.enableSmoothing !== false,
        enableMorphology: filtering?.enableMorphology !== false,
        rejectBorderContours: filtering?.rejectBorderContours !== false,
        rejectLargeContours: filtering?.rejectLargeContours !== false,
        maxContourAreaRatio: clamp(rawMaxContourAreaRatio, 0.05, 1),
        enableBackgroundSuppression: filtering?.enableBackgroundSuppression === true,
        backgroundBlurKernelSize: Math.max(
            3,
            rawBackgroundBlurKernelSize % 2 === 0
                ? rawBackgroundBlurKernelSize + 1
                : rawBackgroundBlurKernelSize,
        ),
        backgroundGain: clamp(rawBackgroundGain, 0.1, 5),
        enableContourMerging: filtering?.enableContourMerging === true,
        contourMergeMaxContours: clamp(rawContourMergeMaxContours, 1, 20),
        contourMergeDistancePx: clamp(rawContourMergeDistancePx, 1, 2000),
        contourMergeMinAreaRatio: clamp(rawContourMergeMinAreaRatio, 0, 1),
    };
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

    const processingWidth = claheResult.cols;
    const processingHeight = claheResult.rows;

    const detectionRect =
        roi && roi.enabled ? buildRect(roi, processingWidth, processingHeight) : null;
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

    const matsToDelete = [rgba, claheResult, adjusted, gray, src];
    cleanupMats(matsToDelete);
};

const contourPointsToArray = (contour, offsetX, offsetY) => {
    if (!contour || !contour.data32S) {
        return [];
    }
    const points = [];
    const coords = contour.data32S;
    for (let i = 0; i < coords.length; i += 2) {
        points.push({
            x: coords[i] + offsetX,
            y: coords[i + 1] + offsetY,
        });
    }
    return points;
};

const contourTouchesBorder = (rect, width, height, margin = 1) => {
    return (
        rect.x <= margin ||
        rect.y <= margin ||
        rect.x + rect.width >= width - margin ||
        rect.y + rect.height >= height - margin
    );
};

const postShapeResult = (payload) => {
    workerCtx.postMessage({
        type: 'SHAPE_RESULT',
        coordinateSpace: 'frame-px',
        ...payload,
    });
};

const handleAnalyzeShape = async (payload) => {
    const {
        frame,
        width,
        height,
        roi,
        requestId,
        adaptiveThreshold,
        minContourArea = 100,
        filtering,
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

    const roiRectData = roi && roi.enabled ? buildRectData(roi, gray.cols, gray.rows) : null;
    const roiRect = roiRectData
        ? new cvModule.Rect(roiRectData.x, roiRectData.y, roiRectData.width, roiRectData.height)
        : null;
    const roiView = roiRect ? gray.roi(roiRect) : gray;
    const smoothed = new cvModule.Mat();
    const binary = new cvModule.Mat();
    const cleaned = new cvModule.Mat();
    const background = new cvModule.Mat();
    const backgroundSuppressed = new cvModule.Mat();
    const boosted = new cvModule.Mat();
    const filteringOptions = normalizeShapeFiltering(filtering);
    const kernel = filteringOptions.enableMorphology
        ? cvModule.getStructuringElement(cvModule.MORPH_ELLIPSE, new cvModule.Size(3, 3))
        : null;
    const contours = new cvModule.MatVector();
    const hierarchy = new cvModule.Mat();
    const candidates = [];
    let mergedHull = null;

    try {
        const normalizedThreshold = normalizeAdaptiveThreshold(adaptiveThreshold);
        let thresholdInput = roiView;

        if (filteringOptions.enableBackgroundSuppression) {
            const bgKernelSize = filteringOptions.backgroundBlurKernelSize;
            cvModule.GaussianBlur(
                roiView,
                background,
                new cvModule.Size(bgKernelSize, bgKernelSize),
                0,
                0,
                cvModule.BORDER_DEFAULT,
            );
            cvModule.subtract(roiView, background, backgroundSuppressed);
            cvModule.convertScaleAbs(
                backgroundSuppressed,
                boosted,
                filteringOptions.backgroundGain,
                0,
            );
            thresholdInput = boosted;
        }

        if (filteringOptions.enableSmoothing) {
            cvModule.GaussianBlur(
                thresholdInput,
                smoothed,
                new cvModule.Size(5, 5),
                0,
                0,
                cvModule.BORDER_DEFAULT,
            );
            thresholdInput = smoothed;
        }

        cvModule.adaptiveThreshold(
            thresholdInput,
            binary,
            255,
            normalizedThreshold.method,
            normalizedThreshold.thresholdType,
            normalizedThreshold.blockSize,
            normalizedThreshold.c,
        );
        const contourInput = filteringOptions.enableMorphology ? cleaned : binary;
        if (filteringOptions.enableMorphology && kernel) {
            cvModule.morphologyEx(
                binary,
                cleaned,
                cvModule.MORPH_OPEN,
                kernel,
                new cvModule.Point(-1, -1),
                1,
                cvModule.BORDER_CONSTANT,
            );
            cvModule.morphologyEx(
                cleaned,
                cleaned,
                cvModule.MORPH_CLOSE,
                kernel,
                new cvModule.Point(-1, -1),
                1,
                cvModule.BORDER_CONSTANT,
            );
        }

        cvModule.findContours(
            contourInput,
            contours,
            hierarchy,
            cvModule.RETR_EXTERNAL,
            cvModule.CHAIN_APPROX_SIMPLE,
        );

        const minimumArea = Number.isFinite(minContourArea) ? Math.max(0, minContourArea) : 100;
        const roiArea = Math.max(1, roiView.cols * roiView.rows);
        const maxContourAreaRatio = filteringOptions.maxContourAreaRatio;
        for (let i = 0; i < contours.size(); i += 1) {
            const contour = contours.get(i);
            if (!contour) {
                continue;
            }
            const contourArea = cvModule.contourArea(contour, false);
            if (contourArea < minimumArea) {
                contour.delete();
                continue;
            }

            const bounds = cvModule.boundingRect(contour);
            const areaRatio = contourArea / roiArea;
            const touchesBorder = contourTouchesBorder(bounds, roiView.cols, roiView.rows, 1);
            const passesBorderFilter = !filteringOptions.rejectBorderContours || !touchesBorder;
            const passesLargeContourFilter =
                !filteringOptions.rejectLargeContours || areaRatio <= maxContourAreaRatio;

            if (!passesBorderFilter || !passesLargeContourFilter) {
                contour.delete();
                continue;
            }

            const contourMoments = cvModule.moments(contour, false);
            if (
                !contourMoments ||
                !Number.isFinite(contourMoments.m00) ||
                contourMoments.m00 <= 0
            ) {
                contour.delete();
                continue;
            }

            candidates.push({
                contour,
                area: contourArea,
                centroid: {
                    x: contourMoments.m10 / contourMoments.m00,
                    y: contourMoments.m01 / contourMoments.m00,
                },
            });
        }

        if (candidates.length === 0) {
            postShapeResult({
                requestId,
                frameSize: { width, height },
                roiRect: roiRectData,
                detected: false,
                contour: null,
            });
            return;
        }

        candidates.sort((a, b) => b.area - a.area);
        const selectedCandidates = [candidates[0]];

        if (filteringOptions.enableContourMerging && candidates.length > 1) {
            const primary = candidates[0];
            const maxCandidates = Math.max(1, Math.floor(filteringOptions.contourMergeMaxContours));
            const maxDistancePx = Math.max(1, filteringOptions.contourMergeDistancePx);
            const minArea = primary.area * filteringOptions.contourMergeMinAreaRatio;

            for (
                let i = 1;
                i < candidates.length && selectedCandidates.length < maxCandidates;
                i += 1
            ) {
                const candidate = candidates[i];
                if (candidate.area < minArea) {
                    continue;
                }
                const dx = candidate.centroid.x - primary.centroid.x;
                const dy = candidate.centroid.y - primary.centroid.y;
                const distance = Math.hypot(dx, dy);
                if (distance <= maxDistancePx) {
                    selectedCandidates.push(candidate);
                }
            }
        }

        let analysisContour = selectedCandidates[0].contour;
        if (selectedCandidates.length > 1) {
            const mergedCoords = [];
            selectedCandidates.forEach((entry) => {
                const contourCoords = entry.contour?.data32S ?? [];
                for (let i = 0; i < contourCoords.length; i += 1) {
                    mergedCoords.push(contourCoords[i]);
                }
            });

            if (mergedCoords.length >= 6) {
                const mergedPoints = cvModule.matFromArray(
                    mergedCoords.length / 2,
                    1,
                    cvModule.CV_32SC2,
                    mergedCoords,
                );
                mergedHull = new cvModule.Mat();
                cvModule.convexHull(mergedPoints, mergedHull, false, true);
                mergedPoints.delete();
                if (mergedHull.rows >= 3) {
                    analysisContour = mergedHull;
                }
            }
        }

        const moments = cvModule.moments(analysisContour, false);
        if (!moments || !Number.isFinite(moments.m00) || moments.m00 <= 0) {
            postShapeResult({
                requestId,
                frameSize: { width, height },
                roiRect: roiRectData,
                detected: false,
                contour: null,
            });
            return;
        }

        const offsetX = roiRectData ? roiRectData.x : 0;
        const offsetY = roiRectData ? roiRectData.y : 0;
        const area = moments.m00;
        const centroid = {
            x: moments.m10 / moments.m00 + offsetX,
            y: moments.m01 / moments.m00 + offsetY,
        };
        const mu20 = moments.mu20;
        const mu02 = moments.mu02;
        const mu11 = moments.mu11;
        const discriminant = Math.sqrt(
            Math.max(0, 4 * mu11 * mu11 + (mu20 - mu02) * (mu20 - mu02)),
        );
        const eigenvalue1 = 0.5 * (mu20 + mu02 + discriminant);
        const eigenvalue2 = 0.5 * (mu20 + mu02 - discriminant);
        const safeEigenvalue2 = Math.max(1e-9, Math.abs(eigenvalue2));
        const eccentricity = eigenvalue1 / safeEigenvalue2;
        const principalAngle = 0.5 * Math.atan2(2 * mu11, mu20 - mu02);
        const rawBounds = cvModule.boundingRect(analysisContour);
        const contourPoints = contourPointsToArray(analysisContour, offsetX, offsetY);

        postShapeResult({
            requestId,
            frameSize: { width, height },
            roiRect: roiRectData,
            detected: true,
            contour: {
                area,
                centroid,
                eigenvalue1,
                eigenvalue2,
                eccentricity,
                principalAngle,
                boundingRect: {
                    x: rawBounds.x + offsetX,
                    y: rawBounds.y + offsetY,
                    width: rawBounds.width,
                    height: rawBounds.height,
                },
            },
            contourPoints,
        });
    } finally {
        candidates.forEach((entry) => {
            entry.contour.delete();
        });
        if (mergedHull) {
            mergedHull.delete();
        }
        hierarchy.delete();
        contours.delete();
        if (kernel) {
            kernel.delete();
        }
        boosted.delete();
        backgroundSuppressed.delete();
        background.delete();
        cleaned.delete();
        binary.delete();
        smoothed.delete();
        if (roiRect && roiView !== gray) {
            roiView.delete();
        }
        gray.delete();
        src.delete();
    }
};

workerCtx.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type !== 'PROCESS_FRAME' && data.type !== 'ANALYZE_SHAPE') {
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
    const handler = data.type === 'ANALYZE_SHAPE' ? handleAnalyzeShape : handleProcessFrame;
    handler(data).catch((error) => {
        workerCtx.postMessage({
            type: 'ERROR',
            requestId: data.requestId,
            message: error && error.message ? error.message : String(error),
        });
    });
});
