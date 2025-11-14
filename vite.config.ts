import { promises as fs } from 'fs';
import path from 'path';

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type PluginOption } from 'vite';
import { configDefaults } from 'vitest/config';

const ensureOpenCvAsset = async () => {
    const source = path.resolve(__dirname, 'node_modules/@techstark/opencv-js/dist/opencv.js');
    const destination = path.resolve(__dirname, 'public/opencv.js');
    try {
        await fs.mkdir(path.dirname(destination), { recursive: true });
        const [sourceStat, destinationStat] = await Promise.all([
            fs.stat(source),
            fs.stat(destination).catch(() => null),
        ]);
        if (!destinationStat || destinationStat.mtimeMs < sourceStat.mtimeMs) {
            await fs.copyFile(source, destination);
        }
    } catch (error) {
        console.warn('[vite] Unable to sync OpenCV asset:', error);
    }
};

export default defineConfig(async ({ mode }) => {
    await ensureOpenCvAsset();
    const env = loadEnv(mode, '.', '');
    const isTest = mode === 'test' || Boolean(process.env.VITEST);
    const plugins: PluginOption[] = [];
    plugins.push(...(react() as PluginOption[]));
    if (!isTest) {
        try {
            const { default: checker } = await import('vite-plugin-checker');
            const ch = checker({ typescript: true }) as PluginOption;
            if (Array.isArray(ch)) plugins.push(...ch);
            else plugins.push(ch);
        } catch {
            // optional dependency missing — skip overlay
        }
    }
    return {
        server: {
            port: 3000,
            host: '0.0.0.0',
        },
        plugins,
        define: {
            'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
            'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        },
        resolve: {
            alias: {
                '@': path.resolve(__dirname, 'src'),
            },
        },
        test: {
            globals: true,
            environment: 'jsdom',
            exclude: [...configDefaults.exclude, 'e2e/**'],
        },
    };
});
