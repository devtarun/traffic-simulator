// End-to-end test of the built page (npm run build → dist/, made by Vite): the
// bundled, minified app.js must work in a real browser. Its names are
// obfuscated and nothing is global, so this test checks behaviour through the
// page only. The build is served by Vite's preview server, as
// `npm run preview` would.

const path = require("node:path");
const { test, expect } = require("@playwright/test");
const { viteBuild } = require("../tests/helpers/build");

const PREVIEW_PORT = 8092;
let server;

test.beforeAll(async () => {
    await viteBuild(); // writes dist/
    const { preview } = await import("vite");
    server = await preview({
        configFile: path.join(__dirname, "..", "vite.config.mjs"),
        logLevel: "silent",
        preview: { port: PREVIEW_PORT, strictPort: true },
    });
});

test.afterAll(async () => {
    await server?.close();
});

test("the built page starts a game, builds roads and opens the settings", async ({
    page,
}) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // without the CrazyGames SDK, so the save lands in localStorage
    await page.route("https://sdk.crazygames.com/**", (route) => route.abort());
    await page.goto(`http://127.0.0.1:${PREVIEW_PORT}/`);

    await expect(page.locator("#start-screen")).toBeVisible();
    await page.click("#fresh-game");
    await expect(page.locator("#start-screen")).toBeHidden();

    await page.click("#mode-road");
    await expect(page.locator("#mode-road")).toHaveClass(/active/);
    await page.mouse.click(200, 350);
    await page.mouse.click(900, 350);
    // the first road of a fresh game is saved, with a toast saying so
    await expect(page.locator("#toasts")).toContainText("New game saved");
    const saved = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("canvas-state")),
    );
    expect(saved.lines).toEqual([[0, 1, 2]]);

    await page.click("#settings");
    await expect(page.locator("#settings-menu")).toBeVisible();
    await page.click("#resume");
    await expect(page.locator("#settings-menu")).toBeHidden();

    expect(errors).toEqual([]);
});
