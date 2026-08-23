#!/usr/bin/env python3
"""
Re-export Jakes Ranks data from the Excel file into data/rankings.json.

Run this any time the Excel file is updated:
    python3 export_data.py

Then commit + push the updated data/rankings.json (Hostinger's Git
integration will redeploy automatically).
"""
import json
import re
import sys
from pathlib import Path

from openpyxl import load_workbook

SCRIPT_DIR = Path(__file__).resolve().parent
XLSX_PATH = SCRIPT_DIR.parent / "2026-FFB-Projections-0805-1 (1).xlsx"
OUTPUT_PATH = SCRIPT_DIR / "data" / "rankings.json"
SHEET_NAME = "Jakes Ranks"

HEADERS = [
    "rank", "player", "team", "bye",
    "pass_att", "comp", "pass_yards", "pass_td", "int",
    "rush_att", "rush_yards", "rush_td", "fps", "auction",
]

# Jake's color legend (fill color -> tag)
COLOR_MAP = {
    "FFFF0000": "ignore",         # red
    "FF00FF00": "priority",       # bright green
    "FFFFFF00": "like",           # yellow
    "FFFFA500": "caution",        # orange
    "FFFFC000": "caution",        # orange (Excel's default "orange" swatch)
    "FF0000FF": "have",           # blue
    "FF0070C0": "have",           # blue (Excel's default "blue" swatch)
    "FF6AA84F": "rookie",         # darker green
    "FF38761D": "rookie",         # darker green (alt shade)
}
NO_FILL = {None, "00000000", "FFFFFFFF"}


def is_error(value):
    return isinstance(value, str) and value.startswith("#")


def clean_comment(text):
    if not text:
        return None
    # Strip the "======\nID#...\nAuthor   (timestamp)\n" header Excel/Sheets prepends
    lines = text.split("\n")
    body_lines = []
    skipping_header = True
    for line in lines:
        if skipping_header:
            if line.strip() == "======" or line.strip().startswith("ID#"):
                continue
            if re.match(r"^.+\(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\)\s*$", line.strip()):
                continue
            skipping_header = False
        body_lines.append(line)
    return "\n".join(body_lines).strip() or text.strip()


def main():
    wb = load_workbook(XLSX_PATH, data_only=True)
    if SHEET_NAME not in wb.sheetnames:
        sys.exit(f"Sheet '{SHEET_NAME}' not found in {XLSX_PATH.name}")
    ws = wb[SHEET_NAME]

    rows = []
    for row in ws.iter_rows(min_row=2, max_col=len(HEADERS)):
        values = [c.value for c in row]
        player = values[1]
        if not player or is_error(player):
            continue

        record = dict(zip(HEADERS, values))
        for key in ("fps", "auction"):
            if isinstance(record.get(key), (int, float)):
                record[key] = round(record[key], 1)

        name_cell = row[1]
        rgb = None
        if name_cell.fill and name_cell.fill.fgColor:
            rgb = name_cell.fill.fgColor.rgb
        record["tag"] = COLOR_MAP.get(rgb) if rgb not in NO_FILL else None

        excel_comment = None
        for cell in row:
            if cell.comment:
                excel_comment = clean_comment(cell.comment.text)
                break
        record["excel_comment"] = excel_comment

        rows.append(record)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps({"players": rows}, indent=2))
    print(f"Wrote {len(rows)} players to {OUTPUT_PATH.relative_to(SCRIPT_DIR)}")


if __name__ == "__main__":
    main()
