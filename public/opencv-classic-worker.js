/* eslint-env worker */
/* global importScripts */
'use strict';

const workerCtx = self;

const state = {
    cvReady: false,
    readyPayload: null,
    canvas: null,
    ctx: null,
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

const ensureCanvasContext = (width, height) => {
    if (!state.canvas || state.canvas.width !== width || state.canvas.height !== height) {
        state.canvas = new OffscreenCanvas(width, height);
        state.ctx = state.canvas.getContext('2d', { willReadFrequently: true });
    }
    return state.ctx;
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

    let view = adjusted;
    let roiView = null;
    if (applyRoi && roi && roi.enabled) {
        const rect = buildRect(roi, width, height);
        roiView = view.roi(rect);
        view = roiView;
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
            frame: bitmap,
        },
        [bitmap],
    );

    cleanupMats([rgba, roiView, adjusted, gray, src]);
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
