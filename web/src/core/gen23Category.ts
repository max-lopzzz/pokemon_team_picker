// Until Gen 4, a move's physical/special category was determined by its
// TYPE, not chosen per move (unlike today's per-move system). This is a
// fixed historical rule, not data sourced from any API — PokeAPI's
// move.damage_class only reflects the current (Gen 4+) per-move category.
const SPECIAL_TYPES = new Set([
  "fire",
  "water",
  "grass",
  "electric",
  "ice",
  "psychic",
  "dragon",
  "dark",
]);

export function getGen23Category(moveType: string): "physical" | "special" {
  return SPECIAL_TYPES.has(moveType) ? "special" : "physical";
}
