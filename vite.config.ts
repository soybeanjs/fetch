import { defineConfig } from 'vite-plus';
import { lint, fmt } from '@soybeanjs/oxc-config';

export default defineConfig({
  staged: {
    '*': 'vp check --fix'
  },
  fmt,
  lint,
  pack: {
    entry: ['src/index.ts', 'src/openapi.ts'],
    platform: 'neutral',
    clean: true,
    minify: true
  }
});
