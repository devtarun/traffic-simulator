// Drawing a frame, and keeping the canvas sized to the window

import {
    canvas,
    ctx,
    game,
    lines,
    points,
    roadsVersion,
    view,
} from "./state.js";
import { corners } from "./geometry.js";
import { terrain } from "./terrain.js";
import { roads } from "./roads.js";
import { getScene } from "./layout.js";
import { house, office, poly, tree } from "./scenery.js";
import { pieceAt, renderCarPos, shownCars } from "./traffic.js";
import { drawLights } from "./lights.js";
import { drawJunctionAlerts, drawQueues, drawRoadFlow } from "./sim.js";
import { CAR_LEN, drawCars } from "./vehicles.js";

// Offscreen layer for the preview road: drawn opaque, then composited at
// half opacity, so its stacked passes don't show through each other.
export const layer = document.createElement("canvas");
export const lctx = layer.getContext("2d");
export const sceneryLayer = document.createElement("canvas");
export const sctx = sceneryLayer.getContext("2d");
export let sceneryKey = "";

export function drawScenery(dpr, boxes, trees) {
    const key = [
        roadsVersion,
        canvas.width,
        canvas.height,
        view.x,
        view.y,
        view.scale,
    ].join(":");
    if (key === sceneryKey) return;
    sceneryKey = key;
    if (
        sceneryLayer.width !== canvas.width ||
        sceneryLayer.height !== canvas.height
    ) {
        sceneryLayer.width = canvas.width;
        sceneryLayer.height = canvas.height;
    }
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, sceneryLayer.width, sceneryLayer.height);
    sctx.setTransform(
        dpr * view.scale,
        0,
        0,
        dpr * view.scale,
        dpr * view.x,
        dpr * view.y,
    );
    terrain(sctx);
    boxes.forEach((b) => (b.office ? office(b, sctx) : house(b, sctx)));
    trees.forEach((t) => tree(t, sctx));
    roads(
        sctx,
        lines.map(([a, b, lanes]) => [points[a], points[b], lanes]),
    );
}

export function render() {
    // Clear and composite in device pixels; draw everything else in world coordinates
    const dpr = window.devicePixelRatio || 1;
    const toWorld = (c) =>
        c.setTransform(
            dpr * view.scale,
            0,
            0,
            dpr * view.scale,
            dpr * view.x,
            dpr * view.y,
        );
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const { boxes, trees } = getScene();
    drawScenery(dpr, boxes, trees);
    ctx.drawImage(sceneryLayer, 0, 0);
    toWorld(ctx);
    drawLights(ctx, game.traffic);
    drawQueues(ctx, game.traffic);
    if (game.selectedRoad !== null && lines[game.selectedRoad])
        drawRoadFlow(ctx, game.traffic, game.selectedRoad);
    // Selected junction: a light blue ring around its box
    const sj =
        game.selectedJunction !== null
            ? game.traffic.junctions.get(game.selectedJunction)
            : null;
    if (sj) {
        ctx.strokeStyle = "rgba(90, 190, 255, 0.95)";
        ctx.lineWidth = 3 / view.scale;
        ctx.beginPath();
        ctx.arc(
            points[sj.node].x,
            points[sj.node].y,
            sj.clear + 6,
            0,
            Math.PI * 2,
        );
        ctx.stroke();
    }
    // When inspection is available, show the selected box's outline and routes of the
    // shown cars (the selected car, or all cars driving to the selected box),
    // under the cars: light blue lines from each car to its destination's door,
    // ending in a dot. Sizes are in screen px.
    const shown = !game.roadEnabled || game.trafficEnabled ? shownCars() : [];
    ctx.strokeStyle = ctx.fillStyle = "rgba(90, 190, 255, 0.9)";
    ctx.lineCap = ctx.lineJoin = "round";
    if ((!game.roadEnabled || game.trafficEnabled) && game.selectedBox) {
        ctx.lineWidth = 3 / view.scale;
        poly(corners(game.selectedBox));
        ctx.stroke();
    }
    shown.forEach((car) => {
        const rest = [renderCarPos(car), ...car.path.slice(pieceAt(car))];
        ctx.lineWidth = 3 / view.scale;
        ctx.beginPath();
        rest.forEach((p, k) =>
            k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
        );
        ctx.stroke();
        const end = rest[rest.length - 1];
        ctx.beginPath();
        ctx.arc(end.x, end.y, 5 / view.scale, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
    drawCars(ctx);
    drawJunctionAlerts(ctx, game.traffic);
    // Rings around the shown cars
    ctx.strokeStyle = "rgba(90, 190, 255, 0.9)";
    ctx.lineWidth = 2 / view.scale;
    shown.forEach((car) => {
        const p = renderCarPos(car);
        ctx.beginPath();
        ctx.arc(p.x, p.y, CAR_LEN / 2 + 3 / view.scale, 0, Math.PI * 2);
        ctx.stroke();
    });
    if (game.last !== null && game.pointer) {
        lctx.setTransform(1, 0, 0, 1, 0, 0);
        lctx.clearRect(0, 0, layer.width, layer.height);
        toWorld(lctx);
        roads(lctx, [[points[game.last], game.pointer, game.roadLanes]]);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 0.5;
        ctx.drawImage(layer, 0, 0);
        ctx.globalAlpha = 1;
        toWorld(ctx);
    }
    // Points aren't drawn: they still snap, join roads and can be right-clicked
}

// Match the backing store to CSS size × devicePixelRatio so drawing stays sharp.
// Resizing clears the canvas, so redraw everything afterwards.
export function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    layer.width = canvas.width;
    layer.height = canvas.height;
    sceneryKey = "";
    render();
}
window.addEventListener("resize", resize);
