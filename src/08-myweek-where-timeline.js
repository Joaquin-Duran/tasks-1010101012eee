
/* ============================================================
   THE THREE DESTINATIONS
   My week -> what I owe.  Where we are -> the company, drillable.
   Company -> the reference shelf.
   Everything else is a section or a toggle inside one of those.
   ============================================================ */

/* ---- shared: the health checks, used on Where we are ---- */
function attentionList(){
  const today = todayISO();
  const all = DATA.tasks, open = all.filter(isOpen);
  const goals = liveGoals();
  const out = [];
  const overdue = open.filter(isLate);
  const silent = goals.filter(g => !tasksOfGoal(g).filter(isOpen).length);
  const noGoal = open.filter(t => !t.goal_id);
  const noDate = open.filter(t => !t.target_date);
  const icebox = all.filter(t => t.phase_key === "icebox" && isOpen(t));
  const unmeasured = goals.filter(g => g.metric_name && g.metric_current == null);

  if (overdue.length) out.push({ tone:"bad",
    text:"<b>" + overdue.length + " open tasks are past their date</b>, the oldest since " +
      fmtDateY(overdue.map(t => t.target_date).sort()[0]) + ".", go:"tasks" });
  if (silent.length) out.push({ tone:"bad",
    text:"<b>" + silent.length + " goal" + (silent.length===1?" has":"s have") + " no open work: " +
      silent.map(g => esc(g.name)).join(", ") + ".</b>", go:"where" });
  if (unmeasured.length) out.push({ tone:"warn",
    text:"<b>" + unmeasured.length + " goals have never been measured.</b> Their health is a guess " +
      "until somebody enters a number.", go:"where" });
  if (icebox.length) out.push({ tone:"warn",
    text:"<b>" + icebox.length + " tasks sit in the Icebox</b> with no date. Give each one a goal " +
      "and a date, or archive it.", go:"tasks" });
  if (noGoal.length) out.push({ tone:"warn",
    text:"<b>" + noGoal.length + " open tasks serve no goal.</b>", go:"tasks" });
  if (noDate.length) out.push({ tone:"warn",
    text:"<b>" + noDate.length + " open tasks have no date</b>, so they appear in no plan.", go:"tasks" });

  const load = DATA.people.filter(p => p.active)
    .map(p => ({ p, n: open.filter(t => (t.owners||[]).includes(p.name)).length }))
    .sort((a,b) => b.n - a.n);
  const total = load.reduce((a,b) => a + b.n, 0) || 1;
  if (load[0] && load[0].n / total > 0.4) out.push({ tone:"bad",
    text:"<b>" + esc(load[0].p.name) + " is on " + load[0].n + " of the " + total +
      " assigned open tasks.</b> Everything queues behind one person.", go:"tasks" });
  return out;
}

/* ---- shared: the handy shelf ---- */
const QUICK = [
  { go:"start",         icon:"👋", label:"Start here",          sub:"new? read this first" },
  { doc:"vision",       icon:"🧭", label:"Where we are going",  sub:"the four stages" },
  { go:"mkt-strategy",  icon:"📣", label:"Marketing strategy",  sub:"how we plan to win" },
  { go:"files",         icon:"🎨", label:"Logos & files",       sub:"brand, creatives, templates" },
  { go:"stack",         icon:"🔑", label:"Subscriptions",       sub:"logins, costs, access" },
  { doc:"design",       icon:"🖌", label:"Design principles",   sub:"palette, type, tone" },
  { doc:"ways-of-working", icon:"⚙️", label:"How we work",      sub:"pillars, cadence, rules" },
  { doc:"library",      icon:"📚", label:"Reference library",   sub:"the long documents" }
];
function quickAccess(){
  const have = QUICK.filter(q => !q.doc || DATA.docs.some(d => d.key === q.doc));
  return '<div class="section-title">Handy<span class="st-sub">the pages people reach for</span></div>' +
    '<div class="quick">' + have.map(q =>
      '<button class="qcard" ' + (q.doc ? 'data-doc="' + esc(q.doc) + '"' : 'data-goview="' + esc(q.go) + '"') + '>' +
        '<span class="qi">' + q.icon + '</span>' +
        '<span class="qt">' + esc(q.label) + '<small>' + esc(q.sub) + '</small></span></button>').join("") +
    '</div>';
}

/* ---- the compact company strip: the big picture without leaving My week ---- */
function companyStrip(){
  const ns = DATA.goals.find(g => g.horizon === "impulse");
  const goals = liveGoals();
  return '<button class="strip" data-goview="where">' +
    '<div class="strip-ns">' +
      '<span class="sub" style="display:block;text-transform:uppercase;letter-spacing:.08em;font-size:10px">Mission</span>' +
      '<span class="strip-name">' + esc(ns ? ns.name : "Nothing set yet") + '</span>' +
    '</div>' +
    '<div class="strip-goals">' + goals.map(g => {
      const pr = progress(tasksOfGoal(g));
      return '<span class="sg" title="' + esc(g.name + " · " + g.status + " · " + pr.done + "/" + pr.total) + '">' +
        '<i style="background:' + g.color + '"></i>' +
        '<b class="' + (GOAL_STATUS_TONE[g.status]||"mute") + '"></b></span>';
    }).join("") + '</div>' +
    '<span class="strip-go">Where we are →</span>' +
  '</button>';
}

/* ============================================================
   1 · MY WEEK  · the landing page
   ============================================================ */
function renderMyWeek(){
  const today = todayISO();
  const w = plannerWindow();
  const meName = ME || "";
  const justMe = UI.plannerScope === "me" && meName;
  const open = DATA.tasks.filter(isOpen);
  const mine = justMe ? open.filter(t => (t.owners||[]).includes(meName)) : open;
  const items = plannerItems(mine);
  const myOverdue = mine.filter(isLate);
  const myDue = mine.filter(t => t.target_date && t.target_date >= today && t.target_date <= w.e);
  const myProg = mine.filter(t => t.status === "In Progress");
  const undated = mine.filter(t => !t.target_date);

  const buckets = [
    { key:"over", label:"Overdue", sub:"should already have happened", tone:"bad", test:o => o.due < today },
    { key:"now",  label:w.label, sub:w.sub, tone:"warn", test:o => o.due >= today && o.due <= w.e },
    { key:"next", label:w.nextLabel, sub:fmtDate(w.nextS) + " – " + fmtDateY(w.nextE), tone:"mute",
      test:o => o.due >= w.nextS && o.due <= w.nextE }
  ];

  let out = '<div class="wrap">' + companyStrip();

  out += '<div class="panel-head" style="border:none;padding:18px 0 10px">' +
    (justMe ? avatar(meName) : "") +
    '<h2 style="font-size:19px;letter-spacing:-.02em">' +
      (justMe ? esc(meName) + "’s week" : "The team’s week") + '</h2>' +
    '<div class="spacer"></div>' +
    '<div class="seg" id="plRange">' + ["week","month","quarter"].map(k =>
      '<button data-r="' + k + '"' + (UI.plannerRange===k?' class="on"':'') + '>' +
      k[0].toUpperCase()+k.slice(1) + '</button>').join("") + '</div>' +
    '<div class="seg" id="plScope">' +
      '<button data-sc="me"' + (UI.plannerScope==="me"?' class="on"':'') + '>Just me</button>' +
      '<button data-sc="team"' + (UI.plannerScope==="team"?' class="on"':'') + '>Everyone</button>' +
    '</div>' +
  '</div>';

  /* each tile opens the list it counts, and closes again on a second click */
  const tiles = [
    { k:"overdue",  n:myOverdue.length, label:"overdue",  list:myOverdue,
      cls: myOverdue.length ? " alert" : " good" },
    { k:"due",      n:myDue.length,     label:"due " + w.label.toLowerCase(), list:myDue, cls:"" },
    { k:"progress", n:myProg.length,    label:"in progress", list:myProg, cls:"" },
    { k:"open",     n:mine.length,      label:"open in total", list:mine, cls:"" }
  ];
  out += '<div class="tiles">' + tiles.map(t =>
    '<button class="tile tappable' + t.cls + (UI.openTile === t.k ? ' on' : '') +
      '" data-tile="' + t.k + '"' + (t.n ? '' : ' disabled') + '>' +
      '<div class="n">' + t.n + '</div>' +
      '<div class="l">' + esc(t.label) + (t.n ? '<i class="caret"></i>' : '') + '</div>' +
    '</button>').join("") + '</div>';

  const openTile = tiles.find(t => t.k === UI.openTile && t.n);
  if (openTile){
    out += '<div class="tile-open"><div class="pl-rows">' +
      openTile.list.slice(0, 60).map(t => plannerItem({
        kind:"task", id:t.id, title:t.title, sub:t.code, due:t.target_date,
        owners:t.owners||[], badge:t.priority || "task",
        tone: t.priority === "P0" ? "bad" : t.priority === "P1" ? "warn" : "mute",
        colour: PRIO_HEX[t.priority] || "" })).join("") +
      '</div></div>';
  }

  /* collapsed by default: the point of this page is to see the shape of the week
     at a glance, then open the pile you actually want to work through */
  const openSet = UI.weekOpen;
  const body = buckets.map(b => {
    const got = items.filter(b.test);
    if (!got.length) return "";
    const isOpen = openSet.has(b.key);
    return '<details class="pl-bucket wk"' + (isOpen ? " open" : "") + ' data-wk="' + b.key + '">' +
      '<summary><span class="pill ' + b.tone + '">' + got.length + '</span>' +
        '<h3>' + esc(b.label) + '</h3><span class="when">' + esc(b.sub) + '</span></summary>' +
      '<div class="pl-rows">' + got.map(plannerItem).join("") + '</div></details>';
  }).join("");

  out += '<div class="panel"><div class="panel-body">' +
    (body || '<div class="empty">Nothing due in this window. ' +
      (undated.length ? undated.length + ' of your tasks have no date at all.' : 'You are clear.') + '</div>') +
    '</div></div>';

  if (undated.length){
    out += '<details class="fold"><summary>' + undated.length +
      ' of your tasks have no date <span class="note">· they appear in no plan</span></summary>' +
      '<div class="pl-rows" style="margin-top:8px">' + undated.map(t => plannerItem({
        kind:"task", id:t.id, title:t.title, sub:t.code, owners:t.owners||[],
        badge:t.priority||"task", tone:"mute", colour:PRIO_HEX[t.priority]||"" })).join("") +
      '</div></details>';
  }

  out += '<div style="margin:10px 0 4px"><button class="btn btn-ghost btn-sm" data-goview="tasks">' +
    'See every task →</button></div>';

  out += quickAccess();

  const recent = DATA.activity.slice(0,5);
  if (recent.length){
    out += '<div class="section-title">Lately<span class="st-sub">what changed on the board</span></div><div class="feed">' + recent.map(a =>
      '<div class="ev' + (String(a.action).indexOf("revealed") === 0 ? " sec" : "") + '">' +
        '<span class="actor" style="color:' + personColor(a.actor) + '">' + esc(a.actor) + '</span>' +
        '<span class="act">' + esc(a.action) + '</span>' +
        '<span class="ttl">' + esc(a.task_title) + '</span>' +
        '<span class="when">' + ago(a.at) + '</span></div>').join("") + '</div>';
  }
  return out + '</div>';
}

/* ============================================================
   2 · WHERE WE ARE  · the company on one page, drillable
   ============================================================ */
function renderWhere(list){
  const ns = DATA.goals.find(g => g.horizon === "impulse");
  const goals = liveGoals();
  const later = somedayGoals();
  const checks = attentionList();
  const areaMeta = byKey(DATA.areas || [], "key");

  let out = '<div class="wrap">';

  if (ns){
    out += '<div class="panel" style="border-left:4px solid ' + ns.color + '">' +
      '<div class="panel-body" style="display:flex;gap:22px;flex-wrap:wrap;align-items:center">' +
        '<div style="flex:1;min-width:250px">' +
          '<div class="sub" style="text-transform:uppercase;letter-spacing:.08em;font-size:10.5px;margin-bottom:5px">Mission</div>' +
          '<h2 style="font-size:20px;margin:0 0 6px;letter-spacing:-.02em">' + esc(ns.name) + '</h2>' +
          (ns.statement ? '<p class="note" style="font-size:13px;margin:0">' + esc(ns.statement) + '</p>' : '') +
        '</div>' +
        '<div style="min-width:200px;--gc:' + ns.color + '">' + metricBlock(ns) + '</div>' +
      '</div></div>';
  }

  if (checks.length){
    out += '<div class="flag ' + checks[0].tone + '"><span class="fi">◆</span><div>' + checks[0].text +
      ' <a href="#" data-goview="' + checks[0].go + '">Look →</a></div></div>';
    if (checks.length > 1){
      out += '<details class="fold"><summary>' + (checks.length-1) + ' more thing' +
        (checks.length === 2 ? "" : "s") + ' worth a look</summary><div style="margin-top:8px">' +
        checks.slice(1).map(c => '<div class="flag ' + c.tone + '"><span class="fi">◆</span><div>' +
          c.text + ' <a href="#" data-goview="' + c.go + '">Look →</a></div></div>').join("") +
        '</div></details>';
    }
  } else {
    out += '<div class="flag ok"><span class="fi">◆</span><div>Nothing rotting.</div></div>';
  }

  out += '<div class="panel-head" style="border:none;padding:18px 0 2px">' +
    '<h2 style="font-size:17px">The goals</h2>' +
    '<span class="sub">click one to see its tasks</span><div class="spacer"></div>' +
    '<button class="btn btn-ghost btn-sm" data-goview="timeline">On a timeline →</button>' +
    '<button class="btn btn-ghost btn-sm" id="newGoal">+ Goal</button>' +
  '</div>';

  const byArea = {};
  goals.forEach(g => { (byArea[g.area || "Other"] = byArea[g.area || "Other"] || []).push(g); });
  const order = Object.keys(byArea).sort((a,b) =>
    ((areaMeta[a] || {}).sort_order || 99) - ((areaMeta[b] || {}).sort_order || 99));

  order.forEach(area => {
    const m = areaMeta[area] || { label:area, color:"#8A8A8A" };
    out += '<div class="section-title" style="--ac:' + m.color + '">' +
        '<span class="st-dot"></span>' + esc(m.label) +
        '<span class="st-sub">' + byArea[area].length +
        (byArea[area].length === 1 ? ' goal' : ' goals') + '</span></div>' +
      '<div class="goal-grid">' + byArea[area].map(goalCard).join("") + '</div>';
  });

  if (later.length){
    out += '<div class="section-title" style="--ac:#8A8A8A"><span class="st-dot"></span>Someday' +
      '<span class="st-sub">nothing scheduled against these</span></div>' +
      '<div class="goal-grid">' + later.map(goalCard).join("") + '</div>';
  }
  return out + '</div>';
}

/* ============================================================
   TIMELINE  · the same work against a calendar, two ways
   ============================================================ */
function renderTimeline(list){
  return '<div class="wrap" style="max-width:none">' +
    '<div class="panel-head" style="border:none;padding:0 0 12px">' +
      '<h2 style="font-size:17px">Roadmap</h2>' +
      '<span class="sub">' + (UI.timelineMode === "phases"
        ? "the windows we set, and whether we hit them"
        : "planned against actual, by goal") + '</span>' +
      '<div class="spacer"></div>' +
      '<div class="seg" id="tlMode">' +
        '<button data-t="goals"' + (UI.timelineMode==="goals"?' class="on"':'') + '>By goal</button>' +
        '<button data-t="phases"' + (UI.timelineMode==="phases"?' class="on"':'') + '>By phase</button>' +
      '</div>' +
    '</div>' +
    (UI.timelineMode === "phases" ? renderPhases(list) : renderGantt(list)) +
  '</div>';
}



/* a marketing sub-tab that is really a handbook page */
function renderMktDoc(){
  const key = MKT_DOC[VIEW];
  const doc = DATA.docs.find(d => d.key === key);
  if (!doc) return '<div class="empty">That page has not been written yet.</div>';
  return '<div class="wrap"><div class="panel"><div class="panel-head">' +
      '<span style="font-size:19px">' + esc(doc.icon || "📄") + '</span>' +
      '<h3>' + esc(doc.title) + '</h3><div class="spacer"></div>' +
      '<span class="sub">' + (doc.updated_by ? esc(doc.updated_by) + " · " : "") + ago(doc.updated_at) + '</span>' +
      '<button class="btn btn-ghost btn-sm" data-editdoc="' + esc(doc.key) + '">Edit</button>' +
    '</div><div class="panel-body"><div class="prose">' + md(doc.body) + '</div></div></div></div>';
}

function goalCard(g){
  const all = tasksOfGoal(g);
  const pr = progress(all);
  const late = all.filter(isLate).length;
  const someday = g.horizon === "someday";
  const open = UI.openGoals.has(g.id);

  return '<div class="goal-card' + (someday ? " someday" : "") + (open ? " open" : "") +
      '" style="--gc:' + g.color + '">' +
    '<button class="gc-head" data-toggle-goal="' + g.id + '">' +
      '<span class="gc-title">' + esc(g.name) + '</span>' +
      '<span class="gc-caret"></span>' +
    '</button>' +
    '<div class="gc-body">' +
      (g.statement ? '<p class="gs">' + esc(g.statement) + '</p>' : '') +
      metricBlock(g) +
    '</div>' +
    '<div class="gf">' + goalPill(g) +
      (someday ? '' :
        '<div class="prog" title="' + pr.done + '/' + pr.total + '"><span style="width:' + pr.pct + '%"></span></div>' +
        '<span class="note">' + pr.done + '/' + pr.total + '</span>' +
        (late ? '<span class="pill bad">' + late + ' late</span>' : '')) +
      '<div class="spacer"></div>' + (g.owner ? avatar(g.owner, g.owner + " owns this") : "") +
    '</div>' +
    (open
      ? '<div class="gc-tasks">' +
          (all.length
            ? all.map(taskRow).join("") +
              '<button class="gc-more" data-open-goal="' + g.id + '">Open the full goal →</button>'
            : '<div class="empty">No tasks under this goal yet.</div>') +
        '</div>'
      : '') +
  '</div>';
}

/* ============================================================
   3 · ONE GOAL  · everything about it, and nothing else
   ============================================================ */
function renderGoalDetail(list){
  const g = DATA.goals.find(x => x.id === UI.goal);
  if (!g){ UI.goal = null; return renderWhere(list); }
  const all = tasksOfGoal(g);
  const pr = progress(all);
  const late = all.filter(isLate).length;
  const mss = msOfGoal(g);
  const w = goalWindow(g);
  const loose = all.filter(t => !t.milestone_id);

  let out = '<div class="wrap">' +
    '<button class="btn btn-ghost btn-sm" data-goview="where" style="margin-bottom:12px">← Where we are</button>' +
    '<div class="tree-goal' + (g.horizon === "someday" ? " someday" : "") + '" style="--gc:' + g.color + '">' +
      '<div class="tg-head" style="cursor:default">' +
        '<div style="flex:1;min-width:240px">' +
          '<div class="ga">' + esc(g.area||"") + ' · ' + esc(g.horizon) + '</div>' +
          '<h3 style="font-size:19px;margin:3px 0 6px">' + esc(g.name) + '</h3>' +
          (g.statement ? '<p class="note" style="margin:0;font-size:13px">' + esc(g.statement) + '</p>' : '') +
        '</div>' +
        (g.metric_name ? '<div style="min-width:190px">' + metricBlock(g) + '</div>' : '') +
        '<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">' +
          goalPill(g) +
          (g.horizon === "someday" ? '' :
            '<div class="prog"><span style="width:' + pr.pct + '%"></span></div>' +
            '<span class="note">' + pr.done + '/' + pr.total + ' tasks' +
            (late ? ' · <b style="color:var(--p0)">' + late + ' late</b>' : '') + '</span>') +
          (g.owner ? '<span class="note">' + avatar(g.owner) + ' ' + esc(g.owner) + '</span>' : '') +
          (w.starts ? '<span class="note">' + fmtDate(w.starts) + ' → ' + fmtDateY(w.ends) + '</span>' : '') +
        '</div>' +
      '</div>' +
      (g.why ? '<div class="tg-body"><p class="note" style="margin:0;font-style:italic">' + esc(g.why) + '</p></div>' : '') +
    '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px">' +
      '<button class="btn btn-ghost btn-sm" data-goal="' + g.id + '">Edit goal</button>' +
      '<button class="btn btn-ghost btn-sm" id="newMs">+ Milestone</button>' +
      '<button class="btn btn-ghost btn-sm" id="newTaskHere">+ Task</button>' +
    '</div>';

  if (g.horizon === "someday" && !mss.length && !all.length){
    return out + '<div class="flag warn" style="margin:0"><span class="fi">◆</span><div>' +
      'Nothing is scheduled against this, on purpose. It is a destination, not this quarter&rsquo;s work.' +
      '</div></div></div>';
  }

  out += '<div class="section-title">Milestones</div>';
  out += mss.length ? mss.map(m => {
    const mAll = tasksOfMs(m);
    const mpr = progress(mAll);
    const mw = msWindow(m);
    const mLate = mw.ends && mw.ends < todayISO() && m.status !== "Done";
    return '<div class="panel"><div class="panel-head">' +
      '<span class="code">' + esc(m.code||"") + '</span>' +
      '<h3>' + esc(m.name) + '</h3>' +
      '<span class="pill ' + (m.status==="Done"?"ok":mLate?"bad":"mute") + '">' + esc(m.status) + '</span>' +
      (mw.ends ? '<span class="sub">' + (mLate ? "was due " : "due ") + fmtDateY(mw.ends) + '</span>'
               : '<span class="sub">no date</span>') +
      '<div class="spacer"></div>' +
      (m.owner ? avatar(m.owner) : "") +
      '<span class="count">' + mpr.done + '/' + mpr.total + '</span>' +
      '<button class="btn btn-ghost btn-sm" data-ms="' + m.id + '">Edit</button>' +
    '</div><div class="panel-body">' +
      (m.description ? '<p class="note" style="margin:0 0 10px">' + esc(m.description) + '</p>' : '') +
      (mAll.length ? '<div class="tg-tasks">' + mAll.map(taskRow).join("") + '</div>'
                   : '<div class="empty">No tasks yet</div>') +
    '</div></div>';
  }).join("")
  : '<div class="flag warn"><span class="fi">◆</span><div>No milestones. A goal with no dated ' +
    'deliverables is a wish · add one so it can appear on a timeline.</div></div>';

  if (loose.length){
    out += '<div class="section-title">On the goal, but under no milestone</div>' +
      '<div class="panel"><div class="panel-body"><div class="tg-tasks">' +
      loose.map(taskRow).join("") + '</div></div></div>';
  }
  return out + '</div>';
}

function taskRow(t){
  return '<div class="tg-task' + (t.status==="Done"?" done":"") + '" data-task="' + t.id + '">' +
    '<span class="st" style="background:' + (STATUS_HEX[t.status]||"#8A8A8A") + '"></span>' +
    '<span class="code">' + esc(t.code||"") + '</span>' +
    '<span class="tt">' + esc(t.title) + '</span>' +
    '<div class="spacer"></div>' +
    (t.owners||[]).slice(0,3).map(o => avatar(o)).join("") +
    (t.target_date ? '<span class="due' + (isLate(t)?" late":"") + '">' + relDue(t.target_date) + '</span>' : '') +
  '</div>';
}

/* ============================================================
   EVERY TASK  · one page, grouped however you like
   ============================================================ */
function renderTasks(list){
  const by = UI.taskGroup;
  let cols = "";
  if (by === "person"){
    const c = DATA.people.filter(p => p.active).map(p =>
      column(p.name, p.color, list.filter(t => (t.owners||[]).includes(p.name))));
    c.push(column("Unassigned", "#B9B4AA", list.filter(t => !(t.owners||[]).length)));
    cols = c.join("");
  } else if (by === "area"){
    const used = CATS.filter(x => list.some(t => t.category === x));
    const c = used.map(x => column(x, "#5A5B5B", list.filter(t => t.category === x)));
    const none = list.filter(t => !t.category);
    if (none.length) c.push(column("Uncategorised", "#B9B4AA", none));
    cols = c.join("") || '<div class="empty">No tasks match.</div>';
  } else if (by === "goal"){
    const c = liveGoals().map(g => column(g.name, g.color, list.filter(t => t.goal_id === g.id)));
    const none = list.filter(t => !t.goal_id);
    if (none.length) c.push(column("No goal", "#C7383B", none));
    cols = c.join("");
  } else {
    cols = STATUSES.map(s => column(s.k, s.c, list.filter(t => t.status === s.k), s.k)).join("");
  }
  return '<div class="wrap" style="max-width:none">' +
    '<div class="panel-head" style="border:none;padding:0 0 12px">' +
      '<h2 style="font-size:17px">Every task</h2>' +
      '<span class="sub">' + list.length + ' shown' +
        (by === "status" ? " · drag between columns to change status" : "") + '</span>' +
      '<div class="spacer"></div>' +
      '<div class="seg" id="tGroup">' + [
        ["status","Status"],["person","Person"],["goal","Goal"],["area","Area"]
      ].map(x => '<button data-tg="' + x[0] + '"' + (by===x[0]?' class="on"':'') + '>' + x[1] + '</button>').join("") +
      '</div>' +
    '</div>' +
    '<div class="cols">' + cols + '</div></div>';
}
