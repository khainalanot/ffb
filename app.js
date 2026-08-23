const TAGS = {
  ignore:   { label: "Ignore",                                dot: "tag-ignore" },
  priority: { label: "Priority — really like",                dot: "tag-priority" },
  like:     { label: "Like — if priority not available",      dot: "tag-like" },
  caution:  { label: "Like — minor injury, be cautious",      dot: "tag-caution" },
  have:     { label: "Already have / protected",              dot: "tag-have" },
  rookie:   { label: "Rookie",                                dot: "tag-rookie" },
};

// Same-origin PHP endpoint. Works once deployed behind Apache/PHP (Hostinger).
const COMMENTS_API = "api/comments.php";

let players = [];
let sortKey = "rank";
let sortDir = 1;
let commentsCache = {}; // player name -> array of comments

function renderLegend() {
  const el = document.getElementById("legend");
  el.innerHTML = Object.entries(TAGS)
    .map(([key, t]) => `<div class="legend-item"><span class="dot ${t.dot}"></span>${t.label}</div>`)
    .join("");
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

function rowsSorted() {
  const rows = [...players];
  rows.sort((a, b) => {
    let av = a[sortKey], bv = b[sortKey];
    if (typeof av === "string") av = av.toLowerCase();
    if (typeof bv === "string") bv = bv.toLowerCase();
    if (av === null || av === undefined) av = -Infinity;
    if (bv === null || bv === undefined) bv = -Infinity;
    if (av < bv) return -1 * sortDir;
    if (av > bv) return 1 * sortDir;
    return 0;
  });
  return rows;
}

function renderTable() {
  const query = document.getElementById("search").value.trim().toLowerCase();
  const body = document.getElementById("ranks-body");
  const rows = rowsSorted().filter(p => {
    if (!query) return true;
    return p.player.toLowerCase().includes(query) || (p.team || "").toLowerCase().includes(query);
  });

  body.innerHTML = rows.map(p => {
    const tag = TAGS[p.tag];
    const dot = tag ? `<span class="tag-pill ${tag.dot}" title="${tag.label}"></span>` : "";
    const hasNotes = !!p.excel_comment || (commentsCache[p.player] && commentsCache[p.player].length > 0);
    return `
      <tr>
        <td>${fmt(p.rank)}</td>
        <td class="player-cell">${dot}${p.player}</td>
        <td>${p.team || "–"}</td>
        <td>${fmt(p.bye)}</td>
        <td>${fmt(p.pass_yards)}</td>
        <td>${fmt(p.pass_td)}</td>
        <td>${fmt(p.int)}</td>
        <td>${fmt(p.rush_yards)}</td>
        <td>${fmt(p.rush_td)}</td>
        <td>${fmt(p.fps)}</td>
        <td>${fmtMoney(p.auction)}</td>
        <td><button class="note-btn ${hasNotes ? "has-notes" : ""}" data-player="${encodeURIComponent(p.player)}">💬</button></td>
      </tr>
    `;
  }).join("");

  body.querySelectorAll(".note-btn").forEach(btn => {
    btn.addEventListener("click", () => openModal(decodeURIComponent(btn.dataset.player)));
  });
}

function renderSortHeaders() {
  document.querySelectorAll("th.sortable").forEach(th => {
    th.classList.toggle("sort-active", th.dataset.key === sortKey);
    th.onclick = () => {
      if (sortKey === th.dataset.key) {
        sortDir *= -1;
      } else {
        sortKey = th.dataset.key;
        sortDir = 1;
      }
      renderSortHeaders();
      renderTable();
    };
  });
}

// ---- Modal / comments ----

const modal = document.getElementById("comment-modal");
let activePlayer = null;

function openModal(playerName) {
  activePlayer = playerName;
  const player = players.find(p => p.player === playerName);
  document.getElementById("modal-player-name").textContent = playerName;

  const excelBox = document.getElementById("modal-excel-comment");
  if (player && player.excel_comment) {
    excelBox.classList.remove("hidden");
    document.getElementById("modal-excel-comment-text").textContent = player.excel_comment;
  } else {
    excelBox.classList.add("hidden");
  }

  document.getElementById("comment-error").classList.add("hidden");
  document.getElementById("comment-form").reset();
  modal.classList.remove("hidden");
  loadComments(playerName);
}

function closeModal() {
  modal.classList.add("hidden");
  activePlayer = null;
}

document.getElementById("modal-close").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

function renderComments(list) {
  const el = document.getElementById("modal-comments");
  if (!list || list.length === 0) {
    el.innerHTML = `<div class="comment-empty">No comments yet — be the first.</div>`;
    return;
  }
  el.innerHTML = list.map(c => `
    <div class="comment-item">
      <div class="comment-meta">${escapeHtml(c.author)} — ${new Date(c.created_at).toLocaleString()}</div>
      <div class="comment-body">${escapeHtml(c.text)}</div>
    </div>
  `).join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function loadComments(playerName) {
  document.getElementById("modal-comments").innerHTML = `<div class="comment-empty">Loading…</div>`;
  try {
    const res = await fetch(`${COMMENTS_API}?player=${encodeURIComponent(playerName)}`);
    if (!res.ok) throw new Error("Failed to load comments");
    const data = await res.json();
    commentsCache[playerName] = data.comments || [];
    renderComments(commentsCache[playerName]);
    renderTable(); // refresh note-btn "has-notes" state
  } catch (err) {
    document.getElementById("modal-comments").innerHTML =
      `<div class="comment-empty">Couldn't load comments. Is the backend set up yet?</div>`;
  }
}

document.getElementById("comment-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!activePlayer) return;
  const author = document.getElementById("comment-author").value.trim();
  const text = document.getElementById("comment-text").value.trim();
  const errEl = document.getElementById("comment-error");
  errEl.classList.add("hidden");

  try {
    const res = await fetch(COMMENTS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player: activePlayer, author, text }),
    });
    if (!res.ok) throw new Error("Failed to post comment");
    document.getElementById("comment-form").reset();
    loadComments(activePlayer);
  } catch (err) {
    errEl.textContent = "Couldn't post your comment. Try again in a bit.";
    errEl.classList.remove("hidden");
  }
});

document.getElementById("search").addEventListener("input", renderTable);

// ---- Init ----

async function init() {
  renderLegend();
  const res = await fetch("data/rankings.json");
  const data = await res.json();
  players = data.players;
  renderSortHeaders();
  renderTable();
}

init();
