# best-cooking-game

[![make.fun · best-cooking-game-20261125-0137](https://make.fun/badge/best-cooking-game-20261125-0137.svg)](https://make.fun/bounty/best-cooking-game-20261125-0137?utm_source=github&utm_medium=readme&utm_campaign=best-cooking-game-20261125-0137)
[![rank](https://make.fun/badge/best-cooking-game-20261125-0137/arefki/best-cooking-game/rank.svg)](https://make.fun/bounty/best-cooking-game-20261125-0137/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-cooking-game-20261125-0137)
[![reward](https://make.fun/badge/best-cooking-game-20261125-0137/arefki/best-cooking-game/reward.svg)](https://make.fun/bounty/best-cooking-game-20261125-0137?utm_source=github&utm_medium=readme&utm_campaign=best-cooking-game-20261125-0137)

**Sizzle & Serve — Rush Hour Kitchen.** An original, complete cooking game for the [make.fun "Make the best cooking game" bounty](https://make.fun/bounty/best-cooking-game-20261125-0137): a fast burger-rush game that plays offline in a desktop browser from its own static files.

## How to play

Orders land on the board with a patience timer. Click a ticket to pick it, then stack its dish on the plate — bottom to top. Patties go on the grill first (~6s to cook; pull them before they burn). Serve fast for tips, keep the combo alive, don't lose all 3 hearts. One 3-minute shift, escalating orders.

- **Mouse:** click tickets, ingredient bins, grill slots, SERVE.
- **Keys:** `1–6` ingredients · `S` serve · `T` clear plate · `R` restart · `Enter` start.

## Run it

```sh
# play locally (any static server over game/)
python3 -m http.server 8080 --directory game
# or: node serve via any static server, then open http://localhost:8080

# hand it in the way the grader does (Node 22)
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output dir and writes `dossier.json` with the vendored make.fun library (`vendor/makefun-game.ts`). Screenshots under `screenshots/` are real renders of the game (title, mid-service, plate ready to serve, shift summary) — deterministic scenes via `?shot=start|play|serve|end&seed=1`.

## Files

- `main.ts` — entry program (Node 22, stdlib only)
- `game/index.html`, `game/style.css`, `game/game.js` — the game (no libraries, no network)
- `screenshots/` — 4 JPEG renders of the game running
- `vendor/makefun-game.ts` — make.fun dossier library, copied from the kit unchanged
- `LICENSE` — MIT
