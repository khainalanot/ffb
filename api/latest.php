<?php
// League-wide latest NFL analyst notes (RotoBaller player-news), for a quick
// draft-day scan. Returns headline + blurb + source + date + link. Cached ~30m.
//   GET api/latest.php -> {"news": [{title,summary,source,date,link}]}

require __DIR__ . '/lib.php';
ffb_api_guard();

function clean_text($html, $max = 500) {
    $t = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $t = trim(preg_replace('/\s+/', ' ', $t));
    if (mb_strlen($t) > $max) $t = mb_substr($t, 0, $max - 1) . '…';
    return $t;
}

$FEEDS = [
    'https://www.rotoballer.com/player-news/feed?sport=nfl',
    'https://www.rotoballer.com/category/nfl/feed',
];

$items = [];
$seen = [];
foreach ($FEEDS as $url) {
    $raw = ffb_http_get_cached($url, 1800);
    $xml = $raw ? @simplexml_load_string($raw, 'SimpleXMLElement', LIBXML_NOCDATA) : null;
    if (!$xml || !isset($xml->channel->item)) continue;
    foreach ($xml->channel->item as $it) {
        $link = (string) $it->link;
        if (!$link || isset($seen[$link])) continue;
        $title = clean_text((string) $it->title, 200);
        $desc = clean_text((string) $it->description);
        // NFL feed can still carry the odd other-sport item; drop obvious ones.
        if (preg_match('/\b(baseball|MLB|NBA|NHL|closer|bullpen|PGA|UFC|NASCAR)\b/i', $title . ' ' . $desc)) continue;
        $seen[$link] = true;
        $ts = strtotime((string) $it->pubDate) ?: 0;
        $items[] = [
            'title'   => $title,
            'summary' => $desc,
            'source'  => 'RotoBaller',
            'date'    => $ts ? date('c', $ts) : null,
            'ts'      => $ts,
            'link'    => $link,
        ];
    }
}

usort($items, fn($a, $b) => $b['ts'] - $a['ts']);
$items = array_slice($items, 0, 25);
foreach ($items as &$i) unset($i['ts']);

echo json_encode(['news' => $items]);
