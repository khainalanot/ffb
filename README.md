# FFB — Jake's Ranks

A visual, sortable draft board built from Jake's projections. Password-protected,
with Ryan's color tags, custom rank order, spreadsheet comments, and his own
comments — all editable right on the site.

## Features

- **Login gate** — one shared password (Ryan's), set in `api/config.php`.
- **All positions** — QB / RB / WR / TE / DST tabs.
- **Color tags** — Jake's QB color-coding is imported; Ryan can set a tag on any
  player (click the colored dot in Edit mode). Legend:
  - 🟢 Priority · 🟡 Like · 🟠 Like but injury-cautious · 🟢 Rookie (dark) · 🔵 Have/protected · 🔴 Ignore
- **Reds hidden by default** — toggle "Show ignored (red)" to see them.
- **Sort** by My rank, FPS, AUC$, or Color.
- **Edit mode** — drag the ⠿ handle to reorder (custom rank), click a dot to change color.
- **Comments** — a shared thread per player, plus any note Jake left in the spreadsheet.

## How the data works

- `data/rankings.json` is a static snapshot generated from the Excel file by
  `export_data.py`. The site never touches the Excel file.
- Ryan's edits (tags, rank order, comments) live in a MySQL database and are
  layered on top of the snapshot at load time — so **re-exporting the Excel file
  never wipes his edits**.

## Updating the projections (when the Excel file changes)

```bash
pip install -r requirements.txt   # first time only
python3 export_data.py
git add data/rankings.json
git commit -m "Update projections"
git push
```

Hostinger's Git integration redeploys automatically after the push.

## One-time Hostinger setup

1. **Create the database**
   - hPanel → **Databases → MySQL Databases**: create a database + user.
   - Note the database name, username, password, and host (usually `localhost`).

2. **Import the schema**
   - Open **phpMyAdmin** for that database → **Import** tab → upload `schema.sql`
     (or paste its contents into the SQL tab and run it).

3. **Connect the GitHub repo**
   - hPanel → **Advanced → Git**: connect `khainalanot/ffb` and point it at the
     domain/subdomain you want.

4. **Add credentials on the server**
   - In **File Manager**, go to `api/`, duplicate `config.example.php`, rename the
     copy to `config.php`, and fill in:
     - the database name / user / password / host from step 1, and
     - `site_password` — the password Ryan will type to log in.
   - `config.php` is in `.gitignore`, so it never goes to GitHub — you set it
     directly on the server.

That's it. The site is live at your domain; log in with `site_password`.

## Local preview (optional, for developers)

Needs PHP; the comment/edit features need a MySQL database too. With just PHP:

```bash
# create api/config.php with a site_password (DB features will be inert)
php -S localhost:8000
# open http://localhost:8000/index.php
```
