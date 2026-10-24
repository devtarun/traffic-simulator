// Grass terrain under everything: a seeded tile repeated as a pattern in
// world space, so it pans and zooms with the map

const TERRAIN_TILE = 128; // tile size in world px
const GRASS = '#a9cf8f';

// One tile: grass with faint speckles and a few darker tufts. Seeded, so it
// looks the same every load; marks near an edge are also drawn wrapped
// round to the opposite edge, so the tiles join without seams.
const terrainTile = (() => {
  const t = document.createElement('canvas');
  t.width = t.height = TERRAIN_TILE;
  const g = t.getContext('2d');
  g.fillStyle = GRASS;
  g.fillRect(0, 0, TERRAIN_TILE, TERRAIN_TILE);
  const rand = rng(20261024);
  const wrapped = (x, y, draw) => [-1, 0, 1].forEach(i => [-1, 0, 1].forEach(j => draw(x + i * TERRAIN_TILE, y + j * TERRAIN_TILE)));
  for (let k = 0; k < 260; k++) {
    const x = rand() * TERRAIN_TILE, y = rand() * TERRAIN_TILE;
    g.fillStyle = `hsla(${90 + rand() * 25}, 38%, ${45 + rand() * 20}%, 0.35)`;
    const s = 1 + rand() * 1.5;
    wrapped(x, y, (px, py) => g.fillRect(px, py, s, s));
  }
  g.lineWidth = 1;
  g.lineCap = 'round';
  for (let k = 0; k < 18; k++) {
    const x = rand() * TERRAIN_TILE, y = rand() * TERRAIN_TILE;
    g.strokeStyle = `hsla(${100 + rand() * 20}, 40%, 38%, 0.45)`;
    wrapped(x, y, (px, py) => {
      g.beginPath();
      [-2, 0, 2].forEach(dx => { g.moveTo(px + dx * 0.6, py); g.lineTo(px + dx, py - 3); });
      g.stroke();
    });
  }
  return t;
})();

let terrainPattern = null;

// Fills the visible part of the world with grass. c must already be in world
// coordinates; the pattern is anchored at the world origin.
function terrain(c) {
  if (!terrainPattern) terrainPattern = c.createPattern(terrainTile, 'repeat');
  c.fillStyle = terrainPattern || GRASS;
  c.fillRect(-view.x / view.scale, -view.y / view.scale, canvas.clientWidth / view.scale, canvas.clientHeight / view.scale);
}
