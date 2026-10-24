// Simulation timing is shared with render interpolation.
const FIXED_DT = 1 / 120;
let accumulator = 0;
let renderAlpha = 0;

// Startup and the animation loop. Loaded last, once everything else is defined.
const hasLastGame = load();
paused = true;
resize();

const startScreen = document.getElementById("start-screen");
const resumeGameButton = document.getElementById("resume-game");
const restoreFileInput = document.getElementById("restore-file");
const startMessage = document.getElementById("start-message");
resumeGameButton.disabled = !hasLastGame;

function enterGame() {
    startMessage.textContent = "";
    startScreen.hidden = true;
    accumulator = 0;
    paused = false;
    prevTime = null;
}

resumeGameButton.onclick = enterGame;

document.getElementById("fresh-game").onclick = () => {
    try {
        if (
            localStorage.getItem(STORAGE_KEY) !== null &&
            !confirm(
                "Starting fresh will delete the saved game in this browser. Continue?",
            )
        )
            return;
        localStorage.removeItem(STORAGE_KEY);
        points.length = 0;
        lines.length = 0;
        roadsChanged();
        last = null;
        view.x = view.y = 0;
        view.scale = 1;
        lights.clear();
        clearSelection();
        roadEnabled = false;
        trafficEnabled = false;
        autoSaveOnFirstRoad = true;
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
    if (paused) {
        accumulator = 0;
        renderAlpha = 1;
    } else {
        accumulator += dt * simSpeed;
        while (accumulator >= FIXED_DT) {
            stepSim(traffic, FIXED_DT);
            accumulator -= FIXED_DT;
        }
        renderAlpha = accumulator / FIXED_DT;
    }
    render();
    updateAlerts(traffic);
    updatePanel(traffic);
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
