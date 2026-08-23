<?php
// Comments API (per player).
//   GET    api/comments.php?player=Josh+Allen -> {"comments": [...]}
//   GET    api/comments.php?counts=1          -> {"counts": {player: n}}
//   POST   api/comments.php {player, text}     -> {"comment": {...}}
//   PUT    api/comments.php {id, text}         -> {"ok": true}
//   DELETE api/comments.php?id=5               -> {"ok": true}

require __DIR__ . '/../auth.php';
$pdo = ffb_api_pdo();

const COMMENT_AUTHOR = 'Ryan';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    // Counts per player, for showing comment markers on the list.
    if (isset($_GET['counts'])) {
        $rows = $pdo->query('SELECT player, COUNT(*) AS n FROM comments GROUP BY player')
                    ->fetchAll(PDO::FETCH_ASSOC);
        $counts = [];
        foreach ($rows as $r) $counts[$r['player']] = (int) $r['n'];
        echo json_encode(['counts' => $counts]);
        exit;
    }

    $player = trim($_GET['player'] ?? '');
    if ($player === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Missing player parameter.']);
        exit;
    }
    $stmt = $pdo->prepare('SELECT id, player, author, text, created_at FROM comments WHERE player = ? ORDER BY created_at ASC');
    $stmt->execute([$player]);
    echo json_encode(['comments' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    exit;
}

if ($method === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);
    $player = trim($body['player'] ?? '');
    $text = trim($body['text'] ?? '');
    $author = COMMENT_AUTHOR;

    if ($player === '' || $text === '') {
        http_response_code(400);
        echo json_encode(['error' => 'player and text are both required.']);
        exit;
    }
    if (mb_strlen($text) > 1000 || mb_strlen($player) > 100) {
        http_response_code(400);
        echo json_encode(['error' => 'Input too long.']);
        exit;
    }

    $stmt = $pdo->prepare('INSERT INTO comments (player, author, text) VALUES (?, ?, ?)');
    $stmt->execute([$player, $author, $text]);
    echo json_encode(['comment' => [
        'id' => $pdo->lastInsertId(),
        'player' => $player,
        'author' => $author,
        'text' => $text,
        'created_at' => date('Y-m-d H:i:s'),
    ]]);
    exit;
}

if ($method === 'PUT') {
    $body = json_decode(file_get_contents('php://input'), true);
    $id = (int) ($body['id'] ?? 0);
    $text = trim($body['text'] ?? '');
    if ($id <= 0 || $text === '') {
        http_response_code(400);
        echo json_encode(['error' => 'id and text are required.']);
        exit;
    }
    if (mb_strlen($text) > 1000) {
        http_response_code(400);
        echo json_encode(['error' => 'Input too long.']);
        exit;
    }
    $stmt = $pdo->prepare('UPDATE comments SET text = ? WHERE id = ?');
    $stmt->execute([$text, $id]);
    echo json_encode(['ok' => true]);
    exit;
}

if ($method === 'DELETE') {
    $id = (int) ($_GET['id'] ?? 0);
    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing id.']);
        exit;
    }
    $pdo->prepare('DELETE FROM comments WHERE id = ?')->execute([$id]);
    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed.']);
