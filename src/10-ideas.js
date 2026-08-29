
/* ============================================================
   IDEAS  ·  the creative board
   Somewhere to put a thought before it is a task, and a place for
   the tools and references that keep turning out to be useful.
   ============================================================ */
const IDEA_KIND = {
  idea:        { label:"Idea",        icon:"💡" },
  resource:    { label:"Resource",    icon:"📎" },
  tool:        { label:"Tool",        icon:"🛠" },
  inspiration: { label:"Inspiration", icon:"✨" },
  question:    { label:"Question",    icon:"❓" }
};
const IDEA_STATUS = {
  spark:     { label:"Spark",     tone:"mute" },
  exploring: { label:"Exploring", tone:"warn" },
  parked:    { label:"Parked",    tone:"mute" },
  building:  { label:"Building",  tone:"ok"   },
  shipped:   { label:"Shipped",   tone:"ok"   }
};

function renderIdeas(){
  const all = (DATA.ideas || []).slice()
    .sort((a,b) => (a.sort_order||0) - (b.sort_order||0));
  const kinds = Object.keys(IDEA_KIND);

  let out = '<div class="wrap">' +
    '<div class="panel-head" style="border:none;padding:0 0 6px">' +
      '<h2 style="font-size:17px">Ideas</h2>' +
      '<span class="sub">a place for thoughts that are not tasks yet</span>' +
      '<div class="spacer"></div>' +
      '<button class="btn btn-primary btn-sm" id="newIdea">+ Post something</button>' +
    '</div>' +
    '<p class="note" style="margin:0 0 16px;max-width:680px">Nothing here has to be finished, ' +
    'assigned or justified. Put the half-thought down so somebody can build on it. ' +
    'When one turns into real work, open it and send it to the board as a task.</p>';

  if (!all.length) return out + '<div class="empty">Nothing on the board yet. Be the first.</div></div>';

  kinds.forEach(k => {
    const got = all.filter(i => i.kind === k);
    if (!got.length) return;
    const meta = IDEA_KIND[k];
    out += '<div class="section-title">' + meta.icon + ' ' + esc(meta.label) +
           ' <span style="color:var(--ink-3);font-weight:600">' + got.length + '</span></div>' +
      '<div class="grid-auto">' + got.map(ideaCard).join("") + '</div>';
  });
  return out + '</div>';
}

function ideaCard(i){
  const st = IDEA_STATUS[i.status] || IDEA_STATUS.spark;
  return '<div class="idea" data-editidea="' + i.id + '">' +
    '<div class="idea-top">' +
      '<span class="pill ' + st.tone + '">' + st.label + '</span>' +
      '<div class="spacer"></div>' +
      (i.author ? avatar(i.author) : "") +
    '</div>' +
    '<h3>' + esc(i.title) + '</h3>' +
    (i.body ? '<p>' + esc(i.body) + '</p>' : '') +
    (i.url ? '<div class="idea-link">' + esc(i.url.replace(/^https?:\/\//,"").slice(0,52)) + '</div>' : '') +
    '<div class="idea-foot">' + ago(i.updated_at) + '</div>' +
  '</div>';
}

function openIdea(id){
  const i = id ? (DATA.ideas || []).find(x => x.id === id) : null;
  const v = (k, d) => (i && i[k] != null ? i[k] : (d ?? ""));
  const kinds  = Object.keys(IDEA_KIND).map(k => ({ k, t: IDEA_KIND[k].label }));
  const stats  = Object.keys(IDEA_STATUS).map(k => ({ k, t: IDEA_STATUS[k].label }));

  const close = modal(
    head(i ? "Edit" : "Post something to the board") +
    '<div class="modal-body">' +
      '<div class="field"><label for="iTitle">The thought</label>' +
        '<input class="input" id="iTitle" value="' + esc(v("title")) + '" ' +
        'placeholder="What if the plan arrived as a message?"></div>' +
      '<div class="grid3">' +
        '<div class="field"><label for="iKind">Kind</label><select class="input" id="iKind">' +
          selOpts(kinds, v("kind","idea")) + '</select></div>' +
        '<div class="field"><label for="iStatus">Where it is</label><select class="input" id="iStatus">' +
          selOpts(stats, v("status","spark")) + '</select></div>' +
        '<div class="field"><label for="iAuthor">Who</label><select class="input" id="iAuthor">' +
          selOpts(DATA.people.filter(p => p.active).map(p => p.name), v("author", ME), "Not set") + '</select></div>' +
      '</div>' +
      '<div class="field"><label for="iBody">More, if there is more</label>' +
        '<textarea class="input" id="iBody" style="min-height:110px">' + esc(v("body")) + '</textarea></div>' +
      '<div class="field"><label for="iUrl">Link</label>' +
        '<input class="input" id="iUrl" value="' + esc(v("url")) + '" placeholder="https://…"></div>' +
    '</div>' +
    '<div class="modal-foot">' +
      (i ? '<button class="btn btn-danger" id="iDel">Remove</button>' : '') +
      (i ? '<button class="btn btn-ghost" id="iPromote">Make it a task</button>' : '') +
      '<div class="spacer"></div>' +
      '<button class="btn btn-ghost" id="mCancel">Cancel</button>' +
      '<button class="btn btn-primary" id="mSave">' + (i ? "Save" : "Post it") + '</button>' +
    '</div>');

  $("#iTitle").focus();
  $("#mSave").onclick = async () => {
    const title = $("#iTitle").value.trim();
    if (!title) return toast("Needs a title", true);
    const payload = { title, body:$("#iBody").value.trim(), kind:$("#iKind").value,
                      status:$("#iStatus").value, url:$("#iUrl").value.trim(),
                      author:$("#iAuthor").value };
    if (i) payload.id = i.id;
    $("#mSave").disabled = true;
    try { await rpc("pm_save_idea", { p_token:TOKEN, p_i:payload, p_actor:ME });
          close(); await refresh(true); toast(i ? "Saved" : "Posted"); }
    catch(err){ $("#mSave").disabled = false; fail(err, "Could not save"); }
  };
  if (i){
    $("#iDel").onclick = async () => {
      if (!confirm("Take “" + i.title + "” off the board?")) return;
      try { await rpc("pm_delete_idea", { p_token:TOKEN, p_id:i.id, p_actor:ME });
            close(); await refresh(true); toast("Removed"); }
      catch(err){ fail(err, "Could not remove"); }
    };
    $("#iPromote").onclick = () => {
      close();
      openTask(null, { title: i.title, description: (i.body || "") + (i.url ? "\n\n" + i.url : "") });
    };
  }
}
