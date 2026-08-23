-- Shared comments (one thread per player)
CREATE TABLE IF NOT EXISTS comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  player VARCHAR(100) NOT NULL,
  author VARCHAR(40) NOT NULL,
  text VARCHAR(1000) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_comments_player ON comments (player);

-- Ryan's edits layered on top of the Excel export: color tag + custom rank.
-- Keyed by position + player so re-exporting the Excel file never wipes them.
CREATE TABLE IF NOT EXISTS overrides (
  id INT AUTO_INCREMENT PRIMARY KEY,
  position VARCHAR(8) NOT NULL,
  player VARCHAR(100) NOT NULL,
  tag VARCHAR(20) DEFAULT NULL,
  sort_rank DOUBLE DEFAULT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_pos_player (position, player)
);
