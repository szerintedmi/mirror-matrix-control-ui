import path from 'path';

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type PluginOption } from 'vite';
import { configDefaults } from 'vitest/config';

export default defineConfig(async ({ mode }) => {
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
            setupFiles: ['vitest.setup.ts'],
            exclude: [...configDefaults.exclude, 'e2e/**'],
        },
    };
});
