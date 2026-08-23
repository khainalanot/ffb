# FFB — Jake's Ranks

A visual, sortable draft board built from Jake's projections. Password-protected,
with Ryan's color tags, custom rank order, spreadsheet comments, and his own
comments — all editable right on the site.

## Features

- **Login gate** — one shared password (Ryan's), set in `api/config.php`.
- **Tabs** — ALL, QB, RB, WR, TE, DST, and ★ Picks.
- **Color tags** — Jake's QB color-coding is imported; Ryan can tag any player
  (click the colored dot in Edit mode to cycle).
- **Editable legend** — "Edit legend" lets Ryan rename tags, change their colors,
  add new ones, delete, or mark any tag as "hidden by default".
- **Hidden-by-default tags** (e.g. Ignore) are filtered out unless "Show hidden" is on.
- **Picks** — in Edit mode, tap ☆ to mark a player as a pick; the ★ Picks tab
  shows everyone he's picked, across positions.
- **Sort** by My rank, FPS, AUC$, Color (and Pos in the ALL view).
- **Edit mode** — drag the ⠿ handle to reorder (custom rank), click a dot to
  change color, tap ☆ to pick.
- **Notes** — a thread per player; add, **edit, and delete** notes. Jake's original
  spreadsheet comments are imported as normal notes (author "Ryan") with their real
  timestamps — see `seed_comments.sql`.

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

2. **Import the schema (and Jake's notes)**
   - Open **phpMyAdmin** for that database → **Import** tab → upload `schema.sql`
     (or paste its contents into the SQL tab and run it).
   - Then import `seed_comments.sql` the same way — this loads Jake's 11 spreadsheet
     notes as normal, editable notes. It's safe to re-run (skips duplicates).

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
