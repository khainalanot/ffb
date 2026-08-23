<?php
// Player news aggregator. Combines:
//   1. ESPN per-athlete news (rich summaries) — needs espn_id
//   2. Google News search RSS (broad coverage across many sources)
//   3. RotoBaller player-news RSS (keyword-matched)
// Returns headline + summary + source + date + link. Links point to the
// original article — full article text stays at the source.
//   GET api/news.php?player=Jonathan+Taylor&espn_id=4242335

require __DIR__ . '/lib.php';
ffb_api_guard();

$player = trim($_GET['player'] ?? '');
$espnId = preg_replace('/\D/', '', $_GET['espn_id'] ?? '');
if ($player === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Missing player.']);
    exit;
}

function clean_text($html, $max = 600) {
    $t = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $t = trim(preg_replace('/\s+/', ' ', $t));
    if (mb_strlen($t) > $max) $t = mb_substr($t, 0, $max - 1) . '…';
    return $t;
}

$items = [];
$seenLink = [];
$seenTitle = [];

function add_item(&$items, &$seenLink, &$seenTitle, $it) {
    if (!$it['link'] || !$it['title']) return;
    $tkey = mb_strtolower($it['title']);
    if (isset($seenLink[$it['link']]) || isset($seenTitle[$tkey])) return;
    $seenLink[$it['link']] = true;
    $seenTitle[$tkey] = true;
    $items[] = $it;
}

// --- 1. ESPN per-athlete news (rich blurbs) ---
if ($espnId !== '') {
    $raw = ffb_http_get_cached("https://site.api.espn.com/apis/site/v2/sports/football/nfl/athletes/$espnId/news", 1800);
    $data = $raw ? json_decode($raw, true) : null;
    foreach (($data['articles'] ?? []) as $a) {
        $link = $a['links']['web']['href'] ?? ($a['links']['mobile']['href'] ?? '');
        $ts = !empty($a['published']) ? strtotime($a['published']) : 0;
        add_item($items, $seenLink, $seenTitle, [
            'title'   => clean_text($a['headline'] ?? '', 200),
            'summary' => clean_text($a['description'] ?? ''),
            'source'  => 'ESPN',
            'date'    => $ts ? date('c', $ts) : null,
            'ts'      => $ts,
            'link'    => $link,
        ]);
    }
}

// --- 2. Google News search (broad coverage) ---
$q = rawurlencode('"' . $player . '" NFL');
$raw = ffb_http_get_cached("https://news.google.com/rss/search?q=$q&hl=en-US&gl=US&ceid=US:en", 1800);
$xml = $raw ? @simplexml_load_string($raw, 'SimpleXMLElement', LIBXML_NOCDATA) : null;
if ($xml && isset($xml->channel->item)) {
    foreach ($xml->channel->item as $it) {
        $title = clean_text((string) $it->title, 200);
        $source = trim((string) ($it->source ?? ''));
        // Google appends " - Source" to titles. Strip it: use the <source> element
        // when present, otherwise take the text after the last " - ".
        if ($source !== '') {
            $title = preg_replace('/\s*-\s*' . preg_quote($source, '/') . '\s*$/u', '', $title);
        } elseif (preg_match('/^(.*) - ([^-]{2,50})$/u', $title, $m)) {
            $title = trim($m[1]);
            $source = trim($m[2]);
        }
        $title = trim($title);
        $ts = strtotime((string) $it->pubDate) ?: 0;
        add_item($items, $seenLink, $seenTitle, [
            'title'   => $title,
            'summary' => '',
            'source'  => $source !== '' ? $source : 'Google News',
            'date'    => $ts ? date('c', $ts) : null,
            'ts'      => $ts,
            'link'    => (string) $it->link,
        ]);
    }
}

// --- 3. RotoBaller player-news RSS (keyword match) ---
$needle = mb_strtolower($player);
foreach (['https://www.rotoballer.com/player-news/feed', 'https://www.rotoballer.com/category/nfl/feed'] as $url) {
    $raw = ffb_http_get_cached($url, 1800);
    $xml = $raw ? @simplexml_load_string($raw, 'SimpleXMLElement', LIBXML_NOCDATA) : null;
    if (!$xml || !isset($xml->channel->item)) continue;
    foreach ($xml->channel->item as $it) {
        $title = (string) $it->title;
        $desc  = (string) $it->description;
        if (mb_strpos(mb_strtolower($title . ' ' . $desc), $needle) === false) continue;
        $ts = strtotime((string) $it->pubDate) ?: 0;
        add_item($items, $seenLink, $seenTitle, [
            'title'   => clean_text($title, 200),
            'summary' => clean_text($desc),
            'source'  => 'RotoBaller',
            'date'    => $ts ? date('c', $ts) : null,
            'ts'      => $ts,
            'link'    => (string) $it->link,
        ]);
    }
}

usort($items, fn($a, $b) => $b['ts'] - $a['ts']);
$items = array_slice($items, 0, 12);
foreach ($items as &$i) unset($i['ts']);

echo json_encode(['news' => $items]);
