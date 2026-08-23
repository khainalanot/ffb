<?php
// Player news aggregator. Primary source is ESPN's per-athlete news feed (needs
// the player's espn_id); RSS feeds are a keyword-matched fallback. Returns
// headline + short summary + source + date + link. The link points to the
// original article — full text stays at the source.
//   GET api/news.php?player=Jonathan+Taylor&espn_id=4242335
//       -> {"news": [{title,summary,source,date,link}]}

require __DIR__ . '/lib.php';
ffb_api_guard();

$RSS_FEEDS = [
    ['RotoBaller', 'https://www.rotoballer.com/player-news/feed'],
    ['RotoBaller', 'https://www.rotoballer.com/category/nfl/feed'],
    ['RotoBaller', 'https://www.rotoballer.com/feed'],
];

$player = trim($_GET['player'] ?? '');
$espnId = preg_replace('/\D/', '', $_GET['espn_id'] ?? '');
if ($player === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Missing player.']);
    exit;
}

function clean_text($html, $max = 260) {
    $t = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $t = trim(preg_replace('/\s+/', ' ', $t));
    if (mb_strlen($t) > $max) $t = mb_substr($t, 0, $max - 1) . '…';
    return $t;
}

$items = [];
$seen = [];

// --- Primary: ESPN per-athlete news ---
if ($espnId !== '') {
    $url = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/athletes/$espnId/news";
    $raw = ffb_http_get_cached($url, 1800);
    $data = $raw ? json_decode($raw, true) : null;
    if (!empty($data['articles'])) {
        foreach ($data['articles'] as $a) {
            $link = $a['links']['web']['href'] ?? ($a['links']['mobile']['href'] ?? '');
            if (!$link || isset($seen[$link])) continue;
            $seen[$link] = true;
            $ts = !empty($a['published']) ? strtotime($a['published']) : 0;
            $items[] = [
                'title'   => clean_text($a['headline'] ?? '', 160),
                'summary' => clean_text($a['description'] ?? '', 280),
                'source'  => 'ESPN',
                'date'    => $ts ? date('c', $ts) : null,
                'ts'      => $ts,
                'link'    => $link,
            ];
        }
    }
}

// --- Fallback / supplement: keyword-matched RSS ---
$needle = mb_strtolower($player);
foreach ($RSS_FEEDS as [$source, $url]) {
    $raw = ffb_http_get_cached($url, 1800);
    if (!$raw) continue;
    $xml = @simplexml_load_string($raw, 'SimpleXMLElement', LIBXML_NOCDATA);
    if (!$xml || !isset($xml->channel->item)) continue;
    foreach ($xml->channel->item as $it) {
        $title = (string) $it->title;
        $desc  = (string) $it->description;
        if (mb_strpos(mb_strtolower($title . ' ' . $desc), $needle) === false) continue;
        $link = (string) $it->link;
        if (isset($seen[$link])) continue;
        $seen[$link] = true;
        $ts = strtotime((string) $it->pubDate) ?: 0;
        $items[] = [
            'title'   => clean_text($title, 160),
            'summary' => clean_text($desc, 280),
            'source'  => $source,
            'date'    => $ts ? date('c', $ts) : null,
            'ts'      => $ts,
            'link'    => $link,
        ];
    }
}

usort($items, fn($a, $b) => $b['ts'] - $a['ts']);
$items = array_slice($items, 0, 10);
foreach ($items as &$i) unset($i['ts']);

echo json_encode(['news' => $items]);
