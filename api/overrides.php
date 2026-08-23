<?php
// Overrides API — Ryan's tag + rank edits, layered on top of the Excel export.
//   GET  api/overrides.php
//        -> {"overrides": {"QB|Josh Allen": {"tag": "priority", "sort_rank": 1}, ...}}
//   POST api/overrides.php {position, player, tag}
//        -> upsert a player's color tag (tag null/"" clears it)
//   POST api/overrides.php {position, order: ["Player A", "Player B", ...]}
//        -> set custom rank order for a position (index becomes sort_rank)

require __DIR__ . '/../auth.php';
$pdo = ffb_api_pdo();

const VALID_TAGS = ['priority', 'like', 'caution', 'rookie', 'have', 'ignore'];

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $stmt = $pdo->query('SELECT position, player, tag, sort_rank FROM overrides');
    $out = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $out[$row['position'] . '|' . $row['player']] = [
            'tag' => $row['tag'],
            'sort_rank' => $row['sort_rank'] === null ? null : (float) $row['sort_rank'],
        ];
    }
    echo json_encode(['overrides' => $out]);
    exit;
}

if ($method === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);
    $position = trim($body['position'] ?? '');
    if ($position === '' || mb_strlen($position) > 8) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing or invalid position.']);
        exit;
    }

    // --- Reorder a whole position ---
    if (isset($body['order']) && is_array($body['order'])) {
        $pdo->beginTransaction();
        $upsert = $pdo->prepare(
            'INSERT INTO overrides (position, player, sort_rank) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE sort_rank = VALUES(sort_rank)'
        );
        foreach ($body['order'] as $i => $player) {
            $player = trim((string) $player);
            if ($player === '') continue;
            $upsert->execute([$position, $player, $i]);
        }
        $pdo->commit();
        echo json_encode(['ok' => true]);
        exit;
    }

    // --- Set / clear a single player's tag ---
    $player = trim($body['player'] ?? '');
    if ($player === '' || mb_strlen($player) > 100) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing or invalid player.']);
        exit;
    }
    $tag = $body['tag'] ?? null;
    if ($tag === '' ) $tag = null;
    if ($tag !== null && !in_array($tag, VALID_TAGS, true)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid tag.']);
        exit;
    }
    $stmt = $pdo->prepare(
        'INSERT INTO overrides (position, player, tag) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE tag = VALUES(tag)'
    );
    $stmt->execute([$position, $player, $tag]);
    echo json_encode(['ok' => true, 'position' => $position, 'player' => $player, 'tag' => $tag]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed.']);
