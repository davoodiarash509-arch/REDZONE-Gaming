# REDZONE Gaming

A bilingual (Persian/English) gaming portal with a black/red theme, Node.js/Express backend, SQLite database and admin dashboard.

See [README_FA.md](README_FA.md) for Windows installation and setup instructions.

## Quick start
1. Install Node.js 20+.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and set a long random `SESSION_SECRET`.
4. Run `npm run create-admin` and choose your admin credentials.
5. Run `npm start`.
6. Open `http://localhost:3000` and `http://localhost:3000/admin/login`.

Do not expose `.env` or `data/`. For public deployment, use HTTPS, set `NODE_ENV=production`, configure a strong secret, and back up the SQLite database and uploads.
