const POSITIONS = ["QB", "RB", "WR", "TE", "DST"];
const TABS = ["ALL", ...POSITIONS];

const COMMENTS_API = "api/comments.php";
const OVERRIDES_API = "api/overrides.php";
const TAGS_API = "api/tags.php";

const DEFAULT_TAGS = [
  { slug: "priority", label: "Priority — really like",           color: "#2ecc71", sort_order: 0, hidden_default: 0 },
  { slug: "like",     label: "Like — if priority not available", color: "#e8c547", sort_order: 1, hidden_default: 0 },
  { slug: "caution",  label: "Like — minor injury, cautious",    color: "#e08a3c", sort_order: 2, hidden_default: 0 },
  { slug: "rookie",   label: "Rookie",                           color: "#1f7a3f", sort_order: 3, hidden_default: 0 },
  { slug: "have",     label: "Have / protected",                 color: "#3d7fe0", sort_order: 4, hidden_default: 0 },
  { slug: "ignore",   label: "Ignore",                           color: "#d9453d", sort_order: 5, hidden_default: 1 },
];

let players = [];
let overrides = {};        // "POS|Player" -> {tag, sort_rank, picked}
let tags = [];             // legend, ordered
let tagMap = {};           // slug -> tag
let commentCounts = {};    // player -> db comment count
let commentsCache = {};

let activeTab = "ALL";
let sortKey = "fps";
let sortDir = -1;
let showHidden = false;
let editMode = false;
let tagFilters = new Set();   // active legend filters (tag slugs); empty = show all
let keepVisible = new Set();  // keys of rows just re-tagged; stay visible until you navigate

function key(p) { return `${p.position}|${p.player}`; }
function ovr(p) { return overrides[key(p)] || {}; }
function tagOf(p) {
  const o = ovr(p);
  return (o.tag !== undefined && o.tag !== null) ? o.tag : p.tag;
}
function rankOf(p) {
  const o = ovr(p);
  return (o.sort_rank !== null && o.sort_rank !== undefined) ? o.sort_rank : null;
}
function tagOrder(slug) {
  const i = tags.findIndex(t => t.slug === slug);
  return i < 0 ? 9999 : i;
}
function isSinglePos() { return POSITIONS.includes(activeTab); }

// ---- tabs ----

function renderTabs() {
  const el = document.getElementById("position-tabs");
  el.innerHTML = TABS.map(t =>
    `<button class="tab ${t === activeTab ? "active" : ""}" data-tab="${t}">${t}</button>`
  ).join("");
  el.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      keepVisible.clear();
      if (!isSinglePos() && sortKey === "rank") { sortKey = "fps"; sortDir = -1; }
      renderTabs();
      renderSortButtons();
      renderTable();
    });
  });
}

// ---- legend ----

function renderLegend() {
  const el = document.getElementById("legend");
  const chips = tags.map(t =>
    `<button class="legend-item ${tagFilters.has(t.slug) ? "active" : ""}" data-slug="${t.slug}" title="Filter by this tag">
       <span class="dot" style="background:${t.color}"></span>${escapeHtml(t.label)}
     </button>`
  ).join("");
  const clear = tagFilters.size
    ? `<button class="legend-clear" id="legend-clear">Clear filter ✕</button>` : "";
  el.innerHTML = chips + clear;

  el.querySelectorAll(".legend-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const slug = btn.dataset.slug;
      if (tagFilters.has(slug)) tagFilters.delete(slug);
      else tagFilters.add(slug);
      keepVisible.clear();
      renderLegend();
      renderTable();
    });
  });
  const cl = document.getElementById("legend-clear");
  if (cl) cl.addEventListener("click", () => { tagFilters.clear(); keepVisible.clear(); renderLegend(); renderTable(); });
}

function renderLegendEditor() {
  const el = document.getElementById("legend-editor");
  el.innerHTML = `
    <div class="legend-editor-rows">
      ${tags.map(t => `
        <div class="legend-edit-row" data-slug="${t.slug}">
          <input type="color" value="${t.color}" class="le-color">
          <input type="text" value="${escapeAttr(t.label)}" class="le-label" maxlength="80">
          <label class="le-hidden"><input type="checkbox" class="le-hidden-cb" ${t.hidden_default ? "checked" : ""}> hide by default</label>
          <button class="le-delete" title="Delete">✕</button>
        </div>
      `).join("")}
    </div>
    <div class="legend-add">
      <input type="color" value="#888888" id="le-new-color">
      <input type="text" placeholder="New label…" id="le-new-label" maxlength="80">
      <button id="le-add-btn">Add tag</button>
    </div>
  `;

  el.querySelectorAll(".legend-edit-row").forEach(row => {
    const slug = row.dataset.slug;
    const color = row.querySelector(".le-color");
    const label = row.querySelector(".le-label");
    const hidden = row.querySelector(".le-hidden-cb");
    const save = () => saveTag({ slug, label: label.value, color: color.value,
                                sort_order: tagOrder(slug), hidden_default: hidden.checked ? 1 : 0 });
    color.addEventListener("change", save);
    label.addEventListener("change", save);
    hidden.addEventListener("change", save);
    row.querySelector(".le-delete").addEventListener("click", () => deleteTag(slug));
  });

  document.getElementById("le-add-btn").addEventListener("click", () => {
    const label = document.getElementById("le-new-label").value.trim();
    const color = document.getElementById("le-new-color").value;
    if (!label) return;
    saveTag({ label, color, sort_order: tags.length, hidden_default: 0 });
  });
}

async function saveTag(payload) {
  // optimistic
  const existing = tags.find(t => t.slug === payload.slug);
  if (existing) {
    Object.assign(existing, payload);
  } else {
    const slug = payload.slug || payload.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    tags.push({ ...payload, slug });
  }
  tags.sort((a, b) => a.sort_order - b.sort_order);
  rebuildTagMap();
  renderLegend(); renderLegendEditor(); renderTable();
  try {
    await fetch(TAGS_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    await loadTags();
    renderLegend(); renderLegendEditor(); renderTable();
  } catch (_) {}
}

async function deleteTag(slug) {
  tags = tags.filter(t => t.slug !== slug);
  rebuildTagMap();
  renderLegend(); renderLegendEditor(); renderTable();
  try { await fetch(`${TAGS_API}?slug=${encodeURIComponent(slug)}`, { method: "DELETE" }); } catch (_) {}
}

function rebuildTagMap() {
  tagMap = {};
  tags.forEach(t => tagMap[t.slug] = t);
}

// ---- sort ----

function renderSortButtons() {
  const el = document.getElementById("sort-buttons");
  const buttons = isSinglePos()
    ? [{ key: "rank", label: "My rank" }, { key: "fps", label: "FPS" }, { key: "auction", label: "AUC$" }, { key: "tag", label: "Color" }]
    : [{ key: "fps", label: "FPS" }, { key: "auction", label: "AUC$" }, { key: "tag", label: "Color" }, { key: "position", label: "Pos" }];
  el.innerHTML = buttons.map(b => `<button class="sort-btn" data-key="${b.key}">${b.label}</button>`).join("");
  el.querySelectorAll(".sort-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (sortKey === btn.dataset.key) sortDir *= -1;
      else { sortKey = btn.dataset.key; sortDir = btn.dataset.key === "rank" ? 1 : -1; }
      keepVisible.clear();
      updateSortButtonState();
      renderTable();
    });
  });
  updateSortButtonState();
}
function updateSortButtonState() {
  document.querySelectorAll(".sort-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.key === sortKey);
    btn.classList.toggle("desc", btn.dataset.key === sortKey && sortDir === -1);
  });
}

// ---- table ----

function fmt(n) {
  if (n === null || n === undefined || n === "") return "–";
  if (typeof n === "number") return Math.round(n).toLocaleString();
  return n;
}
function fmtMoney(n) {
  if (n === null || n === undefined || n === "") return "–";
  return `$${Number(n).toFixed(1)}`;
}

function workingSet() {
  if (activeTab === "ALL") return [...players];
  return players.filter(p => p.position === activeTab);
}

function rowsSorted() {
  const set = workingSet();
  const byFps = [...set].sort((a, b) => (b.fps ?? -Infinity) - (a.fps ?? -Infinity));
  const fpsIndex = new Map(byFps.map((p, i) => [key(p), i]));

  const rows = [...byFps];
  rows.sort((a, b) => {
    let av, bv;
    if (sortKey === "rank") {
      const ra = rankOf(a), rb = rankOf(b);
      av = ra !== null ? ra : 10000 + fpsIndex.get(key(a));
      bv = rb !== null ? rb : 10000 + fpsIndex.get(key(b));
    } else if (sortKey === "tag") {
      av = tagOrder(tagOf(a)); bv = tagOrder(tagOf(b));
    } else if (sortKey === "position") {
      av = POSITIONS.indexOf(a.position); bv = POSITIONS.indexOf(b.position);
    } else {
      av = a[sortKey]; bv = b[sortKey];
      if (av === null || av === undefined) av = -Infinity;
      if (bv === null || bv === undefined) bv = -Infinity;
    }
    if (av < bv) return -1 * sortDir;
    if (av > bv) return 1 * sortDir;
    return fpsIndex.get(key(a)) - fpsIndex.get(key(b));
  });
  return rows;
}

function renderHead() {
  const showPos = !isSinglePos();
  document.getElementById("table-head-row").innerHTML = `
    <th class="drag-col"></th>
    <th>Rk</th>
    ${showPos ? "<th>Pos</th>" : ""}
    <th>Player</th>
    <th class="num">FPS</th>
    <th class="num auc-col">AUC$</th>
  `;
}

function renderTable() {
  if (typeof closeTagMenu === "function") closeTagMenu();
  renderHead();
  const query = document.getElementById("search").value.trim().toLowerCase();
  const body = document.getElementById("ranks-body");
  const showPos = !isSinglePos();
  const canDrag = editMode && isSinglePos() && sortKey === "rank" && sortDir === 1 && !query;

  const rows = rowsSorted().filter(p => {
    const slug = tagOf(p);
    const t = tagMap[slug];
    if (tagFilters.size) {
      if (!tagFilters.has(slug)) return false;   // explicit filter overrides hidden rule
    } else if (!showHidden && !editMode && t && t.hidden_default && !keepVisible.has(key(p))) {
      return false;                              // edit mode / just-tagged keep hidden players visible
    }
    if (!query) return true;
    return p.player.toLowerCase().includes(query) || (p.team || "").toLowerCase().includes(query);
  });

  body.innerHTML = rows.map((p, i) => {
    const t = tagMap[tagOf(p)];
    const chipStyle = t ? `background:${t.color}` : "background:transparent";
    const nComments = commentCounts[p.player] || 0;
    const marker = nComments ? `<span class="note-badge" title="${nComments} note${nComments > 1 ? "s" : ""}">💬 ${nComments}</span>` : "";
    const posBadge = showPos ? `<td><span class="pos-badge">${p.position}</span></td>` : "";
    const inj = injuryDot(p.injury_status);
    const dimmed = (t && t.hidden_default) ? " row-hidden-tag" : "";
    return `
      <tr class="player-row${dimmed}" data-key="${encodeURIComponent(key(p))}" ${canDrag ? 'draggable="true"' : ""}>
        <td class="drag-col">${canDrag ? '<span class="drag-handle">⠿</span>' : ""}</td>
        <td class="rk-cell">${i + 1}</td>
        ${posBadge}
        <td class="player-cell">
          <span class="tag-chip editable" style="${chipStyle}" title="${t ? escapeAttr(t.label) + " — click to change" : "Click to set a tag"}"></span>
          <span class="player-name">${escapeHtml(p.player)}</span>${inj}
          <span class="player-meta">${p.team || ""}${p.bye ? " · BYE " + fmt(p.bye) : ""}</span>
          ${marker}
        </td>
        <td class="num fps-cell">${fmt(p.fps)}</td>
        <td class="num auc-cell auc-col">${fmtMoney(p.auction)}</td>
      </tr>
    `;
  }).join("");

  body.querySelectorAll(".player-row").forEach(row => {
    const k = decodeURIComponent(row.dataset.key);
    const pill = row.querySelector(".tag-chip");
    pill.addEventListener("click", (e) => { e.stopPropagation(); openTagMenu(k, pill); });
    row.addEventListener("click", (e) => {
      if (e.target.closest(".drag-handle")) return;
      openModal(k);
    });
  });

  if (canDrag) setupDrag(body);
}

// ---- editing: tags / picks ----

let tagMenuEl = null;

function closeTagMenu() {
  if (tagMenuEl) { tagMenuEl.remove(); tagMenuEl = null; }
  document.removeEventListener("click", onDocClickForMenu, true);
}
function onDocClickForMenu(e) {
  if (tagMenuEl && !tagMenuEl.contains(e.target)) closeTagMenu();
}

function openTagMenu(k, anchor) {
  closeTagMenu();
  const p = players.find(pl => key(pl) === k);
  if (!p) return;
  const current = tagOf(p);

  const menu = document.createElement("div");
  menu.className = "tag-menu";
  const opts = tags.map(t =>
    `<button class="tag-opt ${t.slug === current ? "current" : ""}" data-slug="${t.slug}">
       <span class="dot" style="background:${t.color}"></span>${escapeHtml(t.label)}
     </button>`
  ).join("");
  menu.innerHTML = `<div class="tag-menu-head">Set tag</div>${opts}
    <button class="tag-opt clear ${!current ? "current" : ""}" data-slug="">
      <span class="dot" style="background:transparent;border:1px solid var(--line)"></span>No tag
    </button>`;
  document.body.appendChild(menu);

  const r = anchor.getBoundingClientRect();
  const mw = 240;
  let left = r.left;
  if (left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
  menu.style.top = `${r.bottom + window.scrollY + 6}px`;
  menu.style.left = `${left + window.scrollX}px`;

  menu.querySelectorAll(".tag-opt").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      setTag(k, btn.dataset.slug || null);
      closeTagMenu();
    });
  });
  tagMenuEl = menu;
  setTimeout(() => document.addEventListener("click", onDocClickForMenu, true), 0);
}

async function setTag(k, slug) {
  const p = players.find(pl => key(pl) === k);
  if (!p) return;
  overrides[k] = { ...ovr(p), tag: slug };
  keepVisible.add(k);   // don't yank the row out from under the click; drops off on next navigation
  renderTable();
  try {
    await fetch(OVERRIDES_API, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ position: p.position, player: p.player, tag: slug }) });
  } catch (_) {}
}

// ---- drag ----

let dragKey = null;
function setupDrag(body) {
  body.querySelectorAll(".player-row").forEach(row => {
    row.addEventListener("dragstart", (e) => {
      dragKey = decodeURIComponent(row.dataset.key);
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => { row.classList.remove("dragging"); dragKey = null; });
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      const dragging = body.querySelector(".dragging");
      if (!dragging || dragging === row) return;
      const rect = row.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      body.insertBefore(dragging, after ? row.nextSibling : row);
    });
  });
  body.addEventListener("drop", saveOrder, { once: true });
}
async function saveOrder(e) {
  e.preventDefault();
  const body = document.getElementById("ranks-body");
  const orderKeys = [...body.querySelectorAll(".player-row")].map(r => decodeURIComponent(r.dataset.key));
  const orderPlayers = orderKeys.map(k => players.find(p => key(p) === k)).filter(Boolean);
  orderPlayers.forEach((p, i) => { overrides[key(p)] = { ...ovr(p), sort_rank: i }; });
  renderTable();
  try {
    await fetch(OVERRIDES_API, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ position: activeTab, order: orderPlayers.map(p => p.player) }) });
  } catch (_) {}
}

// ---- injury status ----

const INJURY = {
  Out:          { cls: "inj-out",   label: "Out" },
  IR:           { cls: "inj-out",   label: "IR" },
  PUP:          { cls: "inj-out",   label: "PUP" },
  Doubtful:     { cls: "inj-out",   label: "Doubtful" },
  Questionable: { cls: "inj-warn",  label: "Questionable" },
  Sus:          { cls: "inj-warn",  label: "Suspended" },
};
function injuryDot(status) {
  const i = INJURY[status];
  if (!i) return "";
  return `<span class="inj-dot ${i.cls}" title="${i.label}"></span>`;
}

// ---- snapshot modal ----

const modal = document.getElementById("comment-modal");
let activeKey = null;
const STAT_ORDER_HINT = ["Pass Yds","Pass TD","INT","Rush Yds","Rush TD","Tgt","Rec","Rec Yds","Rec TD","PPR"];

function heightStr(inches) {
  const n = parseInt(inches, 10);
  if (!n) return null;
  return `${Math.floor(n / 12)}'${n % 12}"`;
}

function openModal(k) {
  activeKey = k;
  const p = players.find(pl => key(pl) === k);
  if (!p) return;

  // header: photo, name, pos/team/#, bio
  const photo = document.getElementById("snap-photo");
  if (p.headshot) { photo.src = p.headshot; photo.hidden = false; photo.onerror = () => { photo.hidden = true; }; }
  else photo.hidden = true;

  document.getElementById("modal-player-name").innerHTML = escapeHtml(p.player) + injuryDot(p.injury_status);
  const num = p.bio && p.bio.number ? ` · #${p.bio.number}` : "";
  document.getElementById("modal-player-sub").textContent =
    `${p.position}${p.team ? " · " + p.team : ""}${num}${p.bye ? " · BYE " + p.bye : ""}`;

  const bio = p.bio || {};
  const bioBits = [];
  if (bio.college) bioBits.push(bio.college);
  if (bio.years_exp != null) bioBits.push(bio.years_exp === 0 ? "Rookie" : `${bio.years_exp} yr exp`);
  const h = heightStr(bio.height);
  if (h && bio.weight) bioBits.push(`${h}, ${bio.weight} lb`);
  if (bio.age) bioBits.push(`Age ${bio.age}`);
  const injLabel = INJURY[p.injury_status];
  if (injLabel) bioBits.push(`⚠ ${injLabel.label}`);
  document.getElementById("snap-bio").textContent = bioBits.join("  ·  ");

  // stat tiles: rank, ADP, AUC$, FPS + projections
  const tiles = [];
  tiles.push(tile("Proj Rank", `${p.position}${(rankOf(p) !== null ? Math.round(rankOf(p)) + 1 : posRankByFps(p))}`));
  if (p.adp != null) tiles.push(tile("ADP", p.adp));
  if (p.auction != null) tiles.push(tile("AUC$", fmtMoney(p.auction)));
  tiles.push(tile("Proj FPS", fmt(p.fps), true));
  const stats = p.stats || {};
  Object.entries(stats).sort((a, b) => {
    const ia = STAT_ORDER_HINT.indexOf(a[0]), ib = STAT_ORDER_HINT.indexOf(b[0]);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  }).forEach(([label, val]) => tiles.push(tile(label, fmt(val))));
  document.getElementById("modal-stats").innerHTML = tiles.join("");

  renderCareer(p);
  document.getElementById("comment-error").classList.add("hidden");
  document.getElementById("comment-form").reset();
  modal.classList.remove("hidden");
  loadSummary(p);
  loadComments(p);
  loadNews(p);
}

async function loadSummary(p) {
  const wrap = document.getElementById("snap-summary-wrap");
  const el = document.getElementById("snap-summary");
  if (!p.rtsports_pid) { wrap.classList.add("hidden"); return; }
  wrap.classList.remove("hidden");
  el.innerHTML = `<div class="comment-empty">Loading outlook…</div>`;
  document.getElementById("snap-summary-link").href =
    `https://www.freedraftguide.com/football/draft-guide-player.php?PID=${encodeURIComponent(p.rtsports_pid)}`;
  try {
    const res = await fetch(`api/summary.php?pid=${encodeURIComponent(p.rtsports_pid)}`);
    if (!res.ok) throw new Error();
    const d = await res.json();
    const parts = [];
    if (d.outlook) parts.push(`<p class="summary-para">${escapeHtml(d.outlook)}</p>`);
    if (d.summary) parts.push(`<p class="summary-para muted">${escapeHtml(d.summary)}</p>`);
    if (!parts.length) { wrap.classList.add("hidden"); return; }
    el.innerHTML = parts.join("") +
      `<div class="summary-attr">Data via <a href="https://www.rtsports.com" target="_blank" rel="noopener noreferrer">RTSports.com</a></div>`;
  } catch (_) {
    wrap.classList.add("hidden");
  }
}

function tile(label, value, hero) {
  return `<div class="stat-box${hero ? " hero" : ""}"><div class="stat-label">${escapeHtml(label)}</div><div class="stat-value">${value}</div></div>`;
}

function posRankByFps(p) {
  const list = players.filter(x => x.position === p.position)
    .sort((a, b) => (b.fps ?? -Infinity) - (a.fps ?? -Infinity));
  return list.findIndex(x => key(x) === key(p)) + 1;
}

function renderCareer(p) {
  const wrap = document.getElementById("snap-career-wrap");
  const career = p.career || [];
  if (!career.length) { wrap.classList.add("hidden"); return; }
  wrap.classList.remove("hidden");
  const statKeys = Object.keys(career[0].stats);
  const head = `<tr><th>Year</th><th>Tm</th><th class="num">G</th>${statKeys.map(s => `<th class="num">${escapeHtml(s)}</th>`).join("")}</tr>`;
  const rows = career.map(c =>
    `<tr><td>${c.season}</td><td>${c.team || "–"}</td><td class="num">${c.games}</td>${statKeys.map(s => `<td class="num">${fmt(c.stats[s])}</td>`).join("")}</tr>`
  ).join("");
  document.getElementById("snap-career").innerHTML = head + rows;
}

async function loadNews(p) {
  const wrap = document.getElementById("snap-news-wrap");
  const el = document.getElementById("snap-news");
  wrap.classList.remove("hidden");
  el.innerHTML = `<div class="comment-empty">Loading news…</div>`;
  try {
    const eid = p.espn_id ? `&espn_id=${encodeURIComponent(p.espn_id)}` : "";
    const res = await fetch(`api/news.php?player=${encodeURIComponent(p.player)}${eid}`);
    if (!res.ok) throw new Error();
    const items = (await res.json()).news || [];
    if (!items.length) { el.innerHTML = `<div class="comment-empty">No recent analysis for ${escapeHtml(p.player)}.</div>`; return; }
    el.innerHTML = items.map(n => `
      <a class="news-item" href="${escapeAttr(n.link)}" target="_blank" rel="noopener noreferrer">
        <div class="news-title">${escapeHtml(n.title)}</div>
        ${n.summary ? `<div class="news-summary">${escapeHtml(n.summary)}</div>` : ""}
        <div class="news-meta">${escapeHtml(n.source)}${n.date ? " · " + fmtDate(n.date) : ""} ↗</div>
      </a>`).join("");
  } catch (_) {
    el.innerHTML = `<div class="comment-empty">Couldn't load news right now.</div>`;
  }
}

function closeModal() { modal.classList.add("hidden"); activeKey = null; }
document.getElementById("modal-close").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

function fmtDate(s) {
  const d = new Date((s || "").replace(" ", "T"));
  if (isNaN(d)) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ", " +
         d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function renderComments(list) {
  const el = document.getElementById("modal-comments");
  if (!list || list.length === 0) { el.innerHTML = `<div class="comment-empty">No notes yet.</div>`; return; }
  el.innerHTML = list.map(c => `
    <div class="comment-item" data-id="${c.id}">
      <div class="comment-top">
        <span class="comment-meta"><span class="comment-author">${escapeHtml(c.author)}</span> · ${fmtDate(c.created_at)}</span>
        <span class="comment-actions">
          <button class="comment-act edit" data-id="${c.id}">Edit</button>
          <button class="comment-act del" data-id="${c.id}">Delete</button>
        </span>
      </div>
      <div class="comment-body">${escapeHtml(c.text)}</div>
    </div>`).join("");

  el.querySelectorAll(".comment-act.edit").forEach(b => b.addEventListener("click", () => startEditComment(+b.dataset.id)));
  el.querySelectorAll(".comment-act.del").forEach(b => b.addEventListener("click", () => deleteComment(+b.dataset.id)));
}

function escapeHtml(str) { const d = document.createElement("div"); d.textContent = str == null ? "" : str; return d.innerHTML; }
function escapeAttr(str) { return escapeHtml(str).replace(/"/g, "&quot;"); }

async function loadComments(p) {
  const el = document.getElementById("modal-comments");
  el.innerHTML = `<div class="comment-empty">Loading…</div>`;
  try {
    const res = await fetch(`${COMMENTS_API}?player=${encodeURIComponent(p.player)}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    commentsCache[p.player] = data.comments || [];
    commentCounts[p.player] = commentsCache[p.player].length;
    renderComments(commentsCache[p.player]);
    renderTable();
  } catch (_) {
    el.innerHTML = `<div class="comment-empty">Couldn't load notes. Is the backend set up yet?</div>`;
  }
}

function currentPlayer() { return players.find(pl => key(pl) === activeKey); }

function startEditComment(id) {
  const p = currentPlayer(); if (!p) return;
  const c = (commentsCache[p.player] || []).find(x => +x.id === id);
  if (!c) return;
  const item = document.querySelector(`.comment-item[data-id="${id}"]`);
  const body = item.querySelector(".comment-body");
  body.innerHTML = `
    <textarea class="comment-edit-area" maxlength="1000">${escapeHtml(c.text)}</textarea>
    <div class="comment-form-actions" style="margin-top:8px">
      <button class="comment-act edit-save" data-id="${id}" style="color:var(--brand)">Save</button>
      <button class="comment-act edit-cancel">Cancel</button>
    </div>`;
  body.querySelector(".edit-save").addEventListener("click", () => saveEditComment(id, body.querySelector(".comment-edit-area").value));
  body.querySelector(".edit-cancel").addEventListener("click", () => renderComments(commentsCache[p.player]));
  body.querySelector(".comment-edit-area").focus();
}

async function saveEditComment(id, text) {
  const p = currentPlayer(); if (!p) return;
  text = text.trim(); if (!text) return;
  const c = (commentsCache[p.player] || []).find(x => +x.id === id);
  if (c) c.text = text;
  renderComments(commentsCache[p.player]);
  try {
    await fetch(COMMENTS_API, { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, text }) });
  } catch (_) {}
}

async function deleteComment(id) {
  const p = currentPlayer(); if (!p) return;
  if (!confirm("Delete this note?")) return;
  commentsCache[p.player] = (commentsCache[p.player] || []).filter(x => +x.id !== id);
  commentCounts[p.player] = commentsCache[p.player].length;
  renderComments(commentsCache[p.player]);
  renderTable();
  try { await fetch(`${COMMENTS_API}?id=${id}`, { method: "DELETE" }); } catch (_) {}
}

document.getElementById("comment-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const p = players.find(pl => key(pl) === activeKey);
  if (!p) return;
  const text = document.getElementById("comment-text").value.trim();
  const errEl = document.getElementById("comment-error");
  errEl.classList.add("hidden");
  try {
    const res = await fetch(COMMENTS_API, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player: p.player, text }) });
    if (!res.ok) throw new Error();
    document.getElementById("comment-form").reset();
    loadComments(p);
  } catch (_) {
    errEl.textContent = "Couldn't post your comment. Try again in a bit.";
    errEl.classList.remove("hidden");
  }
});

// ---- controls ----

document.getElementById("search").addEventListener("input", () => { keepVisible.clear(); renderTable(); });
document.getElementById("show-ignored").addEventListener("change", (e) => { showHidden = e.target.checked; keepVisible.clear(); renderTable(); });
document.getElementById("edit-toggle").addEventListener("click", () => {
  editMode = !editMode;
  keepVisible.clear();
  const btn = document.getElementById("edit-toggle");
  btn.classList.toggle("active", editMode);
  btn.textContent = editMode ? "Done" : "Edit";
  document.getElementById("edit-hint").classList.toggle("hidden", !editMode);
  document.body.classList.toggle("edit-mode", editMode);
  renderTable();
});
document.getElementById("legend-edit-toggle").addEventListener("click", () => {
  const ed = document.getElementById("legend-editor");
  const open = ed.classList.toggle("hidden");
  document.getElementById("legend-edit-toggle").textContent = open ? "Edit legend" : "Done editing legend";
  if (!open) renderLegendEditor();
});

// ---- trending ----

const trendModal = document.getElementById("trending-modal");
function closeTrending() { trendModal.classList.add("hidden"); }
document.getElementById("trending-close").addEventListener("click", closeTrending);
trendModal.addEventListener("click", (e) => { if (e.target === trendModal) closeTrending(); });

const playerByName = () => {
  const m = new Map();
  players.forEach(p => { if (!m.has(p.player)) m.set(p.player, p); });
  return m;
};

function renderTrendList(elId, items) {
  const el = document.getElementById(elId);
  const pmap = playerByName();
  if (!items || !items.length) { el.innerHTML = `<div class="comment-empty">No data.</div>`; return; }
  el.innerHTML = items.map(it => {
    const inRanks = pmap.has(it.name);
    return `<div class="trend-row ${inRanks ? "link" : ""}" ${inRanks ? `data-name="${escapeAttr(it.name)}"` : ""}>
        <span class="pos-badge">${it.pos}</span>
        <span class="trend-name">${escapeHtml(it.name)}</span>
        <span class="trend-team">${it.team || ""}</span>
        <span class="trend-count">${(it.count >= 1000 ? (it.count/1000).toFixed(0) + "k" : it.count)}</span>
      </div>`;
  }).join("");
  el.querySelectorAll(".trend-row.link").forEach(r => r.addEventListener("click", () => {
    const p = pmap.get(r.dataset.name);
    if (p) { closeTrending(); openModal(key(p)); }
  }));
}

let trendHours = 24;

async function loadTrending() {
  document.getElementById("trend-up").innerHTML = `<div class="comment-empty">Loading…</div>`;
  document.getElementById("trend-down").innerHTML = "";
  try {
    const res = await fetch(`api/trending.php?hours=${trendHours}`);
    if (!res.ok) throw new Error();
    const d = await res.json();
    renderTrendList("trend-up", d.up);
    renderTrendList("trend-down", d.down);
  } catch (_) {
    document.getElementById("trend-up").innerHTML = `<div class="comment-empty">Couldn't load trending.</div>`;
  }
}

function openTrending() {
  trendModal.classList.remove("hidden");
  loadTrending();
}
document.getElementById("trending-open").addEventListener("click", openTrending);

// ---- latest analysis ----

const latestModal = document.getElementById("latest-modal");
function closeLatest() { latestModal.classList.add("hidden"); }
document.getElementById("latest-close").addEventListener("click", closeLatest);
latestModal.addEventListener("click", (e) => { if (e.target === latestModal) closeLatest(); });

async function openLatest() {
  latestModal.classList.remove("hidden");
  const el = document.getElementById("latest-list");
  el.innerHTML = `<div class="comment-empty">Loading…</div>`;
  try {
    const res = await fetch("api/latest.php");
    if (!res.ok) throw new Error();
    const items = (await res.json()).news || [];
    if (!items.length) { el.innerHTML = `<div class="comment-empty">No notes right now.</div>`; return; }
    el.innerHTML = items.map(n => `
      <a class="news-item" href="${escapeAttr(n.link)}" target="_blank" rel="noopener noreferrer">
        <div class="news-title">${escapeHtml(n.title)}</div>
        ${n.summary ? `<div class="news-summary">${escapeHtml(n.summary)}</div>` : ""}
        <div class="news-meta">${escapeHtml(n.source)}${n.date ? " · " + fmtDate(n.date) : ""} ↗</div>
      </a>`).join("");
  } catch (_) {
    el.innerHTML = `<div class="comment-empty">Couldn't load latest notes.</div>`;
  }
}
document.getElementById("latest-open").addEventListener("click", openLatest);
document.querySelectorAll(".trend-win").forEach(btn => {
  btn.addEventListener("click", () => {
    trendHours = +btn.dataset.hours;
    document.querySelectorAll(".trend-win").forEach(b => b.classList.toggle("active", b === btn));
    loadTrending();
  });
});

// ---- init ----

async function loadTags() {
  try {
    const res = await fetch(TAGS_API);
    if (!res.ok) throw new Error();
    const data = await res.json();
    tags = (data.tags && data.tags.length) ? data.tags : DEFAULT_TAGS.slice();
  } catch (_) { tags = DEFAULT_TAGS.slice(); }
  tags.sort((a, b) => a.sort_order - b.sort_order);
  rebuildTagMap();
}
async function loadOverrides() {
  try {
    const res = await fetch(OVERRIDES_API);
    if (!res.ok) return;
    overrides = (await res.json()).overrides || {};
  } catch (_) { overrides = {}; }
}
async function loadCounts() {
  try {
    const res = await fetch(`${COMMENTS_API}?counts=1`);
    if (!res.ok) return;
    commentCounts = (await res.json()).counts || {};
  } catch (_) { commentCounts = {}; }
}

async function init() {
  await loadTags();
  renderTabs();
  renderLegend();
  renderSortButtons();
  const res = await fetch("data/rankings.json");
  players = (await res.json()).players;
  await Promise.all([loadOverrides(), loadCounts()]);
  renderTable();
}

init();
