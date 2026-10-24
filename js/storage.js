// Saving to and loading from localStorage

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!s) return;
    points.push(...s.points);
    // Older saves have no road type; they were drawn as 4-lane roads
    lines.push(...s.lines.map(([a, b, lanes]) => [a, b, lanes ?? MAX_LANES]));
    last = s.last;
    if (s.view) Object.assign(view, s.view); // older saves have no view
  } catch (err) {
    console.warn('Could not load saved canvas', err);
  }
}

const saveBtn = document.getElementById('save');
saveBtn.onclick = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ points, lines, last, view }));
    saveBtn.textContent = 'Saved';
  } catch (err) {
    console.warn('Could not save canvas', err);
    saveBtn.textContent = 'Save failed';
  }
  setTimeout(() => { saveBtn.textContent = 'Save'; }, 1200);
};
