
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








