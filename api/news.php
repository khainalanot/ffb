<?php
// Player news aggregator. Pulls syndicated RSS feeds, filters items that mention
// the player, and returns headline + short summary + source + date + link.
// The link points to the original article — full text stays at the source.
//   GET api/news.php?player=Jonathan+Taylor -> {"news": [{title,summary,source,date,link}]}

require __DIR__ . '/lib.php';
ffb_api_guard();

$FEEDS = [
    ['RotoBaller', 'https://www.rotoballer.com/category/nfl/feed'],
    ['RotoBaller', 'https://www.rotoballer.com/feed'],
    ['FantasyPros', 'https://www.fantasypros.com/nfl/rss/news.php'],
];

$player = trim($_GET['player'] ?? '');
if ($player === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Missing player.']);
    exit;
}

function clean_text($html, $max = 240) {
    $t = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $t = trim(preg_replace('/\s+/', ' ', $t));
    if (mb_strlen($t) > $max) $t = mb_substr($t, 0, $max - 1) . '…';
    return $t;
}

$needle = mb_strtolower($player);
$items = [];
$seen = [];

foreach ($FEEDS as [$source, $url]) {
    $raw = ffb_http_get_cached($url, 1800);
    if (!$raw) continue;
    $xml = @simplexml_load_string($raw, 'SimpleXMLElement', LIBXML_NOCDATA);
    if (!$xml || !isset($xml->channel->item)) continue;

    foreach ($xml->channel->item as $it) {
        $title = (string) $it->title;
        $desc  = (string) $it->description;
        $hay = mb_strtolower($title . ' ' . $desc);
        if (mb_strpos($hay, $needle) === false) continue;

        $link = (string) $it->link;
        if (isset($seen[$link])) continue;
        $seen[$link] = true;

        $ts = strtotime((string) $it->pubDate) ?: null;
        $items[] = [
            'title'   => clean_text($title, 160),
            'summary' => clean_text($desc, 260),
            'source'  => $source,
            'date'    => $ts ? date('c', $ts) : null,
            'ts'      => $ts ?? 0,
            'link'    => $link,
        ];
    }
}

usort($items, fn($a, $b) => $b['ts'] - $a['ts']);
$items = array_slice($items, 0, 8);
foreach ($items as &$i) unset($i['ts']);

echo json_encode(['news' => $items]);
