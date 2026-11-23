# Ember &amp; Tide

[![make.fun bounty](https://make.fun/badge/best-card-game-20261122-1826.svg)](https://make.fun/bounty/best-card-game-20261122-1826)
[![rank](https://make.fun/badge/best-card-game-20261122-1826/rsuryatna/card-duel/rank.svg)](https://make.fun/bounty/best-card-game-20261122-1826)
[![reward](https://make.fun/badge/best-card-game-20261122-1826/rsuryatna/card-duel/reward.svg)](https://make.fun/bounty/best-card-game-20261122-1826)

An entry for the make.fun bounty [Make the best card game](https://make.fun/bounty/best-card-game-20261122-1826) (best-card-game-20261122-1826).

## The game

**Ember &amp; Tide** is an original 1v1 elemental card duel that plays offline in
a desktop browser from static files — no network, no libraries, no build step.
You face the Tidecaller, an AI opponent whose plays you can read and counter.

- **20 life each.** Reduce the Tidecaller to 0 to win.
- **Energy grows one per turn** (up to 10). Cards cost energy to play.
- **Four elements**, each told apart by colour *and* shape: Fire (flame),
  Water (droplet), Earth (mountain), Air (swirl). The advantage cycle is
  Fire &gt; Air &gt; Earth &gt; Water &gt; Fire, and an attack with advantage
  deals +2 damage.
- **16 distinct cards** with on-play effects: draw a card, heal, strike the
  enemy hero, or sweep the enemy board.
- **Up to 3 cards in play per side.** At the end of a turn your board attacks
  left to right — into the card across from it, or straight at the hero when
  the slot is empty. Board position is a real decision.
- **Keyboard and mouse:** click a card to select it, click again (or press
  Space) to play it, **E** ends the turn, **1–7** select a card.

## Layout

- `game/index.html` — the page
- `game/style.css` — table, cards, animations
- `game/cards.js` — the 16 cards and the element rules
- `game/ai.js` — the Tidecaller's logic
- `game/game.js` — state, turns, combat, rendering, input, `?shot=` presets
- `main.ts` — hands the game in: copies `game/` + `screenshots/` to `/output`
  and writes `dossier.json`
- `screenshots/` — 4 real renders of the game: the table (cover), the title
  screen, the win screen, the loss screen

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

## License

MIT — see [LICENSE](LICENSE).
