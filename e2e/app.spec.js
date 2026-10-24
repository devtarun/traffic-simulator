// End-to-end tests: the real page in Chrome, driven with the mouse and
// keyboard. Each test gets a fresh browser profile (empty localStorage).
// Assertions read app state with state(page, fn): fn runs in the page with
// every module's exports in scope (points, lines, game.traffic and so on).

const { test, expect } = require("@playwright/test");

// Fail any test whose page throws
let errors;
test.beforeEach(async ({ page }) => {
    errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // No CrazyGames SDK (e2e/platform.spec.js covers it): saves go to
    // localStorage, and the tests don't depend on the network
    await page.route("https://sdk.crazygames.com/**", (route) => route.abort());
});
test.afterEach(() => expect(errors).toEqual([]));

async function startFresh(page) {
    await page.goto("/index.html");
    await page.click("#fresh-game");
    await expect(page.locator("#start-screen")).toBeHidden();
}

// Clicks out a road through screen points, then ends it (right-click on
// empty ground, Escape to close the road type menu that opens). The
// right-click spot keeps clear of the roads these tests draw and of the
// bottom-right toasts (the first road triggers a "New game saved" one).
async function drawRoad(page, ...pts) {
    for (const [x, y] of pts) await page.mouse.click(x, y);
    await page.mouse.click(1220, 560, { button: "right" });
    await expect(page.locator("#road-menu")).toBeVisible();
    await page.keyboard.press("Escape");
}

// A + crossing with its junction at (550, 350)
async function buildCross(page) {
    await page.click("#mode-road");
    await drawRoad(page, [150, 350], [950, 350]);
    await drawRoad(page, [550, 120], [550, 650]);
}

// The dev server hands out each module once, so importing them here gives
// the very instances the app is running
const MODULES = ["state", "layout", "lights", "traffic", "sim"];
const state = (page, fn) =>
    page.evaluate(
        async ({ modules, src }) => {
            const all = await Promise.all(
                modules.map((m) => import(`/js/${m}.js`)),
            );
            const scope = Object.assign({}, ...all);
            return new Function("scope", `with (scope) return (${src})();`)(
                scope,
            );
        },
        { modules: MODULES, src: fn.toString() },
    );

test("the start screen starts a fresh game", async ({ page }) => {
    await page.goto("/index.html");
    await expect(page.locator("#start-screen")).toBeVisible();
    await expect(page.locator("#resume-game")).toBeDisabled(); // nothing saved yet
    await page.click("#fresh-game");
    await expect(page.locator("#start-screen")).toBeHidden();
    expect(
        await state(page, () => [
            game.roadEnabled,
            game.trafficEnabled,
            game.paused,
        ]),
    ).toEqual([false, false, false]);
});

test("drawing two crossing roads makes a junction, houses and traffic", async ({
    page,
}) => {
    await startFresh(page);
    await buildCross(page);
    expect(
        await state(page, () => ({
            points: points.length,
            lines: lines.length,
        })),
    ).toEqual({ points: 5, lines: 4 });
    // Traffic is rebuilt on the next animation frame, so wait for it
    await expect
        .poll(() => state(page, () => game.traffic.junctions.size))
        .toBe(1);
    expect(await state(page, () => getScene().boxes.length)).toBeGreaterThan(
        10,
    );
    await expect
        .poll(() =>
            state(page, () => game.traffic.cars.filter((c) => c.path).length),
        )
        .toBeGreaterThan(0);
});

test("clicks don't build roads while the Road tool is off", async ({
    page,
}) => {
    await startFresh(page);
    await page.mouse.click(200, 300);
    await page.mouse.click(600, 300);
    expect(await state(page, () => lines.length)).toBe(0);
});

test("the road type menu sets the type of new roads", async ({ page }) => {
    await startFresh(page);
    await page.click("#mode-road");
    await page.mouse.click(700, 500, { button: "right" });
    await expect(page.locator("#road-menu")).toBeVisible();
    await page.getByRole("button", { name: "2-lane road" }).click();
    await expect(page.locator("#road-menu")).toBeHidden();
    await drawRoad(page, [200, 300], [700, 300]);
    expect(await state(page, () => lines.map((l) => l[2]))).toEqual([1]);
});

test("with the Traffic tool, clicking a junction adds a signal and shows its panel", async ({
    page,
}) => {
    await startFresh(page);
    await buildCross(page);
    await page.click("#mode-road"); // Road off
    await page.click("#mode-traffic");
    await page.mouse.click(550, 350);
    expect(await state(page, () => lights.size)).toBe(1);
    await expect(page.locator("#panel")).toBeVisible();
    await expect(page.locator("#panel")).toContainText("Intersection");
    await expect(page.locator("#panel")).toContainText("Timed");
});

test("the settings popup pauses the simulation until Resume", async ({
    page,
}) => {
    await startFresh(page);
    await page.click("#settings");
    await expect(page.locator("#settings-menu")).toBeVisible();
    expect(await state(page, () => game.paused)).toBe(true);
    await page.click("#resume");
    await expect(page.locator("#settings-menu")).toBeHidden();
    expect(await state(page, () => game.paused)).toBe(false);
});

test("the help button at the top left pauses and shows the controls", async ({
    page,
}) => {
    await startFresh(page);
    const box = await page.locator("#help").boundingBox();
    expect(box.x).toBeLessThan(100);
    expect(box.y).toBeLessThan(100);
    await page.click("#help");
    await expect(page.locator("#help-menu")).toBeVisible();
    await expect(page.locator("#help-menu")).toContainText("Road");
    await expect(page.locator("#help-menu")).toContainText("Traffic");
    expect(await state(page, () => game.paused)).toBe(true);
    await page.click("#help-close");
    await expect(page.locator("#help-menu")).toBeHidden();
    expect(await state(page, () => game.paused)).toBe(false);
});

test("the page has a road emoji favicon", async ({ page }) => {
    await page.goto("/index.html");
    const href = await page.locator('link[rel="icon"]').getAttribute("href");
    expect(decodeURIComponent(href)).toContain("🛣️");
});

test("a saved game can be resumed after reloading", async ({ page }) => {
    await startFresh(page);
    await buildCross(page);
    await page.click("#settings");
    await page.click("#save");
    await expect(page.locator("#save")).toHaveText("Saved");
    await page.reload();
    await expect(page.locator("#resume-game")).toBeEnabled();
    await page.click("#resume-game");
    expect(await state(page, () => lines.length)).toBe(4);
});

test("the speed button cycles normal, 2× and 3×", async ({ page }) => {
    await startFresh(page);
    const speed = page.locator("#speed");
    for (const [n, label] of [
        [2, "❯❯"],
        [3, "❯❯❯"],
        [1, "❯"],
    ]) {
        await speed.click();
        await expect(speed).toHaveText(label);
        expect(await state(page, () => game.simSpeed)).toBe(n);
    }
});

test("traffic + adds cars and says so in a toast", async ({ page }) => {
    await startFresh(page);
    await buildCross(page);
    // Wait for traffic to be rebuilt for the new roads before counting
    await expect
        .poll(() => state(page, () => game.traffic.cars.length))
        .toBeGreaterThan(0);
    const before = await state(page, () => game.traffic.cars.length);
    await page.click("#traffic-more");
    await expect(page.locator("#toasts")).toContainText(
        "Traffic increased by 10%",
    );
    expect(await state(page, () => game.traffic.cars.length)).toBeGreaterThan(
        before,
    );
});

test("the wheel zooms and a drag pans the view", async ({ page }) => {
    await startFresh(page);
    await page.mouse.move(640, 400);
    await page.mouse.wheel(0, -400);
    await expect.poll(() => state(page, () => view.scale)).toBeGreaterThan(1);
    const before = await state(page, () => ({ ...view }));
    await page.mouse.move(640, 400);
    await page.mouse.down();
    await page.mouse.move(700, 450, { steps: 5 });
    await page.mouse.up();
    const after = await state(page, () => ({ ...view }));
    expect(after.x - before.x).toBeCloseTo(60, 0);
    expect(after.y - before.y).toBeCloseTo(50, 0);
    expect(await state(page, () => points.length)).toBe(0);
});
