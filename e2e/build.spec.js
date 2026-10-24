// End-to-end test of the built page (npm run build → dist/, made by Vite): the
// bundled, minified app.js must work in a real browser. Its names are
// obfuscated and nothing is global, so this test checks behaviour through the
// page only. Vite's module script runs in strict mode, which this also covers.

const { test, expect } = require("@playwright/test");
const { viteBuild } = require("../tests/helpers/build");

test.beforeAll(async () => {
    await viteBuild(); // writes dist/, which the test server also serves
});

test("the built page starts a game, builds roads and opens the settings", async ({
    page,
}) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/dist/index.html");

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
