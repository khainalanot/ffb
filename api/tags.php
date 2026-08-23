<?php
// Tags (legend) API — Ryan can rename, recolor, add, remove tags.
//   GET    api/tags.php                -> {"tags": [{slug,label,color,sort_order,hidden_default}, ...]}
//   POST   api/tags.php {slug,label,color,sort_order,hidden_default}  -> upsert a tag
//   POST   api/tags.php {order: [slug, ...]}   -> set sort_order from array index
//   DELETE api/tags.php?slug=xyz       -> remove a tag (also clears it from any players)

require __DIR__ . '/../auth.php';
$pdo = ffb_api_pdo();

$method = $_SERVER['REQUEST_METHOD'];

function slugify($s) {
    $s = strtolower(trim($s));
    $s = preg_replace('/[^a-z0-9]+/', '-', $s);
    return trim($s, '-');
}

if ($method === 'GET') {
    $rows = $pdo->query('SELECT slug, label, color, sort_order, hidden_default FROM tags ORDER BY sort_order ASC')
                ->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$r) {
        $r['sort_order'] = (int) $r['sort_order'];
        $r['hidden_default'] = (int) $r['hidden_default'];
    }
    echo json_encode(['tags' => $rows]);
    exit;
}

if ($method === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);

    // Reorder
    if (isset($body['order']) && is_array($body['order'])) {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare('UPDATE tags SET sort_order = ? WHERE slug = ?');
        foreach ($body['order'] as $i => $slug) {
            $stmt->execute([$i, (string) $slug]);
        }
        $pdo->commit();
        echo json_encode(['ok' => true]);
        exit;
    }

    // Upsert one tag
    $label = trim($body['label'] ?? '');
    $color = trim($body['color'] ?? '');
    $slug  = trim($body['slug'] ?? '');
    if ($slug === '') $slug = slugify($label);
    $sortOrder = isset($body['sort_order']) ? (int) $body['sort_order'] : 0;
    $hidden = !empty($body['hidden_default']) ? 1 : 0;

    if ($slug === '' || $label === '') {
        http_response_code(400);
        echo json_encode(['error' => 'label is required.']);
        exit;
    }
    if (!preg_match('/^#[0-9a-fA-F]{6}$/', $color)) {
        http_response_code(400);
        echo json_encode(['error' => 'color must be a hex value like #2ecc71.']);
        exit;
    }
    if (mb_strlen($label) > 80 || mb_strlen($slug) > 30) {
        http_response_code(400);
        echo json_encode(['error' => 'Too long.']);
        exit;
    }

    $stmt = $pdo->prepare(
        'INSERT INTO tags (slug, label, color, sort_order, hidden_default) VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE label = VALUES(label), color = VALUES(color),
                                 sort_order = VALUES(sort_order), hidden_default = VALUES(hidden_default)'
    );
    $stmt->execute([$slug, $label, $color, $sortOrder, $hidden]);
    echo json_encode(['ok' => true, 'slug' => $slug]);
    exit;
}

if ($method === 'DELETE') {
    $slug = trim($_GET['slug'] ?? '');
    if ($slug === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Missing slug.']);
        exit;
    }
    $pdo->beginTransaction();
    $pdo->prepare('DELETE FROM tags WHERE slug = ?')->execute([$slug]);
    $pdo->prepare('UPDATE overrides SET tag = NULL WHERE tag = ?')->execute([$slug]);
    $pdo->commit();
    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed.']);
