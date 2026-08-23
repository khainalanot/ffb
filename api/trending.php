<?php
// Trending adds/drops from Sleeper's free API, resolved to player names via the
// sleeper_map.json produced by the export. Cached ~1h per time window.
//   GET api/trending.php?hours=24|72|168 -> {"up": [{name,pos,team,count}], "down": [...]}

require __DIR__ . '/lib.php';
ffb_api_guard();

$mapPath = __DIR__ . '/../data/sleeper_map.json';
$map = is_file($mapPath) ? json_decode(file_get_contents($mapPath), true) : [];

$hours = (int) ($_GET['hours'] ?? 24);
if (!in_array($hours, [24, 72, 168], true)) $hours = 24;

function trend($type, $map, $hours) {
    $url = "https://api.sleeper.app/v1/players/nfl/trending/$type?lookback_hours=$hours&limit=50";
    $raw = ffb_http_get_cached($url, 3600);
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
        if (count($out) >= 15) break;
    }
    return $out;
}

echo json_encode([
    'hours' => $hours,
    'up'    => trend('add', $map, $hours),
    'down'  => trend('drop', $map, $hours),
]);
