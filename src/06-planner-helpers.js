
/* ============================================================
   PLANNER
   What is due, in a window you choose, for the team or just you.
   Milestones and goals appear alongside tasks -- a deadline is a
   deadline whatever altitude it sits at.
   ============================================================ */
function plannerWindow(){
  const t = todayISO();
  if (UI.plannerRange === "week"){
    const s = startOfWeek(t);
    return { s, e: addDays(s,6), label:"This week", sub: fmtDate(s) + " – " + fmtDateY(addDays(s,6)),
             nextS: addDays(s,7), nextE: addDays(s,13), nextLabel:"Next week" };
  }
  if (UI.plannerRange === "month"){
    const s = startOfMonth(t);
    const e = addDays(iso(new Date(d(s).getFullYear(), d(s).getMonth()+1, 1)), -1);
    const n = addDays(e,1);
    return { s, e, label:"This month", sub: d(s).toLocaleDateString(undefined,{month:"long",year:"numeric"}),
             nextS:n, nextE: addDays(iso(new Date(d(n).getFullYear(), d(n).getMonth()+1, 1)), -1),
             nextLabel:"Next month" };
  }
  const s = startOfQuarter(t);
  const e = addDays(iso(new Date(d(s).getFullYear(), d(s).getMonth()+3, 1)), -1);
  const n = addDays(e,1);
  return { s, e, label:"This quarter", sub:"Q" + (Math.floor(d(s).getMonth()/3)+1) + " " + d(s).getFullYear(),
           nextS:n, nextE: addDays(iso(new Date(d(n).getFullYear(), d(n).getMonth()+3, 1)), -1),
           nextLabel:"Next quarter" };
}

function plannerItem(o){
  const late = o.due && o.due < todayISO() && !o.done;
  return '<div class="pl-row" data-open="' + o.kind + ':' + o.id + '" style="--pc:' + (o.colour||"transparent") + '">' +
    '<span class="pill ' + (o.tone||"mute") + '">' + esc(o.badge) + '</span>' +
    '<span class="t">' + esc(o.title) + (o.sub ? '<small>' + esc(o.sub) + '</small>' : '') + '</span>' +
    '<div class="spacer"></div>' +
    (o.owners||[]).slice(0,3).map(x => avatar(x)).join("") +
    (o.due ? '<span class="due' + (late ? " late" : "") + '" style="margin-left:8px">' + relDue(o.due) + '</span>' : '') +
  '</div>';
}

function plannerItems(list){
  const items = [];
  list.forEach(t => {
    if (!t.target_date || t.status === "Done") return;
    items.push({ kind:"task", id:t.id, title:t.title, sub:t.code, due:t.target_date,
                 owners:t.owners||[], badge:t.priority || "task",
                 tone: t.priority === "P0" ? "bad" : t.priority === "P1" ? "warn" : "mute",
                 colour: PRIO_HEX[t.priority] || "" });
  });
  DATA.milestones.forEach(m => {
    if (!m.ends || m.status === "Done") return;
    const g = byId(DATA.goals)[m.goal_id];
    if (F.goal && m.goal_id !== F.goal) return;
    if (UI.plannerScope === "me" && ME && m.owner !== ME) return;
    items.push({ kind:"milestone", id:m.id, title:m.name, sub: g ? g.name : "", due:m.ends,
                 owners: m.owner ? [m.owner] : [], badge:"milestone", tone:"mute",
                 colour: g ? g.color : "" });
  });
  liveGoals().forEach(g => {
    if (!g.ends || g.status === "Achieved") return;
    if (F.goal && g.id !== F.goal) return;
    if (UI.plannerScope === "me" && ME && g.owner !== ME) return;
    items.push({ kind:"goal", id:g.id, title:g.name, sub:g.area || "", due:g.ends,
                 owners: g.owner ? [g.owner] : [], badge:"goal",
                 tone: GOAL_STATUS_TONE[g.status] || "mute", colour:g.color });
  });
  return items.sort((a,b) => a.due < b.due ? -1 : a.due > b.due ? 1 : 0);
}









/* ============================================================
   FOCUS SPRINT  ·  a timer against one task
   Starting a sprint moves the task to In Progress and opens a
   countdown. The deadline is an absolute timestamp in localStorage,
   so a sprint survives a reload, a re-render and a tab change.
   Nothing is written to the database except that status change:
   logging sprint history would need a table and an RPC.
   ============================================================ */
const SPRINT_DURATIONS = [15, 25, 45, 60];
const SPRINT_DEFAULT   = 25;

/* Team photos. pm_people.photo_url wins when it is set; this map is the
   local fallback. Paths are relative, so they resolve both on the Pages URL
   and on the local server. Anything here is public: index.html is world
   readable, so only put in a picture that is meant to be. */
const PHOTOS = {
  "Joaquin": "assets/joaquin.jpg"
};

let SP = null;          /* { taskId, title, code, endsAt, total, left } */
let spTimer = null;

function spSave(){ SP ? store.set("gp_sprint", JSON.stringify(SP)) : store.del("gp_sprint"); }
function spLoad(){
  try { SP = JSON.parse(store.get("gp_sprint") || "null"); } catch(e){ SP = null; }
  if (SP && !SP.paused && spLeft() <= 0) SP = null;   /* it expired while away */
  spSave(); spPaint(); spSchedule();
}
/* milliseconds left. A paused sprint holds its remainder instead of a deadline. */
function spLeft(){
  if (!SP) return 0;
  return SP.paused ? (SP.left || 0) : Math.max(0, SP.endsAt - Date.now());
}
function spSchedule(){
  clearInterval(spTimer); spTimer = null;
  if (SP && !SP.paused) spTimer = setInterval(spTick, 1000);
}
function mmss(ms){
  const s = Math.max(0, Math.round(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2,"0") + ":" + String(s % 60).padStart(2,"0");
}

async function spStart(taskId, minutes){
  const t = DATA.tasks.find(x => x.id === taskId);
  if (!t) return toast("That task is not on the board any more", true);
  const total = Math.max(1, Math.round(minutes)) * 60000;
  SP = { taskId, title:t.title, code:t.code || "", endsAt: Date.now() + total, total, paused:false, left:0 };
  spSave(); spPaint(); spSchedule();
  toast("Sprint started · " + Math.round(minutes) + " min on " + (t.code || t.title));
  /* a sprint means someone is working on it, so say so on the board */
  if (t.status !== "In Progress" && t.status !== "Done"){
    try {
      const row = await rpc("pm_set_status", { p_token:TOKEN, p_id:t.id, p_status:"In Progress", p_actor:ME });
      Object.assign(t, row);
      render();
    } catch(err){ /* the timer is local, so it keeps running either way */ }
  }
}
function spPause(){
  if (!SP || SP.paused) return;
  SP.left = spLeft(); SP.paused = true;
  spSave(); spPaint(); spSchedule();
}
function spResume(){
  if (!SP || !SP.paused) return;
  SP.endsAt = Date.now() + (SP.left || 0); SP.paused = false;
  spSave(); spPaint(); spSchedule();
}
function spExtend(mins){
  if (!SP) return;
  const add = mins * 60000;
  SP.total += add;
  if (SP.paused) SP.left = (SP.left || 0) + add; else SP.endsAt = Date.now() + spLeft() + add;
  spSave(); spPaint(); spSchedule();
}
function spStop(quiet){
  SP = null; spSave(); spPaint(); spSchedule();
  if (!quiet) toast("Sprint ended");
}

function spTick(){
  if (!SP) return spSchedule();
  if (spLeft() <= 0) return spFinish();
  spPaint();
}
function spPaint(){
  const bar = $("#sprintBar"); if (!bar) return;
  if (!SP || !TOKEN){ bar.classList.add("hidden"); return; }
  bar.classList.remove("hidden");
  bar.classList.toggle("paused", !!SP.paused);
  const left = spLeft();
  const pct = SP.total ? Math.max(0, Math.min(100, (1 - left / SP.total) * 100)) : 0;
  $("#sbRing").style.setProperty("--pct", pct.toFixed(1));
  $("#sbTitle").textContent = SP.title || "Focus";
  $("#sbSub").textContent = (SP.code ? SP.code + " · " : "") +
    (SP.paused ? "paused" : Math.round(SP.total / 60000) + " min sprint");
  $("#sbTime").textContent = mmss(left);
  $("#sbPause").textContent = SP.paused ? "Resume" : "Pause";
}

/* Time is up. Offer the three things anyone actually wants next. */
function spFinish(){
  const t = DATA.tasks.find(x => x.id === SP.taskId);
  const title = SP.title, id = SP.taskId, mins = Math.round(SP.total / 60000);
  spStop(true);
  toast("Sprint finished · " + mins + " min on " + title);
  const close = modal(
    head("Sprint finished") +
    '<div class="modal-body">' +
      '<p class="note" style="margin:0 0 4px">' + mins + ' minutes on</p>' +
      '<h3 style="margin:0 0 14px">' + esc(title) + '</h3>' +
      '<div class="dur-row">' +
        '<button class="dur" data-again="10">Another 10 min</button>' +
        '<button class="dur" data-again="25">Another 25 min</button>' +
      '</div>' +
    '</div>' +
    '<div class="modal-foot">' +
      (t ? '<button class="btn btn-ghost" id="spDone">Mark done</button>' : '') +
      '<div class="spacer"></div>' +
      '<button class="btn btn-primary" id="mCancel">Stop here</button>' +
    '</div>');
  $$("[data-again]").forEach(b => b.onclick = () => { close(); spStart(id, Number(b.dataset.again)); });
  const d = $("#spDone");
  if (d) d.onclick = async () => {
    d.disabled = true;
    try {
      const row = await rpc("pm_set_status", { p_token:TOKEN, p_id:id, p_status:"Done", p_actor:ME });
      Object.assign(t, row); close(); render(); toast("Marked done");
    } catch(err){ d.disabled = false; fail(err, "Could not mark it done"); }
  };
}

/* ---- the launcher ---- */
/* Open tasks for whoever is signed in, most urgent first, so both the
   random pick and the list start from the same honest set. */
function spCandidates(){
  const open = DATA.tasks.filter(isOpen);
  const mine = open.filter(t => (t.owners || []).includes(ME));
  const pool = mine.length ? mine : open;
  const rank = { P0:0, P1:1, P2:2, P3:3 };
  return pool.slice().sort((a,b) =>
    (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9) ||
    String(a.target_date || "9999").localeCompare(String(b.target_date || "9999")));
}

function openSprint(taskId){
  if (SP) return toast("A sprint is already running · end it first", true);
  const pool = spCandidates();
  const fixed = taskId ? DATA.tasks.find(x => x.id === taskId) : null;
  if (!fixed && !pool.length) return toast("No open task to sprint on", true);
  let mins = Number(store.get("gp_sprintlen")) || SPRINT_DEFAULT;

  const close = modal(
    head("Start a focus sprint", fixed && fixed.code) +
    '<div class="modal-body">' +
      (fixed
        ? '<div class="field"><label>Task</label><h3 style="margin:2px 0 0">' + esc(fixed.title) + '</h3></div>'
        : '<div class="field"><label for="spTask">Task</label>' +
            '<div style="display:flex;gap:8px">' +
              '<select class="input" id="spTask">' +
                pool.map(t => '<option value="' + esc(t.id) + '">' +
                  esc((t.code ? t.code + " · " : "") + t.title) + '</option>').join("") +
              '</select>' +
              '<button class="btn btn-ghost" id="spRand" style="white-space:nowrap">Surprise me</button>' +
            '</div><span class="hint">' + pool.length + ' open task' + (pool.length === 1 ? "" : "s") +
            (DATA.tasks.filter(isOpen).some(t => (t.owners || []).includes(ME))
              ? ' assigned to you' : ' on the board') + '.</span></div>') +
      '<div class="field"><label>How long</label><div class="dur-row" id="spDur">' +
        SPRINT_DURATIONS.map(d => '<button class="dur' + (d === mins ? " on" : "") +
          '" data-dur="' + d + '">' + d + ' min</button>').join("") +
      '</div>' +
      '<input class="input" id="spCustom" type="number" min="1" max="240" value="' + mins +
        '" style="max-width:130px"><span class="hint">Minutes. Change it to whatever suits.</span></div>' +
    '</div>' +
    foot("Start sprint"));

  const paintDur = () => $$("#spDur .dur").forEach(b =>
    b.classList.toggle("on", Number(b.dataset.dur) === mins));
  $$("#spDur .dur").forEach(b => b.onclick = () => {
    mins = Number(b.dataset.dur); $("#spCustom").value = mins; paintDur();
  });
  $("#spCustom").addEventListener("input", e => { mins = Number(e.target.value) || 0; paintDur(); });

  const r = $("#spRand");
  if (r) r.onclick = () => {
    const pick = pool[Math.floor(Math.random() * pool.length)];
    $("#spTask").value = pick.id;
    toast("Picked " + (pick.code || pick.title));
  };

  $("#mSave").onclick = () => {
    if (!(mins >= 1 && mins <= 240)) return toast("Pick between 1 and 240 minutes", true);
    const id = fixed ? fixed.id : $("#spTask").value;
    store.set("gp_sprintlen", String(mins));
    close();
    spStart(id, mins);
  };
}
