<?php
require __DIR__ . '/auth.php';
ffb_require_auth_or_redirect();
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FFB</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Oswald:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css?v=12">
</head>
<body>
<header class="topbar">
  <div class="bar-inner">
    <div class="brand">
      <span class="brand-mark">FFB</span>
      <span class="brand-sub">Draft Board</span>
    </div>
    <div class="controls">
      <div class="search-wrap">
        <svg class="search-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14"/></svg>
        <input id="search" type="search" placeholder="Search player or team">
      </div>
      <a href="logout.php" class="logout-link">Log out</a>
    </div>
  </div>
</header>

<div class="page">
<nav class="tabs" id="position-tabs"></nav>

<div class="legend-row">
  <div class="legend" id="legend"></div>
  <button id="legend-edit-toggle" class="ghost-btn">Edit legend</button>
</div>

<div id="legend-editor" class="legend-editor hidden"></div>

<div class="toolbar">
  <div class="sort-group">
    <span class="sort-label">Sort</span>
    <div class="sort-buttons" id="sort-buttons"></div>
  </div>
  <div class="toolbar-right">
    <label class="switch">
      <input type="checkbox" id="show-ignored">
      <span class="switch-track"><span class="switch-thumb"></span></span>
      <span class="switch-text">Show hidden</span>
    </label>
    <button id="latest-open" class="ghost-btn">📰 Latest</button>
    <button id="trending-open" class="ghost-btn">📈 Trending</button>
    <button id="edit-toggle" class="edit-toggle">Edit</button>
  </div>
</div>

<p class="edit-hint hidden" id="edit-hint">
  <strong>Edit mode.</strong> Click a color chip to set a tag · drag <span class="mono">⠿</span> to reorder (sort must be “My rank”). Ignored players stay visible here and only drop off when you click Done.
</p>

<main>
  <div class="table-wrap">
    <table id="ranks-table">
      <thead>
        <tr id="table-head-row"></tr>
      </thead>
      <tbody id="ranks-body"></tbody>
    </table>
  </div>
</main>
</div>

<div id="comment-modal" class="modal hidden">
  <div class="modal-content snapshot">
    <button class="modal-close" id="modal-close" aria-label="Close">&times;</button>

    <div class="snap-head">
      <img id="snap-photo" class="snap-photo" alt="" hidden>
      <div class="snap-headinfo">
        <h2 id="modal-player-name"></h2>
        <div id="modal-player-sub" class="modal-player-sub"></div>
        <div id="snap-bio" class="snap-bio"></div>
      </div>
    </div>

    <div class="stat-grid" id="modal-stats"></div>

    <div id="snap-summary-wrap" class="snap-section hidden">
      <div class="section-head">Fantasy Outlook <a id="snap-summary-link" class="section-link" href="#" target="_blank" rel="noopener noreferrer">via RTSports.com ↗</a></div>
      <div id="snap-summary" class="summary-body"></div>
    </div>

    <div id="snap-career-wrap" class="snap-section hidden">
      <div class="section-head">Career</div>
      <div class="career-scroll"><table id="snap-career" class="career-table"></table></div>
    </div>

    <div id="snap-news-wrap" class="snap-section hidden">
      <div class="section-head">Analysis</div>
      <div id="snap-news" class="news-list"></div>
    </div>

    <div class="section-head">Notes</div>
    <div id="modal-comments" class="comments-list"></div>

    <form id="comment-form">
      <textarea id="comment-text" placeholder="Add a note…" required maxlength="1000"></textarea>
      <div class="comment-form-actions">
        <button type="submit">Post note</button>
        <div id="comment-error" class="comment-error hidden"></div>
      </div>
    </form>
  </div>
</div>

<div id="latest-modal" class="modal hidden">
  <div class="modal-content">
    <button class="modal-close" id="latest-close" aria-label="Close">&times;</button>
    <h2 class="trend-title">Latest analysis</h2>
    <div class="trend-sub">Freshest NFL player notes · via RotoBaller</div>
    <div id="latest-list" class="news-list"></div>
  </div>
</div>

<div id="trending-modal" class="modal hidden">
  <div class="modal-content">
    <button class="modal-close" id="trending-close" aria-label="Close">&times;</button>
    <h2 class="trend-title">Trending</h2>
    <div class="trend-sub">Adds &amp; drops across fantasy leagues · via Sleeper</div>
    <div class="trend-windows" id="trend-windows">
      <button class="trend-win active" data-hours="24">24 hours</button>
      <button class="trend-win" data-hours="72">3 days</button>
      <button class="trend-win" data-hours="168">7 days</button>
    </div>
    <div class="trend-cols">
      <div><div class="section-head up">▲ Trending up</div><div id="trend-up" class="trend-list"></div></div>
      <div><div class="section-head down">▼ Trending down</div><div id="trend-down" class="trend-list"></div></div>
    </div>
  </div>
</div>

<script src="app.js?v=12"></script>
</body>
</html>
