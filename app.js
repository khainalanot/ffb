const POSITIONS = ["QB", "RB", "WR", "TE", "DST"];
const TABS = ["ALL", ...POSITIONS, "PICKS"];

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
function isPicked(p) { return !!ovr(p).picked; }
function tagOrder(slug) {
  const i = tags.findIndex(t => t.slug === slug);
  return i < 0 ? 9999 : i;
}
function isSinglePos() { return POSITIONS.includes(activeTab); }

// ---- tabs ----

function renderTabs() {
  const el = document.getElementById("position-tabs");
  el.innerHTML = TABS.map(t => {
    const label = t === "PICKS" ? "★ Picks" : t;
    return `<button class="tab ${t === activeTab ? "active" : ""}" data-tab="${t}">${label}</button>`;
  }).join("");
  el.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      if (!isSinglePos() && sortKey === "rank") { sortKey = "fps"; sortDir = -1; }
      renderTabs();
      renderSortButtons();
      renderTable();
    });
  });
}

// ---- legend ----

function renderLegend() {
  document.getElementById("legend").innerHTML = tags.map(t =>
    `<div class="legend-item"><span class="dot" style="background:${t.color}"></span>${escapeHtml(t.label)}</div>`
  ).join("");
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
  if (activeTab === "PICKS") return players.filter(isPicked);
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
    <th>RK</th>
    ${showPos ? "<th>POS</th>" : ""}
    <th>Player</th>
    <th>FPS</th>
    <th>AUC$</th>
  `;
}

function renderTable() {
  renderHead();
  const query = document.getElementById("search").value.trim().toLowerCase();
  const body = document.getElementById("ranks-body");
  const showPos = !isSinglePos();
  const canDrag = editMode && isSinglePos() && sortKey === "rank" && sortDir === 1 && !query;

  const rows = rowsSorted().filter(p => {
    const t = tagMap[tagOf(p)];
    if (!showHidden && t && t.hidden_default) return false;
    if (!query) return true;
    return p.player.toLowerCase().includes(query) || (p.team || "").toLowerCase().includes(query);
  });

  body.innerHTML = rows.map((p, i) => {
    const t = tagMap[tagOf(p)];
    const dotStyle = t ? `background:${t.color}` : "background:transparent;border:1px solid var(--border)";
    const nComments = (p.excel_comment ? 1 : 0) + (commentCounts[p.player] || 0);
    const marker = nComments ? `<span class="note-badge" title="${nComments} comment${nComments > 1 ? "s" : ""}">💬 ${nComments}</span>` : "";
    const picked = isPicked(p);
    const star = (editMode || picked)
      ? `<span class="pick-star ${picked ? "on" : "off"}" title="${picked ? "Remove pick" : "Mark as pick"}">${picked ? "★" : "☆"}</span>`
      : "";
    return `
      <tr class="player-row" data-key="${encodeURIComponent(key(p))}" ${canDrag ? 'draggable="true"' : ""}>
        <td class="drag-col">${canDrag ? '<span class="drag-handle">⠿</span>' : ""}</td>
        <td class="rk-cell">${i + 1}</td>
        ${showPos ? `<td class="pos-cell">${p.position}</td>` : ""}
        <td class="player-cell">
          <span class="tag-pill ${editMode ? "editable" : ""}" style="${dotStyle}" title="${t ? escapeAttr(t.label) : "No tag"}"></span>
          ${star}
          <span class="player-name">${escapeHtml(p.player)}</span>
          <span class="player-meta">${p.team || ""}${p.bye ? " · BYE " + fmt(p.bye) : ""}</span>
          ${marker}
        </td>
        <td>${fmt(p.fps)}</td>
        <td>${fmtMoney(p.auction)}</td>
      </tr>
    `;
  }).join("");

  body.querySelectorAll(".player-row").forEach(row => {
    const k = decodeURIComponent(row.dataset.key);
    const pill = row.querySelector(".tag-pill");
    if (editMode) {
      pill.addEventListener("click", (e) => { e.stopPropagation(); cycleTag(k); });
      const starEl = row.querySelector(".pick-star");
      if (starEl) starEl.addEventListener("click", (e) => { e.stopPropagation(); togglePick(k); });
    }
    row.addEventListener("click", (e) => {
      if (e.target.closest(".drag-handle") || e.target.closest(".pick-star")) return;
      openModal(k);
    });
  });

  if (canDrag) setupDrag(body);
  if (activeTab === "PICKS" && rows.length === 0) {
    body.innerHTML = `<tr><td colspan="6" class="empty-note">No picks yet. Turn on Edit and tap ☆ next to a player to add them.</td></tr>`;
  }
}

// ---- editing: tags / picks ----

async function cycleTag(k) {
  const p = players.find(pl => key(pl) === k);
  if (!p) return;
  const order = [...tags.map(t => t.slug), null];
  const current = tagOf(p);
  const idx = order.indexOf(current ?? null);
  const next = order[(idx + 1) % order.length];
  overrides[k] = { ...ovr(p), tag: next };
  renderTable();
  try {
    await fetch(OVERRIDES_API, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ position: p.position, player: p.player, tag: next }) });
  } catch (_) {}
}

async function togglePick(k) {
  const p = players.find(pl => key(pl) === k);
  if (!p) return;
  const next = !isPicked(p);
  overrides[k] = { ...ovr(p), picked: next ? 1 : 0 };
  renderTable();
  try {
    await fetch(OVERRIDES_API, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ position: p.position, player: p.player, picked: next }) });
  } catch (_) {}
}

// Star is only shown when picked; in edit mode we also need a way to ADD a pick.
// So in edit mode, every row shows a faint ☆ toggle.
function decorateEditStars() { /* handled in renderTable via always-present star in edit mode */ }

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

// ---- modal ----

const modal = document.getElementById("comment-modal");
let activeKey = null;
const STAT_ORDER_HINT = ["Pass Yds","Pass TD","INT","Rush Yds","Rush TD","Tgt","Rec","Rec Yds","Rec TD","PPR"];

function openModal(k) {
  activeKey = k;
  const p = players.find(pl => key(pl) === k);
  if (!p) return;
  document.getElementById("modal-player-name").textContent = p.player;
  document.getElementById("modal-player-sub").textContent =
    `${p.position}${p.team ? " · " + p.team : ""}${p.bye ? " · BYE " + p.bye : ""}`;

  const stats = p.stats || {};
  const entries = Object.entries(stats).sort((a, b) => {
    const ia = STAT_ORDER_HINT.indexOf(a[0]); const ib = STAT_ORDER_HINT.indexOf(b[0]);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const fpsBox = `<div class="stat-box"><div class="stat-label">FPS</div><div class="stat-value">${fmt(p.fps)}</div></div>`;
  const aucBox = p.auction != null ? `<div class="stat-box"><div class="stat-label">AUC$</div><div class="stat-value">${fmtMoney(p.auction)}</div></div>` : "";
  document.getElementById("modal-stats").innerHTML = fpsBox + aucBox + entries.map(([label, val]) =>
    `<div class="stat-box"><div class="stat-label">${escapeHtml(label)}</div><div class="stat-value">${fmt(val)}</div></div>`
  ).join("");

  document.getElementById("comment-error").classList.add("hidden");
  document.getElementById("comment-form").reset();
  modal.classList.remove("hidden");
  loadComments(p);
}
function closeModal() { modal.classList.add("hidden"); activeKey = null; }
document.getElementById("modal-close").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

function renderComments(list) {
  const el = document.getElementById("modal-comments");
  if (!list || list.length === 0) { el.innerHTML = `<div class="comment-empty">No comments yet.</div>`; return; }
  el.innerHTML = list.map(c => `
    <div class="comment-item ${c.pinned ? "pinned" : ""}">
      <div class="comment-meta">${escapeHtml(c.author)}${c.pinned ? ' <span class="from-sheet">from spreadsheet</span>' : " — " + new Date(c.created_at).toLocaleString()}</div>
      <div class="comment-body">${escapeHtml(c.text)}</div>
    </div>`).join("");
}
function escapeHtml(str) { const d = document.createElement("div"); d.textContent = str == null ? "" : str; return d.innerHTML; }
function escapeAttr(str) { return escapeHtml(str).replace(/"/g, "&quot;"); }

async function loadComments(p) {
  const el = document.getElementById("modal-comments");
  el.innerHTML = `<div class="comment-empty">Loading…</div>`;
  const pinned = p.excel_comment ? [{ author: "Ryan", text: p.excel_comment, pinned: true }] : [];
  try {
    const res = await fetch(`${COMMENTS_API}?player=${encodeURIComponent(p.player)}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    commentsCache[p.player] = data.comments || [];
    commentCounts[p.player] = commentsCache[p.player].length;
    renderComments([...pinned, ...commentsCache[p.player]]);
    renderTable();
  } catch (_) {
    if (pinned.length) renderComments(pinned);
    else el.innerHTML = `<div class="comment-empty">Couldn't load comments. Is the backend set up yet?</div>`;
  }
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

document.getElementById("search").addEventListener("input", renderTable);
document.getElementById("show-ignored").addEventListener("change", (e) => { showHidden = e.target.checked; renderTable(); });
document.getElementById("edit-toggle").addEventListener("click", () => {
  editMode = !editMode;
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
