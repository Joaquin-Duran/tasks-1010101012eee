
/* ============================================================
   A small markdown renderer. Enough for the handbook: headings,
   lists, tables, code, quotes, rules, and [[wiki links]] between docs.
   Everything is escaped first, so doc bodies can never inject markup.
   ============================================================ */
function md(src){
  if (!src) return "";
  const blocks = [];
  let s = String(src).replace(/\r\n/g, "\n");

  // pull fenced blocks out first so nothing else touches them.
  // ```marks is a small extension: one "Label|#colour" per line, rendered as
  // colour chips. It exists so docs can show brand marks without the renderer
  // having to allow raw HTML through.
  s = s.replace(/```([\w-]*)\n([\s\S]*?)```/g, (m, lang, code) => {
    if (lang === "marks"){
      const chips = code.trim().split("\n").map(line => {
        const [label, colour, img] = line.split("|").map(x => (x||"").trim());
        if (!label) return "";
        /* MyFitnessPal -> MFP, Eat This Much -> ETM, Yazio -> YAZ */
        const caps = (label.match(/[A-Z]/g) || []);
        const initials = (caps.length >= 2 ? caps.join("") : label.replace(/[^A-Za-z]/g,"").slice(0,3))
          .slice(0,3).toUpperCase();
        const badge = img
          ? '<img src="' + esc(img) + '" alt="" loading="lazy">'
          : '<i>' + esc(initials) + '</i>';
        return '<span class="cm' + (img ? ' has-img' : '') + '" style="--c:' +
          esc(colour || "#8A8A8A") + '">' + badge + '<b>' + esc(label) + '</b></span>';
      }).join("");
      blocks.push('<div class="cmarks">' + chips + '</div>');
    } else {
      blocks.push('<pre><code>' + esc(code.replace(/\n$/, "")) + '</code></pre>');
    }
    return "@@BLOCK" + (blocks.length - 1) + "@@";
  });

  const inline = txt => {
    let x = esc(txt);
    x = x.replace(/`([^`]+)`/g, (m,c) => '<code>' + c + '</code>');
    /* non-greedy, so bold can contain italics: **a *b* c** */
    x = x.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
    x = x.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    // [[Doc title]] -> jump to that handbook doc
    x = x.replace(/\[\[([^\]]+)\]\]/g, (m, name) => {
      const key = docKeyByName(name);
      return key
        ? '<a class="wl" href="#" data-doc="' + esc(key) + '">' + esc(name) + '</a>'
        : '<a class="wl dead" href="#" title="No document called that yet">' + esc(name) + '</a>';
    });
    x = x.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return x;
  };

  const lines = s.split("\n");
  const out = [];
  let i = 0;
  const para = [];
  const flushPara = () => { if (para.length){ out.push('<p>' + inline(para.join(" ")) + '</p>'); para.length = 0; } };

  while (i < lines.length){
    const ln = lines[i];

    if (/^@@BLOCK\d+@@$/.test(ln.trim())){ flushPara(); out.push(ln.trim()); i++; continue; }
    if (!ln.trim()){ flushPara(); i++; continue; }

    let m;
    if ((m = ln.match(/^(#{1,4})\s+(.*)$/))){
      flushPara();
      const lvl = Math.min(m[1].length, 3);
      out.push('<h' + lvl + '>' + inline(m[2]) + '</h' + lvl + '>');
      i++; continue;
    }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(ln)){ flushPara(); out.push('<hr>'); i++; continue; }

    // table: | a | b |  followed by | --- | --- |
    if (/^\s*\|/.test(ln) && i+1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i+1])){
      flushPara();
      const cells = row => row.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
      const head = cells(ln);
      i += 2;
      const body = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])){ body.push(cells(lines[i])); i++; }
      out.push('<table><thead><tr>' + head.map(h => '<th>' + inline(h) + '</th>').join("") +
        '</tr></thead><tbody>' +
        body.map(r => '<tr>' + r.map(c => '<td>' + inline(c) + '</td>').join("") + '</tr>').join("") +
        '</tbody></table>');
      continue;
    }

    if (/^\s*>\s?/.test(ln)){
      flushPara();
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])){ buf.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
      out.push('<blockquote>' + inline(buf.join(" ")) + '</blockquote>');
      continue;
    }

    if (/^\s*([-*+]|\d+\.)\s+/.test(ln)){
      flushPara();
      const ordered = /^\s*\d+\./.test(ln);
      const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])){
        let item = lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, "");
        i++;
        // soft-wrapped continuation lines belong to the item above
        while (i < lines.length && lines[i].trim() && !/^\s*([-*+]|\d+\.)\s+/.test(lines[i]) &&
               !/^(#{1,4}\s|\s*\||\s*>|@@BLOCK)/.test(lines[i])){ item += " " + lines[i].trim(); i++; }
        items.push('<li>' + inline(item) + '</li>');
      }
      out.push((ordered ? '<ol>' : '<ul>') + items.join("") + (ordered ? '</ol>' : '</ul>'));
      continue;
    }

    para.push(ln.trim());
    i++;
  }
  flushPara();

  return out.join("\n").replace(/@@BLOCK(\d+)@@/g, (m, n) => blocks[+n]);
}

function docKeyByName(name){
  const n = String(name).trim().toLowerCase();
  const hit = DATA.docs.find(x => x.title.toLowerCase() === n || x.key.toLowerCase() === n);
  return hit ? hit.key : null;
}

/* ============================ filtering ============================ */
function visible(){
  const q = F.q.trim().toLowerCase();
  return DATA.tasks.filter(t => {
    if (F.open && t.status === "Done") return false;
    if (F.person && !(t.owners || []).includes(F.person)) return false;
    if (F.mine && ME && !(t.owners || []).includes(ME)) return false;
    if (F.cat && t.category !== F.cat) return false;
    if (F.phase && t.phase_key !== F.phase) return false;
    if (F.goal && t.goal_id !== F.goal) return false;
    if (F.pri.size && !F.pri.has(t.priority)) return false;
    if (q){
      const g = goalOf(t);
      const hay = [t.code, t.title, t.description, t.notes, t.category, g && g.name, (t.owners||[]).join(" ")]
        .join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/* ============================ shared bits ============================ */
function card(t){
  const ph = byKey(DATA.phases, "key")[t.phase_key];
  const g  = goalOf(t);
  const pri = PRIOS.find(p => p.k === t.priority);
  const owners = (t.owners || []).map(o => avatar(o)).join("");
  return '<article class="card" draggable="true" data-id="' + t.id + '"' +
    (pri ? ' style="--pc:' + pri.c + '"' : '') + '>' +
      '<div class="card-top">' +
        (t.code ? '<span class="code">' + esc(t.code) + '</span>' : '') +
        (pri ? '<span class="pri" style="background:' + pri.c + '" title="' + esc(pri.t) + '">' + pri.k + '</span>' : '') +
        (t.effort ? '<span class="tag">' + esc(t.effort) + '</span>' : '') +
      '</div>' +
      '<h4>' + esc(t.title) + '</h4>' +
      '<div class="card-meta">' +
        (t.category ? '<span class="tag">' + esc(t.category) + '</span>' : '') +
        (g ? '<span class="tag goal" style="--tc:' + g.color + '" title="Goal">' + esc(g.name) + '</span>'
           : '<span class="tag" style="color:var(--p0);border-color:rgba(199,56,59,.3)" title="Not attached to any goal">no goal</span>') +
        (ph && ph.key !== "icebox" ? '<span class="tag phase" style="--tc:' + ph.color + '">' + esc(ph.name) + '</span>' : '') +
        (owners ? '<div class="avs">' + owners + '</div>' : '') +
        (t.target_date ? '<span class="due' + (isLate(t) ? ' late' : '') + '">' + fmtDate(t.target_date) + '</span>' : '') +
      '</div>' +
    '</article>';
}

function column(title, colour, tasks, dropStatus){
  return '<section class="col"' + (dropStatus ? ' data-drop="' + esc(dropStatus) + '"' : '') + '>' +
    '<div class="col-head"><span class="dot" style="background:' + colour + '"></span>' +
      '<h3>' + esc(title) + '</h3><span class="count">' + tasks.length + '</span></div>' +
    '<div class="col-body">' +
      (tasks.length ? tasks.map(card).join("") : '<div class="empty">Nothing here</div>') +
    '</div></section>';
}

function fmtN(n){ return n == null ? "\u2013" : (Math.round(Number(n)*10)/10).toLocaleString(); }

function metricBlock(g){
  if (!g.metric_name) return '';
  const pts = DATA.metrics.filter(m => m.goal_id === g.id).sort((a,b) => a.on_date < b.on_date ? -1 : 1);
  const cur = g.metric_current, tgt = g.metric_target;
  const has = cur != null;
  /* some metrics are wins when they fall: cost per user, steps before a plan.
     Progress there is how far the gap has closed, not the raw ratio. */
  const base = g.metric_baseline;
  let pct = 0;
  if (has && tgt != null){
    if (g.lower_is_better){
      const from = (base != null && base > tgt) ? base : Math.max(cur, tgt);
      pct = from === tgt ? 100 : Math.round((from - cur) / (from - tgt) * 100);
    } else {
      pct = Math.round(cur / tgt * 100);
    }
    pct = Math.max(0, Math.min(100, pct));
  }
  const max = Math.max.apply(null, pts.map(p => Number(p.value) || 0).concat([1]));
  return '<div class="metric">' +
    '<div class="mrow">' +
      '<span class="mv">' + fmtN(cur) + '</span>' +
      '<span>' + esc(g.metric_unit || "") + '</span>' +
      '<span class="mt">' + (tgt != null
        ? (g.lower_is_better ? "down to " : "target ") + fmtN(tgt) : "no target") + '</span>' +
    '</div>' +
    '<div class="mbar' + (has ? "" : " none") + '"><span style="width:' + pct + '%"></span></div>' +
    '<div class="note" style="margin-top:5px;font-size:11px">' + esc(g.metric_name) +
      (has ? "" : ' · <b style="color:var(--p0)">never measured</b>') + '</div>' +
    (pts.length > 1
      ? '<div class="spark" style="margin-top:8px">' + pts.slice(-12).map(p =>
          '<i style="height:' + Math.max(6, Math.round((Number(p.value)||0)/max*22)) + 'px" title="' +
          esc(p.on_date + ": " + p.value) + '"></i>').join("") + '</div>'
      : '') +
  '</div>';
}

function goalPill(g){
  return '<span class="pill ' + (GOAL_STATUS_TONE[g.status] || "mute") + '">' + esc(g.status) + '</span>';
}

