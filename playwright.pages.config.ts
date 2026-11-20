import { defineConfig } from "@playwright/test";

const preview = "http://127.0.0.1:4310/yardwork/";
const publishedOrLocal = process.env.YARDWORK_PAGES_TEST_URL;

export default defineConfig({
  testDir: "./tests/hosted",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: publishedOrLocal ?? preview,
    viewport: { width: 1440, height: 1000 },
    channel: process.env.CI ? undefined : "chrome",
    launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--no-sandbox"] },
    trace: "retain-on-failure",
  },
  webServer: publishedOrLocal ? undefined : {
    command: "npm exec vite preview -- --base /yardwork/ --port 4310 --strictPort",
    url: preview,
  },
});
