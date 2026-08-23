<?php
require __DIR__ . '/auth.php';
ffb_require_auth_or_redirect();
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Jake's Ranks</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<header class="topbar">
  <h1>Jake's Ranks <span class="subtitle" id="pos-subtitle">— QB</span></h1>
  <div class="controls">
    <input id="search" type="search" placeholder="Search player or team…">
    <a href="logout.php" class="logout-link">Log out</a>
  </div>
</header>

<div class="tabs" id="position-tabs"></div>

<div class="legend" id="legend"></div>

<div class="toolbar">
  <div class="sort-buttons" id="sort-buttons"></div>
  <div class="toolbar-right">
    <label class="show-ignored">
      <input type="checkbox" id="show-ignored">
      Show ignored (red)
    </label>
    <button id="edit-toggle" class="edit-toggle">Edit</button>
  </div>
</div>

<p class="edit-hint hidden" id="edit-hint">Editing on — click a player's dot to change its color, or drag the ⠿ handle to reorder. Sort must be “My rank” to drag.</p>

<main>
  <table id="ranks-table">
    <thead>
      <tr>
        <th class="drag-col"></th>
        <th data-key="rank" class="sortable">RK</th>
        <th>Player</th>
        <th data-key="fps" class="sortable">FPS</th>
        <th data-key="auction" class="sortable">AUC$</th>
      </tr>
    </thead>
    <tbody id="ranks-body"></tbody>
  </table>
</main>

<div id="comment-modal" class="modal hidden">
  <div class="modal-content">
    <button class="modal-close" id="modal-close">&times;</button>
    <h2 id="modal-player-name"></h2>
    <div id="modal-player-sub" class="modal-player-sub"></div>

    <div class="stat-grid" id="modal-stats"></div>

    <div id="modal-excel-comment" class="excel-comment hidden">
      <div class="excel-comment-label">From the spreadsheet</div>
      <p id="modal-excel-comment-text"></p>
    </div>

    <h3>Comments</h3>
    <div id="modal-comments" class="comments-list"></div>

    <form id="comment-form">
      <textarea id="comment-text" placeholder="Add a comment…" required maxlength="1000"></textarea>
      <button type="submit">Post</button>
      <div id="comment-error" class="comment-error hidden"></div>
    </form>
  </div>
</div>

<script src="app.js"></script>
</body>
</html>
