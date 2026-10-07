
/* ============================================================
   ADS  ·  the whiteboard
   A campaign is a wall. Every ad on it is a card that moves left
   to right as it gets realer: an idea, a draft, ready, running,
   stopped. Anyone can pin one up, and every card and every note
   carries a name and a time, so the wall reads as a conversation
   rather than a filing cabinet.

   The picture on a card is a small reference image kept in the
   database. Finished creatives belong in the Azure container and
   are linked from the card: see CONTEXT.md section 6.
   ============================================================ */
const AD_STAGES = [
  { k:"idea",     label:"Idea",     sub:"a thought, nothing written", tone:"mute" },
  { k:"drafting", label:"Drafting", sub:"copy and visual being made", tone:"warn" },
  { k:"ready",    label:"Ready",    sub:"could go live today",        tone:"ok"   },
  { k:"live",     label:"Running",  sub:"out in the world",           tone:"ok"   },
  { k:"killed",   label:"Stopped",  sub:"kept so we remember why",    tone:"mute" }
];
const AD_FORMATS   = ["Static","Story","Reel","Feed post","Video","Carousel","Text only"];
const AD_PLATFORMS = ["Meta","Instagram","Google","Reddit","TikTok","YouTube","Email","Other"];
const CAMPAIGN_STATUS = [
  { k:"draft",  t:"Planning" },
  { k:"live",   t:"Running"  },
  { k:"paused", t:"Paused"   },
  { k:"done",   t:"Finished" }
];
const LOOSE = "loose";          // the board for ads that belong to no campaign

function campaignsAll(){ return (DATA.campaigns || []).slice(); }
function adsOf(id){
  return (DATA.ads || []).filter(a => id === LOOSE ? !a.campaign_id : a.campaign_id === id);
}
function notesOf(adId, campaignId){
  return (DATA.ad_notes || []).filter(n =>
    adId ? n.ad_id === adId : (n.campaign_id === campaignId && !n.ad_id));
}
function stageMeta(k){ return AD_STAGES.find(s => s.k === k) || AD_STAGES[0]; }
function money(n, cur){
  if (n == null || n === "") return "";
  const sym = cur === "USD" ? "$" : cur === "GBP" ? "£" : "€";
  return sym + Number(n).toLocaleString();
}

/* ---- the pictures, fetched one campaign at a time so pm_bootstrap stays small ---- */
const AD_SHOTS = {};
const AD_SHOTS_ASKED = new Set();
async function ensureAdShots(ids){
  const want = ids.filter(id => !(id in AD_SHOTS) && !AD_SHOTS_ASKED.has(id));
  if (!want.length) return;
  want.forEach(id => AD_SHOTS_ASKED.add(id));
  try {
    const got = await rpc("pm_ad_shots", { p_token:TOKEN, p_ids:want });
    Object.assign(AD_SHOTS, got || {});
    want.forEach(id => { if (!(id in AD_SHOTS)) AD_SHOTS[id] = null; });
    render();
  } catch(err){ want.forEach(id => AD_SHOTS_ASKED.delete(id)); }
}

/* fit inside a box, keep the shape, small enough to live in a row */
function fitImageDataUrl(file, maxEdge, quality){
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Could not read that file"));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("The browser cannot open that image. JPEG, PNG or WebP."));
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", quality || 0.72));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/* ============================================================
   THE SHELF  ·  every campaign, and the loose ads
   ============================================================ */
function renderAds(){
  const camps = campaignsAll();
  const loose = adsOf(LOOSE);

  let out = '<div class="wrap">' +
    '<div class="panel-head" style="border:none;padding:0 0 6px">' +
      '<h2 style="font-size:17px">Ads</h2>' +
      '<span class="sub">campaigns, and the creative on the wall of each one</span>' +
      '<div class="spacer"></div>' +
      '<button class="btn btn-ghost btn-sm" id="newAd">+ Ad</button>' +
      '<button class="btn btn-primary btn-sm" id="newCampaign">+ Campaign</button>' +
    '</div>' +
    '<p class="note" style="margin:0 0 16px;max-width:700px">A campaign holds the ' +
    'decisions: who it is aimed at, what it costs, when it runs. The wall inside it ' +
    'holds the work: one card per ad, moving right as it gets realer. Pin up a ' +
    'half-thought, somebody else will finish it.</p>';

  if (!camps.length && !loose.length){
    return out + '<div class="empty">No campaigns yet. Start one, or pin a single ad ' +
      'up and give it a campaign later.</div></div>';
  }

  if (camps.length){
    out += '<div class="grid-auto">' + camps.map(campaignCard).join("") + '</div>';
  }
  if (loose.length){
    out += '<div class="section-title">Not in a campaign' +
      '<span class="st-sub">' + loose.length + (loose.length === 1 ? ' ad' : ' ads') + '</span></div>' +
      '<div class="grid-auto">' + campaignCard({ id:LOOSE, name:"Loose ads",
        objective:"Single ads with no campaign behind them yet.", color:"#8A8A8A",
        status:"draft", platform:"" }) + '</div>';
  }
  return out + '</div>';
}

function campaignCard(c){
  const ads = adsOf(c.id);
  const counts = AD_STAGES.map(s => ({ s, n: ads.filter(a => a.stage === s.k).length }));
  const stat = CAMPAIGN_STATUS.find(x => x.k === c.status) || CAMPAIGN_STATUS[0];
  const live = ads.filter(a => a.stage === "live").length;
  const last = ads.map(a => a.updated_at).sort().pop();

  return '<div class="camp" data-camp="' + esc(c.id) + '" style="--gc:' + (c.color || "#EF6E45") + '">' +
    '<div class="camp-top">' +
      '<span class="pill ' + (c.status === "live" ? "ok" : c.status === "paused" ? "warn" : "mute") + '">' +
        esc(stat.t) + '</span>' +
      (c.platform ? '<span class="pill mute">' + esc(c.platform) + '</span>' : '') +
      '<div class="spacer"></div>' +
      (c.owner ? avatar(c.owner, c.owner + " owns this") : "") +
    '</div>' +
    '<h3>' + esc(c.name) + '</h3>' +
    (c.objective ? '<p>' + esc(c.objective) + '</p>' : '') +
    '<div class="camp-bar">' + counts.map(x =>
      '<span class="cb ' + x.s.k + '" style="flex:' + (x.n || 0.08) + '" ' +
      'title="' + x.n + ' ' + esc(x.s.label.toLowerCase()) + '"></span>').join("") + '</div>' +
    '<div class="camp-foot">' +
      '<span class="note">' + ads.length + (ads.length === 1 ? ' ad' : ' ads') +
        (live ? ' · <b style="color:var(--ok)">' + live + ' running</b>' : '') + '</span>' +
      '<div class="spacer"></div>' +
      (c.budget_amount != null ? '<span class="note">' + money(c.budget_amount, c.budget_currency) + '</span>' : '') +
      (c.ends ? '<span class="note">to ' + fmtDate(c.ends) + '</span>' : '') +
      (last && !c.ends ? '<span class="note">' + ago(last) + '</span>' : '') +
    '</div>' +
  '</div>';
}

/* ============================================================
   ONE WALL  ·  lanes you drag across
   ============================================================ */
function renderAdBoard(){
  const id = UI.adCampaign;
  const c = id === LOOSE
    ? { id:LOOSE, name:"Loose ads", color:"#8A8A8A", objective:"Ads with no campaign behind them yet." }
    : (DATA.campaigns || []).find(x => x.id === id);
  if (!c){ UI.adCampaign = null; return renderAds(); }
  const ads = adsOf(c.id);
  const real = id !== LOOSE;
  const stat = CAMPAIGN_STATUS.find(x => x.k === c.status) || CAMPAIGN_STATUS[0];
  const wall = notesOf(null, c.id);

  let out = '<div class="wrap" style="max-width:none">' +
    '<button class="btn btn-ghost btn-sm" data-goview="ads" style="margin-bottom:12px">' +
      '← All campaigns</button>' +
    '<div class="panel" style="border-left:4px solid ' + (c.color || "#EF6E45") + '">' +
      '<div class="panel-head">' +
        '<h3 style="font-size:17px">' + esc(c.name) + '</h3>' +
        (real ? '<span class="pill ' + (c.status === "live" ? "ok" : c.status === "paused" ? "warn" : "mute") +
          '">' + esc(stat.t) + '</span>' : '') +
        (c.platform ? '<span class="pill mute">' + esc(c.platform) + '</span>' : '') +
        '<div class="spacer"></div>' +
        (real ? '<button class="btn btn-ghost btn-sm" id="copyBrief">Copy the brief</button>' : '') +
        (real ? '<button class="btn btn-ghost btn-sm" data-editcamp="' + esc(c.id) + '">Edit</button>' : '') +
        '<button class="btn btn-primary btn-sm" id="newAdHere">+ Ad</button>' +
      '</div>' +
      '<div class="panel-body">' +
        (c.objective ? '<p class="note" style="margin:0 0 10px">' + esc(c.objective) + '</p>' : '') +
        (real ? '<div class="camp-facts">' +
          (c.audience ? '<div><b>Who</b>' + esc(c.audience) + '</div>' : '') +
          (c.budget_amount != null ? '<div><b>Budget</b>' + money(c.budget_amount, c.budget_currency) + '</div>' : '') +
          (c.starts || c.ends ? '<div><b>When</b>' + esc(fmtDate(c.starts)) +
            (c.ends ? ' to ' + esc(fmtDateY(c.ends)) : '') + '</div>' : '') +
          (c.owner ? '<div><b>Owner</b>' + esc(c.owner) + '</div>' : '') +
        '</div>' : '') +
        (c.brief ? '<details class="fold" style="margin:12px 0 0"><summary>The brief</summary>' +
          '<div class="prose" style="margin-top:10px">' + md(c.brief) + '</div></details>' : '') +
      '</div>' +
    '</div>';

  out += '<div class="lanes">' + AD_STAGES.map(s => {
    const got = ads.filter(a => a.stage === s.k);
    return '<div class="lane" data-adrop="' + s.k + '">' +
      '<div class="lane-head"><b>' + esc(s.label) + '</b>' +
        '<span class="count">' + got.length + '</span>' +
        '<small>' + esc(s.sub) + '</small></div>' +
      '<div class="lane-body">' + got.map(adCard).join("") +
        '<button class="lane-add" data-addto="' + s.k + '">+ Pin one up</button>' +
      '</div>' +
    '</div>';
  }).join("") + '</div>';

  /* the wall note: a line about the campaign, not about one ad */
  out += '<div class="section-title">On the wall<span class="st-sub">notes about the campaign itself</span></div>' +
    '<div class="panel" style="max-width:760px"><div class="panel-body">' +
      (wall.length ? '<div class="notes">' + wall.map(noteRow).join("") + '</div>'
                   : '<div class="empty" style="padding:14px">Nothing written here yet.</div>') +
      '<div class="note-add">' +
        '<input class="input" id="wallNote" placeholder="Add a line. It goes up with your name on it.">' +
        '<button class="btn btn-ghost btn-sm" id="wallSend">Pin it</button>' +
      '</div>' +
    '</div></div>';

  return out + '</div>';
}

function noteRow(n){
  return '<div class="nrow">' + avatar(n.author) +
    '<div class="nbody"><b>' + esc(n.author) + '</b> <span class="when">' + ago(n.at) + '</span>' +
    '<p>' + esc(n.body) + '</p></div>' +
    (n.author === ME ? '<button class="nx" data-delnote="' + n.id + '" title="Remove">×</button>' : '') +
  '</div>';
}

function adCard(a){
  const shot = AD_SHOTS[a.id];
  const notes = notesOf(a.id).length;
  const f = (DATA.files || []).find(x => x.id === a.file_id);
  return '<div class="adcard" draggable="true" data-ad="' + a.id + '">' +
    (a.has_shot
      ? (shot ? '<img class="adshot" src="' + shot + '" alt="">' : '<div class="adshot ph"></div>')
      : (f && f.thumb_url ? '<img class="adshot" src="' + esc(f.thumb_url) + '" alt="">' : '')) +
    '<div class="adbody">' +
      '<div class="adtop">' +
        (a.format ? '<span class="pill mute">' + esc(a.format) + '</span>' : '') +
        '<div class="spacer"></div>' +
        (a.author ? avatar(a.author, "Pinned up by " + a.author) : "") +
      '</div>' +
      '<h4>' + esc(a.name) + '</h4>' +
      (a.headline ? '<p class="adh">' + esc(a.headline) + '</p>' : '') +
      (a.body ? '<p class="adb">' + esc(a.body.slice(0, 120)) + (a.body.length > 120 ? "…" : "") + '</p>' : '') +
      '<div class="adfoot">' +
        (a.cta ? '<span class="cta">' + esc(a.cta) + '</span>' : '') +
        '<div class="spacer"></div>' +
        (notes ? '<span class="note" title="' + notes + ' notes">● ' + notes + '</span>' : '') +
        '<span class="note">' + ago(a.updated_at) + '</span>' +
      '</div>' +
    '</div>' +
  '</div>';
}

/* ============================================================
   THE CARD, OPENED
   ============================================================ */
function openAd(id, seed){
  const a = id ? (DATA.ads || []).find(x => x.id === id) : null;
  const v = (k, d) => (a && a[k] != null ? a[k] : ((seed && seed[k]) ?? d ?? ""));
  const camps = campaignsAll().map(c => ({ id:c.id, name:c.name }));
  const notes = a ? notesOf(a.id) : [];
  const shot = a && a.has_shot ? AD_SHOTS[a.id] : null;

  const close = modal(
    head(a ? "Ad" : "Pin up an ad", a && a.format) +
    '<div class="modal-body">' +
      '<div class="field"><label for="aName">What is it</label>' +
        '<input class="input" id="aName" value="' + esc(v("name")) + '" ' +
        'placeholder="Sunday night, no plan, 20 minutes"></div>' +
      '<div class="grid3">' +
        '<div class="field"><label for="aCamp">Campaign</label><select class="input" id="aCamp">' +
          selOpts(camps, v("campaign_id"), "No campaign") + '</select></div>' +
        '<div class="field"><label for="aFormat">Format</label><select class="input" id="aFormat">' +
          selOpts(AD_FORMATS, v("format"), "Not set") + '</select></div>' +
        '<div class="field"><label for="aStage">Where it is</label><select class="input" id="aStage">' +
          selOpts(AD_STAGES.map(s => ({ k:s.k, t:s.label })), v("stage","idea")) + '</select></div>' +
      '</div>' +
      '<div class="field"><label for="aHead">The hook</label>' +
        '<input class="input" id="aHead" value="' + esc(v("headline")) + '" ' +
        'placeholder="The line somebody reads first"></div>' +
      '<div class="field"><label for="aBody">The words</label>' +
        '<textarea class="input" id="aBody" style="min-height:96px" ' +
        'placeholder="The body copy, as it would run.">' + esc(v("body")) + '</textarea></div>' +
      '<div class="grid2">' +
        '<div class="field"><label for="aCta">Button</label>' +
          '<input class="input" id="aCta" value="' + esc(v("cta")) + '" placeholder="Get my plan"></div>' +
        '<div class="field"><label for="aOwner">Who is making it</label><select class="input" id="aOwner">' +
          selOpts(DATA.people.filter(p => p.active).map(p => p.name), v("owner"), "Nobody yet") + '</select></div>' +
      '</div>' +
      '<div class="field"><label for="aVisual">The picture, in words</label>' +
        '<textarea class="input" id="aVisual" style="min-height:62px" ' +
        'placeholder="What it should look like, so somebody else could make it.">' + esc(v("visual")) + '</textarea></div>' +

      '<div class="section-title" style="margin:16px 0 8px">The picture</div>' +
      '<div class="adshot-edit">' +
        '<div class="adshot-box" id="aShotBox">' +
          (shot ? '<img src="' + shot + '" alt="">' :
           a && a.has_shot ? '<span class="note">loading</span>' :
           '<span class="note">No picture</span>') +
        '</div>' +
        '<div style="flex:1;min-width:200px">' +
          '<input type="file" id="aShotFile" accept="image/png,image/jpeg,image/webp" hidden>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">' +
            '<button class="btn btn-ghost btn-sm" id="aShotPick"' + (a ? '' : ' disabled') + '>' +
              'Choose a picture</button>' +
            (a && a.has_shot ? '<button class="btn btn-ghost btn-sm" id="aShotDrop">Remove it</button>' : '') +
          '</div>' +
          '<span class="hint">' + (a
            ? 'A reference to think with: it is shrunk to 560px and kept in the database, ' +
              'behind the passcode. The finished creative belongs in the brand container, ' +
              'and goes on the card as a link below.'
            : 'Save the card first, then you can put a picture on it.') + '</span>' +
        '</div>' +
      '</div>' +

      '<div class="grid2" style="margin-top:14px">' +
        '<div class="field"><label for="aLink">Where it points</label>' +
          '<input class="input" id="aLink" value="' + esc(v("link_url")) + '" placeholder="https://goprep…"></div>' +
        '<div class="field"><label for="aRef">Reference or asset</label>' +
          '<input class="input" id="aRef" value="' + esc(v("ref_url")) + '" ' +
          'placeholder="a link to the file, or the ad that inspired it"></div>' +
      '</div>' +

      (a ? '<div class="section-title" style="margin:18px 0 8px">What people said</div>' +
        (notes.length ? '<div class="notes">' + notes.map(noteRow).join("") + '</div>'
                      : '<div class="empty" style="padding:12px">Nothing yet.</div>') +
        '<div class="note-add">' +
          '<input class="input" id="adNote" placeholder="Say what you think. Your name goes on it.">' +
          '<button class="btn btn-ghost btn-sm" id="adNoteSend">Add</button>' +
        '</div>' : '') +
    '</div>' +
    '<div class="modal-foot">' +
      (a ? '<button class="btn btn-danger" id="aDel">Take it down</button>' : '') +
      (a ? '<button class="btn btn-ghost" id="aTask">Make it a task</button>' : '') +
      '<div class="spacer"></div>' +
      '<button class="btn btn-ghost" id="mCancel">Cancel</button>' +
      '<button class="btn btn-primary" id="mSave">' + (a ? "Save" : "Pin it up") + '</button>' +
    '</div>', { wide:true });

  $("#aName").focus();
  if (a && a.has_shot && !shot) ensureAdShots([a.id]);

  $("#mSave").onclick = async () => {
    const name = $("#aName").value.trim();
    if (!name) return toast("Give the card a name", true);
    const payload = { name, campaign_id:$("#aCamp").value, format:$("#aFormat").value,
                      stage:$("#aStage").value, headline:$("#aHead").value.trim(),
                      body:$("#aBody").value.trim(), cta:$("#aCta").value.trim(),
                      visual:$("#aVisual").value.trim(), owner:$("#aOwner").value,
                      link_url:$("#aLink").value.trim(), ref_url:$("#aRef").value.trim() };
    if (a) payload.id = a.id;
    $("#mSave").disabled = true;
    try {
      const row = await rpc("pm_save_ad", { p_token:TOKEN, p_ad:payload, p_actor:ME });
      close(); await refresh(true);
      if (!a && row && row.id) openAd(row.id);
      toast(a ? "Saved" : "Up on the wall");
    } catch(err){ $("#mSave").disabled = false; fail(err, "Could not save"); }
  };

  if (a){
    const pick = $("#aShotPick"), file = $("#aShotFile");
    pick.onclick = () => file.click();
    file.onchange = async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      pick.disabled = true; pick.textContent = "Shrinking…";
      try {
        const url = await fitImageDataUrl(f, 560, 0.72);
        if (url.length > 220000) throw new Error("Still too big after shrinking. Try a smaller picture.");
        await rpc("pm_set_ad_shot", { p_token:TOKEN, p_ad_id:a.id, p_data:url, p_actor:ME });
        AD_SHOTS[a.id] = url;
        close(); await refresh(true); openAd(a.id);
        toast("Picture on the card");
      } catch(err){
        pick.disabled = false; pick.textContent = "Choose a picture";
        toast(err.message, true);
      }
    };
    const drop = $("#aShotDrop");
    if (drop) drop.onclick = async () => {
      try {
        await rpc("pm_set_ad_shot", { p_token:TOKEN, p_ad_id:a.id, p_data:null, p_actor:ME });
        delete AD_SHOTS[a.id]; AD_SHOTS_ASKED.delete(a.id);
        close(); await refresh(true); openAd(a.id); toast("Picture removed");
      } catch(err){ fail(err, "Could not remove it"); }
    };

    const send = async () => {
      const body = $("#adNote").value.trim();
      if (!body) return;
      try {
        await rpc("pm_add_ad_note", { p_token:TOKEN, p_ad_id:a.id, p_campaign_id:null,
                                      p_body:body, p_actor:ME });
        close(); await refresh(true); openAd(a.id);
      } catch(err){ fail(err, "Could not add that"); }
    };
    $("#adNoteSend").onclick = send;
    $("#adNote").addEventListener("keydown", e => { if (e.key === "Enter") send(); });
    $$("[data-delnote]").forEach(el => el.onclick = async () => {
      try { await rpc("pm_delete_ad_note", { p_token:TOKEN, p_id:Number(el.dataset.delnote), p_actor:ME });
            close(); await refresh(true); openAd(a.id); }
      catch(err){ fail(err, "Could not remove that"); }
    });

    $("#aDel").onclick = async () => {
      if (!confirm("Take “" + a.name + "” off the wall?")) return;
      try { await rpc("pm_delete_ad", { p_token:TOKEN, p_id:a.id, p_actor:ME });
            close(); await refresh(true); toast("Taken down"); }
      catch(err){ fail(err, "Could not remove it"); }
    };
    $("#aTask").onclick = () => {
      close();
      openTask(null, { title:"Make the ad: " + a.name,
        description:[a.headline, a.body, a.visual].filter(Boolean).join("\n\n") });
    };
  }
}

function openCampaign(id){
  const c = id ? (DATA.campaigns || []).find(x => x.id === id) : null;
  const v = (k, d) => (c && c[k] != null ? c[k] : (d ?? ""));
  const close = modal(
    head(c ? "Campaign" : "New campaign") +
    '<div class="modal-body">' +
      '<div class="field"><label for="cName">Campaign</label>' +
        '<input class="input" id="cName" value="' + esc(v("name")) + '" ' +
        'placeholder="January, the people who already cook"></div>' +
      '<div class="field"><label for="cObj">What it is for</label>' +
        '<input class="input" id="cObj" value="' + esc(v("objective")) + '" ' +
        'placeholder="One line. What changes if this works."></div>' +
      '<div class="field"><label for="cAud">Who it is aimed at</label>' +
        '<textarea class="input" id="cAud" style="min-height:58px" ' +
        'placeholder="The archetype, in your own words.">' + esc(v("audience")) + '</textarea></div>' +
      '<div class="grid3">' +
        '<div class="field"><label for="cPlat">Where</label><select class="input" id="cPlat">' +
          selOpts(AD_PLATFORMS, v("platform"), "Not set") + '</select></div>' +
        '<div class="field"><label for="cStatus">Status</label><select class="input" id="cStatus">' +
          selOpts(CAMPAIGN_STATUS, v("status","draft")) + '</select></div>' +
        '<div class="field"><label for="cOwner">Owner</label><select class="input" id="cOwner">' +
          selOpts(DATA.people.filter(p => p.active).map(p => p.name), v("owner", ME), "Not set") + '</select></div>' +
      '</div>' +
      '<div class="grid3">' +
        '<div class="field"><label for="cBudget">Budget</label>' +
          '<input class="input" id="cBudget" type="number" step="any" value="' + esc(v("budget_amount")) + '"></div>' +
        '<div class="field"><label for="cStarts">Starts</label>' +
          '<input class="input" id="cStarts" type="date" value="' + esc(v("starts")) + '"></div>' +
        '<div class="field"><label for="cEnds">Ends</label>' +
          '<input class="input" id="cEnds" type="date" value="' + esc(v("ends")) + '"></div>' +
      '</div>' +
      '<div class="field" style="flex:1;display:flex;flex-direction:column;min-height:0">' +
        '<label for="cBrief">The brief <span class="hint" style="display:inline">' +
        'Everything a designer or a writer would need. This is what Copy the brief sends them.</span></label>' +
        mdField("cBrief", v("brief"), "The argument, the proof, the tone, the thing to avoid.") +
      '</div>' +
    '</div>' +
    foot(c ? "Save campaign" : "Create campaign",
         c ? '<button class="btn btn-danger" id="cDel">Archive</button>' : ""),
    { wide:true, tall:true });
  wireMd("cBrief");
  $("#cName").focus();

  $("#mSave").onclick = async () => {
    const name = $("#cName").value.trim();
    if (!name) return toast("Give the campaign a name", true);
    const payload = { name, objective:$("#cObj").value.trim(), audience:$("#cAud").value.trim(),
                      platform:$("#cPlat").value, status:$("#cStatus").value, owner:$("#cOwner").value,
                      budget_amount:$("#cBudget").value, starts:$("#cStarts").value,
                      ends:$("#cEnds").value, brief:$("#cBrief").value };
    if (c) payload.id = c.id;
    $("#mSave").disabled = true;
    try {
      const row = await rpc("pm_save_campaign", { p_token:TOKEN, p_c:payload, p_actor:ME });
      close(); await refresh(true);
      if (!c && row && row.id){ UI.adCampaign = row.id; store.set("gp_adcamp", row.id); goView("ad-board"); }
      toast(c ? "Saved" : "Campaign started");
    } catch(err){ $("#mSave").disabled = false; fail(err, "Could not save"); }
  };
  if (c) $("#cDel").onclick = async () => {
    if (!confirm("Archive “" + c.name + "”? Its ads stay, with no campaign.")) return;
    try { await rpc("pm_delete_campaign", { p_token:TOKEN, p_id:c.id, p_actor:ME });
          close(); UI.adCampaign = null; goView("ads"); await refresh(true); toast("Archived"); }
    catch(err){ fail(err, "Could not archive"); }
  };
}

/* ---- what you send somebody who has to make the thing ---- */
function campaignBrief(c){
  const ads = adsOf(c.id);
  const L = [];
  L.push("# " + c.name);
  if (c.objective) L.push("", c.objective);
  const facts = [];
  if (c.platform) facts.push("Where: " + c.platform);
  if (c.budget_amount != null) facts.push("Budget: " + money(c.budget_amount, c.budget_currency));
  if (c.starts || c.ends) facts.push("When: " + fmtDate(c.starts) + (c.ends ? " to " + fmtDateY(c.ends) : ""));
  if (c.owner) facts.push("Owner: " + c.owner);
  if (facts.length) L.push("", facts.join("  ·  "));
  if (c.audience) L.push("", "## Who it is aimed at", "", c.audience);
  if (c.brief) L.push("", "## The brief", "", c.brief);

  AD_STAGES.forEach(s => {
    const got = ads.filter(a => a.stage === s.k);
    if (!got.length) return;
    L.push("", "## " + s.label);
    got.forEach(a => {
      L.push("", "### " + a.name + (a.format ? "  (" + a.format + ")" : ""));
      if (a.headline) L.push("", "Hook: " + a.headline);
      if (a.body) L.push("", a.body);
      if (a.cta) L.push("", "Button: " + a.cta);
      if (a.visual) L.push("", "Picture: " + a.visual);
      if (a.link_url) L.push("", "Points at: " + a.link_url);
      if (a.ref_url) L.push("", "Reference: " + a.ref_url);
      if (a.owner) L.push("", "Making it: " + a.owner);
      const ns = notesOf(a.id);
      if (ns.length) L.push("", ns.map(n => "- " + n.author + ": " + n.body).join("\n"));
    });
  });
  const wall = notesOf(null, c.id);
  if (wall.length) L.push("", "## On the wall", "", wall.map(n => "- " + n.author + ": " + n.body).join("\n"));
  return L.join("\n");
}
