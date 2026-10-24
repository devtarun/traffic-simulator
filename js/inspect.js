// The inspection panel (bottom left) for a selected junction. Its layout is
// built when the selection changes; the live values in it are refreshed
// every frame by updatePanel().

const panel = document.getElementById('panel');
const panelTitle = panel.querySelector('.panel-title');
const panelBody = panel.querySelector('.panel-body');
panel.querySelector('.panel-close').onclick = () => { selectedJunction = null; };

let panelFor = undefined; // what the panel was last built for
const STATE_NAMES = { green: 'Green', amber: 'Amber', red: 'All red' };

function junctionStatus(j) {
  return j.gridlock ? ['Gridlock', 'bad'] : j.blocked ? ['Blocked', 'warn'] : ['Flowing', 'ok'];
}

// Builds the junction panel's layout for junction node
function buildJunctionPanel(node) {
  const light = lightAt(node);
  panelTitle.textContent = 'Intersection';
  panelBody.innerHTML = light ? `
    <div class="row"><span>Signal</span><b>Timed</b></div>
    <div class="row"><span>Phase</span><b><i class="lamp"></i><span data-v="phase"></span></b></div>
    <label class="row slider"><span>Green time</span><input type="range" min="${GREEN_MIN}" max="${GREEN_MAX}" step="1" value="${light.green}"><b data-v="green"></b></label>
    <div class="row"><span>Waiting</span><b data-v="waiting"></b></div>
    <div class="row"><span>Status</span><b data-v="status"></b></div>
    <button data-a="toggle">Remove signal</button>` : `
    <div class="row"><span>Signal</span><b>None (give way)</b></div>
    <div class="row"><span>Waiting</span><b data-v="waiting"></b></div>
    <div class="row"><span>Status</span><b data-v="status"></b></div>
    <button data-a="toggle">Add timed signal</button>`;
  const slider = panelBody.querySelector('input[type=range]');
  if (slider) slider.oninput = () => { const l = lightAt(node); if (l) l.green = +slider.value; };
  panelBody.querySelector('[data-a=toggle]').onclick = () => { toggleLight(node); panelFor = undefined; };
}

// Shows, hides, rebuilds or refreshes the panel to match the selection
function updatePanel(t) {
  const j = selectedJunction !== null ? t.junctions.get(selectedJunction) : null;
  const want = j ? 'j' + j.node + ':' + (lightAt(j.node) ? 'timed' : 'none') : null;
  if (want !== panelFor) {
    panelFor = want;
    panel.hidden = !want;
    if (j) buildJunctionPanel(j.node);
  }
  if (!j) return;
  const set = (k, text, cls) => {
    const el = panelBody.querySelector(`[data-v=${k}]`);
    if (!el) return;
    if (el.textContent !== text) el.textContent = text;
    if (cls !== undefined) el.className = cls;
  };
  const light = lightAt(j.node);
  if (light) {
    const cyc = lightCycle(light, j);
    set('phase', `${cyc.phase + 1} of ${j.phases.length} · ${STATE_NAMES[cyc.state]} · ${Math.ceil(cyc.left)} s`);
    panelBody.querySelector('.lamp').className = 'lamp ' + cyc.state;
    set('green', light.green + ' s');
  }
  set('waiting', String(t.cars.filter(c => c.path && c.waitingAt === j.node && c.v < 1).length));
  const [status, cls] = junctionStatus(j);
  set('status', status, cls);
}
