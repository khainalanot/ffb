-- Shared comments (one thread per player)
CREATE TABLE IF NOT EXISTS comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  player VARCHAR(100) NOT NULL,
  author VARCHAR(40) NOT NULL,
  text VARCHAR(1000) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_comments_player ON comments (player);

-- Ryan's edits layered on top of the Excel export: color tag, custom rank, pick flag.
-- Keyed by position + player so re-exporting the Excel file never wipes them.
CREATE TABLE IF NOT EXISTS overrides (
  id INT AUTO_INCREMENT PRIMARY KEY,
  position VARCHAR(8) NOT NULL,
  player VARCHAR(100) NOT NULL,
  tag VARCHAR(30) DEFAULT NULL,
  sort_rank DOUBLE DEFAULT NULL,
  picked TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_pos_player (position, player)
);

-- Editable legend: Ryan can rename, recolor, add, or remove tags.
CREATE TABLE IF NOT EXISTS tags (
  slug VARCHAR(30) PRIMARY KEY,
  label VARCHAR(80) NOT NULL,
  color VARCHAR(7) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  hidden_default TINYINT(1) NOT NULL DEFAULT 0
);

-- Seed the legend with Jake's original color scheme.
INSERT INTO tags (slug, label, color, sort_order, hidden_default) VALUES
  ('priority', 'Priority — really like',            '#2ecc71', 0, 0),
  ('like',     'Like — if priority not available',  '#e8c547', 1, 0),
  ('caution',  'Like — minor injury, cautious',     '#e08a3c', 2, 0),
  ('rookie',   'Rookie',                            '#1f7a3f', 3, 0),
  ('have',     'Have / protected',                  '#3d7fe0', 4, 0),
  ('ignore',   'Ignore',                            '#d9453d', 5, 1)
ON DUPLICATE KEY UPDATE slug = slug;
