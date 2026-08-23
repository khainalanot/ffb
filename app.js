const TAGS = {
  priority: { label: "Priority — really like",           dot: "tag-priority", order: 0 },
  like:     { label: "Like — if priority not available", dot: "tag-like", order: 1 },
  caution:  { label: "Like — minor injury, cautious",    dot: "tag-caution", order: 2 },
  rookie:   { label: "Rookie",                           dot: "tag-rookie", order: 3 },
  have:     { label: "Have / protected",                 dot: "tag-have", order: 4 },
  ignore:   { label: "Ignore",                           dot: "tag-ignore", order: 5 },
};
const TAG_KEYS = Object.keys(TAGS);
const NO_TAG_ORDER = 6;
const POSITIONS = ["QB", "RB", "WR", "TE", "DST"];

const COMMENTS_API = "api/comments.php";
const OVERRIDES_API = "api/overrides.php";

let players = [];          // all players, base data
let overrides = {};        // "POS|Player" -> {tag, sort_rank}
let commentsCache = {};

let activePos = "QB";
let sortKey = "rank";      // rank | fps | auction | tag
let sortDir = 1;
let showIgnored = false;
let editMode = false;

function key(p) { return `${p.position}|${p.player}`; }
function tagOf(p) {
  const o = overrides[key(p)];
  return (o && o.tag !== undefined && o.tag !== null) ? o.tag : p.tag;
}
function rankOf(p) {
  const o = overrides[key(p)];
  return (o && o.sort_rank !== null && o.sort_rank !== undefined) ? o.sort_rank : null;
}

// ---- rendering ----

function renderTabs() {
  const el = document.getElementById("position-tabs");
  el.innerHTML = POSITIONS.map(pos =>
    `<button class="tab ${pos === activePos ? "active" : ""}" data-pos="${pos}">${pos}</button>`
  ).join("");
  el.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      activePos = btn.dataset.pos;
      renderTabs();
      renderTable();
    });
  });
  document.getElementById("pos-subtitle").textContent = `— ${activePos}`;
}

function renderLegend() {
  document.getElementById("legend").innerHTML = Object.values(TAGS)
    .map(t => `<div class="legend-item"><span class="dot ${t.dot}"></span>${t.label}</div>`)
    .join("");
}

function renderSortButtons() {
  const el = document.getElementById("sort-buttons");
  const buttons = [
    { key: "rank", label: "My rank" },
    { key: "fps", label: "FPS" },
    { key: "auction", label: "AUC$" },
    { key: "tag", label: "Color" },
  ];
  el.innerHTML = buttons.map(b => `<button class="sort-btn" data-key="${b.key}">${b.label}</button>`).join("");
  el.querySelectorAll(".sort-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (sortKey === btn.dataset.key) sortDir *= -1;
      else { sortKey = btn.dataset.key; sortDir = 1; }
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

function fmt(n) {
  if (n === null || n === undefined || n === "") return "–";
  if (typeof n === "number") return Math.round(n).toLocaleString();
  return n;
}
function fmtMoney(n) {
  if (n === null || n === undefined || n === "") return "–";
  return `$${Number(n).toFixed(1)}`;
}

function posPlayers() {
  return players.filter(p => p.position === activePos);
}

// Default rank = by FPS desc. "My rank" uses custom sort_rank when present,
// falling back to FPS order for players Ryan hasn't placed yet.
function baseByFps() {
  return [...posPlayers()].sort((a, b) => (b.fps ?? -Infinity) - (a.fps ?? -Infinity));
}

function rowsSorted() {
  const base = baseByFps();
  const fpsIndex = new Map(base.map((p, i) => [key(p), i]));

  const rows = [...base];
  rows.sort((a, b) => {
    let av, bv;
    if (sortKey === "rank") {
      const ra = rankOf(a), rb = rankOf(b);
      av = ra !== null ? ra : 10000 + fpsIndex.get(key(a));
      bv = rb !== null ? rb : 10000 + fpsIndex.get(key(b));
    } else if (sortKey === "tag") {
      av = TAGS[tagOf(a)] ? TAGS[tagOf(a)].order : NO_TAG_ORDER;
      bv = TAGS[tagOf(b)] ? TAGS[tagOf(b)].order : NO_TAG_ORDER;
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

function renderTable() {
  const query = document.getElementById("search").value.trim().toLowerCase();
  const body = document.getElementById("ranks-body");
  const canDrag = editMode && sortKey === "rank" && sortDir === 1 && !query;

  const rows = rowsSorted().filter(p => {
    if (!showIgnored && tagOf(p) === "ignore") return false;
    if (!query) return true;
    return p.player.toLowerCase().includes(query) || (p.team || "").toLowerCase().includes(query);
  });

  body.innerHTML = rows.map((p, i) => {
    const t = TAGS[tagOf(p)];
    const dotClass = t ? t.dot : "";
    const hasNotes = !!p.excel_comment || (commentsCache[p.player] && commentsCache[p.player].length > 0);
    return `
      <tr class="player-row" data-key="${encodeURIComponent(key(p))}" ${canDrag ? 'draggable="true"' : ""}>
        <td class="drag-col">${canDrag ? '<span class="drag-handle">⠿</span>' : ""}</td>
        <td class="rk-cell">${i + 1}</td>
        <td class="player-cell">
          <span class="tag-pill ${dotClass} ${editMode ? "editable" : ""}" title="${t ? t.label : "No tag"}"></span>
          <span class="player-name">${p.player}</span>
          <span class="player-meta">${p.team || ""}${p.bye ? " · BYE " + fmt(p.bye) : ""}</span>
          ${hasNotes ? `<span class="note-dot" title="Has notes"></span>` : ""}
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
    }
    row.addEventListener("click", (e) => {
      if (e.target.closest(".drag-handle")) return;
      openModal(k);
    });
  });

  if (canDrag) setupDrag(body);
}

// ---- editing: tags ----

async function cycleTag(k) {
  const p = players.find(pl => key(pl) === k);
  if (!p) return;
  const current = tagOf(p);
  const idx = current ? TAG_KEYS.indexOf(current) : -1;
  const next = idx + 1 >= TAG_KEYS.length ? null : TAG_KEYS[idx + 1];

  overrides[k] = { ...(overrides[k] || { sort_rank: null }), tag: next };
  renderTable();

  try {
    await fetch(OVERRIDES_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ position: p.position, player: p.player, tag: next }),
    });
  } catch (_) { /* keep optimistic UI */ }
}

// ---- editing: drag to reorder ----

let dragKey = null;

function setupDrag(body) {
  body.querySelectorAll(".player-row").forEach(row => {
    row.addEventListener("dragstart", (e) => {
      dragKey = decodeURIComponent(row.dataset.key);
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      dragKey = null;
    });
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

  orderPlayers.forEach((p, i) => {
    overrides[key(p)] = { ...(overrides[key(p)] || { tag: null }), sort_rank: i };
  });
  renderTable();

  try {
    await fetch(OVERRIDES_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ position: activePos, order: orderPlayers.map(p => p.player) }),
    });
  } catch (_) { /* keep optimistic UI */ }
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
    `<div class="stat-box"><div class="stat-label">${label}</div><div class="stat-value">${fmt(val)}</div></div>`
  ).join("");

  const excelBox = document.getElementById("modal-excel-comment");
  if (p.excel_comment) {
    excelBox.classList.remove("hidden");
    document.getElementById("modal-excel-comment-text").textContent = p.excel_comment;
  } else {
    excelBox.classList.add("hidden");
  }

  document.getElementById("comment-error").classList.add("hidden");
  document.getElementById("comment-form").reset();
  modal.classList.remove("hidden");
  loadComments(p.player);
}

function closeModal() { modal.classList.add("hidden"); activeKey = null; }
document.getElementById("modal-close").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

function renderComments(list) {
  const el = document.getElementById("modal-comments");
  if (!list || list.length === 0) { el.innerHTML = `<div class="comment-empty">No comments yet.</div>`; return; }
  el.innerHTML = list.map(c => `
    <div class="comment-item">
      <div class="comment-meta">${escapeHtml(c.author)} — ${new Date(c.created_at).toLocaleString()}</div>
      <div class="comment-body">${escapeHtml(c.text)}</div>
    </div>`).join("");
}
function escapeHtml(str) { const d = document.createElement("div"); d.textContent = str; return d.innerHTML; }

async function loadComments(playerName) {
  document.getElementById("modal-comments").innerHTML = `<div class="comment-empty">Loading…</div>`;
  try {
    const res = await fetch(`${COMMENTS_API}?player=${encodeURIComponent(playerName)}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    commentsCache[playerName] = data.comments || [];
    renderComments(commentsCache[playerName]);
    renderTable();
  } catch (_) {
    document.getElementById("modal-comments").innerHTML =
      `<div class="comment-empty">Couldn't load comments. Is the backend set up yet?</div>`;
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
    const res = await fetch(COMMENTS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player: p.player, text }),
    });
    if (!res.ok) throw new Error();
    document.getElementById("comment-form").reset();
    loadComments(p.player);
  } catch (_) {
    errEl.textContent = "Couldn't post your comment. Try again in a bit.";
    errEl.classList.remove("hidden");
  }
});

// ---- controls ----

document.getElementById("search").addEventListener("input", renderTable);
document.getElementById("show-ignored").addEventListener("change", (e) => {
  showIgnored = e.target.checked; renderTable();
});
document.getElementById("edit-toggle").addEventListener("click", () => {
  editMode = !editMode;
  document.getElementById("edit-toggle").classList.toggle("active", editMode);
  document.getElementById("edit-toggle").textContent = editMode ? "Done" : "Edit";
  document.getElementById("edit-hint").classList.toggle("hidden", !editMode);
  document.body.classList.toggle("edit-mode", editMode);
  renderTable();
});

// ---- init ----

async function loadOverrides() {
  try {
    const res = await fetch(OVERRIDES_API);
    if (!res.ok) return;
    const data = await res.json();
    overrides = data.overrides || {};
  } catch (_) { overrides = {}; }
}

async function init() {
  renderTabs();
  renderLegend();
  renderSortButtons();
  const res = await fetch("data/rankings.json");
  players = (await res.json()).players;
  await loadOverrides();
  renderTable();
}

init();
