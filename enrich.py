#!/usr/bin/env python3
"""
Enrichment for export_data.py — pulls free, factual player data and attaches it
to each player record:

  - Sleeper  (bio, headshot, injury status, sleeper_id/espn_id)
  - Fantasy Football Calculator (ADP)
  - nflverse (year-by-year career stats, last completed seasons)

All network calls fail soft: if a source is unreachable, that field is simply
left empty and the export still succeeds. Also writes data/sleeper_map.json
(a tiny id -> {name, pos, team} map) so the live trending endpoint can resolve
Sleeper player ids to names without downloading the full 14 MB player file.
"""
import csv
import io
import json
import re
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SLEEPER_MAP_PATH = SCRIPT_DIR / "data" / "sleeper_map.json"

SLEEPER_PLAYERS = "https://api.sleeper.app/v1/players/nfl"
FFCALC_ADP = "https://fantasyfootballcalculator.com/api/v1/adp/ppr?teams=12&year={year}"
NFLVERSE_SEASON = ("https://github.com/nflverse/nflverse-data/releases/download/"
                   "player_stats/player_stats_season_{year}.csv")

SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}


def _get(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 FFB"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def norm(name):
    if not name:
        return ""
    s = name.lower().replace(".", "").replace("'", "").replace("-", " ")
    parts = [p for p in s.split() if p not in SUFFIXES]
    return " ".join(parts)


# ---------- Sleeper: bio / headshot / injury / ids ----------

def load_sleeper():
    """Return {(norm_name, pos): sleeper_record} and write the id->name map."""
    try:
        data = json.loads(_get(SLEEPER_PLAYERS))
    except Exception as e:
        print(f"  ! Sleeper unavailable ({e}); skipping bios/headshots")
        return {}
    by_key = {}
    id_map = {}
    for pid, p in data.items():
        pos = p.get("position")
        name = p.get("full_name") or ""
        if p.get("team") and pos in {"QB", "RB", "WR", "TE"}:
            id_map[pid] = {"n": name, "pos": pos, "tm": p.get("team")}
        if not name or not pos:
            continue
        by_key[(norm(name), pos)] = {
            "sleeper_id": pid,
            "espn_id": p.get("espn_id"),
            "number": p.get("number"),
            "height": p.get("height"),
            "weight": p.get("weight"),
            "years_exp": p.get("years_exp"),
            "college": p.get("college"),
            "age": p.get("age"),
            "injury_status": p.get("injury_status"),
            "headshot": f"https://sleepercdn.com/content/nfl/players/{pid}.jpg",
        }
    SLEEPER_MAP_PATH.parent.mkdir(parents=True, exist_ok=True)
    SLEEPER_MAP_PATH.write_text(json.dumps(id_map))
    print(f"  Sleeper: {len(by_key)} players, wrote {len(id_map)} to sleeper_map.json")
    return by_key


# ---------- FFCalc: ADP ----------

def load_adp():
    for year in (2026, 2025):
        try:
            data = json.loads(_get(FFCALC_ADP.format(year=year), timeout=20))
            if data.get("players"):
                out = {}
                for p in data["players"]:
                    out[(norm(p["name"]), p["position"])] = p.get("adp")
                print(f"  ADP: {len(out)} players (FFCalc {year})")
                return out
        except Exception:
            continue
    print("  ! ADP unavailable; skipping")
    return {}


# ---------- nflverse: career stats ----------

CAREER_FIELDS = {
    "QB": [("Pass Yds", "passing_yards"), ("Pass TD", "passing_tds"), ("INT", "interceptions"),
           ("Rush Yds", "rushing_yards"), ("Rush TD", "rushing_tds")],
    "RB": [("Rush Yds", "rushing_yards"), ("Rush TD", "rushing_tds"), ("Rec", "receptions"),
           ("Rec Yds", "receiving_yards"), ("Rec TD", "receiving_tds")],
    "WR": [("Rec", "receptions"), ("Rec Yds", "receiving_yards"), ("Rec TD", "receiving_tds"),
           ("Rush Yds", "rushing_yards")],
    "TE": [("Rec", "receptions"), ("Rec Yds", "receiving_yards"), ("Rec TD", "receiving_tds")],
}


def _num(v):
    try:
        f = float(v)
        return int(round(f))
    except (TypeError, ValueError):
        return 0


def load_careers(years=(2024, 2023, 2022)):
    """Return {(norm_name, pos): [ {season, team, games, stats{}}, ... ] } newest first."""
    careers = {}
    got = []
    for year in years:
        try:
            raw = _get(NFLVERSE_SEASON.format(year=year), timeout=40).decode("utf-8", "replace")
        except Exception:
            continue
        reader = csv.DictReader(io.StringIO(raw))
        for row in reader:
            if row.get("season_type") not in (None, "", "REG"):
                continue
            pos = row.get("position")
            if pos not in CAREER_FIELDS:
                continue
            name = row.get("player_display_name") or row.get("player_name")
            key = (norm(name), pos)
            stats = {label: _num(row.get(col)) for label, col in CAREER_FIELDS[pos]}
            careers.setdefault(key, []).append({
                "season": int(row["season"]),
                "team": row.get("recent_team"),
                "games": _num(row.get("games")),
                "stats": stats,
            })
        got.append(year)
    for key in careers:
        careers[key].sort(key=lambda r: r["season"], reverse=True)
    if got:
        print(f"  Careers: {len(careers)} players (seasons {got})")
    else:
        print("  ! nflverse unavailable; skipping career stats")
    return careers


# ---------- apply ----------

def enrich(players):
    sleeper = load_sleeper()
    adp = load_adp()
    careers = load_careers()
    matched_bio = matched_adp = matched_car = 0
    for p in players:
        key = (norm(p["player"]), p["position"])
        s = sleeper.get(key)
        if s:
            p["bio"] = {k: s[k] for k in ("number", "height", "weight", "years_exp", "college", "age")}
            p["headshot"] = s["headshot"]
            p["injury_status"] = s.get("injury_status")
            p["sleeper_id"] = s["sleeper_id"]
            matched_bio += 1
        if key in adp and adp[key] is not None:
            p["adp"] = adp[key]
            matched_adp += 1
        if key in careers:
            p["career"] = careers[key]
            matched_car += 1
    print(f"  Matched: {matched_bio} bios, {matched_adp} ADP, {matched_car} careers "
          f"of {len(players)} players")
    return players
