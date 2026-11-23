// Ember & Tide — card definitions and element rules.
// Every card: id, name, element, cost (energy), attack, health (= attack at
// summon), and an on-play effect. Effects are one of: draw, heal, strike
// (damage the enemy hero), sweep (damage all enemy board cards).

// The four elements. Each one is told apart by colour AND by a shape icon
// (an inline SVG symbol in index.html), never by text alone.
const ELEMENTS = {
  fire:  { name: 'Fire',  colour: '#e8452c', dark: '#8f1d0e', icon: 'icon-flame',  beats: 'air' },
  water: { name: 'Water', colour: '#2b7de0', dark: '#123f7d', icon: 'icon-drop',   beats: 'fire' },
  earth: { name: 'Earth', colour: '#5da24a', dark: '#2c4d22', icon: 'icon-mount',  beats: 'water' },
  air:   { name: 'Air',   colour: '#e8c33a', dark: '#7a5f08', icon: 'icon-swirl',  beats: 'earth' },
};

// Elemental advantage is a cycle: fire > air > earth > water > fire.
// An attacker whose element beats the defender's deals +2 damage.
function advantageBonus(attackerEl, defenderEl) {
  if (!attackerEl || !defenderEl) return 0;
  return ELEMENTS[attackerEl].beats === defenderEl ? 2 : 0;
}

function elementName(el) {
  return ELEMENTS[el] ? ELEMENTS[el].name : el;
}

// The deck: 16 distinct cards, 4 per element. Costs 1-5, attacks 2-8.
const CARD_DEFS = [
  // Fire — beats Air.
  { id: 'ember-spark',   name: 'Ember Spark',    element: 'fire',  cost: 1, attack: 2, effect: null,            effectText: '' },
  { id: 'flame-imp',     name: 'Flame Imp',      element: 'fire',  cost: 2, attack: 3, effect: { kind: 'strike', value: 1 }, effectText: 'Deal 1 to the enemy hero.' },
  { id: 'ember-drake',   name: 'Ember Drake',    element: 'fire',  cost: 3, attack: 5, effect: { kind: 'draw',   value: 1 }, effectText: 'Draw a card.' },
  { id: 'inferno-phoenix', name: 'Inferno Phoenix', element: 'fire', cost: 5, attack: 8, effect: { kind: 'sweep', value: 2 }, effectText: 'Deal 2 to all enemy cards.' },
  // Water — beats Fire.
  { id: 'tide-sprite',   name: 'Tide Sprite',    element: 'water', cost: 1, attack: 2, effect: { kind: 'heal',   value: 2 }, effectText: 'Heal 2 life.' },
  { id: 'coral-guard',   name: 'Coral Guard',    element: 'water', cost: 2, attack: 3, effect: { kind: 'heal',   value: 3 }, effectText: 'Heal 3 life.' },
  { id: 'deep-leviathan', name: 'Deep Leviathan', element: 'water', cost: 4, attack: 6, effect: { kind: 'draw',   value: 1 }, effectText: 'Draw a card.' },
  { id: 'storm-kraken',  name: 'Storm Kraken',   element: 'water', cost: 5, attack: 7, effect: { kind: 'sweep', value: 2 }, effectText: 'Deal 2 to all enemy cards.' },
  // Earth — beats Water.
  { id: 'pebble-golem',  name: 'Pebble Golem',   element: 'earth', cost: 1, attack: 2, effect: { kind: 'heal',   value: 2 }, effectText: 'Heal 2 life.' },
  { id: 'thorn-bramble', name: 'Thorn Bramble',  element: 'earth', cost: 2, attack: 3, effect: { kind: 'strike', value: 1 }, effectText: 'Deal 1 to the enemy hero.' },
  { id: 'stone-titan',   name: 'Stone Titan',    element: 'earth', cost: 4, attack: 6, effect: { kind: 'heal',   value: 4 }, effectText: 'Heal 4 life.' },
  { id: 'mountain-colossus', name: 'Mountain Colossus', element: 'earth', cost: 5, attack: 8, effect: { kind: 'draw', value: 1 }, effectText: 'Draw a card.' },
  // Air — beats Earth.
  { id: 'zephyr-wisp',   name: 'Zephyr Wisp',    element: 'air',   cost: 1, attack: 2, effect: { kind: 'draw',   value: 1 }, effectText: 'Draw a card.' },
  { id: 'gale-hawk',     name: 'Gale Hawk',      element: 'air',   cost: 2, attack: 4, effect: { kind: 'strike', value: 1 }, effectText: 'Deal 1 to the enemy hero.' },
  { id: 'storm-eagle',   name: 'Storm Eagle',    element: 'air',   cost: 3, attack: 5, effect: { kind: 'heal',   value: 3 }, effectText: 'Heal 3 life.' },
  { id: 'sky-tempest',   name: 'Sky Tempest',    element: 'air',   cost: 5, attack: 7, effect: { kind: 'sweep', value: 2 }, effectText: 'Deal 2 to all enemy cards.' },
];

function cardDef(id) {
  return CARD_DEFS.find((c) => c.id === id) || null;
}

// A shuffled deck is two copies of every card (32 cards). The shuffle uses a
// small seeded RNG so a ?seed= run is reproducible.
function buildDeck(seed) {
  const ids = [];
  for (const def of CARD_DEFS) ids.push(def.id, def.id);
  const rng = mulberry32(seed >>> 0 || 1);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = ids[i]; ids[i] = ids[j]; ids[j] = tmp;
  }
  return ids;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A fresh board card: a copy of the definition with its own health and uid.
let uidCounter = 0;
function summonCard(def, owner) {
  uidCounter += 1;
  return {
    uid: 'c' + uidCounter,
    id: def.id,
    name: def.name,
    element: def.element,
    cost: def.cost,
    attack: def.attack,
    health: def.attack,
    maxHealth: def.attack,
    effect: def.effect,
    effectText: def.effectText,
    owner,
    justPlayed: false,
    attacking: false,
  };
}
