<?php
// Comments API (per player).
//   GET  api/comments.php?player=Josh+Allen  -> {"comments": [...]}
//   POST api/comments.php {player, text}      -> {"comment": {...}}

require __DIR__ . '/../auth.php';
$pdo = ffb_api_pdo();

const COMMENT_AUTHOR = 'Ryan';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
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

http_response_code(405);
echo json_encode(['error' => 'Method not allowed.']);
