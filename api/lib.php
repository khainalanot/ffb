<?php
// Small helpers for the live data endpoints: an auth guard and a file cache.

require_once __DIR__ . '/../auth.php';

function ffb_api_guard() {
    header('Content-Type: application/json');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    if (!ffb_is_authed()) {
        http_response_code(401);
        echo json_encode(['error' => 'Not signed in.']);
        exit;
    }
}

function ffb_cache_dir() {
    $dir = __DIR__ . '/../cache';
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    return $dir;
}

// Fetch a URL, caching the raw body on disk for $ttl seconds.
function ffb_http_get_cached($url, $ttl = 1800) {
    $file = ffb_cache_dir() . '/' . md5($url) . '.cache';
    if (is_file($file) && (time() - filemtime($file) < $ttl)) {
        return file_get_contents($file);
    }
    $body = ffb_http_get($url);
    if ($body !== null && $body !== '') {
        @file_put_contents($file, $body);
        return $body;
    }
    // On failure, serve stale cache if we have it.
    if (is_file($file)) return file_get_contents($file);
    return null;
}

function ffb_http_get($url) {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_USERAGENT => 'Mozilla/5.0 FFB',
        ]);
        $body = curl_exec($ch);
        return $body === false ? null : $body;
    }
    $ctx = stream_context_create(['http' => ['timeout' => 15, 'header' => "User-Agent: Mozilla/5.0 FFB\r\n"]]);
    $body = @file_get_contents($url, false, $ctx);
    return $body === false ? null : $body;
}
