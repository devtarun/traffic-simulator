# Canvas Road Builder

A small, dependency-free road building and traffic simulation game that runs in a web browser. Roads connect at junctions, procedural scenery fills the blocks beside them, and traffic follows routes while responding to queues, junction priority, and signals.

## Run

Open `index.html` in a modern browser. No build step or package installation is required. Alternatively, serve this folder with any static file server and open its local address.

## Controls

### Road mode

- **Left-click** to place a point and connect it to the previous point. Click near an existing point to connect to it.
- **Drag** with the left or middle mouse button to pan. Use the **mouse wheel** to zoom around the pointer.
- **W/A/S/D** pans the view. Angle snapping is on by default.
- **Right-click** on empty space to end the current road chain and choose a 2-lane or 4-lane road for new roads. Right-click a point to remove it and its connected roads.

### Traffic mode

- Select **Traffic** to stop building roads and interact with the simulation.
- Click a **junction** to toggle its traffic light and inspect it; click a **road** to inspect traffic flow; click a **car** or **building** to show its route.
- Use the **+ / −** controls to adjust traffic and the speed control to cycle simulation speed.

### Settings

The gear opens settings and pauses traffic. **Snap** toggles angle snapping, **Save** stores the current map, view, and signals in this browser, **Reset** clears the current map, and **Resume** closes settings. Saved maps are local to the browser and are restored when the page loads.
