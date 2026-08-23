<?php
// Player Fantasy Summary + Outlook from FreeDraftGuide / RTSports, fetched live
// and displayed WITH the required live linkback to rtsports.com (per their terms).
// Only the RTSports player id is stored in the repo; the prose is fetched here at
// runtime and cached briefly, never committed.
//   GET api/summary.php?pid=18220
//     -> {"summary": "...", "outlook": "...", "note": "...",
//         "link": "...", "attribution": "Data via RTSports.com"}

require __DIR__ . '/lib.php';
ffb_api_guard();

$pid = preg_replace('/\D/', '', $_GET['pid'] ?? '');
if ($pid === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Missing pid.']);
    exit;
}

function panel_text($html) {
    $t = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    return trim(preg_replace('/\s+/', ' ', $t));
}

$url = "https://www.freedraftguide.com/football/draft-guide-playercard-provider.php?PID=$pid";
$raw = ffb_http_get_cached($url, 21600); // 6h
$data = $raw ? json_decode($raw, true) : null;
if (!$data || isset($data['error'])) {
    echo json_encode(['summary' => '', 'outlook' => '', 'note' => '']);
    exit;
}

// fantasy_panel = "Fantasy Summary <ranks> <summary text> FANTASY OUTLOOK <outlook text>"
$fp = panel_text($data['fantasy_panel'] ?? '');
$summary = $fp;
$outlook = '';
if (preg_match('/FANTASY OUTLOOK/i', $fp)) {
    [$summary, $outlook] = preg_split('/FANTASY OUTLOOK/i', $fp, 2);
}
// strip the "Fantasy Summary … Overall Rank: N" header off the summary
$summary = preg_replace('/^.*?Overall Rank:\s*\d+/is', '', $summary);
$summary = trim($summary);
$outlook = trim($outlook);

// note_panel = "Player Notes <date> <note text> …" — keep the most recent note
$np = panel_text($data['note_panel'] ?? '');
$np = preg_replace('/^Player Notes\s*/i', '', $np);
$note = mb_substr($np, 0, 400);
if (mb_strlen($np) > 400) $note .= '…';

echo json_encode([
    'summary'     => $summary,
    'outlook'     => $outlook,
    'note'        => $note,
    'link'        => "https://www.freedraftguide.com/football/draft-guide-player.php?PID=$pid",
    'attribution' => 'Data via RTSports.com',
]);
