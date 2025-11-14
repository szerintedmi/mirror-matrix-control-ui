import { OpenCvWorkerClient } from './opencvWorkerClient';

let singleton: OpenCvWorkerClient | null = null;

export const getOpenCvWorkerClient = (): OpenCvWorkerClient => {
    if (!singleton) {
        singleton = new OpenCvWorkerClient();
    }
    return singleton;
};

export const resetOpenCvWorkerClient = () => {
    if (singleton) {
        singleton.dispose();
        singleton = null;
    }
};
