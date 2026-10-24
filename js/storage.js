// Saving to and loading from localStorage

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!s) return;
    points.push(...s.points);
    lines.push(...s.lines);
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
