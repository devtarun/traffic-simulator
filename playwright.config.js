// End-to-end tests: Playwright drives the real page in Chrome.
// `npm run test:e2e` starts the Vite dev server (it serves the modules
// straight from js/) and runs everything in e2e/.

const { defineConfig } = require("@playwright/test");

const PORT = 8091;

module.exports = defineConfig({
    testDir: "e2e",
    fullyParallel: true,
    reporter: "list",
    use: {
        baseURL: `http://127.0.0.1:${PORT}`,
        // The installed Chrome, so no separate browser download is needed
        channel: "chrome",
        viewport: { width: 1280, height: 800 },
    },
    webServer: {
        command: `npx vite --port ${PORT} --strictPort --logLevel warn`,
        url: `http://127.0.0.1:${PORT}/index.html`,
        reuseExistingServer: !process.env.CI,
    },
});
