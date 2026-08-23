# FFB — Jake's Ranks

A visual, sortable version of Jake's QB rankings, with his color-coded
priority tags, his own spreadsheet comments, and a shared comment box
anyone can post to.

## How it works

- `data/rankings.json` is a static snapshot generated from the Excel file
  by `export_data.py`. The site itself never touches the Excel file.
- `index.html` / `style.css` / `app.js` render the table from that JSON.
- `api/comments.php` is a tiny PHP + MySQL backend so comments posted on
  the site are shared with everyone who visits, not just saved locally.

## Updating the data (whenever the Excel file changes)

```bash
pip install -r requirements.txt   # first time only
python3 export_data.py
git add data/rankings.json
git commit -m "Update rankings"
git push
```

Hostinger's Git integration will redeploy automatically after the push.

## One-time Hostinger setup

1. **Create the database**
   - In hPanel, go to **Databases > MySQL Databases** and create a new database + user.
   - Note the database name, username, password, and host (usually `localhost`).

2. **Import the schema**
   - Open **phpMyAdmin** for that database, go to the **Import** tab, and upload `schema.sql`
     (or paste its contents into the SQL tab and run it).

3. **Connect the GitHub repo**
   - In hPanel, go to **Advanced > Git**, and connect this repository
     (`khainalanot/ffb`). Point it at the domain/subdomain you want to serve it from.

4. **Add your DB credentials on the server**
   - After the first deploy, use Hostinger's **File Manager** to go to the `api/` folder.
   - Duplicate `config.example.php`, rename the copy to `config.php`, and fill in the
     database name/user/password/host from step 1.
   - `config.php` is intentionally **not** in the git repo (it's in `.gitignore`) so your
     database password never ends up on GitHub — you set it directly on the server.

That's it — the site is live, and `api/comments.php` will start reading/writing
to the `comments` table.

## Local preview

You can preview the frontend locally without the comment feature working
(no PHP server running locally):

```bash
python3 -m http.server 8000
# open http://localhost:8000
```
