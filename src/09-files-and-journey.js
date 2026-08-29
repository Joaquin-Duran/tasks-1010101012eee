
/* ============================================================
   FILES  ·  a real browser over the Azure container
   ============================================================ */
function fmtBytes(n){
  n = Number(n) || 0;
  if (n < 1024) return n + " B";
  if (n < 1048576) return Math.round(n/1024) + " KB";
  return (n/1048576).toFixed(1) + " MB";
}
const FILE_ICON = { image:"🖼", source:"🎨", font:"🔤", file:"📎" };

function renderFiles(){
  const files = DATA.files || [];
  const assets = DATA.assets || [];
  const folders = uniq(files.map(f => f.folder)).sort();
  /* default to the fullest folder rather than whichever sorts first -- landing on
     a folder with one file in it makes the whole browser look empty */
  const biggest = folders.slice().sort((a,b) =>
    files.filter(f => f.folder === b).length - files.filter(f => f.folder === a).length)[0];
  const cur = UI.fileFolder && folders.includes(UI.fileFolder) ? UI.fileFolder : (biggest || null);
  const shown = files.filter(f => f.folder === cur);
  const totalBytes = files.reduce((a,b) => a + Number(b.bytes || 0), 0);

  let out = '<div class="wrap" style="max-width:none">' +
    '<div class="panel-head" style="border:none;padding:0 0 12px">' +
      '<h2 style="font-size:17px">Files</h2>' +
      '<span class="sub">' + files.length + ' brand files · ' + fmtBytes(totalBytes) +
      ' · hosted on Azure, public links</span>' +
      '<div class="spacer"></div>' +
      '<button class="btn btn-ghost btn-sm" id="newAsset">+ Elsewhere</button>' +
    '</div>';

  if (!files.length){
    out += '<div class="empty">Nothing indexed yet.</div>';
  } else {
    out += '<div class="seg fold-tabs" id="fFolder">' + folders.map(f =>
      '<button data-ff="' + esc(f) + '"' + (f === cur ? ' class="on"' : '') + '>' + esc(f) +
      ' <b>' + files.filter(x => x.folder === f).length + '</b></button>').join("") + '</div>';

    out += '<div class="fgrid">' + shown.map(f =>
      '<div class="fcard" data-file="' + f.id + '">' +
        (f.kind === "image"
          ? '<div class="fthumb"><img src="' + esc(f.thumb_url || f.url) + '" alt="" loading="lazy"></div>'
          : '<div class="fthumb glyph">' + (FILE_ICON[f.kind] || "📎") + '</div>') +
        '<div class="fmeta">' +
          '<span class="fname" title="' + esc(f.path) + '">' + esc(f.name) + '</span>' +
          '<span class="fsub">' + esc(f.path.split(".").pop().toUpperCase()) + ' · ' + fmtBytes(f.bytes) +
            (f.lang === "es" ? ' · <b class="lang">Spanish</b>' : f.lang === "de" ? ' · <b class="lang">German</b>' : '') + '</span>' +
        '</div>' +
        '<div class="factions">' +
          '<a href="' + esc(f.url) + '" target="_blank" rel="noopener noreferrer" title="Open in a tab">Open</a>' +
          '<button data-dl="' + f.id + '" title="Save to your computer">Download</button>' +
        '</div>' +
      '</div>').join("") + '</div>';

    out += '<div class="note" style="margin:14px 0 0">Every file above lives at ' +
      '<code>goprepassets.blob.core.windows.net/brand/…</code> and is publicly readable, so ' +
      'these links work in a deck or an email with no login. ' +
      '<b>Download all of a folder:</b> select the files you want and use Download, or grab the ' +
      'whole container with the az command in the README.</div>';
  }

  const elsewhere = assets.filter(a => !a.url || a.url.indexOf("/brand/") === -1);
  if (elsewhere.length){
    out += '<div class="section-title">Elsewhere · not in the container</div><div class="grid-auto">' +
      elsewhere.map(a =>
        '<div class="pv" style="--sc:' + (a.url ? "var(--s-done)" : "var(--line)") + '">' +
          '<div class="pv-top"><h3>' + esc(a.name) + '</h3><div class="spacer"></div>' +
            (a.url ? '<a href="' + esc(a.url) + '" target="_blank" rel="noopener noreferrer" class="note">open ↗</a>'
                   : '<span class="pill mute">local only</span>') + '</div>' +
          (a.description ? '<p class="purpose">' + esc(a.description) + '</p>' : '') +
          (a.location ? '<div class="vault"><b>Where it is:</b> ' + esc(a.location) + '</div>' : '') +
          '<div class="pv-foot"><div class="spacer"></div>' +
            '<button class="btn btn-ghost btn-sm" data-editasset="' + a.id + '">Edit</button></div>' +
        '</div>').join("") + '</div>';
  }
  return out + '</div>';
}

/* lightbox for a single file */
function openFile(id){
  const f = (DATA.files || []).find(x => x.id === id);
  if (!f) return;
  const close = modal(
    head(f.name, f.path.split("/")[0]) +
    '<div class="modal-body" style="text-align:center">' +
      (f.kind === "image"
        ? '<div class="lightbox"><img src="' + esc(f.thumb_url || f.url) + '" alt=""></div>'
        : '<div class="lightbox glyph">' + (FILE_ICON[f.kind] || "📎") + '</div>') +
      '<div class="note" style="margin-top:12px;text-align:left">' +
        '<b>Path</b> <code>' + esc(f.path) + '</code><br>' +
        '<b>Size</b> ' + fmtBytes(f.bytes) + '<br>' +
        '<b>Link</b> <a href="' + esc(f.url) + '" target="_blank" rel="noopener noreferrer">' +
          esc(f.url) + '</a></div>' +
    '</div>' +
    '<div class="modal-foot"><div class="spacer"></div>' +
      '<button class="btn btn-ghost" id="mCancel">Close</button>' +
      '<button class="btn btn-primary" id="fDl">Download</button></div>', { wide:true });
  $("#fDl").onclick = () => downloadFile(f);
}

/* Azure has CORS open for GET, so the page can fetch the bytes and hand the
   browser a real save rather than opening the image in a tab. */
async function downloadFile(f){
  try {
    const r = await fetch(f.url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = f.path.split("/").pop();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast("Saved " + a.download);
  } catch(err){
    window.open(f.url, "_blank", "noopener");
    toast("Opened in a tab · save it from there", true);
  }
}

/* ============================================================
   JOURNEY  ·  the flow as a node graph
   ============================================================ */
const JSTATUS = {
  live:     { label:"live",     tone:"ok"   },
  building: { label:"building", tone:"warn" },
  planned:  { label:"planned",  tone:"mute" },
  idea:     { label:"someday",  tone:"mute" },
  problem:  { label:"problem",  tone:"bad"  }
};

function renderJourney(){
  const which = VIEW === "journey-value" ? "value" : "user";
  const steps = (DATA.journey || []).filter(s => s.journey === which);
  const cols = [];
  steps.forEach(s => {
    (cols[s.step_no] = cols[s.step_no] || []).push(s);
  });

  const head2 = which === "user"
    ? { h:"The user journey", s:"what somebody actually walks through, start to finish" }
    : { h:"Value creation", s:"how one profile turns into more and more of the job being done for them" };

  let out = '<div class="wrap" style="max-width:none">' +
    '<div class="panel-head" style="border:none;padding:0 0 12px">' +
      '<h2 style="font-size:17px">' + esc(head2.h) + '</h2>' +
      '<span class="sub">' + esc(head2.s) + '</span>' +
    '</div>' +
    '<p class="note" style="margin:-4px 0 14px;max-width:720px">Every box is a step. Click one to ' +
    'open the task that would improve it · or to create that task if it does not exist yet. ' +
    'A red box is a step we know is weak.</p>';

  /* Vertical flow: one step per band, branches side by side, a long connector
     between bands. Reads top to bottom with room to breathe, rather than a row
     of squashed columns. */
  out += '<div class="jflow">';
  cols.forEach((group, i) => {
    if (!group) return;
    out += '<div class="jband">' +
      '<div class="jband-no"><span>' + i + '</span></div>' +
      '<div class="jband-nodes">' + group.map(s => {
        const st = JSTATUS[s.status] || JSTATUS.planned;
        const t = s.task_code ? DATA.tasks.find(x => x.code === s.task_code) : null;
        const g = s.goal_key ? DATA.goals.find(x => x.key === s.goal_key) : null;
        return '<div class="jnode s-' + esc(s.status) + '" data-step="' + s.id + '"' +
            (g ? ' style="--gc:' + g.color + '"' : '') + '>' +
          '<div class="jnode-head">' +
            '<span class="jname">' + esc(s.name) + '</span>' +
            '<span class="pill ' + st.tone + '">' + st.label + '</span>' +
          '</div>' +
          (s.subtitle ? '<div class="jsub">' + esc(s.subtitle) + '</div>' : '') +
          (s.shot_url
            ? '<div class="jshot"><img src="' + esc(s.shot_url) + '" alt="" loading="lazy"></div>'
            : '') +
          (s.description ? '<div class="jdesc">' + esc(s.description) + '</div>' : '') +
          (s.note ? '<div class="jnote">' + esc(s.note) + '</div>' : '') +
          '<div class="jfoot">' +
            (g ? '<span class="tag goal" style="--tc:' + g.color + '">' + esc(g.name) + '</span>' : '') +
            (t ? '<span class="jtask">' + esc(t.code) + ' →</span>'
               : '<span class="jtask none">+ add a task</span>') +
          '</div>' +
        '</div>';
      }).join("") + '</div>' +
    '</div>';
    if (i < cols.length - 1 && cols.slice(i+1).some(Boolean)) out += '<div class="jlink"></div>';
  });
  out += '</div>';

  const problems = steps.filter(s => s.status === "problem");
  if (problems.length){
    out += '<div class="section-title">Known weak steps</div>' +
      problems.map(s => '<div class="flag bad"><span class="fi">◆</span><div>' +
        '<b>' + esc(s.name) + '</b> · ' + esc(s.note || s.description || "") +
        (s.task_code ? ' <a href="#" data-step-task="' + esc(s.task_code) + '">' + esc(s.task_code) + ' →</a>' : '') +
        '</div></div>').join("");
  }
  return out + '</div>';
}

function openStep(id){
  const s = (DATA.journey || []).find(x => x.id === id);
  if (!s) return;
  const t = s.task_code ? DATA.tasks.find(x => x.code === s.task_code) : null;
  const g = s.goal_key ? DATA.goals.find(x => x.key === s.goal_key) : null;
  const st = JSTATUS[s.status] || JSTATUS.planned;

  const close = modal(
    head(s.name, "step " + s.step_no) +
    '<div class="modal-body">' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px">' +
        '<span class="pill ' + st.tone + '">' + st.label + '</span>' +
        (g ? '<span class="tag goal" style="--tc:' + g.color + '">' + esc(g.name) + '</span>' : '') +
      '</div>' +
      (s.shot_url ? '<div class="lightbox" style="margin-bottom:14px"><img src="' + esc(s.shot_url) + '" alt=""></div>' : '') +
      (s.subtitle ? '<p class="note" style="margin:0 0 8px;font-size:13px">' + esc(s.subtitle) + '</p>' : '') +
      '<div class="field"><label for="sShot">Screenshot link</label>' +
        '<input class="input" id="sShot" value="' + esc(s.shot_url || "") + '" ' +
        'placeholder="https://goprepassets.blob.core.windows.net/brand/…"><span class="hint">' +
        'Grab the screen, upload it to the brand container, paste the link here.</span></div>' +
      (s.description ? '<p style="margin:0 0 12px">' + esc(s.description) + '</p>' : '') +
      (s.note ? '<div class="flag ' + (s.status === "problem" ? "bad" : "warn") +
                '" style="margin:0 0 12px"><span class="fi">◆</span><div>' + esc(s.note) + '</div></div>' : '') +
      (t
        ? '<div class="note"><b>The work on this step</b></div>' +
          '<div class="pl-rows" style="margin-top:6px"><div class="pl-row" data-open="task:' + t.id + '" ' +
          'style="--pc:' + (PRIO_HEX[t.priority]||"transparent") + '">' +
            '<span class="pill ' + (t.status==="Done"?"ok":"mute") + '">' + esc(t.status) + '</span>' +
            '<span class="t">' + esc(t.title) + '<small>' + esc(t.code) + '</small></span>' +
            '<div class="spacer"></div>' +
            (t.owners||[]).map(o => avatar(o)).join("") +
          '</div></div>'
        : '<div class="note">No task points at this step yet.</div>') +
    '</div>' +
    '<div class="modal-foot">' +
      '<button class="btn btn-ghost" id="sSaveShot">Save screenshot link</button>' +
      '<div class="spacer"></div>' +
      '<button class="btn btn-ghost" id="mCancel">Close</button>' +
      '<button class="btn btn-primary" id="sMakeTask">' +
        (t ? "Add another task here" : "Create a task for this step") + '</button></div>');

  $("#sSaveShot").onclick = async () => {
    try {
      await rpc("pm_save_journey_step", { p_token:TOKEN,
        p_s:{ id:s.id, shot_url:$("#sShot").value.trim() }, p_actor:ME });
      close(); await refresh(true); toast("Screenshot saved");
    } catch(err){ fail(err, "Could not save"); }
  };

  $("#sMakeTask").onclick = () => {
    close();
    openTask(null, { goal: g ? g.id : "", title: "Improve: " + s.name,
                     description: (s.description || "") + (s.note ? "\n\n" + s.note : "") });
  };
}
