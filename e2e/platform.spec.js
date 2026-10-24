// End-to-end tests of the CrazyGames SDK integration (js/platform.js) in a
// real browser. The SDK's script URL is answered with a stub that records
// calls in window.sdkCalls and keeps its data in window.sdkData, so the
// tests don't depend on the network or on CrazyGames' servers.

const { test, expect } = require("@playwright/test");

const SDK_URL = "https://sdk.crazygames.com/**";
const STUB = `
window.sdkCalls = [];
window.sdkData = JSON.parse(sessionStorage.getItem("sdkData") || "{}");
const record = (name, f) => (...args) => {
    window.sdkCalls.push(name);
    return f?.(...args);
};
const persist = () => sessionStorage.setItem("sdkData", JSON.stringify(window.sdkData));
window.CrazyGames = {
    SDK: {
        environment: "crazygames",
        init: () => new Promise((resolve) => setTimeout(() => {
            window.sdkCalls.push("init");
            resolve();
        }, 200)),
        game: {
            loadingStart: record("loadingStart"),
            loadingStop: record("loadingStop"),
            gameplayStart: record("gameplayStart"),
            gameplayStop: record("gameplayStop"),
        },
        data: {
            getItem: record("getItem", (k) => window.sdkData[k] ?? null),
            setItem: record("setItem", (k, v) => { window.sdkData[k] = String(v); persist(); }),
            removeItem: record("removeItem", (k) => { delete window.sdkData[k]; persist(); }),
        },
    },
};`;

let errors;
test.beforeEach(async ({ page }) => {
    errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route(SDK_URL, (route) =>
        route.fulfill({ contentType: "text/javascript", body: STUB }),
    );
});
test.afterEach(() => expect(errors).toEqual([]));

test("the game waits for the SDK, saves to its data and reports gameplay", async ({
    page,
}) => {
    await page.goto("/index.html");
    // the start buttons unlock once init has finished and the save is loaded
    await expect(page.locator("#fresh-game")).toBeEnabled();
    expect(await page.evaluate(() => window.sdkCalls)).toEqual([
        "init",
        "loadingStart",
        "getItem",
        "loadingStop",
    ]);

    await page.click("#fresh-game");
    await page.click("#mode-road");
    await page.mouse.click(200, 350);
    await page.mouse.click(900, 350);
    await expect(page.locator("#toasts")).toContainText("New game saved");
    const saved = await page.evaluate(() =>
        JSON.parse(window.sdkData["canvas-state"]),
    );
    expect(saved.lines).toEqual([[0, 1, 2]]);
    expect(
        await page.evaluate(() => localStorage.getItem("canvas-state")),
    ).toBeNull();

    await page.click("#settings");
    await page.click("#resume");
    expect(
        await page.evaluate(() =>
            window.sdkCalls.filter((c) => c.startsWith("gameplay")),
        ),
    ).toEqual(["gameplayStart", "gameplayStop", "gameplayStart"]);

    // after a reload the game resumes from the SDK's data
    await page.reload();
    await expect(page.locator("#resume-game")).toBeEnabled();
    await page.click("#resume-game");
    await expect(page.locator("#start-screen")).toBeHidden();
    expect(
        await page.evaluate(async () => {
            const { lines } = await import("/js/state.js");
            return lines.length;
        }),
    ).toBe(1);
});
