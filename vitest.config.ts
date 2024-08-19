import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node', // or 'jsdom' for browser-like environment
        include: ['tests/**/*.{test,spec}.{js,ts}'], // Adjust the glob pattern to match your test files
    },
});
