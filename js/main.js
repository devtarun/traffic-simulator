// Startup and the animation loop. The entry module: it imports every other
// module, in the order they run (tests/helpers/app.js follows this list too).

import {
    STORAGE_KEY,
    game,
    lines,
    points,
    roadsChanged,
    view,
} from "./state.js";
import { saves, startPlatform } from "./platform.js";
import "./geometry.js";
import "./terrain.js";
import "./roads.js";
import { getScene } from "./layout.js";
import "./scenery.js";
import "./traffic.js";
import { lights } from "./lights.js";
import { stepSim, updateAlerts } from "./sim.js";
import "./junctions.js";
import "./vehicles.js";
import { render, resize } from "./render.js";
import { load, restoreSave, saveData } from "./storage.js";
import { updatePanel } from "./inspect.js";
import {
    clearSelection,
    panKeys,
    setPaused,
    updateToolToggles,
} from "./input.js";

// Simulation timing is shared with render interpolation.
const FIXED_DT = 1 / 120;
let accumulator = 0;

game.paused = true;
resize();

const startScreen = document.getElementById("start-screen");
const resumeGameButton = document.getElementById("resume-game");
const restoreFileInput = document.getElementById("restore-file");
const startMessage = document.getElementById("start-message");
const startButtons = [
    "fresh-game",
    "resume-game",
    "backup-game",
    "restore-game",
].map((id) => document.getElementById(id));

// The start screen's buttons wait for the platform (the CrazyGames SDK
// preloads the player's save in its init) and the saved game to load
startButtons.forEach((b) => (b.disabled = true));
startPlatform(() => {
    const hasLastGame = load();
    startButtons.forEach((b) => (b.disabled = false));
    resumeGameButton.disabled = !hasLastGame;
});

function enterGame() {
    startMessage.textContent = "";
    startScreen.hidden = true;
    accumulator = 0;
    setPaused(false);
    prevTime = null;
}

resumeGameButton.onclick = enterGame;

document.getElementById("fresh-game").onclick = () => {
    try {
        if (
            saves.getItem(STORAGE_KEY) !== null &&
            !confirm(
                "Starting fresh will delete the saved game in this browser. Continue?",
            )
        )
            return;
        saves.removeItem(STORAGE_KEY);
        points.length = 0;
        lines.length = 0;
        roadsChanged();
        game.last = null;
        view.x = view.y = 0;
        view.scale = 1;
        lights.clear();
        clearSelection();
        game.roadEnabled = false;
        game.trafficEnabled = false;
        game.autoSaveOnFirstRoad = true;
        updateToolToggles();
        getScene();
        resumeGameButton.disabled = true;
        enterGame();
    } catch (err) {
        startMessage.textContent = "Could not clear the saved game.";
    }
};

document.getElementById("backup-game").onclick = () => {
    try {
        const blob = new Blob([JSON.stringify(saveData(), null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `traffic-simulator-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        startMessage.textContent = "Backup downloaded.";
    } catch (err) {
        startMessage.textContent = "Could not create the backup.";
    }
};

document.getElementById("restore-game").onclick = () =>
    restoreFileInput.click();
restoreFileInput.onchange = async () => {
    const file = restoreFileInput.files[0];
    if (!file) return;
    try {
        restoreSave(JSON.parse(await file.text()));
        clearSelection();
        updateToolToggles();
        getScene();
        resumeGameButton.disabled = false;
        enterGame();
    } catch (err) {
        startMessage.textContent =
            err.message || "Could not restore that backup.";
    } finally {
        restoreFileInput.value = "";
    }
};

// Moves the cars and redraws every frame. dt is capped so a background tab
// coming back doesn't teleport everything.
let prevTime = null;
function frame(now) {
    const dt = prevTime === null ? 0 : Math.min(0.1, (now - prevTime) / 1000);
    prevTime = now;
    panKeys(dt);
    getScene(); // rebuilds traffic if the roads changed
    if (game.paused) {
        accumulator = 0;
        game.renderAlpha = 1;
    } else {
        accumulator += dt * game.simSpeed;
        while (accumulator >= FIXED_DT) {
            stepSim(game.traffic, FIXED_DT);
            accumulator -= FIXED_DT;
        }
        game.renderAlpha = accumulator / FIXED_DT;
    }
    render();
    updateAlerts(game.traffic);
    updatePanel(game.traffic);
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
