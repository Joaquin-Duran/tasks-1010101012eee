




/* ============================================================
   HANDBOOK
   ============================================================ */
function renderHandbook(){
  if (UI.doc){
    const doc = DATA.docs.find(x => x.key === UI.doc);
    if (!doc) { UI.doc = null; return renderHandbook(); }
    return '<div class="wrap">' +
      '<div class="panel"><div class="panel-head">' +
        '<button class="btn btn-ghost btn-sm" id="docBack">← Handbook</button>' +
        '<span style="font-size:19px">' + esc(doc.icon || "📄") + '</span>' +
        '<h3>' + esc(doc.title) + '</h3>' +
        '<div class="spacer"></div>' +
        '<span class="sub">' + (doc.updated_by ? esc(doc.updated_by) + " · " : "") + ago(doc.updated_at) + '</span>' +
        '<button class="btn btn-ghost btn-sm" data-editdoc="' + esc(doc.key) + '">Edit</button>' +
      '</div><div class="panel-body"><div class="prose">' + md(doc.body) + '</div></div></div></div>';
  }
  const secs = {};
  DATA.docs.forEach(x => { (secs[x.section || "Other"] = secs[x.section || "Other"] || []).push(x); });
  const order = ["Direction","How we work","Who we are","Other"];
  let out = '<div class="wrap"><div class="panel"><div class="panel-head"><h3>Handbook</h3>' +
    '<span class="sub">what we believe, how we work, where we are going</span><div class="spacer"></div>' +
    '<button class="btn btn-ghost btn-sm" id="newDoc">+ Document</button></div></div>';
  Object.keys(secs).sort((a,b) => order.indexOf(a) - order.indexOf(b)).forEach(sec => {
    out += '<div class="section-title">' + esc(sec) + '</div><div class="grid-auto">' +
      secs[sec].sort((a,b) => (a.sort_order||0)-(b.sort_order||0)).map(x =>
        '<div class="doc-card" data-doc="' + esc(x.key) + '">' +
          '<div class="ic">' + esc(x.icon || "📄") + '</div>' +
          '<h3>' + esc(x.title) + '</h3>' +
          (x.summary ? '<p>' + esc(x.summary) + '</p>' : '') +
          '<div class="up">' + (x.updated_by ? esc(x.updated_by) + " · " : "") + ago(x.updated_at) + '</div>' +
        '</div>').join("") + '</div>';
  });
  if (!DATA.docs.length) out += '<div class="empty">No documents yet.</div>';
  return out + '</div>';
}

function renderStart(){
  const doc = DATA.docs.find(x => x.key === "start-here");
  if (!doc) return '<div class="empty">No onboarding document yet · add one in the Handbook.</div>';
  const open = DATA.tasks.filter(isOpen);
  const quick = open.filter(t => isLate(t) && (t.effort === "S" || t.effort === "M")).slice(0,5);
  return '<div class="wrap">' +
    '<div class="panel"><div class="panel-head">' +
      '<span style="font-size:19px">' + esc(doc.icon||"👋") + '</span><h3>' + esc(doc.title) + '</h3>' +
      '<div class="spacer"></div>' +
      '<button class="btn btn-ghost btn-sm" data-editdoc="start-here">Edit</button>' +
    '</div><div class="panel-body"><div class="prose">' + md(doc.body) + '</div></div></div>' +
    (quick.length ? '<div class="section-title">Small overdue tasks · good first pickups</div>' +
      '<div class="panel"><div class="panel-body"><div class="pl-rows">' +
      quick.map(t => plannerItem({ kind:"task", id:t.id, title:t.title, sub:t.code + " · " + (t.effort||""),
        due:t.target_date, owners:t.owners||[], badge:t.priority||"task",
        tone: t.priority==="P0"?"bad":"warn", colour:PRIO_HEX[t.priority]||"" })).join("") +
      '</div></div></div>' : "") +
  '</div>';
}

function renderTeam(){
  const doc = DATA.docs.find(x => x.key === "team");
  const open = DATA.tasks.filter(isOpen);
  let out = '<div class="wrap">';
  out += '<div class="section-title">The roster</div><div class="grid-auto">';
  DATA.people.filter(p => p.active).forEach(p => {
    const mine = open.filter(t => (t.owners||[]).includes(p.name));
    const late = mine.filter(isLate).length;
    const goalsOwned = DATA.goals.filter(g => g.owner === p.name);
    out += '<div class="panel" style="margin:0"><div class="panel-head" style="border:none">' +
      avatar(p.name) + '<div><h3>' + esc(p.name) + '</h3>' +
      '<span class="sub">' + esc(p.role || "role not set") + '</span></div></div>' +
      '<div class="panel-body" style="padding-top:0">' +
      '<div class="note">' + mine.length + ' open · ' +
        (late ? '<b style="color:var(--p0)">' + late + ' overdue</b>' : 'nothing overdue') + '</div>' +
      (goalsOwned.length ? '<div style="margin-top:9px;display:flex;gap:5px;flex-wrap:wrap">' +
        goalsOwned.map(g => '<span class="tag goal" style="--tc:' + g.color + '">' + esc(g.name) + '</span>').join("") +
        '</div>' : '<div class="note" style="margin-top:9px;font-style:italic">Owns no goal</div>') +
      '</div></div>';
  });
  out += '</div>';
  if (doc) out += '<div class="section-title">Notes</div><div class="panel"><div class="panel-head">' +
    '<h3>' + esc(doc.title) + '</h3><div class="spacer"></div>' +
    '<button class="btn btn-ghost btn-sm" data-editdoc="team">Edit</button></div>' +
    '<div class="panel-body"><div class="prose">' + md(doc.body) + '</div></div></div>';
  return out + '</div>';
}

/* ============================================================
   THE STACK  ·  providers, subscriptions, who owns what.
   Passwords for low-risk tools are stored and revealed on request,
   and every reveal lands in Activity. Anything that can spend money
   or delete production stores no password at all, by database
   constraint -- it points at the vault instead.
   ============================================================ */
function renderStack(){
  const ps = DATA.providers;
  const cats = {};
  ps.forEach(p => { (cats[p.category || "Other"] = cats[p.category || "Other"] || []).push(p); });
  /* run rate counts what we still pay for; lapsed rows are kept for the record only */
  const live = ps.filter(p => (p.category || "") !== "Lapsed");
  const spend = {};
  live.forEach(p => {
    const a = Number(p.cost_amount) || 0;
    if (!a) return;
    const cur = p.cost_currency || "EUR";
    spend[cur] = (spend[cur] || 0) + (p.cost_cycle === "yearly" ? a/12 : p.cost_cycle === "monthly" ? a : 0);
  });
  const sym = c => ({ EUR:"\u20AC", USD:"$", GBP:"\u00A3" })[c] || (c + " ");
  const monthlyLabel = Object.keys(spend).length
    ? Object.entries(spend).map(([cur,v]) => sym(cur) + Math.round(v)).join(" + ")
    : "\u2014";
  const yearlyLabel = Object.keys(spend).length
    ? Object.entries(spend).map(([cur,v]) => sym(cur) + Math.round(v*12)).join(" + ")
    : "\u2014";
  const crit = ps.filter(p => p.sensitivity === "critical").length;
  const lapsed = ps.length - live.length;
  const soon = ps.filter(p => p.renewal_date && p.renewal_date >= todayISO() &&
                              daysBetween(todayISO(), p.renewal_date) <= 45);

  let out = '<div class="wrap">';
  out += '<div class="panel"><div class="panel-head"><h3>The stack</h3>' +
    '<span class="sub">everything we pay for or depend on</span><div class="spacer"></div>' +
    '<button class="btn btn-ghost btn-sm" id="newProv">+ Provider</button></div></div>';

  out += '<div class="tiles">' +
    '<div class="tile"><div class="n">' + live.length + '</div><div class="l">live providers' +
      (lapsed ? ' · ' + lapsed + ' lapsed' : '') + '</div></div>' +
    '<div class="tile"><div class="n" style="font-size:21px">' + monthlyLabel + '</div>' +
      '<div class="l">per month · ' + yearlyLabel + ' a year</div></div>' +
    '<div class="tile"><div class="n">' + crit + '</div><div class="l">critical accounts</div></div>' +
    '<div class="tile' + (soon.length ? " alert" : "") + '"><div class="n">' + soon.length +
      '</div><div class="l">renewing within 45 days</div></div>' +
  '</div>';

  out += '<div class="flag warn"><span class="fi">◆</span><div>' +
    '<b>Anything marked critical stores no password here · on purpose.</b> ' +
    'One shared team passcode protects this page, and it cannot be revoked for one person. ' +
    'So accounts that can spend money or delete production hold only a pointer to where the ' +
    'real credential lives and how to ask for access. Passwords for low-risk tools are stored, ' +
    'hidden until you click, and every reveal is written to Activity with your name on it.</div></div>';

  /* the things everything else runs on come first */
  const CAT_ORDER = ["Infrastructure","Identity","Tools","Marketing","Research","Lapsed"];
  const ordered = Object.keys(cats).sort((a,b) => {
    const ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
  ordered.forEach(cat => {
    out += '<div class="section-title">' + esc(cat) + '</div><div class="grid-auto">';
    cats[cat].forEach(p => {
      const critical = p.sensitivity === "critical";
      const shown = UI.revealed[p.id];
      out += '<div class="pv" style="--sc:' + (critical ? "var(--p0)" : "var(--s-done)") + '">' +
        '<div class="pv-top"><h3>' + esc(p.name) + '</h3>' +
          '<span class="pill ' + (critical ? "bad" : "ok") + '">' + (critical ? "critical" : "low risk") + '</span>' +
          '<div class="spacer"></div>' +
          (p.url ? '<a href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer" class="note">open ↗</a>' : '') +
        '</div>' +
        (p.purpose ? '<p class="purpose">' + esc(p.purpose) + '</p>' : '') +
        '<dl class="pv-rows">' +
          (p.owner ? '<div><dt>Owner</dt><dd>' + esc(p.owner) + '</dd></div>' : '') +
          (p.plan ? '<div><dt>Plan</dt><dd>' + esc(p.plan) + '</dd></div>' : '') +
          (p.cost_amount != null ? '<div><dt>Cost</dt><dd>' + esc(p.cost_currency||"EUR") + ' ' +
            fmtN(p.cost_amount) + ' / ' + esc(p.cost_cycle||"") + '</dd></div>' : '') +
          (p.renewal_date ? '<div><dt>Renews</dt><dd>' + fmtDateY(p.renewal_date) + '</dd></div>' : '') +
          (p.account_email ? '<div><dt>Account</dt><dd>' + esc(p.account_email) + '</dd></div>' : '') +
          (p.username && !critical ? '<div><dt>Username</dt><dd>' + esc(p.username) + '</dd></div>' : '') +
          (p.notes ? '<div><dt>Notes</dt><dd>' + esc(p.notes) + '</dd></div>' : '') +
        '</dl>' +
        (critical
          ? '<div class="vault"><b>No password stored here.</b>' +
            (p.vault_location ? '<br>Lives in: ' + esc(p.vault_location) : '') +
            (p.access_note ? '<br>' + esc(p.access_note) : '') + '</div>'
          : shown
            ? '<div><div class="note" style="margin-bottom:4px">' +
              (shown.username ? esc(shown.username) + " · " : "") + 'click to select</div>' +
              '<div class="secret">' + esc(shown.secret) + '</div></div>'
            : '') +
        '<div class="pv-foot">' +
          (!critical && p.has_secret && !shown
            ? '<button class="btn btn-ghost btn-sm" data-reveal="' + p.id + '">Show password</button>' : '') +
          (!critical && !p.has_secret ? '<span class="note">No password recorded</span>' : '') +
          (shown ? '<button class="btn btn-ghost btn-sm" data-hide="' + p.id + '">Hide</button>' : '') +
          '<div class="spacer"></div>' +
          '<button class="btn btn-ghost btn-sm" data-editprov="' + p.id + '">Edit</button>' +
        '</div>' +
      '</div>';
    });
    out += '</div>';
  });
  if (!ps.length) out += '<div class="empty">Nothing recorded yet.</div>';
  return out + '</div>';
}




function renderPhases(list){
  const today = todayISO();
  /* Where stranded work should go. Not simply "the current phase" -- a window
     that closes next week is no better a home than the one it came from. Take the
     first phase with at least a fortnight of runway left. */
  const target = DATA.phases
    .filter(f => f.ends && daysBetween(today, f.ends) >= 14)
    .sort((a,b) => (a.sort_order||0) - (b.sort_order||0))[0];

  return '<div class="tl">' + DATA.phases.map(ph => {
    const ts = list.filter(t => t.phase_key === ph.key);
    const allTs = DATA.tasks.filter(t => t.phase_key === ph.key);
    const upcoming = ph.ends && ph.ends >= today;
    if (!allTs.length && ph.key !== "icebox" && !upcoming) return "";
    const pr = progress(ts);
    const openN = allTs.filter(isOpen).length;
    const closed = ph.ends && ph.ends < today;
    const live = ph.starts && ph.ends && ph.starts <= today && ph.ends >= today;
    const win = ph.starts ? fmtDate(ph.starts) + " → " + fmtDateY(ph.ends) : "unscheduled";

    return '<section class="tlp' + (closed ? " closed" : "") + '" style="--pc:' + ph.color + '">' +
      '<div class="tlp-head">' +
        '<h3>' + esc(ph.name) + '</h3>' +
        '<span class="win">' + esc(win) + '</span>' +
        (live ? '<span class="pill warn">now</span>' : '') +
        (closed ? '<span class="pill mute">closed</span>' : '') +
        (ph.theme ? '<span class="theme">' + esc(ph.theme) + '</span>' : '') +
        '<div class="spacer"></div>' +
        '<div class="prog" title="' + pr.done + ' of ' + pr.total + ' done"><span style="width:' + pr.pct + '%"></span></div>' +
        '<span class="count">' + pr.done + '/' + pr.total + '</span>' +
        '<button class="btn btn-ghost btn-sm" data-phase="' + esc(ph.key) + '">Edit</button>' +
      '</div>' +
      (closed && openN && target && target.key !== ph.key
        ? '<div class="rescue"><div><b>' + openN + ' task' + (openN===1?"":"s") +
          ' still open in a window that closed ' + relDue(ph.ends) + '.</b> ' +
          'Leaving them here makes every date on this board a little less true.</div>' +
          '<button class="btn btn-primary btn-sm" data-move-from="' + esc(ph.key) +
          '" data-move-to="' + esc(target.key) + '">Move to ' + esc(target.name) + '</button></div>'
        : '') +
      (!allTs.length && upcoming
        ? '<div class="crit" style="padding-top:12px"><i>Nothing planned into this window yet.</i></div>'
        : '') +
      (ph.verdict ? '<div class="crit verdict"><b>Verdict:</b> ' + esc(ph.verdict) + '</div>' : '') +
      (ts.length ? '<div class="tlp-body">' + ts.map(card).join("") + '</div>' : '') +
      (ph.success_criteria ? '<div class="crit"><b>Success:</b> ' + esc(ph.success_criteria) + '</div>' : '') +
    '</section>';
  }).join("") + '</div>';
}

function renderActivity(){
  if (!DATA.activity.length) return '<div class="empty">No activity yet.</div>';
  return '<div class="feed">' + DATA.activity.map(a =>
    '<div class="ev' + (String(a.action).indexOf("revealed") === 0 ? " sec" : "") + '">' +
      '<span class="actor" style="color:' + personColor(a.actor) + '">' + esc(a.actor) + '</span>' +
      '<span class="act">' + esc(a.action) + (a.detail ? " (" + esc(a.detail) + ")" : "") + '</span>' +
      '<span class="ttl">' + esc(a.task_title) + '</span>' +
      '<span class="when">' + ago(a.at) + '</span>' +
    '</div>').join("") + '</div>';
}
