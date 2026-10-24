// The CrazyGames SDK (https://docs.crazygames.com/sdk/intro/), loaded by a
// script tag in index.html: startup waits for its init(), saves go to its
// data module (kept with the player's account), and it hears when gameplay
// starts and stops. Without a usable SDK (another site, offline, blocked, or
// environment "disabled") saves go to localStorage and events are dropped.

let sdk = null; // window.CrazyGames.SDK once it's initialised and usable
let playing = false;

// Inits the SDK, then calls onReady (to load the save) while the SDK shows
// loading. Without the SDK, onReady runs right away.
export function startPlatform(onReady) {
    const candidate = window.CrazyGames?.SDK;
    if (!candidate) return onReady();
    candidate
        .init()
        .then(
            () => {
                if (candidate.environment !== "disabled") sdk = candidate;
            },
            (err) => console.warn("CrazyGames SDK unavailable", err),
        )
        .then(() => {
            sdkCall(() => sdk.game.loadingStart());
            onReady();
            sdkCall(() => sdk.game.loadingStop());
        });
}

// Runs f against the SDK if there is one; an SDK error never breaks the game
function sdkCall(f) {
    if (!sdk) return;
    try {
        return f();
    } catch (err) {
        console.warn("CrazyGames SDK call failed", err);
    }
}

// Tells the SDK whether the player is playing (not on the start screen or in
// the settings); repeated calls with the same value are dropped
export function setGameplay(on) {
    if (on === playing) return;
    playing = on;
    sdkCall(() => (on ? sdk.game.gameplayStart() : sdk.game.gameplayStop()));
}

// Where saves live: the SDK's data module (same API as localStorage) when
// available, else localStorage
export const saves = {
    getItem: (key) => (sdk ? sdk.data : localStorage).getItem(key),
    setItem: (key, value) =>
        (sdk ? sdk.data : localStorage).setItem(key, value),
    removeItem: (key) => (sdk ? sdk.data : localStorage).removeItem(key),
};
