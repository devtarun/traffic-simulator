# Canvas Road Builder

A small, dependency-free road building and traffic simulation game that runs in a web browser. Roads connect at junctions, procedural scenery fills the blocks beside them, and traffic follows routes while responding to queues, junction priority, and signals.

## Run

Open `index.html` in a modern browser, or use the included dev server:

```sh
npm install
npm run dev
```

Then open `http://127.0.0.1:8080`. The app runs straight from the source; the local server is only for development.

## Build

```sh
npm run build      # writes dist/
npm run preview    # serves dist/ to try it
```

Vite builds a deployable copy in `dist/`: `index.html`, `app.css` and `app.js`. All the scripts are bundled into `app.js` and minified, which also shortens every internal name (compressed and obfuscated); the CSS and HTML are minified too. Serve `dist/` from a web server; the built page can't be opened straight from disk.

## Tests

```sh
npm test            # unit tests (Node's built-in runner)
npm run test:e2e    # end-to-end tests in Chrome (Playwright)
```

## Start screen and backups

On load, choose **Resume Last Game** to use the map saved in this browser or **Start Fresh Game** to clear it and begin with an empty map. Starting fresh asks before deleting an existing save; the new game is auto-saved when its first road is placed. **Backup Current Game** downloads the current map, view, and traffic signals as JSON. **Restore Backup** imports a JSON backup and replaces the browser's saved game.

## Controls

### Road and Traffic toggles

- **Road on**: left-click to place a point and connect it to the previous point. Click near an existing point to connect to it. Turn Road off to stop building; you can still click cars and buildings to inspect their routes. Road starts off.
- **Traffic on**: click a junction to place or remove its traffic light. This toggle works independently of Road. With Traffic off, junction clicks follow the Road toggle behavior.
- **Drag** with the left or middle mouse button to pan. Use the **mouse wheel** to zoom around the pointer.
- **W/A/S/D** pans the view. Angle snapping is on by default.
- With Road on, **right-click** empty space to end the current road chain and choose a 2-lane or 4-lane road. Right-click a point to remove it and its connected roads.
- Use the **+ / −** controls to adjust traffic and the speed control to cycle simulation speed.

### Settings

The gear opens settings and pauses traffic. **Snap** toggles angle snapping, **Save** stores the current map, view, and signals in this browser, **Reset** clears the current map, and **Resume** closes settings. Saved maps are local to the browser and are restored when the page loads.
