
/* ============================================================
   MODALS
   ============================================================ */
function modal(html, opts){
  const wide = opts && opts.wide ? " wide" : "";
  document.body.insertAdjacentHTML("beforeend",
    '<div class="scrim" id="scrim"><div class="modal' + wide + '" role="dialog" aria-modal="true">' + html + '</div></div>');
  const scrim = $("#scrim");
  const close = () => { scrim.remove(); document.removeEventListener("keydown", onEsc); };
  function onEsc(e){ if (e.key === "Escape") close(); }
  scrim.addEventListener("click", e => { if (e.target === scrim) close(); });
  document.addEventListener("keydown", onEsc);
  const x = $("#mClose"), c = $("#mCancel");
  if (x) x.onclick = close;
  if (c) c.onclick = close;
  return close;
}
function selOpts(list, cur, blank){
  return (blank ? '<option value="">' + blank + '</option>' : '') +
    list.map(o => {
      /* id wins where a row has one: goals carry BOTH id and key, and the
         task links to the id. Phases have only a key, which is what they link by. */
      const val = o.id ?? o.k ?? o.key ?? o;
      const lab = o.t ?? o.name ?? o.k ?? o;
      return '<option value="' + esc(val) + '"' + (String(val) === String(cur ?? "") ? " selected" : "") + '>' +
        esc(lab) + '</option>';
    }).join("");
}
function head(title, code, extra){
  return '<div class="modal-head">' + (code ? '<span class="code">' + esc(code) + '</span>' : '') +
    '<h2>' + esc(title) + '</h2>' + (extra || "") +
    '<button class="x" id="mClose" aria-label="Close">×</button></div>';
}
function foot(saveLabel, danger){
  return '<div class="modal-foot">' + (danger || "") + '<div class="spacer"></div>' +
    '<button class="btn btn-ghost" id="mCancel">Cancel</button>' +
    '<button class="btn btn-primary" id="mSave">' + esc(saveLabel) + '</button></div>';
}

/* ---------------- task ---------------- */
function openTask(id, seed){
  const t = id ? DATA.tasks.find(x => x.id === id) : null;
  const v = (k, dflt) => (t && t[k] != null ? t[k] : (dflt ?? ""));
  const owners = new Set(t ? (t.owners || []) : (ME ? [ME] : []));
  const msList = DATA.milestones.map(m => {
    const g = byId(DATA.goals)[m.goal_id];
    return { id:m.id, name:(g ? g.name + " · " : "") + m.name };
  });

  const close = modal(
    head(t ? "Edit task" : "New task", t && t.code) +
    '<div class="modal-body">' +
      '<div class="field"><label for="mTitle">Task</label>' +
        '<input class="input" id="mTitle" value="' + esc(v("title", seed && seed.title)) + '" placeholder="What needs to happen?"></div>' +
      '<div class="grid3">' +
        '<div class="field"><label for="mStatus">Status</label><select class="input" id="mStatus">' +
          selOpts(STATUSES, v("status","Not Started")) + '</select></div>' +
        '<div class="field"><label for="mPri">Priority</label><select class="input" id="mPri">' +
          selOpts(PRIOS, v("priority"), "Not set") + '</select></div>' +
        '<div class="field"><label for="mEff">Effort</label><select class="input" id="mEff">' +
          selOpts(EFFORTS, v("effort"), "Not set") + '</select></div>' +
      '</div>' +
      '<div class="grid2">' +
        '<div class="field"><label for="mMs">Milestone</label><select class="input" id="mMs">' +
          selOpts(msList, v("milestone_id"), "Not attached") +
          '</select><span class="hint">Sets the goal automatically.</span></div>' +
        '<div class="field"><label for="mGoal">Goal</label><select class="input" id="mGoal">' +
          selOpts(liveGoals(), v("goal_id", seed && seed.goal), "No goal") +
          '</select><span class="hint">Only needed without a milestone.</span></div>' +
      '</div>' +
      '<div class="grid3">' +
        '<div class="field"><label for="mCat">Area</label><select class="input" id="mCat">' +
          selOpts(CATS, v("category"), "Not set") + '</select></div>' +
        '<div class="field"><label for="mStart">Starts</label>' +
          '<input class="input" id="mStart" type="date" value="' + esc(v("start_date")) + '">' +
          '<span class="hint">Blank = inferred from effort.</span></div>' +
        '<div class="field"><label for="mDate">Due</label>' +
          '<input class="input" id="mDate" type="date" value="' + esc(v("target_date")) + '"></div>' +
      '</div>' +
      '<div class="field"><label for="mPhase">Phase</label><select class="input" id="mPhase">' +
        selOpts(DATA.phases, v("phase_key"), "Not set") + '</select></div>' +
      '<div class="field"><label>Owners</label><div class="owner-pick" id="mOwners">' +
        DATA.people.filter(p => p.active).map(p =>
          '<label class="opt' + (owners.has(p.name) ? " on" : "") + '">' +
            '<input type="checkbox" value="' + esc(p.name) + '"' + (owners.has(p.name) ? " checked" : "") + '>' +
            '<span class="av" style="background:' + p.color + '">' + esc(p.initials || "") + '</span>' +
            esc(p.name) + '</label>').join("") +
      '</div></div>' +
      '<div class="field"><label for="mDesc">Description / acceptance</label>' +
        '<textarea class="input" id="mDesc" placeholder="What does done look like?">' + esc(v("description", seed && seed.description)) + '</textarea></div>' +
      '<div class="field"><label for="mNotes">Comments</label>' +
        '<textarea class="input" id="mNotes" style="min-height:60px">' + esc(v("notes")) + '</textarea></div>' +
      (t ? '<div class="note">Added by ' + esc(t.created_by || "Not set") + ' · updated ' + ago(t.updated_at) + '</div>' : '') +
    '</div>' +
    foot(t ? "Save changes" : "Create task",
         t ? '<button class="btn btn-danger" id="mDel">Archive</button>' : ""));

  $$("#mOwners .opt").forEach(l => l.querySelector("input").addEventListener("change",
    e => l.classList.toggle("on", e.target.checked)));
  /* picking a milestone implies its goal, so keep the two in step */
  $("#mMs").addEventListener("change", e => {
    const m = byId(DATA.milestones)[e.target.value];
    if (m && m.goal_id) $("#mGoal").value = m.goal_id;
  });
  $("#mTitle").focus();

  $("#mSave").onclick = async () => {
    const title = $("#mTitle").value.trim();
    if (!title) return toast("Give the task a title", true);
    const payload = {
      title, status:$("#mStatus").value, priority:$("#mPri").value, effort:$("#mEff").value,
      category:$("#mCat").value, phase_key:$("#mPhase").value,
      target_date:$("#mDate").value, start_date:$("#mStart").value,
      goal_id:$("#mGoal").value, milestone_id:$("#mMs").value,
      description:$("#mDesc").value.trim(), notes:$("#mNotes").value.trim(),
      owners:$$("#mOwners input:checked").map(i => i.value)
    };
    if (t) payload.id = t.id;
    $("#mSave").disabled = true;
    try {
      await rpc("pm_save_task", { p_token:TOKEN, p_task:payload, p_actor:ME });
      close(); await refresh(true); toast(t ? "Saved" : "Task created");
    } catch(err){ $("#mSave").disabled = false; fail(err, "Could not save"); }
  };
  if (t) $("#mDel").onclick = async () => {
    if (!confirm("Archive “" + t.title + "”? It leaves the board but stays in the database.")) return;
    try { await rpc("pm_delete_task", { p_token:TOKEN, p_id:t.id, p_actor:ME });
          close(); await refresh(true); toast("Archived"); }
    catch(err){ fail(err, "Could not archive"); }
  };
}

/* ---------------- goal ---------------- */
function openGoal(id){
  const g = id ? DATA.goals.find(x => x.id === id) : null;
  const v = (k, dflt) => (g && g[k] != null ? g[k] : (dflt ?? ""));
  const pts = g ? DATA.metrics.filter(m => m.goal_id === g.id).sort((a,b) => a.on_date < b.on_date ? 1 : -1) : [];

  const close = modal(
    head(g ? "Edit goal" : "New goal", null) +
    '<div class="modal-body">' +
      '<div class="field"><label for="gName">Goal</label>' +
        '<input class="input" id="gName" value="' + esc(v("name")) + '" placeholder="People come back"></div>' +
      '<div class="field"><label for="gStatement">What we want to be true</label>' +
        '<textarea class="input" id="gStatement" style="min-height:56px">' + esc(v("statement")) + '</textarea></div>' +
      '<div class="field"><label for="gWhy">Why it matters</label>' +
        '<textarea class="input" id="gWhy" style="min-height:56px">' + esc(v("why")) + '</textarea></div>' +
      '<div class="grid3">' +
        '<div class="field"><label for="gArea">Area</label><select class="input" id="gArea">' +
          selOpts(AREAS, v("area"), "Not set") + '</select></div>' +
        '<div class="field"><label for="gHorizon">Horizon</label><select class="input" id="gHorizon">' +
          selOpts(["quarter","year","impulse"], v("horizon","quarter")) + '</select></div>' +
        '<div class="field"><label for="gStatus">Health</label><select class="input" id="gStatus">' +
          selOpts(GOAL_STATUS, v("status","Not started")) + '</select></div>' +
      '</div>' +
      '<div class="grid3">' +
        '<div class="field"><label for="gOwner">Owner</label><select class="input" id="gOwner">' +
          selOpts(DATA.people.filter(p => p.active).map(p => p.name), v("owner"), "Not set") + '</select></div>' +
        '<div class="field"><label for="gStarts">Starts</label>' +
          '<input class="input" id="gStarts" type="date" value="' + esc(v("starts")) + '"></div>' +
        '<div class="field"><label for="gEnds">Ends</label>' +
          '<input class="input" id="gEnds" type="date" value="' + esc(v("ends")) + '"></div>' +
      '</div>' +
      '<div class="section-title" style="margin:18px 0 8px">The metric</div>' +
      '<div class="grid2">' +
        '<div class="field"><label for="gMetric">What we measure</label>' +
          '<input class="input" id="gMetric" value="' + esc(v("metric_name")) + '" placeholder="Repeat-active users"></div>' +
        '<div class="field"><label for="gUnit">Unit</label>' +
          '<input class="input" id="gUnit" value="' + esc(v("metric_unit")) + '" placeholder="users"></div>' +
      '</div>' +
      '<div class="grid3">' +
        '<div class="field"><label for="gBase">Baseline</label>' +
          '<input class="input" id="gBase" type="number" step="any" value="' + esc(v("metric_baseline")) + '"></div>' +
        '<div class="field"><label for="gTarget">Target</label>' +
          '<input class="input" id="gTarget" type="number" step="any" value="' + esc(v("metric_target")) + '"></div>' +
        '<div class="field"><label for="gColor">Colour</label>' +
          '<input class="input" id="gColor" value="' + esc(v("color","#EF6E45")) + '"></div>' +
      '</div>' +
      (g ? '<div class="field"><label>Log a reading</label>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<input class="input" id="gPDate" type="date" value="' + todayISO() + '" style="width:auto">' +
          '<input class="input" id="gPVal" type="number" step="any" placeholder="value" style="width:110px">' +
          '<input class="input" id="gPNote" placeholder="note (optional)" style="flex:1;min-width:120px">' +
          '<button class="btn btn-ghost" id="gPAdd">Log</button>' +
        '</div>' +
        (pts.length ? '<div class="note" style="margin-top:8px">' + pts.slice(0,6).map(p =>
          esc(p.on_date) + ": <b>" + esc(String(p.value)) + "</b>").join(" · ") + '</div>'
          : '<span class="hint">No readings yet. Without one, this goal&rsquo;s health is a guess.</span>') +
        '</div>' : '') +
    '</div>' +
    foot(g ? "Save goal" : "Create goal",
         g ? '<button class="btn btn-danger" id="gDel">Archive</button>' : ""), { wide:false });

  $("#gName").focus();
  if (g) $("#gPAdd").onclick = async () => {
    const val = $("#gPVal").value;
    if (val === "") return toast("Enter a value", true);
    try {
      await rpc("pm_save_metric", { p_token:TOKEN, p_goal_id:g.id, p_date:$("#gPDate").value,
                                    p_value:Number(val), p_note:$("#gPNote").value, p_actor:ME });
      close(); await refresh(true); toast("Reading logged");
    } catch(err){ fail(err, "Could not log that"); }
  };

  $("#mSave").onclick = async () => {
    const name = $("#gName").value.trim();
    if (!name) return toast("Give the goal a name", true);
    const payload = {
      name, statement:$("#gStatement").value.trim(), why:$("#gWhy").value.trim(),
      area:$("#gArea").value, horizon:$("#gHorizon").value, status:$("#gStatus").value,
      owner:$("#gOwner").value, starts:$("#gStarts").value, ends:$("#gEnds").value,
      metric_name:$("#gMetric").value.trim(), metric_unit:$("#gUnit").value.trim(),
      metric_baseline:$("#gBase").value, metric_target:$("#gTarget").value,
      color:$("#gColor").value.trim()
    };
    if (g) payload.id = g.id;
    $("#mSave").disabled = true;
    try { await rpc("pm_save_goal", { p_token:TOKEN, p_goal:payload, p_actor:ME });
          close(); await refresh(true); toast(g ? "Goal saved" : "Goal created"); }
    catch(err){ $("#mSave").disabled = false; fail(err, "Could not save"); }
  };
  if (g) $("#gDel").onclick = async () => {
    if (!confirm("Archive the goal “" + g.name + "”? Its tasks stay, but lose their goal.")) return;
    try { await rpc("pm_delete_goal", { p_token:TOKEN, p_id:g.id, p_actor:ME });
          close(); await refresh(true); toast("Goal archived"); }
    catch(err){ fail(err, "Could not archive"); }
  };
}

/* ---------------- milestone ---------------- */
function openMilestone(id){
  const m = id ? DATA.milestones.find(x => x.id === id) : null;
  const v = (k, dflt) => (m && m[k] != null ? m[k] : (dflt ?? ""));
  const w = m ? msWindow(m) : null;
  const close = modal(
    head(m ? "Edit milestone" : "New milestone", m && m.code) +
    '<div class="modal-body">' +
      '<div class="field"><label for="sName">Milestone</label>' +
        '<input class="input" id="sName" value="' + esc(v("name")) + '" placeholder="Meal Prep works end to end"></div>' +
      '<div class="field"><label for="sDesc">What done looks like</label>' +
        '<textarea class="input" id="sDesc" style="min-height:56px">' + esc(v("description")) + '</textarea></div>' +
      '<div class="grid2">' +
        '<div class="field"><label for="sGoal">Goal</label><select class="input" id="sGoal">' +
          selOpts(DATA.goals.filter(g => g.horizon !== "impulse"), v("goal_id"), "No goal") + '</select></div>' +
        '<div class="field"><label for="sOwner">Owner</label><select class="input" id="sOwner">' +
          selOpts(DATA.people.filter(p => p.active).map(p => p.name), v("owner"), "Not set") + '</select></div>' +
      '</div>' +
      '<div class="grid3">' +
        '<div class="field"><label for="sStatus">Status</label><select class="input" id="sStatus">' +
          selOpts(MS_STATUS, v("status","Not Started")) + '</select></div>' +
        '<div class="field"><label for="sStarts">Starts</label>' +
          '<input class="input" id="sStarts" type="date" value="' + esc(v("starts")) + '"></div>' +
        '<div class="field"><label for="sEnds">Due</label>' +
          '<input class="input" id="sEnds" type="date" value="' + esc(v("ends")) + '"></div>' +
      '</div>' +
      (m && w && w.starts ? '<div class="note">The Gantt draws this from the tasks under it: ' +
        fmtDateY(w.starts) + ' → ' + fmtDateY(w.ends) + '. The dates above are the fallback when it has no dated tasks.</div>' : '') +
    '</div>' +
    foot(m ? "Save milestone" : "Create milestone",
         m ? '<button class="btn btn-danger" id="sDel">Archive</button>' : ""));
  $("#sName").focus();
  $("#mSave").onclick = async () => {
    const name = $("#sName").value.trim();
    if (!name) return toast("Give the milestone a name", true);
    const payload = { name, description:$("#sDesc").value.trim(), goal_id:$("#sGoal").value,
                      owner:$("#sOwner").value, status:$("#sStatus").value,
                      starts:$("#sStarts").value, ends:$("#sEnds").value };
    if (m) payload.id = m.id;
    $("#mSave").disabled = true;
    try { await rpc("pm_save_milestone", { p_token:TOKEN, p_ms:payload, p_actor:ME });
          close(); await refresh(true); toast(m ? "Saved" : "Milestone created"); }
    catch(err){ $("#mSave").disabled = false; fail(err, "Could not save"); }
  };
  if (m) $("#sDel").onclick = async () => {
    if (!confirm("Archive “" + m.name + "”? Its tasks stay but lose their milestone.")) return;
    try { await rpc("pm_delete_milestone", { p_token:TOKEN, p_id:m.id, p_actor:ME });
          close(); await refresh(true); toast("Archived"); }
    catch(err){ fail(err, "Could not archive"); }
  };
}

/* ---------------- doc ---------------- */
function openDoc(key){
  const doc = key ? DATA.docs.find(x => x.key === key) : null;
  const v = (k, dflt) => (doc && doc[k] != null ? doc[k] : (dflt ?? ""));
  const close = modal(
    head(doc ? "Edit: " + doc.title : "New document") +
    '<div class="modal-body">' +
      '<div class="grid3">' +
        '<div class="field"><label for="dTitle">Title</label>' +
          '<input class="input" id="dTitle" value="' + esc(v("title")) + '"></div>' +
        '<div class="field"><label for="dSection">Section</label>' +
          '<input class="input" id="dSection" value="' + esc(v("section","Direction")) + '" list="secList">' +
          '<datalist id="secList">' + uniq(DATA.docs.map(x => x.section).filter(Boolean))
            .map(s => '<option value="' + esc(s) + '">').join("") + '</datalist></div>' +
        '<div class="field"><label for="dIcon">Icon</label>' +
          '<input class="input" id="dIcon" value="' + esc(v("icon","📄")) + '"></div>' +
      '</div>' +
      '<div class="field"><label for="dSummary">One-line summary</label>' +
        '<input class="input" id="dSummary" value="' + esc(v("summary")) + '"></div>' +
      '<div class="field"><label for="dBody">Body <span class="hint" style="display:inline">' +
        'Markdown. Use [[Document title]] to link to another page.</span></label>' +
        '<textarea class="input md-edit" id="dBody">' + esc(v("body")) + '</textarea></div>' +
    '</div>' +
    foot(doc ? "Save document" : "Create document"), { wide:true });
  $("#dTitle").focus();
  $("#mSave").onclick = async () => {
    const title = $("#dTitle").value.trim();
    if (!title) return toast("Give it a title", true);
    const payload = { title, section:$("#dSection").value.trim(), icon:$("#dIcon").value.trim(),
                      summary:$("#dSummary").value.trim(), body:$("#dBody").value };
    if (doc) payload.id = doc.id;
    else payload.key = title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48);
    $("#mSave").disabled = true;
    try {
      const row = await rpc("pm_save_doc", { p_token:TOKEN, p_doc:payload, p_actor:ME });
      close(); await refresh(true);
      if (row && row.key) UI.doc = row.key;
      render(); toast("Saved");
    } catch(err){ $("#mSave").disabled = false; fail(err, "Could not save"); }
  };
}

/* ---------------- provider ---------------- */
function openProvider(id){
  const p = id ? DATA.providers.find(x => x.id === id) : null;
  const v = (k, dflt) => (p && p[k] != null ? p[k] : (dflt ?? ""));
  const close = modal(
    head(p ? "Edit provider" : "New provider") +
    '<div class="modal-body">' +
      '<div class="grid2">' +
        '<div class="field"><label for="vName">Provider</label>' +
          '<input class="input" id="vName" value="' + esc(v("name")) + '" placeholder="Figma"></div>' +
        '<div class="field"><label for="vCat">Category</label>' +
          '<input class="input" id="vCat" value="' + esc(v("category")) + '" list="catList" placeholder="Design">' +
          '<datalist id="catList">' + uniq(DATA.providers.map(x => x.category).filter(Boolean))
            .map(s => '<option value="' + esc(s) + '">').join("") + '</datalist></div>' +
      '</div>' +
      '<div class="field"><label for="vPurpose">What we use it for</label>' +
        '<input class="input" id="vPurpose" value="' + esc(v("purpose")) + '"></div>' +
      '<div class="field"><label for="vSens">Risk level</label>' +
        '<select class="input" id="vSens">' +
          '<option value="low"' + (v("sensitivity","low")==="low"?" selected":"") + '>Low risk · password may be stored here</option>' +
          '<option value="critical"' + (v("sensitivity")==="critical"?" selected":"") + '>Critical · can spend money or delete production</option>' +
        '</select>' +
        '<span class="hint">Critical accounts store no password, by database rule. They record where the credential lives instead.</span></div>' +
      '<div class="grid2">' +
        '<div class="field"><label for="vUrl">URL</label>' +
          '<input class="input" id="vUrl" value="' + esc(v("url")) + '" placeholder="https://…"></div>' +
        '<div class="field"><label for="vOwner">Owner</label><select class="input" id="vOwner">' +
          selOpts(DATA.people.filter(x => x.active).map(x => x.name), v("owner"), "Not set") + '</select></div>' +
      '</div>' +
      '<div class="grid3">' +
        '<div class="field"><label for="vPlan">Plan</label>' +
          '<input class="input" id="vPlan" value="' + esc(v("plan")) + '" placeholder="Pro"></div>' +
        '<div class="field"><label for="vCost">Cost</label>' +
          '<input class="input" id="vCost" type="number" step="any" value="' + esc(v("cost_amount")) + '"></div>' +
        '<div class="field"><label for="vCycle">Billing</label><select class="input" id="vCycle">' +
          selOpts(["monthly","yearly","usage","free","one-off"], v("cost_cycle","monthly")) + '</select></div>' +
      '</div>' +
      '<div class="grid2">' +
        '<div class="field"><label for="vRenew">Renews on</label>' +
          '<input class="input" id="vRenew" type="date" value="' + esc(v("renewal_date")) + '"></div>' +
        '<div class="field"><label for="vEmail">Account email</label>' +
          '<input class="input" id="vEmail" value="' + esc(v("account_email")) + '"></div>' +
      '</div>' +
      '<div id="lowBox" class="' + (v("sensitivity","low")==="low" ? "" : "hidden") + '">' +
        '<div class="grid2">' +
          '<div class="field"><label for="vUser">Username</label>' +
            '<input class="input" id="vUser" value="' + esc(v("username")) + '" autocomplete="off"></div>' +
          '<div class="field"><label for="vSecret">Password</label>' +
            '<input class="input" id="vSecret" type="text" autocomplete="off" placeholder="' +
              (p && p.has_secret ? "unchanged · type to replace" : "") + '">' +
            '<span class="hint">Stored in the database, hidden until someone clicks Show. Every reveal is logged.</span></div>' +
        '</div>' +
      '</div>' +
      '<div id="critBox" class="' + (v("sensitivity")==="critical" ? "" : "hidden") + '">' +
        '<div class="grid2">' +
          '<div class="field"><label for="vVault">Where the credential lives</label>' +
            '<input class="input" id="vVault" value="' + esc(v("vault_location")) + '" placeholder="Bitwarden › Ops"></div>' +
          '<div class="field"><label for="vAccess">How to get access</label>' +
            '<input class="input" id="vAccess" value="' + esc(v("access_note")) + '" placeholder="Ask Joaquin to invite your account"></div>' +
        '</div>' +
      '</div>' +
      '<div class="field"><label for="vNotes">Notes</label>' +
        '<textarea class="input" id="vNotes" style="min-height:56px">' + esc(v("notes")) + '</textarea></div>' +
    '</div>' +
    foot(p ? "Save" : "Add provider",
         p ? '<button class="btn btn-danger" id="vDel">Remove</button>' : ""), { wide:true });

  $("#vSens").addEventListener("change", e => {
    const crit = e.target.value === "critical";
    $("#lowBox").classList.toggle("hidden", crit);
    $("#critBox").classList.toggle("hidden", !crit);
  });
  $("#vName").focus();

  $("#mSave").onclick = async () => {
    const name = $("#vName").value.trim();
    if (!name) return toast("Give it a name", true);
    const crit = $("#vSens").value === "critical";
    const payload = {
      name, category:$("#vCat").value.trim(), purpose:$("#vPurpose").value.trim(),
      url:$("#vUrl").value.trim(), owner:$("#vOwner").value, plan:$("#vPlan").value.trim(),
      cost_amount:$("#vCost").value, cost_cycle:$("#vCycle").value,
      renewal_date:$("#vRenew").value, account_email:$("#vEmail").value.trim(),
      sensitivity: crit ? "critical" : "low", notes:$("#vNotes").value.trim()
    };
    if (crit){
      payload.vault_location = $("#vVault").value.trim();
      payload.access_note = $("#vAccess").value.trim();
    } else {
      payload.username = $("#vUser").value.trim();
      /* only send the password when one was typed, so saving does not wipe it */
      const s = $("#vSecret").value;
      if (s) payload.secret = s;
    }
    if (p) payload.id = p.id;
    $("#mSave").disabled = true;
    try { await rpc("pm_save_provider", { p_token:TOKEN, p_p:payload, p_actor:ME });
          close(); await refresh(true); toast("Saved"); }
    catch(err){ $("#mSave").disabled = false; fail(err, "Could not save"); }
  };
  if (p) $("#vDel").onclick = async () => {
    if (!confirm("Remove “" + p.name + "” from the stack?")) return;
    try { await rpc("pm_delete_provider", { p_token:TOKEN, p_id:p.id, p_actor:ME });
          close(); await refresh(true); toast("Removed"); }
    catch(err){ fail(err, "Could not remove"); }
  };
}

/* ---------------- phase ---------------- */
function openPhase(key){
  const f = byKey(DATA.phases, "key")[key];
  if (!f) return;
  const v = (k, dflt) => (f[k] != null ? f[k] : (dflt ?? ""));
  const open = DATA.tasks.filter(t => t.phase_key === key && isOpen(t)).length;
  const closed = f.ends && f.ends < todayISO();

  const close = modal(
    head("Edit phase", f.key) +
    '<div class="modal-body">' +
      '<div class="field"><label for="fName">Name</label>' +
        '<input class="input" id="fName" value="' + esc(v("name")) + '"></div>' +
      '<div class="field"><label for="fTheme">Theme</label>' +
        '<input class="input" id="fTheme" value="' + esc(v("theme")) + '" placeholder="Stabilize + listen"></div>' +
      '<div class="grid2">' +
        '<div class="field"><label for="fStarts">Starts</label>' +
          '<input class="input" id="fStarts" type="date" value="' + esc(v("starts")) + '"></div>' +
        '<div class="field"><label for="fEnds">Ends</label>' +
          '<input class="input" id="fEnds" type="date" value="' + esc(v("ends")) + '"></div>' +
      '</div>' +
      '<div class="field"><label for="fCrit">Success criteria</label>' +
        '<textarea class="input" id="fCrit" style="min-height:60px">' + esc(v("success_criteria")) + '</textarea></div>' +
      '<div class="field"><label for="fVerdict">Verdict' +
        (closed ? '' : ' <span class="hint" style="display:inline">· write this when the window closes</span>') +
        '</label><textarea class="input" id="fVerdict" style="min-height:60px" placeholder="Did we hit it? Say so plainly.">' +
        esc(v("verdict")) + '</textarea></div>' +
      (closed && open
        ? '<div class="flag warn" style="margin:0"><span class="fi">◆</span><div>' + open +
          ' task' + (open===1?"":"s") + ' still open in a closed window. Moving the end date forward ' +
          'is a re-plan; moving the tasks to a live phase is a tidy-up. Prefer whichever is actually true.' +
          '</div></div>'
        : '') +
    '</div>' +
    foot("Save phase"));

  $("#fName").focus();
  $("#mSave").onclick = async () => {
    const payload = { key:f.key, name:$("#fName").value.trim(), theme:$("#fTheme").value.trim(),
                      starts:$("#fStarts").value, ends:$("#fEnds").value,
                      success_criteria:$("#fCrit").value.trim(), verdict:$("#fVerdict").value.trim() };
    if (!payload.name) return toast("Give the phase a name", true);
    $("#mSave").disabled = true;
    try { await rpc("pm_save_phase", { p_token:TOKEN, p_phase:payload, p_actor:ME });
          close(); await refresh(true); toast("Phase saved"); }
    catch(err){ $("#mSave").disabled = false; fail(err, "Could not save"); }
  };
}

/* ---------------- file / asset ---------------- */
function openAsset(id){
  const a = id ? (DATA.assets||[]).find(x => x.id === id) : null;
  const v = (k, dflt) => (a && a[k] != null ? a[k] : (dflt ?? ""));
  const KINDS = ["logo","image","document","video","template","folder","link","file"];
  const cats = uniq((DATA.assets||[]).map(x => x.category).filter(Boolean));

  const close = modal(
    head(a ? "Edit file" : "Add a file") +
    '<div class="modal-body">' +
      '<div class="grid2">' +
        '<div class="field"><label for="aName">Name</label>' +
          '<input class="input" id="aName" value="' + esc(v("name")) + '" placeholder="Instagram post templates"></div>' +
        '<div class="field"><label for="aCat">Category</label>' +
          '<input class="input" id="aCat" value="' + esc(v("category")) + '" list="aCats" placeholder="Social">' +
          '<datalist id="aCats">' + cats.map(x => '<option value="' + esc(x) + '">').join("") + '</datalist></div>' +
      '</div>' +
      '<div class="grid2">' +
        '<div class="field"><label for="aKind">Kind</label><select class="input" id="aKind">' +
          selOpts(KINDS, v("kind","file")) + '</select></div>' +
        '<div class="field"><label for="aOwner">Owner</label><select class="input" id="aOwner">' +
          selOpts(DATA.people.filter(p => p.active).map(p => p.name), v("owner"), "Not set") + '</select></div>' +
      '</div>' +
      '<div class="field"><label for="aUrl">Link</label>' +
        '<input class="input" id="aUrl" value="' + esc(v("url")) + '" placeholder="https://drive.google.com/…">' +
        '<span class="hint">This page is a registry, not storage. Upload the file somewhere the ' +
        'team can reach · Drive is already paid for · and paste the link here.</span></div>' +
      '<div class="field"><label for="aLoc">Where it is, if there is no link yet</label>' +
        '<input class="input" id="aLoc" value="' + esc(v("location")) + '" placeholder="Todo Branding › LOGOS"></div>' +
      '<div class="field"><label for="aDesc">What it is</label>' +
        '<textarea class="input" id="aDesc" style="min-height:56px">' + esc(v("description")) + '</textarea></div>' +
    '</div>' +
    foot(a ? "Save" : "Add file",
         a ? '<button class="btn btn-danger" id="aDel">Remove</button>' : ""));

  $("#aName").focus();
  $("#mSave").onclick = async () => {
    const name = $("#aName").value.trim();
    if (!name) return toast("Give it a name", true);
    const payload = { name, category:$("#aCat").value.trim(), kind:$("#aKind").value,
                      url:$("#aUrl").value.trim(), location:$("#aLoc").value.trim(),
                      description:$("#aDesc").value.trim(), owner:$("#aOwner").value };
    if (a) payload.id = a.id;
    $("#mSave").disabled = true;
    try { await rpc("pm_save_asset", { p_token:TOKEN, p_a:payload, p_actor:ME });
          close(); await refresh(true); toast("Saved"); }
    catch(err){ $("#mSave").disabled = false; fail(err, "Could not save"); }
  };
  if (a) $("#aDel").onclick = async () => {
    if (!confirm("Remove “" + a.name + "” from the list? The file itself is untouched.")) return;
    try { await rpc("pm_delete_asset", { p_token:TOKEN, p_id:a.id, p_actor:ME });
          close(); await refresh(true); toast("Removed"); }
    catch(err){ fail(err, "Could not remove"); }
  };
}
