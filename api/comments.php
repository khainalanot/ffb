<?php
// Simple JSON API backing the site's comment feature.
//   GET  api/comments.php?player=Josh+Allen   -> {"comments": [...]}
//   POST api/comments.php {player, author, text} -> {"comment": {...}}

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$configPath = __DIR__ . '/config.php';
if (!file_exists($configPath)) {
    http_response_code(500);
    echo json_encode(['error' => 'Server not configured yet: copy api/config.example.php to api/config.php and fill in your database credentials.']);
    exit;
}
$config = require $configPath;

try {
    $pdo = new PDO(
        "mysql:host={$config['host']};dbname={$config['dbname']};charset=utf8mb4",
        $config['user'],
        $config['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed.']);
    exit;
}

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
    $author = trim($body['author'] ?? '');
    $text = trim($body['text'] ?? '');

    if ($player === '' || $author === '' || $text === '') {
        http_response_code(400);
        echo json_encode(['error' => 'player, author, and text are all required.']);
        exit;
    }
    if (mb_strlen($author) > 40 || mb_strlen($text) > 1000 || mb_strlen($player) > 100) {
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
