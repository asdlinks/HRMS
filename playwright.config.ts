import { defineConfig } from '@playwright/test';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, 'tests/.env.e2e'), quiet: true });

export default defineConfig({
  testDir: './tests',
  retries: 0,
  timeout: 30000,
  use: {
    baseURL: 'https://test.mywehr.com',
    video: 'on',
    trace: 'on',
    screenshot: 'on',
    headless: true,
  },
});
