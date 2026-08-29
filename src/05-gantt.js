/* ============================================================
   GANTT
   Rows are goal -> milestone -> task, collapsible to any depth.
   Two bars per row: the pale one is the plan, the solid one is
   what has actually happened. Where the solid bar falls short of
   the pale one and today has passed, you are behind.
   ============================================================ */

/* Build the column model once, then every row reuses it. */
function ganttColumns(from, to, scale){
  const cols = [];
  if (scale === "month"){
    let cur = startOfMonth(from);
    while (cur <= to){
      const nxt = iso(new Date(d(cur).getFullYear(), d(cur).getMonth()+1, 1));
      cols.push({ start:cur, end:addDays(nxt,-1),
                  label:d(cur).toLocaleDateString(undefined,{month:"short"}),
                  group:String(d(cur).getFullYear()), groupStart:d(cur).getMonth()===0 });
      cur = nxt;
    }
  } else {
    let cur = startOfWeek(from);
    let seenMonth = null, weekNo = 0;
    while (cur <= to){
      const mk = d(cur).toLocaleDateString(undefined,{month:"short",year:"2-digit"});
      if (mk !== seenMonth){ seenMonth = mk; weekNo = 0; }
      weekNo++;
      cols.push({ start:cur, end:addDays(cur,6), label:String(weekNo),
                  group:mk, groupStart:weekNo===1 });
      cur = addDays(cur, 7);
    }
  }
  return cols;
}

/* Group the columns into the month/year header band above them. */
function ganttGroups(cols){
  const groups = [];
  cols.forEach(c => {
    const last = groups[groups.length-1];
    if (last && last.label === c.group) last.span++;
    else groups.push({ label:c.group, span:1 });
  });
  return groups;
}

function pos(from, to, s, e){
  const total = daysBetween(from, to) + 1;
  const a = Math.max(0, daysBetween(from, s));
  const b = Math.min(total, daysBetween(from, e) + 1);
  if (b <= a) return null;
  return { left: a/total*100, width: (b-a)/total*100 };
}

function bar(from, to, s, e, cls, colour, label){
  const p = pos(from, to, s, e);
  if (!p) return "";
  return '<div class="gbar ' + cls + '" style="left:' + p.left.toFixed(3) + '%;width:' +
    p.width.toFixed(3) + '%;--bc:' + colour + '"' + (label ? ' title="' + esc(label) + '"' : '') + '></div>';
}

function ganttRow(opts){
  const { level, id, name, colour, from, to, plan, actual, meta, caret, kind } = opts;
  const cols = opts.cols;
  const today = todayISO();
  const tp = pos(from, to, today, today);
  return '<div class="grow lvl-' + level + '"' + (id ? ' data-row="' + esc(id) + '"' : '') +
      (kind ? ' data-kind="' + kind + '"' : '') + '>' +
    '<div class="glabel"><div class="gname">' +
      (caret != null
        ? '<button class="gcaret' + (caret ? "" : " closed") + '" data-toggle="' + esc(id) + '">▼</button>'
        : '<span class="gcaret"></span>') +
      (colour ? '<span class="gswatch" style="background:' + colour + '"></span>' : '') +
      '<span class="txt">' + esc(name) + '</span>' +
      (meta ? '<span class="gmeta">' + meta + '</span>' : '') +
    '</div></div>' +
    '<div class="gtrack">' +
      cols.map((c,i) => '<div class="gcell' + (c.groupStart ? " mstart" : "") +
        (i % 2 ? " alt" : "") + '"></div>').join("") +
      '<div class="gbarwrap">' +
        (plan   ? bar(from, to, plan.s,   plan.e,   "plan " + (plan.cls||""),     colour || "#8A8A8A", plan.label)   : "") +
        (actual ? bar(from, to, actual.s, actual.e, "actual " + (actual.cls||""), colour || "#8A8A8A", actual.label) : "") +
        (tp ? '<div class="gtoday" style="left:' + tp.left.toFixed(3) + '%"></div>' : '') +
      '</div>' +
    '</div>' +
  '</div>';
}

/* What has actually happened on a task, as opposed to what was planned. */
function taskActual(t){
  const s = taskStart(t);
  if (!s) return null;
  const today = todayISO();
  if (t.status === "Done"){
    const fin = (t.updated_at || "").slice(0,10) || t.target_date;
    return { s, e: fin < s ? s : fin, cls:"done", label:"Done " + fmtDateY(fin) };
  }
  if (t.status === "Not Started") return null;
  const e = today > s ? today : s;
  const late = isLate(t);
  return { s, e, cls: late ? "late" : "", label: t.status + (late ? " · overdue" : "") + " · running since " + fmtDateY(s) };
}

/* For a goal or milestone the "actual" bar is how much of the window
   the completed work accounts for -- a bar noticeably shorter than the
   today line means the work is behind the calendar. */
function rollupActual(win, pct, allDone){
  if (!win.starts || !win.ends || !pct) return null;
  const span = daysBetween(win.starts, win.ends) + 1;
  const e = addDays(win.starts, Math.max(0, Math.round(span * pct / 100) - 1));
  return { s: win.starts, e, cls: allDone ? "done" : "", label: pct + "% of the work under this is done" };
}

function renderGantt(list){
  const goals = liveGoals().filter(g => !F.goal || g.id === F.goal);
  if (!goals.length) return '<div class="empty">No goals yet. Add one from the Goals view.</div>';

  /* work out the window the chart should cover */
  const dates = [];
  goals.forEach(g => {
    const w = goalWindow(g);
    if (w.starts) dates.push(w.starts);
    if (w.ends) dates.push(w.ends);
    msOfGoal(g).forEach(m => {
      const mw = msWindow(m);
      if (mw.starts) dates.push(mw.starts);
      if (mw.ends) dates.push(mw.ends);
    });
  });
  list.forEach(t => { const s = taskStart(t); if (s) dates.push(s); if (t.target_date) dates.push(t.target_date); });
  dates.push(todayISO());
  dates.sort();
  const scale = UI.ganttScale;
  const pad = scale === "month" ? 20 : 10;
  const from = (scale === "month" ? startOfMonth : startOfWeek)(addDays(dates[0], -pad));
  const to   = addDays(dates[dates.length-1], pad);
  const cols = ganttColumns(from, to, scale);
  const groups = ganttGroups(cols);
  const colW = scale === "month" ? 62 : 27;
  const trackMin = cols.length * colW;

  const showMs   = UI.ganttLevel !== "goal";
  const showTask = UI.ganttLevel === "task";
  const rows = [];

  goals.forEach(g => {
    const gTasks = tasksOfGoal(g, list);
    const gAll   = tasksOfGoal(g);
    const w = goalWindow(g);
    const pr = progress(gAll);
    const open = !UI.collapsed.has(g.id);
    const overdue = gAll.filter(isLate).length;

    rows.push(ganttRow({
      cols, from, to, level:"goal", id:g.id, kind:"goal", name:g.name, colour:g.color,
      caret: showMs ? open : null,
      plan:   w.starts && w.ends ? { s:w.starts, e:w.ends, label:fmtDateY(w.starts) + " → " + fmtDateY(w.ends) } : null,
      actual: rollupActual(w, pr.pct, pr.pct === 100),
      meta: '<span class="pill ' + (GOAL_STATUS_TONE[g.status]||"mute") + '">' + esc(g.status) + '</span>' +
            '<span class="count">' + pr.done + "/" + pr.total + '</span>' +
            (overdue ? '<span class="pill bad">' + overdue + ' late</span>' : '') +
            (!w.starts || !w.ends ? '<span class="pill mute" title="Nothing under this goal has a date">no dates</span>' : '')
    }));
    if (!showMs || !open) return;

    msOfGoal(g).forEach(m => {
      const mTasks = tasksOfMs(m, list);
      const mAll   = tasksOfMs(m);
      const mw = msWindow(m);
      const mOpen = !UI.collapsed.has(m.id);
      const mpr = progress(mAll);
      const mLate = mw.ends && mw.ends < todayISO() && m.status !== "Done";

      rows.push(ganttRow({
        cols, from, to, level:"ms", id:m.id, kind:"milestone", name:m.name, colour:g.color,
        caret: showTask && mAll.length ? mOpen : null,
        plan:   mw.starts && mw.ends ? { s:mw.starts, e:mw.ends, label:fmtDateY(mw.starts) + " → " + fmtDateY(mw.ends) } : null,
        actual: rollupActual(mw, mpr.pct, m.status === "Done"),
        meta: (m.owner ? avatar(m.owner) : "") +
              '<span class="count">' + mpr.done + "/" + mpr.total + '</span>' +
              (mLate ? '<span class="pill bad">late</span>' : '') +
              (!mw.starts || !mw.ends
                ? '<span class="pill mute" title="No task under this milestone has a date, so it cannot be drawn">no dates</span>'
                : '')
      }));
      if (!showTask || !mOpen) return;

      mTasks.forEach(t => {
        const s = taskStart(t);
        rows.push(ganttRow({
          cols, from, to, level:"task", id:t.id, kind:"task", name:t.title, colour:PRIO_HEX[t.priority] || "#8A8A8A",
          plan:   s && t.target_date ? { s, e:t.target_date, label:"Planned " + fmtDateY(s) + " → " + fmtDateY(t.target_date) } : null,
          actual: taskActual(t),
          meta: (t.owners||[]).slice(0,3).map(o => avatar(o)).join("") +
                (t.target_date ? '<span class="due' + (isLate(t) ? " late" : "") + '">' + relDue(t.target_date) + '</span>' : '')
        }));
      });
      /* tasks under this milestone that the filters hid */
      const hidden = mAll.length - mTasks.length;
      if (hidden > 0) rows.push(
        '<div class="grow lvl-task"><div class="glabel"><div class="gname">' +
        '<span class="gcaret"></span><span class="txt" style="color:var(--ink-3);font-style:italic">' +
        hidden + ' more hidden by filters</span></div></div><div class="gtrack"></div></div>');
    });
  });

  /* anything with no goal at all still deserves to be visible */
  const orphans = list.filter(t => !t.goal_id && t.target_date);
  if (orphans.length && !F.goal){
    rows.push(ganttRow({ cols, from, to, level:"goal", id:"__orphans", kind:"orphans",
      name:"Not attached to any goal", colour:"#C7383B",
      caret: showTask ? !UI.collapsed.has("__orphans") : null,
      plan:null, actual:null,
      meta:'<span class="pill bad">' + orphans.length + '</span>' }));
    if (showTask && !UI.collapsed.has("__orphans")){
      orphans.forEach(t => {
        const s = taskStart(t);
        rows.push(ganttRow({
          cols, from, to, level:"task", id:t.id, kind:"task", name:t.title, colour:PRIO_HEX[t.priority] || "#8A8A8A",
          plan: s && t.target_date ? { s, e:t.target_date } : null,
          actual: taskActual(t),
          meta:(t.owners||[]).slice(0,3).map(o => avatar(o)).join("")
        }));
      });
    }
  }

  const head =
    '<div class="grow ghead-1"><div class="glabel"><div class="gname" style="font-weight:600;color:var(--ink-3);font-size:11px;letter-spacing:.06em;text-transform:uppercase">' +
      (scale === "month" ? "Year" : "Month") + '</div></div>' +
      '<div class="gtrack" style="grid-template-columns:' +
        groups.map(g => g.span + "fr").join(" ") + '">' +
      groups.map(g => '<div class="gmonth">' + esc(g.label) + '</div>').join("") + '</div></div>' +
    '<div class="grow ghead-2"><div class="glabel"><div class="gname" style="font-weight:600;color:var(--ink-3);font-size:11px;letter-spacing:.06em;text-transform:uppercase">' +
      (scale === "month" ? "Month" : "Week") + '</div></div>' +
      '<div class="gtrack">' + cols.map(c =>
        '<div class="gweek' + (c.groupStart ? " mstart" : "") + '" title="' + esc(fmtDateY(c.start)) + '">' +
        esc(c.label) + '</div>').join("") + '</div></div>';

  return '<div class="gantt">' +
    '<div class="panel-head" style="border-bottom:1px solid var(--line-2)">' +
      '<h3>Gantt</h3>' +
      '<span class="sub">' + fmtDateY(from) + ' → ' + fmtDateY(to) + '</span>' +
      '<div class="spacer"></div>' +
      '<div class="seg" id="gLevel">' +
        ['goal','ms','task'].map(k => '<button data-l="' + k + '"' + (UI.ganttLevel===k?' class="on"':'') + '>' +
          ({goal:"Goals",ms:"Milestones",task:"Tasks"})[k] + '</button>').join("") +
      '</div>' +
      '<div class="seg" id="gScale">' +
        ['week','month'].map(k => '<button data-s="' + k + '"' + (UI.ganttScale===k?' class="on"':'') + '>' +
          ({week:"Weeks",month:"Months"})[k] + '</button>').join("") +
      '</div>' +
      '<button class="btn btn-ghost btn-sm" id="gExpand">Expand all</button>' +
      '<button class="btn btn-ghost btn-sm" id="gCollapse">Collapse all</button>' +
    '</div>' +
    '<div class="gscroll"><div class="gbody" style="--track-min:' + trackMin + 'px;--cols:' + cols.length + '">' +
      head + rows.join("") +
    '</div></div>' +
    '<div class="glegend">' +
      '<span><i style="background:#8A8A8A;opacity:.25"></i>Planned window</span>' +
      '<span><i style="background:var(--orange)"></i>Actually happening</span>' +
      '<span><i style="background:var(--s-done)"></i>Done</span>' +
      '<span><i style="background:var(--p0)"></i>Overdue</span>' +
      '<span style="border-left:2px solid var(--orange);padding-left:7px">Today</span>' +
      '<span class="spacer"></span>' +
      '<span>On a goal or milestone row, the solid bar is how much of the work is finished. ' +
      'If it stops well short of the today line, that item is behind.</span>' +
    '</div>' +
  '</div>';
}

function wireGantt(){
  $$("#gLevel button").forEach(b => b.onclick = () => {
    UI.ganttLevel = b.dataset.l; store.set("gp_glevel", UI.ganttLevel); render();
  });
  $$("#gScale button").forEach(b => b.onclick = () => {
    UI.ganttScale = b.dataset.s; store.set("gp_gscale", UI.ganttScale); render();
  });
  const persist = () => store.set("gp_collapsed", JSON.stringify(Array.from(UI.collapsed)));
  $$(".gcaret[data-toggle]").forEach(b => b.onclick = e => {
    e.stopPropagation();
    const id = b.dataset.toggle;
    UI.collapsed.has(id) ? UI.collapsed.delete(id) : UI.collapsed.add(id);
    persist(); render();
  });
  const gExpand = $("#gExpand"), gCollapse = $("#gCollapse");
  if (gExpand) gExpand.onclick = () => { UI.collapsed.clear(); persist(); render(); };
  if (gCollapse) gCollapse.onclick = () => {
    DATA.goals.forEach(g => UI.collapsed.add(g.id));
    DATA.milestones.forEach(m => UI.collapsed.add(m.id));
    UI.collapsed.add("__orphans");
    persist(); render();
  };
  $$(".grow[data-kind]").forEach(r => {
    const kind = r.dataset.kind, id = r.dataset.row;
    const label = r.querySelector(".glabel");
    if (!label) return;
    label.style.cursor = "pointer";
    label.addEventListener("click", e => {
      if (e.target.closest(".gcaret")) return;
      if (kind === "task") openTask(id);
      else if (kind === "goal" && id !== "__orphans") openGoal(id);
      else if (kind === "milestone") openMilestone(id);
    });
  });
}

