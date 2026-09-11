# Pixel Warren

A pixel-art monster-hunting idle game. Click and auto-damage your way
through ten realms of rising difficulty (Whispering Forest through
Dragon's Peak), a roster of 77 monsters, spend gold on run upgrades,
spend Blessings in a permanent Village, and gamble a little along the way.

## Running it

```bash
npm install
node server.js
```

Then open `http://localhost:8080`. The one real dependency is `mariadb`
(for optional accounts, see below); everything else is Node's built-ins.
Without a `.env` at all, the server still runs fine in guest-only mode.

## Configuration

Copy `.env.example` to `.env` and adjust as needed (the server reads these
from `process.env`, so exporting them directly also works):

- `PORT` / `HOST`: where the server listens (default `8080` / `0.0.0.0`).
- `DATA_DIR`: where `save.json` is written for guest play. Point this at
  a mounted volume when this eventually runs in Docker.
- `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME`: MariaDB
  connection details for accounts and the leaderboard. Leave `DB_HOST`
  unset to run in guest-only mode (single JSON save file, no login).
- `BESTIARY=true`: design-review switch that reveals every monster's
  lore and power in the Bestiary regardless of what's been defeated.
  Leave unset for normal play (silhouettes until you find each one).
- `TOOLS=true`: enables the monster sprite editor at `/tool` (paint
  pixels, trace a reference image, save straight into
  `public/js/sprites.js`). Leave unset in production -- it writes to a
  source file on disk.
- `GOD=true`: every click kills the current target outright, bypassing
  shields/hydra invulnerability/math gates. For fast testing only.
- `MONSTERS=true`: enables the monster simulator at `/monsters` -- pick
  any monster from the full roster and fight it in an isolated test
  arena, independent of realm progress or your save.

## Accounts and leaderboard

With MariaDB configured, the server creates its own schema on boot
(`users`, `sessions`, `saves`, `leaderboard` -- no separate migration
step) and exposes:

- `POST /api/signup`, `POST /api/login`, `POST /api/logout`, `GET /api/me`
- `GET /api/leaderboard` -- top 20 by Blessings, then dragon kills.

Signing in switches `/api/save` from the local file to that account's row
in the `saves` table, via an `HttpOnly` session cookie. Guest play (no
account) is unaffected either way -- it's purely additive. Passwords are
hashed with `crypto.scrypt`; there's no rate limiting on login/signup yet.

Only one session is valid per account at a time -- logging in on another
tab or device deletes the previous session, so two copies of the game
can never both be autosaving the same account and clobbering each
other's progress. The older tab's next save silently falls back to
guest-file mode and it gets a toast explaining why.

Combat itself is still fully client-side, so an account does not yet
prevent someone from editing their own save client-side before it's
posted -- that requires moving the tick loop and action validation onto
the server, planned as a follow-up once accounts are solid.

## Project layout

- `server.js`: static file server, the account/session/leaderboard API,
  and `/api/save` (per-account when logged in, JSON-file otherwise).
- `public/index.html`: the page markup only. Pulls in `style.css` and the
  six files under `public/js/` in order (see below).
- `public/style.css`: all styling.
- `public/js/`: the game logic, split by concern and loaded in this
  order (later files call functions defined in earlier ones, so the
  order matters -- they're plain scripts sharing one global scope, not
  ES modules):
  1. `sprites.js` -- pixel-grid sprite data (`MONSTERS`, `DECOR`, icons)
     and `svgFromGrid`, the renderer that turns a character grid into SVG.
  2. `content.js` -- `LEVELS_RAW`/`LEVELS`, `UPGRADES`, `VILLAGE`,
     `BESTIARY`, `ACHIEVEMENTS`, and their small accessor helpers.
  3. `state.js` -- save/load (`persistLoad`/`persistSave`), `state` itself,
     derived stats (`clickDamage`, `dpsValue`, etc.).
  4. `render.js` -- the `el` DOM-reference table and every `render*`
     function, plus the roulette wheel.
  5. `combat.js` -- click/auto damage, kill handling, offline progress,
     the auto-DPS tick.
  6. `ui.js` -- event wiring, the account/leaderboard modal, pop-out
     battle view, and the boot sequence.
- `data/`: local guest save file (gitignored).
- `scripts/build-artifact.js`: inlines `index.html` + `style.css` +
  `js/*.js` into one self-contained file at `dist/pixel-warren.artifact.html`.
  Run `npm run build:artifact` before publishing to Claude Artifacts --
  an artifact has no server, so it can't load the split files separately.
  The save layer falls back to `localStorage` automatically when no
  server answers (accounts require a real server, so Artifact play is
  guest-only).

## Adding content

The game is data-driven in a few places worth knowing about if you're
extending it (all in `public/js/content.js` unless noted):

- **Levels** (`LEVELS_RAW`): push one object to add a realm. Only
  `key/name/enemies/boss/bossName/baseHp/baseGold` are required;
  everything else (lore, decor, boss abilities) has a default.
- **Upgrades** (`UPGRADES`): push one object with an `effect`/`format`
  pair and a `role` (which stat it feeds). Optional `requires` gates it
  behind another upgrade's level (or, with `source:'village'`, behind a
  Village building's level instead).
- **Village buildings** (`VILLAGE`): same shape as upgrades, but costed
  in Blessings and permanent across Ascends.
- **Boss abilities**: `shield`, `summon`, `regen`, and `mathGate` are
  implemented; see the comment above `LEVELS_RAW` for their config shape.
- **Sprites** (`public/js/sprites.js`): `MONSTERS`/`DECOR` entries are a
  palette plus a row-strings grid, turned into SVG by `svgFromGrid`.
- **Bestiary** (`BESTIARY`): lore and power text per monster key, shown
  once that monster's been defeated at least once. A sprite can opt out
  with `hideFromBestiary: true` (used for Matti's guardian, Julia, who
  isn't a "monster" in her own right).
- **Achievements** (`ACHIEVEMENTS`): unlocked via `unlockAchievement(id)`
  calls scattered at the relevant trigger points.
