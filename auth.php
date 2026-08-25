<?php
// Shared password-gate helper. Included by index.php and api/comments.php.
session_start();

function ffb_config() {
    $configPath = __DIR__ . '/api/config.php';
    if (!file_exists($configPath)) {
        return null;
    }
    return require $configPath;
}

function ffb_require_auth_or_redirect() {
    if (empty($_SESSION['ffb_authed'])) {
        header('Location: login.php');
        exit;
    }
}

function ffb_is_authed() {
    return !empty($_SESSION['ffb_authed']);
}

function ffb_pdo() {
    $config = ffb_config();
    if ($config === null) {
        return null;
    }
    return new PDO(
        "mysql:host={$config['host']};dbname={$config['dbname']};charset=utf8mb4",
        $config['user'],
        $config['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
}

// Guard an API endpoint: enforce auth + config, return a ready PDO or exit JSON.
function ffb_api_pdo() {
    header('Content-Type: application/json');
    header('Cache-Control: no-store, no-cache, must-revalidate');   // never serve stale edits
    if (!ffb_is_authed()) {
        http_response_code(401);
        echo json_encode(['error' => 'Not signed in.']);
        exit;
    }
    if (ffb_config() === null) {
        http_response_code(500);
        echo json_encode(['error' => 'Server not configured yet: copy api/config.example.php to api/config.php and fill it in.']);
        exit;
    }
    try {
        return ffb_pdo();
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Database connection failed.']);
        exit;
    }
}
