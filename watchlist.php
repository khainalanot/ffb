<?php
require __DIR__ . '/auth.php';
ffb_require_auth_or_redirect();
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FFB · Watchlist</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Oswald:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css?v=17">
</head>
<body>
<header class="topbar">
  <div class="bar-inner">
    <div class="brand">
      <span class="brand-mark">FFB</span>
      <span class="brand-sub">Watchlist</span>
    </div>
    <div class="controls">
      <a href="index.php" class="ghost-btn">← Draft board</a>
      <a href="logout.php" class="logout-link">Log out</a>
    </div>
  </div>
</header>

<div class="page">
  <div class="watch-page-head">
    <h1 class="watch-page-title">🔖 Watchlist</h1>
    <p class="watch-page-sub">Players Ryan is keeping an eye on · <span id="watch-total">0</span> total</p>
  </div>

  <div class="watch-filters" id="watch-filters"></div>

  <div id="watch-grid" class="watch-grid">
    <div class="comment-empty">Loading…</div>
  </div>
</div>

<script>
const POSITIONS = ["QB", "RB", "WR", "TE", "DST"];
let players = [];
let overrides = {};
let posFilter = "ALL";

function key(p) { return `${p.position}|${p.player}`; }
function escapeHtml(s) { const d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, "&quot;"); }

function watched() {
  return players.filter(p => {
    const o = overrides[key(p)];
    return o && o.watched;
  });
}

function renderFilters() {
  const list = watched();
  const counts = { ALL: list.length };
  POSITIONS.forEach(pos => counts[pos] = list.filter(p => p.position === pos).length);
  const tabs = ["ALL", ...POSITIONS].filter(t => t === "ALL" || counts[t] > 0);
  document.getElementById("watch-filters").innerHTML = tabs.map(t =>
    `<button class="watch-filter ${t === posFilter ? "active" : ""}" data-pos="${t}">${t === "ALL" ? "All" : t} <span class="watch-filter-count">${counts[t]}</span></button>`
  ).join("");
  document.querySelectorAll(".watch-filter").forEach(btn =>
    btn.addEventListener("click", () => { posFilter = btn.dataset.pos; renderFilters(); renderGrid(); }));
}

function renderGrid() {
  const grid = document.getElementById("watch-grid");
  let list = watched();
  document.getElementById("watch-total").textContent = list.length;
  if (posFilter !== "ALL") list = list.filter(p => p.position === posFilter);

  if (list.length === 0) {
    grid.innerHTML = `<div class="watch-page-empty">
        <div class="watch-page-empty-icon">🔖</div>
        <p>No players on the watchlist yet.</p>
        <p class="muted">Open the <a href="index.php">draft board</a> and tap the bookmark on any player to add them here.</p>
      </div>`;
    return;
  }

  list.sort((a, b) => (b.fps ?? -Infinity) - (a.fps ?? -Infinity));
  grid.innerHTML = list.map(p => {
    const photo = p.headshot
      ? `<img class="watch-card-photo" src="${escapeAttr(p.headshot)}" alt="" onerror="this.classList.add('broken')">`
      : `<div class="watch-card-photo placeholder">${escapeHtml((p.player || "?").charAt(0))}</div>`;
    return `<div class="watch-card" data-key="${encodeURIComponent(key(p))}">
        <button class="watch-card-remove" data-key="${encodeURIComponent(key(p))}" title="Remove" aria-label="Remove">✕</button>
        ${photo}
        <div class="watch-card-body">
          <div class="watch-card-name">${escapeHtml(p.player)}</div>
          <div class="watch-card-meta">
            <span class="pos-badge pos-${p.position}">${p.position}</span>
            <span>${escapeHtml(p.team || "")}</span>
          </div>
        </div>
      </div>`;
  }).join("");

  grid.querySelectorAll(".watch-card-remove").forEach(btn =>
    btn.addEventListener("click", (e) => { e.stopPropagation(); removeWatch(decodeURIComponent(btn.dataset.key)); }));
  grid.querySelectorAll(".watch-card").forEach(card =>
    card.addEventListener("click", () => {
      const k = decodeURIComponent(card.dataset.key);
      const p = players.find(pl => key(pl) === k);
      if (p) location.href = "index.php?p=" + encodeURIComponent(k);  // opens the full profile there
    }));
}

async function removeWatch(k) {
  const p = players.find(pl => key(pl) === k);
  if (!p) return;
  overrides[k] = { ...(overrides[k] || {}), watched: 0 };
  renderFilters();
  renderGrid();
  try {
    await fetch("api/overrides.php", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ position: p.position, player: p.player, watched: 0 }) });
  } catch (_) {}
}

async function init() {
  const [rk, ov] = await Promise.all([
    fetch("data/rankings.json").then(r => r.json()),
    fetch("api/overrides.php", { cache: "no-store" }).then(r => r.ok ? r.json() : { overrides: {} }).catch(() => ({ overrides: {} })),
  ]);
  players = rk.players || [];
  overrides = ov.overrides || {};
  renderFilters();
  renderGrid();
}
init();
</script>
</body>
</html>
