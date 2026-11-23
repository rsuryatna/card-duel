// Ember & Tide — the Tidecaller, the AI opponent.
// Its logic is deliberately simple and readable, so a player can see what it
// is doing and play around it: it plays the best card it can afford, it
// prefers an elemental advantage against your board, and it never hides a
// card it plays — every play is announced in the message log.

// Score one hand card for the AI. A card is worth its attack plus a bonus
// when its element beats something already on the player's board, plus a
// small bonus for a useful effect. Cheap cards score a little higher so the
// AI spends its energy instead of hoarding it.
function scoreCardForAI(card, playerBoard) {
  let score = card.attack * 2;
  if (card.effect) score += 1;
  for (const enemy of playerBoard) {
    if (card.element && enemy.element) {
      // +2 damage on advantage, so the card is worth more against that board.
      const beats = { fire: 'air', air: 'earth', earth: 'water', water: 'fire' };
      if (beats[card.element] === enemy.element) score += 3;
    }
  }
  score -= card.cost * 0.5;
  return score;
}

// Pick the cards the AI plays this turn. It may play up to two cards, in
// order of score, while it can afford them and has board room. Returns the
// list of hand indexes to play, best first.
function chooseAIPlays(hand, energy, boardRoom, playerBoard) {
  const plays = [];
  let left = energy;
  const scored = hand
    .map((card, index) => ({ card, index, score: scoreCardForAI(card, playerBoard) }))
    .sort((a, b) => b.score - a.score);
  for (const entry of scored) {
    if (plays.length >= 2) break;
    if (plays.length >= boardRoom) break;
    if (entry.card.cost > left) continue;
    plays.push(entry.index);
    left -= entry.card.cost;
  }
  return plays;
}

// Pick which of the player's board cards the AI most wants gone. It prefers
// the biggest threat (highest attack), and among equals the one its own
// element beats. The board combat is automatic and left-to-right, so this is
// only used for the message the AI shows when it eyes a card.
function aiThreatTarget(playerBoard) {
  if (!playerBoard.length) return null;
  let best = playerBoard[0];
  for (const card of playerBoard) {
    if (card.attack > best.attack) best = card;
  }
  return best;
}
