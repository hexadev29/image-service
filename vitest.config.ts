import { defineConfig } from 'vitest/config';

// Native Canvas rendering is exercised by the explicit sample-render command.
// Keeping Vitest in pure unit-test mode avoids loading Skia in its worker pool.
export default defineConfig({ test: { include: ['tests/unit/**/*.test.ts'] } });
