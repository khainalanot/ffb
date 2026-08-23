<?php
// Trending adds/drops from Sleeper's free API, resolved to player names via the
// sleeper_map.json produced by the export. Cached ~1h.
//   GET api/trending.php -> {"up": [{name,pos,team,count}], "down": [...]}

require __DIR__ . '/lib.php';
ffb_api_guard();

$mapPath = __DIR__ . '/../data/sleeper_map.json';
$map = is_file($mapPath) ? json_decode(file_get_contents($mapPath), true) : [];

function trend($type, $map) {
    $raw = ffb_http_get_cached("https://api.sleeper.app/v1/players/nfl/trending/add", 3600);
    if ($type === 'drop') {
        $raw = ffb_http_get_cached("https://api.sleeper.app/v1/players/nfl/trending/drop", 3600);
    }
    $rows = $raw ? json_decode($raw, true) : [];
    $out = [];
    foreach ($rows as $r) {
        $info = $map[$r['player_id']] ?? null;
        if (!$info) continue;                 // only players we can name (skips IDPs/defenses)
        $out[] = [
            'name'  => $info['n'],
            'pos'   => $info['pos'],
            'team'  => $info['tm'],
            'count' => (int) $r['count'],
        ];
        if (count($out) >= 12) break;
    }
    return $out;
}

echo json_encode([
    'up'   => trend('add', $map),
    'down' => trend('drop', $map),
]);
