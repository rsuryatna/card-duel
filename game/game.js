// Ember & Tide — game state, turn logic, rendering, input and the ?shot=
// screenshot presets. Vanilla DOM, no libraries, no network. The game is a
// 1v1 elemental card duel: you vs the Tidecaller, 20 life each, energy that
// grows one per turn, up to 3 cards in play per side. At the end of a turn
// the side's board attacks left to right: into the card across from it, or
// straight at the enemy hero when the slot is empty.

(function () {
  'use strict';

  var MAX_LIFE = 20;
  var MAX_BOARD = 3;
  var MAX_HAND = 7;
  var MAX_ENERGY = 10;

  // ---------- state ----------

  var state = null;
  var busy = false; // true while combat / AI animations run

  function freshSide(seed) {
    return {
      life: MAX_LIFE,
      energy: 0,
      maxEnergy: 0,
      deck: buildDeck(seed),
      hand: [],
      board: [null, null, null],
      discard: [],
    };
  }

  function newGame(seed) {
    state = {
      seed: seed || 1,
      screen: 'title',
      turn: 0,
      phase: 'player',
      you: freshSide((seed || 1) + 11),
      opp: freshSide((seed || 1) + 77),
      selected: -1,
      stats: { turns: 0, cardsPlayed: 0, damageDealt: 0 },
      log: 'Welcome to Ember & Tide.',
    };
    // Opening hands of 4.
    for (var i = 0; i < 4; i++) {
      drawCard(state.you);
      drawCard(state.opp);
    }
    showScreen('title');
    setMessage('Welcome to Ember & Tide. Press Click to Play.');
    render();
  }

  // ---------- helpers ----------

  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function setMessage(text) {
    state.log = text;
    var el = $('message');
    if (el) el.textContent = text;
  }

  function drawCard(side) {
    if (side.deck.length === 0) {
      if (side.discard.length === 0) return null;
      // Reshuffle the discard pile into a fresh deck (seeded, deterministic).
      var rng = mulberry32(state.seed * 31 + side.discard.length);
      var d = side.discard.slice();
      side.discard = [];
      for (var i = d.length - 1; i > 0; i--) {
        var j = Math.floor(rng() * (i + 1));
        var t = d[i]; d[i] = d[j]; d[j] = t;
      }
      side.deck = d;
    }
    var id = side.deck.pop();
    if (side.hand.length >= MAX_HAND) return { discarded: id };
    side.hand.push(summonCard(cardDef(id), side === state.you ? 'you' : 'opp'));
    return { drawn: id };
  }

  function boardCount(side) {
    var n = 0;
    for (var i = 0; i < MAX_BOARD; i++) if (side.board[i]) n++;
    return n;
  }

  function firstEmptySlot(side) {
    for (var i = 0; i < MAX_BOARD; i++) if (!side.board[i]) return i;
    return -1;
  }

  // ---------- effects ----------

  function applyEffect(card, owner) {
    var me = owner === 'you' ? state.you : state.opp;
    var foe = owner === 'you' ? state.opp : state.you;
    var fx = card.effect;
    if (!fx) return;
    if (fx.kind === 'draw') {
      for (var i = 0; i < fx.value; i++) drawCard(me);
      setMessage(card.name + ': draw ' + fx.value + ' card' + (fx.value > 1 ? 's' : '') + '.');
    } else if (fx.kind === 'heal') {
      me.life = Math.min(MAX_LIFE, me.life + fx.value);
      setMessage(card.name + ': heal ' + fx.value + ' life.');
      floatText(owner === 'you' ? 'you-life' : 'opp-life', '+' + fx.value, true);
    } else if (fx.kind === 'strike') {
      damageHero(foe, fx.value, owner === 'you' ? 'opp' : 'you');
      setMessage(card.name + ': deal ' + fx.value + ' to the enemy hero.');
    } else if (fx.kind === 'sweep') {
      for (var s = 0; s < MAX_BOARD; s++) {
        if (foe.board[s]) damageBoardCard(foe, s, fx.value);
      }
      setMessage(card.name + ': deal ' + fx.value + ' to all enemy cards.');
    }
    render();
  }

  // ---------- damage ----------

  function damageHero(side, amount, who) {
    // `who` is the side taking the damage ('you' or 'opp'). Damage dealt TO
    // the opponent counts toward the player's damage stat.
    side.life = Math.max(0, side.life - amount);
    if (who === 'opp') state.stats.damageDealt += amount;
    floatText(who === 'you' ? 'you-life' : 'opp-life', '-' + amount, false);
    var row = $(who === 'you' ? 'you-row' : 'opp-row');
    if (row) { row.classList.remove('flash-red'); void row.offsetWidth; row.classList.add('flash-red'); }
    render();
    checkEnd();
  }

  function damageBoardCard(side, slot, amount) {
    var card = side.board[slot];
    if (!card) return false;
    card.health -= amount;
    var el = document.querySelector('[data-uid="' + card.uid + '"]');
    if (el) {
      el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
      var r = el.getBoundingClientRect();
      var stage = $('stage').getBoundingClientRect();
      floatTextAt(r.left - stage.left + r.width / 2, r.top - stage.top + 10, '-' + amount, false);
    }
    if (card.health <= 0) {
      side.board[slot] = null;
      side.discard.push(card.id);
    }
    render();
    return true;
  }

  function checkEnd() {
    if (!state || state.screen === 'win' || state.screen === 'loss') return;
    if (state.opp.life <= 0) {
      state.screen = 'win';
      $('win-stats').innerHTML =
        'Won in <b>' + state.stats.turns + '</b> turns &middot; <b>' + state.stats.cardsPlayed +
        '</b> cards played &middot; <b>' + state.stats.damageDealt + '</b> damage dealt';
      showScreen('win');
    } else if (state.you.life <= 0) {
      state.screen = 'loss';
      $('loss-stats').innerHTML =
        'Survived <b>' + state.stats.turns + '</b> turns &middot; <b>' + state.stats.cardsPlayed +
        '</b> cards played &middot; the Tidecaller had <b>' + state.opp.life + '</b> life left';
      showScreen('loss');
    }
    render();
  }

  // ---------- playing cards ----------

  function canPlay(handIndex) {
    if (!state || state.screen !== 'play' || state.phase !== 'player' || busy) return false;
    var card = state.you.hand[handIndex];
    if (!card) return false;
    if (card.cost > state.you.energy) return false;
    if (firstEmptySlot(state.you) === -1) return false;
    return true;
  }

  function playCard(handIndex, silent) {
    if (!canPlay(handIndex)) return false;
    var card = state.you.hand[handIndex];
    var slot = firstEmptySlot(state.you);
    state.you.energy -= card.cost;
    state.you.hand.splice(handIndex, 1);
    card.justPlayed = true;
    state.you.board[slot] = card;
    state.stats.cardsPlayed += 1;
    state.selected = -1;
    if (!silent) setMessage('You play ' + card.name + ' (' + card.attack + ' attack).');
    render();
    applyEffect(card, 'you');
    return true;
  }

  // ---------- turns and combat ----------

  function startPlayerTurn() {
    if (state.screen !== 'play') return;
    state.turn += 1;
    state.stats.turns = state.turn;
    state.phase = 'player';
    state.you.maxEnergy = Math.min(MAX_ENERGY, state.you.maxEnergy + 1);
    state.you.energy = state.you.maxEnergy;
    var drawn = drawCard(state.you);
    setMessage('Turn ' + state.turn + ': +' + state.you.maxEnergy + ' energy' +
      (drawn && drawn.drawn ? ', drew a card.' : ', hand full.'));
    $('turn-badge').textContent = 'Turn ' + state.turn;
    render();
  }

  // One board attacks, slot by slot, left to right. Each attacker hits the
  // card across from it (with the elemental advantage bonus) or the hero.
  async function combatPhase(attackerSide, defenderSide, attackerWho) {
    for (var slot = 0; slot < MAX_BOARD; slot++) {
      var atk = attackerSide.board[slot];
      if (!atk) continue;
      if (state.screen === 'win' || state.screen === 'loss') return;
      var def = defenderSide.board[slot];
      var el = document.querySelector('[data-uid="' + atk.uid + '"]');
      if (el) {
        el.classList.remove('lunge', 'lunge-down'); void el.offsetWidth;
        el.classList.add(attackerWho === 'you' ? 'lunge' : 'lunge-down');
      }
      await sleep(420);
      if (def) {
        var bonus = advantageBonus(atk.element, def.element);
        var dmg = atk.attack + bonus;
        setMessage(atk.name + ' attacks ' + def.name +
          (bonus ? ' — elemental advantage, +' + bonus + '!' : '') + ' for ' + dmg + '.');
        damageBoardCard(defenderSide, slot, dmg);
      } else {
        setMessage(atk.name + ' strikes the ' + (attackerWho === 'you' ? 'Tidecaller' : 'hero') +
          ' for ' + atk.attack + '.');
        damageHero(defenderSide, atk.attack, attackerWho === 'you' ? 'opp' : 'you');
      }
      if (el) { el.classList.remove('lunge', 'lunge-down'); }
      await sleep(280);
      if (state.screen === 'win' || state.screen === 'loss') return;
    }
  }

  async function endTurn() {
    if (!state || state.screen !== 'play' || state.phase !== 'player' || busy) return;
    busy = true;
    state.selected = -1;
    render();
    // Your board attacks first.
    await combatPhase(state.you, state.opp, 'you');
    if (state.screen === 'win' || state.screen === 'loss') { busy = false; return; }
    // Then the Tidecaller takes its turn.
    await aiTurn();
    if (state.screen === 'win' || state.screen === 'loss') { busy = false; return; }
    busy = false;
    startPlayerTurn();
  }

  async function aiTurn() {
    state.phase = 'ai';
    $('turn-badge').textContent = 'Tidecaller';
    state.opp.maxEnergy = Math.min(MAX_ENERGY, state.opp.maxEnergy + 1);
    state.opp.energy = state.opp.maxEnergy;
    drawCard(state.opp);
    setMessage('The Tidecaller draws and thinks…');
    render();
    await sleep(650);
    var plays = chooseAIPlays(state.opp.hand, state.opp.energy, MAX_BOARD - boardCount(state.opp), state.you.board.filter(Boolean));
    // chooseAIPlays returns indexes into the hand as it was when called, so
    // snapshot the intended cards by identity before any play shrinks the
    // hand: re-reading plays[k] against the shifted hand would play the
    // wrong card (e.g. hand [A,B,C,D], plays [0,2] means A then C, but after
    // A leaves, index 2 of [B,C,D] is D, not C).
    var planned = plays.map(function (i) { return state.opp.hand[i]; }).filter(Boolean);
    for (var k = 0; k < planned.length; k++) {
      var card = planned[k];
      var idx = state.opp.hand.indexOf(card);
      if (idx === -1) continue;
      if (card.cost > state.opp.energy) continue;
      var slot = firstEmptySlot(state.opp);
      if (slot === -1) break;
      state.opp.energy -= card.cost;
      state.opp.hand.splice(idx, 1);
      card.justPlayed = true;
      state.opp.board[slot] = card;
      setMessage('Tidecaller plays ' + card.name + ' (' + card.attack + ' attack).');
      render();
      await sleep(650);
      applyEffect(card, 'opp');
      if (state.screen === 'win' || state.screen === 'loss') return;
    }
    if (!plays.length) setMessage('The Tidecaller plays nothing and holds its energy.');
    await sleep(500);
    await combatPhase(state.opp, state.you, 'opp');
  }

  // ---------- rendering ----------

  function elIcon(element) {
    var icon = ELEMENTS[element] ? ELEMENTS[element].icon : 'icon-flame';
    return '<span class="el-icon"><svg><use href="#' + icon + '"/></svg></span>';
  }

  function cardElement(card, opts) {
    opts = opts || {};
    var div = document.createElement('div');
    div.className = 'card el-' + card.element + (card.justPlayed ? ' just-played' : '');
    div.setAttribute('data-uid', card.uid);
    if (opts.index !== undefined) div.setAttribute('data-hand-index', String(opts.index));
    var effect = card.effectText ? card.effectText : 'A sturdy elemental.';
    div.innerHTML =
      '<div class="card-top">' +
        '<span class="cost">' + card.cost + '</span>' +
        elIcon(card.element) +
        '<span class="el-name">' + elementName(card.element) + '</span>' +
      '</div>' +
      '<div class="art">' + elIcon(card.element).replace('el-icon', 'el-icon') + '</div>' +
      '<div class="name">' + card.name + '</div>' +
      '<div class="effect">' + effect + '</div>' +
      '<div class="stats">' +
        '<span class="atk"><span class="lbl">ATK</span>' + card.attack + '</span>' +
        '<span class="hp"><span class="lbl">HP</span>' + card.health + '</span>' +
      '</div>';
    // The art icon is bigger than the header icon: swap its size via CSS (.art svg).
    return div;
  }

  function renderBoard(side, containerId) {
    var container = $(containerId);
    // Keep the label, drop the old slots/cards.
    var label = container.querySelector('.board-label');
    container.innerHTML = '';
    if (label) container.appendChild(label);
    for (var i = 0; i < MAX_BOARD; i++) {
      var card = side.board[i];
      if (card) {
        var el = cardElement(card);
        card.justPlayed = false;
        container.appendChild(el);
      } else {
        var slot = document.createElement('div');
        slot.className = 'slot';
        slot.textContent = 'empty';
        container.appendChild(slot);
      }
    }
  }

  function renderHand() {
    var handEl = $('hand');
    handEl.innerHTML = '';
    state.you.hand.forEach(function (card, index) {
      var el = cardElement(card, { index: index });
      if (state.phase === 'player' && !busy && state.screen === 'play') {
        if (card.cost <= state.you.energy && firstEmptySlot(state.you) !== -1) {
          el.classList.add('playable');
        } else {
          el.classList.add('cant-afford');
        }
      }
      if (index === state.selected) el.classList.add('selected');
      el.addEventListener('click', function () { onHandCardClick(index); });
      handEl.appendChild(el);
    });
  }

  function renderOppHand() {
    var el = $('opp-hand');
    el.innerHTML = '';
    var n = Math.min(state.opp.hand.length, 7);
    for (var i = 0; i < n; i++) {
      var back = document.createElement('div');
      back.className = 'mini-back';
      el.appendChild(back);
    }
    var count = document.createElement('span');
    count.className = 'count';
    count.textContent = state.opp.hand.length + ' cards';
    el.appendChild(count);
  }

  function render() {
    if (!state) return;
    $('you-life').textContent = String(state.you.life);
    $('opp-life').textContent = String(state.opp.life);
    $('you-energy').textContent = String(state.you.energy) + '/' + state.you.maxEnergy;
    $('opp-energy').textContent = String(state.opp.energy) + '/' + state.opp.maxEnergy;
    $('you-deck').textContent = String(state.you.deck.length);
    $('opp-deck').textContent = String(state.opp.deck.length);
    $('message').textContent = state.log;
    $('turn-badge').textContent = state.phase === 'ai' ? 'Tidecaller' : 'Turn ' + Math.max(1, state.turn);
    var btn = $('end-turn');
    btn.disabled = !(state.screen === 'play' && state.phase === 'player' && !busy);
    renderBoard(state.opp, 'opp-board');
    renderBoard(state.you, 'you-board');
    renderHand();
    renderOppHand();
    var countEl = $('you-hand-count');
    countEl.innerHTML = '<span class="count">Hand ' + state.you.hand.length + '/' + MAX_HAND + '</span>';
  }

  function floatTextAt(x, y, text, isHeal) {
    var stage = $('stage');
    var span = document.createElement('div');
    span.className = 'dmg' + (isHeal ? ' heal' : '');
    span.textContent = text;
    span.style.left = x + 'px';
    span.style.top = y + 'px';
    stage.appendChild(span);
    setTimeout(function () { span.remove(); }, 1050);
  }

  function floatText(anchorId, text, isHeal) {
    var anchor = $(anchorId);
    if (!anchor) return;
    var r = anchor.getBoundingClientRect();
    var stage = $('stage').getBoundingClientRect();
    floatTextAt(r.left - stage.left + r.width / 2 - 14, r.top - stage.top - 8, text, isHeal);
  }

  // ---------- screens ----------

  function showScreen(name) {
    state.screen = name;
    $('title-screen').classList.toggle('hidden', name !== 'title');
    $('win-screen').classList.toggle('hidden', name !== 'win');
    $('loss-screen').classList.toggle('hidden', name !== 'loss');
    render();
  }

  function startGame() {
    state.screen = 'play';
    state.turn = 0;
    showScreen('play');
    startPlayerTurn();
  }

  // ---------- input ----------

  function onHandCardClick(index) {
    if (!state || state.screen !== 'play' || state.phase !== 'player' || busy) return;
    if (state.selected === index) {
      playCard(index);
    } else {
      state.selected = index;
      var card = state.you.hand[index];
      setMessage(card.name + ' selected — click again or press Space to play it (' +
        card.cost + ' energy, you have ' + state.you.energy + ').');
      render();
    }
  }

  function playSelected() {
    if (state.selected >= 0) playCard(state.selected);
  }

  document.addEventListener('keydown', function (e) {
    if (!state) return;
    if (state.screen === 'title' && (e.key === 'Enter' || e.key === ' ')) { startGame(); return; }
    if (state.screen === 'win' || state.screen === 'loss') {
      if (e.key === 'Enter') { newGame(state.seed + 1); startGame(); }
      return;
    }
    if (state.screen !== 'play') return;
    if (e.key === 'e' || e.key === 'E') { endTurn(); }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); playSelected(); }
    else if (e.key >= '1' && e.key <= '7') {
      var idx = Number(e.key) - 1;
      if (idx < state.you.hand.length) onHandCardClick(idx);
    }
  });

  $('play-btn').addEventListener('click', startGame);
  $('end-turn').addEventListener('click', endTurn);
  $('win-again-btn').addEventListener('click', function () { newGame(state.seed + 1); startGame(); });
  $('loss-again-btn').addEventListener('click', function () { newGame(state.seed + 1); startGame(); });

  // Clicking your board while a card is selected plays it there.
  $('you-board').addEventListener('click', function () { playSelected(); });

  // ---------- stage scaling ----------

  function fitStage() {
    var scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    $('stage').style.transform = 'translate(-50%, -50%) scale(' + scale + ')';
  }
  window.addEventListener('resize', fitStage);
  fitStage();

  // ---------- ?shot= presets (deterministic staged states for screenshots) ----------

  function stagePlayShot() {
    // A dense mid-game table, built by hand — no randomness.
    newGame(1);
    state.screen = 'play';
    state.turn = 6;
    state.stats.turns = 6;
    state.you.life = 14;
    state.opp.life = 11;
    state.you.maxEnergy = 6; state.you.energy = 6;
    state.opp.maxEnergy = 5; state.opp.energy = 2;
    // Your board: Ember Drake (full health) and Coral Guard (hurt).
    var drake = summonCard(cardDef('ember-drake'), 'you');
    var guard = summonCard(cardDef('coral-guard'), 'you');
    guard.health = 2;
    state.you.board = [drake, guard, null];
    // Tidecaller's board: Gale Hawk and a hurt Pebble Golem.
    var hawk = summonCard(cardDef('gale-hawk'), 'opp');
    var golem = summonCard(cardDef('pebble-golem'), 'opp');
    golem.health = 1;
    state.opp.board = [hawk, golem, null];
    // Your hand: five readable cards.
    state.you.hand = ['flame-imp', 'tide-sprite', 'stone-titan', 'zephyr-wisp', 'sky-tempest']
      .map(function (id) { return summonCard(cardDef(id), 'you'); });
    state.opp.hand = ['ember-spark', 'thorn-bramble', 'storm-eagle', 'deep-leviathan']
      .map(function (id) { return summonCard(cardDef(id), 'opp'); });
    state.you.deck = buildDeck(101).slice(0, 18);
    state.opp.deck = buildDeck(202).slice(0, 21);
    state.phase = 'player';
    setMessage('Tidecaller plays Gale Hawk — your Ember Drake is ready to strike.');
    showScreen('play');
    // One card mid-lunge, so the shot reads as a game in motion.
    setTimeout(function () {
      var el = document.querySelector('[data-uid="' + drake.uid + '"]');
      if (el) el.classList.add('lunge');
      window.__shotReady = true;
    }, 120);
  }

  function stageEndShot(won) {
    newGame(1);
    state.screen = 'play';
    state.turn = 9;
    state.stats.turns = 9;
    state.stats.cardsPlayed = 14;
    state.stats.damageDealt = won ? 22 : 9;
    state.you.life = won ? 9 : 0;
    state.opp.life = won ? 0 : 7;
    state.you.maxEnergy = 8; state.you.energy = 3;
    state.opp.maxEnergy = 8; state.opp.energy = 1;
    var phoenix = summonCard(cardDef('inferno-phoenix'), 'you');
    var titan = summonCard(cardDef('stone-titan'), 'you');
    state.you.board = [phoenix, titan, null];
    state.opp.board = [null, null, null];
    state.you.hand = ['flame-imp', 'tide-sprite']
      .map(function (id) { return summonCard(cardDef(id), 'you'); });
    state.opp.hand = ['ember-spark'].map(function (id) { return summonCard(cardDef(id), 'opp'); });
    state.you.deck = buildDeck(303).slice(0, 12);
    state.opp.deck = buildDeck(404).slice(0, 15);
    state.phase = 'player';
    setMessage(won ? 'The Tidecaller falls — victory!' : 'The Tidecaller prevails…');
    if (won) {
      state.screen = 'win';
      $('win-stats').innerHTML =
        'Won in <b>9</b> turns &middot; <b>14</b> cards played &middot; <b>22</b> damage dealt';
      showScreen('win');
    } else {
      state.screen = 'loss';
      $('loss-stats').innerHTML =
        'Survived <b>9</b> turns &middot; <b>14</b> cards played &middot; the Tidecaller had <b>7</b> life left';
      showScreen('loss');
    }
    window.__shotReady = true;
  }

  // ---------- boot ----------

  var params = new URLSearchParams(window.location.search);
  var shot = params.get('shot');
  var seed = Number(params.get('seed') || '1') || 1;
  window.__shotReady = false;

  if (shot === 'play') {
    stagePlayShot();
  } else if (shot === 'win') {
    stageEndShot(true);
  } else if (shot === 'loss') {
    stageEndShot(false);
  } else {
    // start (or plain load): the title screen.
    newGame(seed);
    window.__shotReady = true;
  }

  // Debug hook for the screenshot / playtest driver.
  window.__emberTide = {
    debug: function () {
      return {
        screen: state.screen,
        turn: state.turn,
        phase: state.phase,
        youLife: state.you.life,
        oppLife: state.opp.life,
        youEnergy: state.you.energy,
        youHand: state.you.hand.length,
        oppHand: state.opp.hand.length,
        youBoard: boardCount(state.you),
        oppBoard: boardCount(state.opp),
        busy: busy,
      };
    },
    state: function () { return state; },
    play: playCard,
    endTurn: endTurn,
    startGame: startGame,
    newGame: newGame,
  };
})();
