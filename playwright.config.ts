import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/ui",
  outputDir: "artifacts/ui",
  timeout: 180_000,
  forbidOnly: !!process.env.CI,
  workers: 2,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4190",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1280, height: 900 } } },
    { name: "mobile-360", use: { browserName: "chromium", viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true } },
  ],
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4190",
    url: "http://127.0.0.1:4190",
    reuseExistingServer: false,
  },
});
