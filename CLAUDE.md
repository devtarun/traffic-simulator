# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A single-file blank canvas: everything (markup, CSS, JS) lives in `index.html`. There is no build step, package manager, linter, or test suite, and no external dependencies. Run it by opening `index.html` in a browser (or serving the folder with any static server, e.g. `npx serve .` or `python -m http.server`).

## Architecture notes

- The page is a single full-window `<canvas id="c">` on a white page background; the canvas itself is transparent.
- **Two coordinate spaces.** `resize()` sizes the canvas backing store to CSS size × `devicePixelRatio` and applies `ctx.setTransform(dpr, …)`, so drawing calls use CSS-pixel coordinates. `getImageData`/`putImageData` ignore the transform and work in device pixels.
- **State:** `points` (CSS-pixel positions), `lines` (pairs of indices into `points`), `last` (index of the most recently clicked point) and `pointer` (current pointer position, `null` when outside the canvas).
- **Clicking** (`pointerdown`, so mouse, pen and touch all work): if the click is within `HIT` px of an existing point, that point is reused; otherwise a new point is added. Either way a solid line is added from `last` to it (skipping self-lines and duplicates) and it becomes `last`.
- **Preview:** while the pointer is over the canvas, a half-opacity road runs from `last` to the pointer. It is drawn opaque on the offscreen `layer` canvas (kept the same size as the main canvas by `resize()`), then copied onto the main canvas with `globalAlpha = 0.5`, so its stacked layers don't show through each other. Within `HIT` px of a point, the pointer snaps to that point's exact position, using the same `hitTest()` as clicking.
- **Right click** (`pointerdown` with `button === 2`) on a point (by `hitTest()`) asks for confirmation with `confirm()`, then calls `remove()`, which deletes the point and its lines and shifts higher indices in `lines` and `last` down by one; removing `last` ends the chain. Right click elsewhere sets `last = null`, ending the chain and hiding the preview. The canvas's context menu is disabled.
- **Controls** are fixed at the top-right, over the canvas. Reset clears `points`, `lines` and `last` but leaves the saved copy alone. Save writes `{ points, lines, last }` as JSON to `localStorage` under `STORAGE_KEY`; `load()` restores it on startup. Saving is manual only.
- **Lines are drawn as roads** by `roads(c, segs)`, which draws `[p, q]` segments on context `c`: asphalt, white edge lines and a dashed yellow center line. Each layer is drawn for every line before the next layer starts, so roads that cross merge into junctions.
- **Rendering is immediate-mode:** `render()` clears and redraws everything (roads, then preview, then points on top) from state. It runs on every pointer event and after `resize()`, which is needed because setting `width`/`height` clears the canvas. New visuals should be added to `render()` rather than drawn directly.
