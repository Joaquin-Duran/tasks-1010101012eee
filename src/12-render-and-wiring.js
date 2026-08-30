
/* ============================================================
   RENDER
   ============================================================ */
const RENDERERS = {
  my:       renderMyWeek,
  where:    renderWhere,
  goal:     renderGoalDetail,
  tasks:    renderTasks,
  timeline: renderTimeline,
  "journey-user":  renderJourney,
  "journey-value": renderJourney,
  ideas:    renderIdeas,
  "mkt-strategy": renderMktDoc,
  "mkt-q1":       renderMktDoc,
  "mkt-persona": renderMktDoc,
  "mkt-competitors": renderMktDoc,
  files:    renderFiles,
  stack:    renderStack,
  start:    renderStart,
  handbook: renderHandbook,
  team:     renderTeam,
  activity: renderActivity
};

function renderStats(list){
  const done = list.filter(t => t.status === "Done").length;
  const prog = list.filter(t => t.status === "In Progress").length;
  const p0   = list.filter(t => t.priority === "P0" && t.status !== "Done").length;
  const late = list.filter(isLate).length;
  $("#stats").innerHTML =
    '<span><b>' + list.length + '</b> shown</span>' +
    '<span><b>' + prog + '</b> in progress</span>' +
    '<span><b>' + done + '</b> done</span>' +
    (p0 ? '<span style="color:var(--p0)"><b>' + p0 + '</b> open P0</span>' : '') +
    (late ? '<span style="color:var(--p0)"><b>' + late + '</b> overdue</span>' : '');
}

function renderNav(){
  const home = VIEW_HOME[VIEW] || "my";
  $("#groups").innerHTML = NAV.map(n =>
    '<button class="tab' + (n.k === home ? " on" : "") + '" data-dest="' + n.k + '">' +
    esc(n.label) + '</button>').join("");
  const subs = SUB_VIEWS[home] || [];
  $("#views").innerHTML = subs.map(v =>
    '<button class="subtab' + (v.k === VIEW ? " on" : "") + '" data-view="' + v.k + '">' +
    esc(v.label) + '</button>').join("");
  $("#views").classList.toggle("hidden", !subs.length);
}

function render(){
  renderNav();
  const list = visible();
  $("#filters").classList.toggle("hidden", !TASKY.has(VIEW));
  const fn = RENDERERS[VIEW] || renderMyWeek;
  $("#main").innerHTML = fn(list);
  if (TASKY.has(VIEW)) renderStats(list);
  wireMain();
}

/* ============================ interaction ============================ */
let dragId = null;

function wireMain(){
  /* cards: click to open, drag to change status */
  $$(".card").forEach(el => {
    el.addEventListener("click", () => openTask(el.dataset.id));
    el.addEventListener("dragstart", e => {
      dragId = el.dataset.id;
      el.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", dragId); } catch(err){}
    });
    el.addEventListener("dragend", () => { el.classList.remove("dragging"); dragId = null; });
  });
  $$(".col[data-drop]").forEach(col => {
    col.addEventListener("dragover", e => { e.preventDefault(); col.classList.add("drop"); });
    col.addEventListener("dragleave", () => col.classList.remove("drop"));
    col.addEventListener("drop", async e => {
      e.preventDefault();
      col.classList.remove("drop");
      const id = dragId || e.dataTransfer.getData("text/plain");
      const status = col.dataset.drop;
      const t = DATA.tasks.find(x => x.id === id);
      if (!t || t.status === status) return;
      const prev = t.status;
      t.status = status;                 // optimistic
      render();
      try {
        const row = await rpc("pm_set_status", { p_token:TOKEN, p_id:id, p_status:status, p_actor:ME });
        Object.assign(t, row);
        await refresh(true);
      } catch(err){
        t.status = prev; render();
        fail(err, "Could not move that task");
      }
    });
  });

  /* everything that opens something */
  $$("[data-task]").forEach(el => el.onclick = () => openTask(el.dataset.task));
  $$("[data-person]").forEach(el => el.onclick = () => openPerson(el.dataset.person));
  $$("[data-goal]").forEach(el => el.onclick = e => {
    if (e.target.closest("a")) return;
    openGoal(el.dataset.goal);
  });
  $$("[data-ms]").forEach(el => el.onclick = () => openMilestone(el.dataset.ms));
  $$("[data-editdoc]").forEach(el => el.onclick = e => { e.stopPropagation(); openDoc(el.dataset.editdoc); });
  $$("[data-editprov]").forEach(el => el.onclick = () => openProvider(el.dataset.editprov));
  $$(".doc-card[data-doc]").forEach(el => el.onclick = () => { UI.doc = el.dataset.doc; render(); });
  $$("a.wl[data-doc]").forEach(el => el.onclick = e => {
    e.preventDefault();
    const k = el.dataset.doc;
    goView("handbook"); UI.doc = k; render(); $("#main").scrollTop = 0;
  });
  $$("[data-goview]").forEach(el => el.onclick = e => {
    e.preventDefault();
    goView(el.dataset.goview);
  });
  const back = $("#docBack");
  if (back) back.onclick = () => { UI.doc = null; render(); };

  const nd = $("#newDoc");   if (nd) nd.onclick = () => openDoc(null);
  const ng = $("#newGoal");  if (ng) ng.onclick = () => openGoal(null);
  const nm = $("#newMs");    if (nm) nm.onclick = () => openMilestone(null);
  const np = $("#newProv");  if (np) np.onclick = () => openProvider(null);

  /* credentials: reading one is a separate, logged call */
  $$("[data-reveal]").forEach(el => el.onclick = async () => {
    const id = el.dataset.reveal;
    el.disabled = true; el.textContent = "…";
    try {
      const r = await rpc("pm_reveal_secret", { p_token:TOKEN, p_id:id, p_actor:ME });
      if (!r || r.ok !== true){
        toast(r && r.reason === "critical_no_secret"
          ? "No password is stored for a critical account · see where it lives."
          : "No password recorded for that one.", true);
        el.disabled = false; el.textContent = "Show password";
        return;
      }
      UI.revealed[id] = { secret:r.secret, username:r.username };
      await refresh(true);          // so the reveal shows in Activity straight away
      toast("Shown, and written to Activity under your name");
    } catch(err){ el.disabled = false; el.textContent = "Show password"; fail(err, "Could not read that"); }
  });
  $$("[data-hide]").forEach(el => el.onclick = () => { delete UI.revealed[el.dataset.hide]; render(); });

  /* drill down into a goal, as opposed to editing it */
  $$("[data-open-goal]").forEach(el => el.onclick = e => {
    if (e.target.closest("button,[data-goal],[data-ms],[data-task]")) return;
    goView("goal", { goal: el.dataset.openGoal });
  });

  /* the toggles that replaced whole tabs */
  const seg = (sel, attr, key, storeKey) => $$(sel + " button").forEach(b => b.onclick = () => {
    UI[key] = b.dataset[attr]; store.set(storeKey, UI[key]); render();
  });
  seg("#wMode",   "w",  "whereMode",    "gp_wmode");
  seg("#tlMode",  "t",  "timelineMode", "gp_tlmode");
  seg("#tGroup",  "tg", "taskGroup",    "gp_tgroup");
  seg("#plRange", "r",  "plannerRange", "gp_prange");
  seg("#plScope", "sc", "plannerScope", "gp_pscope");

  /* quick-access cards jump straight to a handbook page */
  $$(".qcard[data-doc]").forEach(el => el.onclick = () => {
    UI.doc = el.dataset.doc; goView("handbook"); UI.doc = el.dataset.doc; render();
  });

  /* files: browse, preview, save */
  seg("#fFolder", "ff", "fileFolder", "gp_ffolder");
  $$("[data-file]").forEach(el => el.onclick = e => {
    if (e.target.closest("a,[data-dl]")) return;
    openFile(el.dataset.file);
  });
  $$("[data-dl]").forEach(el => el.onclick = e => {
    e.stopPropagation();
    const f = (DATA.files||[]).find(x => x.id === el.dataset.dl);
    if (f) downloadFile(f);
  });
  $$("details.wk").forEach(d => d.addEventListener("toggle", () => {
    d.open ? UI.weekOpen.add(d.dataset.wk) : UI.weekOpen.delete(d.dataset.wk);
    store.set("gp_weekopen", JSON.stringify(Array.from(UI.weekOpen)));
  }));
  $$("[data-step]").forEach(el => el.onclick = () => openStep(el.dataset.step));
  $$("[data-step-task]").forEach(el => el.onclick = e => {
    e.preventDefault();
    const t = DATA.tasks.find(x => x.code === el.dataset.stepTask);
    if (t) openTask(t.id);
  });

  $$("[data-editasset]").forEach(el => el.onclick = () => openAsset(el.dataset.editasset));
  const na = $("#newAsset"); if (na) na.onclick = () => openAsset(null);

  /* the four counters open the list they count */
  $$("[data-tile]").forEach(el => el.onclick = () => {
    UI.openTile = UI.openTile === el.dataset.tile ? null : el.dataset.tile;
    store.set("gp_tile", UI.openTile || "");
    render();
  });
  /* a goal card opens in place to show its tasks */
  $$("[data-toggle-goal]").forEach(el => el.onclick = e => {
    e.stopPropagation();
    const id = el.dataset.toggleGoal;
    UI.openGoals.has(id) ? UI.openGoals.delete(id) : UI.openGoals.add(id);
    store.set("gp_opengoals", JSON.stringify(Array.from(UI.openGoals)));
    render();
  });

  $$("[data-editidea]").forEach(el => el.onclick = () => openIdea(el.dataset.editidea));
  const ni = $("#newIdea"); if (ni) ni.onclick = () => openIdea(null);

  const nth = $("#newTaskHere");
  if (nth) nth.onclick = () => openTask(null, { goal: UI.goal });

  /* phases: edit the window, or rescue what is stranded in a closed one */
  $$("[data-phase]").forEach(el => el.onclick = e => { e.stopPropagation(); openPhase(el.dataset.phase); });
  $$("[data-move-from]").forEach(el => el.onclick = async () => {
    const from = byKey(DATA.phases,"key")[el.dataset.moveFrom];
    const to   = byKey(DATA.phases,"key")[el.dataset.moveTo];
    const n = DATA.tasks.filter(t => t.phase_key === from.key && isOpen(t)).length;
    if (!confirm("Move " + n + " open task" + (n===1?"":"s") + " from “" + from.name +
                 "” into “" + to.name + "”?\n\nTheir dates are left alone · change those " +
                 "individually, so the new plan is a decision rather than a shuffle.")) return;
    el.disabled = true;
    try {
      const r = await rpc("pm_move_phase_tasks", { p_token:TOKEN, p_from:from.key, p_to:to.key,
                                                   p_shift_days:0, p_actor:ME });
      await refresh(true);
      toast("Moved " + (r && r.moved != null ? r.moved : n) + " into " + to.name);
    } catch(err){ el.disabled = false; fail(err, "Could not move those"); }
  });

  if (VIEW === "timeline" && UI.timelineMode === "goals") wireGantt();
  $$("[data-open]").forEach(el => el.onclick = () => {
    const [kind, id] = el.dataset.open.split(":");
    if (kind === "task") openTask(id);
    else if (kind === "goal") goView("goal", { goal:id });
    else if (kind === "milestone") openMilestone(id);
  });
}

function goView(view, opts){
  VIEW = view;
  if (!opts || !opts.keepGoal) UI.goal = (view === "goal" && opts && opts.goal) ? opts.goal : null;
  if (view === "goal" && opts && opts.goal) UI.goal = opts.goal;
  if (view !== "handbook") UI.doc = null;
  store.set("gp_view", VIEW);
  render();
  $("#main").scrollTop = 0;
}

/* ---------------- data ---------------- */
async function refresh(quiet){
  try {
    const x = await rpc("pm_bootstrap", { p_token:TOKEN });
    DATA = {
      people:x.people||[], phases:x.phases||[], tasks:x.tasks||[],
      goals:x.goals||[], milestones:x.milestones||[], docs:x.docs||[],
      providers:x.providers||[], assets:x.assets||[],
      files:x.files||[], journey:x.journey||[],
      ideas:x.ideas||[], areas:x.areas||[],
      metrics:x.metrics||[], activity:x.activity||[]
    };
    buildFilters();
    populateWho();
    render();
    if (!quiet) toast("Up to date");
  } catch(err){
    if (String(err.message).includes("unauthorized")) return logout("Session expired · sign in again.");
    toast("Could not load: " + err.message, true);
  }
}

function buildFilters(){
  const keep = (id, val) => { const el = $(id); if (el) el.value = val; };
  $("#fPerson").innerHTML = '<option value="">All people</option>' +
    DATA.people.filter(p => p.active).map(p => '<option>' + esc(p.name) + '</option>').join("");
  $("#fCat").innerHTML = '<option value="">All areas</option>' +
    CATS.map(c => '<option>' + esc(c) + '</option>').join("");
  $("#fPhase").innerHTML = '<option value="">All phases</option>' +
    DATA.phases.map(p => '<option value="' + esc(p.key) + '">' + esc(p.name) + '</option>').join("");
  $("#fGoal").innerHTML = '<option value="">All goals</option>' +
    DATA.goals.filter(g => g.horizon !== "impulse")
      .map(g => '<option value="' + esc(g.id) + '">' + esc(g.name) + '</option>').join("");
  keep("#fPerson", F.person); keep("#fCat", F.cat); keep("#fPhase", F.phase); keep("#fGoal", F.goal);
  if (!$("#fPri").children.length){
    $("#fPri").innerHTML = PRIOS.map(p =>
      '<button class="chip" data-pri="' + p.k + '" title="' + esc(p.t) + '">' + p.k + '</button>').join("");
    $$("#fPri .chip").forEach(b => b.onclick = () => {
      const k = b.dataset.pri;
      F.pri.has(k) ? F.pri.delete(k) : F.pri.add(k);
      b.classList.toggle("on");
      render();
    });
  }
}

/* ---------------- session ---------------- */
function logout(msg){
  TOKEN = null; store.del("gp_token");
  spStop(true);
  $("#app").classList.add("hidden");
  $("#login").classList.remove("hidden");
  $("#loginErr").textContent = msg || "";
  $("#pass").value = "";
}
function startApp(){
  $("#login").classList.add("hidden");
  $("#app").classList.remove("hidden");
  spLoad();
  refresh(true);
}
/* The roster comes from pm_people, so adding a teammate is a database change only. */
function populateWho(){
  const names = DATA.people.filter(p => p.active).map(p => p.name);
  if (!names.length) return;
  if (!names.includes(ME)) ME = names[0];
  store.set("gp_me", ME);
  $("#whoSel").innerHTML = names.map(n =>
    '<option' + (n === ME ? " selected" : "") + '>' + esc(n) + '</option>').join("");
  paintWho();
}
function paintWho(){
  const a = $("#whoAv");
  a.textContent = initials(ME);
  a.style.background = personColor(ME);
  a.style.borderColor = "transparent";
}

$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = $("#loginBtn");
  btn.disabled = true; btn.textContent = "Checking…";
  $("#loginErr").textContent = "";
  try {
    const r = await rpc("pm_login", { p_passcode: $("#pass").value });
    if (!r || r.ok !== true){
      const reason = r && r.reason;
      if (reason === "too_many_attempts"){
        const mins = Math.max(1, Math.ceil((r.retry_after_seconds || 900) / 60));
        $("#loginErr").textContent =
          "Too many wrong attempts. Try again in about " + mins + " minute" + (mins === 1 ? "" : "s") + ".";
      } else {
        const left = r && r.attempts_left;
        $("#loginErr").textContent = "That passcode is not right." +
          (left != null ? " " + left + " attempt" + (left === 1 ? "" : "s") + " left before a 15-minute lockout." : "");
      }
      return;
    }
    TOKEN = r.token;
    store.set("gp_token", TOKEN);
    startApp();
  } catch(err){
    $("#loginErr").textContent = "Could not sign in: " + err.message;
  } finally {
    btn.disabled = false; btn.textContent = "Open the board";
  }
});

/* ---------------- wiring ---------------- */
$("#groups").addEventListener("click", e => {
  const b = e.target.closest("[data-dest]"); if (!b) return;
  const n = NAV.find(x => x.k === b.dataset.dest);
  if (n) goView(n.view);
});
$("#views").addEventListener("click", e => {
  const b = e.target.closest("[data-view]"); if (!b) return;
  goView(b.dataset.view);
});
$("#q").addEventListener("input", e => { F.q = e.target.value; render(); });
$("#fPerson").addEventListener("change", e => { F.person = e.target.value; render(); });
$("#fCat").addEventListener("change", e => { F.cat = e.target.value; render(); });
$("#fPhase").addEventListener("change", e => { F.phase = e.target.value; render(); });
$("#fGoal").addEventListener("change", e => { F.goal = e.target.value; render(); });
$("#fMine").addEventListener("click", e => { F.mine = !F.mine; e.target.classList.toggle("on"); render(); });
$("#fOpen").addEventListener("click", e => { F.open = !F.open; e.target.classList.toggle("on"); render(); });
$("#whoSel").addEventListener("change", e => {
  ME = e.target.value;
  store.set("gp_me", ME);
  paintWho();
  render();
});
$("#refreshBtn").addEventListener("click", () => refresh());
$("#focusBtn").addEventListener("click", () => SP ? spPaint() : openSprint(null));
$("#sbPause").addEventListener("click", () => SP && SP.paused ? spResume() : spPause());
$("#sbOpen").addEventListener("click", () => { if (SP) openTask(SP.taskId); });
$("#sbStop").addEventListener("click", () => spStop());
/* "+ New" makes whatever the current view is about */
$("#newBtn").addEventListener("click", () => {
  if (VIEW === "where") openGoal(null);
  else if (VIEW === "handbook") openDoc(null);
  else if (VIEW === "stack") openProvider(null);
  else if (VIEW === "files") openAsset(null);
  else if (VIEW === "ideas") openIdea(null);
  else openTask(null);
});

/* a view stored before the nav was reorganised should not strand anyone */
if (!RENDERERS[VIEW]) VIEW = "my";

if (TOKEN) startApp();
</script>
</body>
</html>
