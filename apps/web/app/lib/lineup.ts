/**
 * 7v7 rotation planner.
 *
 * A game is 8 "sections" — 4 per half. Each section fields 7 players:
 * a keeper plus a left/center/right defender and a left/center/right forward.
 * One keeper is designated per half and stays in goal for that whole half.
 *
 * The generator tries to make three things fair at once:
 *   1. total sections played per player (goalie minutes count toward the total)
 *   2. defense vs. forward splits
 *   3. how often each player lands in a specific slot (left / center / right)
 * Everything is driven by a seeded PRNG so a plan can be reproduced from its
 * seed, and so "Randomize" produces a genuinely different rotation each time.
 */

export const DEFENSE_POSITIONS = ["LD", "CD", "RD"] as const;
export const FORWARD_POSITIONS = ["LF", "CF", "RF"] as const;
export const FIELD_POSITIONS = [
  ...DEFENSE_POSITIONS,
  ...FORWARD_POSITIONS,
] as const;
export const POSITIONS = ["GK", ...FIELD_POSITIONS] as const;

export type FieldPosition = (typeof FIELD_POSITIONS)[number];
export type Position = (typeof POSITIONS)[number];

export const POSITION_LABELS: Record<Position, string> = {
  GK: "Goalie",
  LD: "Left Def",
  CD: "Center Def",
  RD: "Right Def",
  LF: "Left Fwd",
  CF: "Center Fwd",
  RF: "Right Fwd",
};

export const SECTIONS_PER_HALF = 4;
export const TOTAL_SECTIONS = SECTIONS_PER_HALF * 2;
export const PLAYERS_ON_FIELD = POSITIONS.length; // 7
const FIELD_SLOTS_PER_HALF = SECTIONS_PER_HALF * FIELD_POSITIONS.length; // 24

/**
 * What a half in goal is worth when balancing playing time. Keeping goal for a
 * half is 4 sections of real time, but counting it at full value left keepers
 * stuck on the bench for most of their other half. Crediting it at 3 buys them
 * back a fair share of field time.
 */
export const GK_SECTION_WEIGHT = 3;

export interface SubPair {
  /** The player coming on. */
  in: string;
  /** The player they replace. */
  out: string;
  /** Where the incoming player lines up. */
  position: Position;
}

export interface Section {
  index: number;
  half: 1 | 2;
  sectionInHalf: number;
  lineup: Record<Position, string>;
  bench: string[];
  /** Each arrival matched to the player they replace. */
  subs: SubPair[];
  changedPositions: Position[];
}

export interface PlayerSummary {
  player: string;
  sectionsPlayed: number;
  gk: number;
  defense: number;
  forward: number;
  bench: number;
  /** Playing time with goalie sections discounted — what the split balances. */
  weightedLoad: number;
}

export interface Plan {
  sections: Section[];
  summary: PlayerSummary[];
  seed: number;
}

export interface PlanInput {
  players: string[];
  firstHalfGoalie: string;
  secondHalfGoalie: string;
  seed: number;
}

export function validatePlanInput({
  players,
  firstHalfGoalie,
  secondHalfGoalie,
}: Omit<PlanInput, "seed">): string[] {
  const problems: string[] = [];
  if (players.length < PLAYERS_ON_FIELD) {
    problems.push(
      `Select at least ${PLAYERS_ON_FIELD} players — only ${players.length} marked present.`
    );
  }
  if (!firstHalfGoalie || !players.includes(firstHalfGoalie)) {
    problems.push("Pick a goalie for the first half.");
  }
  if (!secondHalfGoalie || !players.includes(secondHalfGoalie)) {
    problems.push("Pick a goalie for the second half.");
  }
  if (
    firstHalfGoalie &&
    firstHalfGoalie === secondHalfGoalie &&
    players.length > PLAYERS_ON_FIELD
  ) {
    problems.push(
      "Use two different goalies so one player isn't in goal all game."
    );
  }
  return problems;
}

/** Deterministic PRNG so a seed always reproduces the same plan. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function jitterFor(players: string[], random: () => number) {
  const jitter: Record<string, number> = {};
  for (const player of players) jitter[player] = random();
  return jitter;
}

/**
 * Sections on the field each player should get, not counting time in goal.
 *
 * Slots are dealt one at a time to whoever is carrying the lightest load so
 * far, which settles on an even split without any remainder bookkeeping. Two
 * things shape the result: a half in goal only adds GK_SECTION_WEIGHT to a
 * keeper's load, so they still get a real share of field time in their other
 * half; and a keeper's capacity is limited to the half they aren't in goal for.
 */
function fieldTargets(
  players: string[],
  goalLoad: Record<string, number>,
  fieldCapacity: Record<string, number>,
  random: () => number
): Record<string, number> {
  // A fixed nudge per player decides who gets the odd slot when loads tie.
  const jitter = jitterFor(players, random);
  const load: Record<string, number> = {};
  const assigned: Record<string, number> = {};
  for (const player of players) {
    load[player] = goalLoad[player];
    assigned[player] = 0;
  }

  for (let slot = 0; slot < FIELD_SLOTS_PER_HALF * 2; slot++) {
    let next: string | null = null;
    for (const player of players) {
      if (assigned[player] >= fieldCapacity[player]) continue;
      if (
        next === null ||
        load[player] + jitter[player] < load[next] + jitter[next]
      ) {
        next = player;
      }
    }
    if (next === null) break;
    assigned[next] += 1;
    load[next] += 1;
  }
  return assigned;
}

/** Split each player's field sections between the two halves. */
function halfTargets(
  players: string[],
  firstHalfGoalie: string,
  secondHalfGoalie: string,
  field: Record<string, number>,
  random: () => number
): [Record<string, number>, Record<string, number>] {
  const first: Record<string, number> = {};
  const second: Record<string, number> = {};

  for (const player of players) {
    const fieldSections = field[player];
    if (player === firstHalfGoalie && player === secondHalfGoalie) {
      first[player] = 0;
      second[player] = 0;
    } else if (player === firstHalfGoalie) {
      first[player] = 0;
      second[player] = Math.min(SECTIONS_PER_HALF, fieldSections);
    } else if (player === secondHalfGoalie) {
      first[player] = Math.min(SECTIONS_PER_HALF, fieldSections);
      second[player] = 0;
    } else {
      const half = Math.floor(fieldSections / 2);
      const odd = fieldSections % 2 === 1 && random() < 0.5 ? 1 : 0;
      first[player] = Math.min(SECTIONS_PER_HALF, half + odd);
      second[player] = Math.min(
        SECTIONS_PER_HALF,
        fieldSections - first[player]
      );
    }
  }

  // Each half has exactly 24 field slots; nudge non-keepers between halves
  // until both sides balance.
  const movable = players.filter(
    (p) => p !== firstHalfGoalie && p !== secondHalfGoalie
  );
  for (let guard = 0; guard < 500; guard++) {
    const firstTotal = players.reduce((sum, p) => sum + first[p], 0);
    if (firstTotal === FIELD_SLOTS_PER_HALF) break;
    const fromFirst = firstTotal > FIELD_SLOTS_PER_HALF;
    const [from, to] = fromFirst ? [first, second] : [second, first];
    const candidate = shuffled(movable, random).find(
      (p) => from[p] > 0 && to[p] < SECTIONS_PER_HALF
    );
    if (!candidate) break;
    from[candidate] -= 1;
    to[candidate] += 1;
  }

  return [first, second];
}

interface RotationState {
  defense: Record<string, number>;
  forward: Record<string, number>;
  slot: Record<string, Record<FieldPosition, number>>;
  lastPosition: Record<string, Position | null>;
  /** Consecutive sections spent in the same line, for rotation tie-breaks. */
  lineStreak: Record<string, number>;
}

/** Pick the six field players for one section. */
function pickFieldPlayers(
  eligible: string[],
  need: Record<string, number>,
  sectionsLeft: number,
  benchStreak: Record<string, number>,
  lineStreak: Record<string, number>,
  random: () => number
): string[] {
  const jitter = jitterFor(eligible, random);
  const byPriority = [...eligible].sort((a, b) => {
    if (need[b] !== need[a]) return need[b] - need[a];
    // Whoever has been sitting longest gets the next turn.
    if (benchStreak[b] !== benchStreak[a])
      return benchStreak[b] - benchStreak[a];
    // Otherwise rest whoever has been stuck in one line longest — a player only
    // ever changes line by coming off and being sent back on somewhere else.
    if (lineStreak[a] !== lineStreak[b]) return lineStreak[a] - lineStreak[b];
    return jitter[a] - jitter[b];
  });

  // Anyone who needs every remaining section has to be on now.
  const locked = byPriority.filter(
    (p) => need[p] >= sectionsLeft && need[p] > 0
  );
  const chosen = locked.slice(0, FIELD_POSITIONS.length);
  for (const player of byPriority) {
    if (chosen.length === FIELD_POSITIONS.length) break;
    if (!chosen.includes(player)) chosen.push(player);
  }
  return chosen;
}

/**
 * Place the six field players, returning the slots that changed hands.
 *
 * Anyone arriving from the bench takes a slot that was actually vacated, so
 * every substitution reads as one player stepping into another's spot. Players
 * already on the field keep the remaining slots between them — they can still
 * trade defense for forward with each other, which keeps positions rotating
 * without muddying who subbed for whom.
 */
function assignPositions(
  onField: string[],
  previous: Record<Position, string> | null,
  state: RotationState,
  random: () => number
): { lineup: Record<FieldPosition, string>; vacated: FieldPosition[] } {
  const stayed = new Set(
    previous
      ? FIELD_POSITIONS.map((slot) => previous[slot]).filter((player) =>
          onField.includes(player)
        )
      : []
  );
  const held = FIELD_POSITIONS.filter(
    (slot) => previous !== null && stayed.has(previous[slot])
  );
  const vacated = FIELD_POSITIONS.filter((slot) => !held.includes(slot));

  const lineup = {} as Record<FieldPosition, string>;
  // Anyone still on keeps the exact spot they already hold.
  for (const slot of held) lineup[slot] = previous![slot];
  fillSlots(
    vacated,
    onField.filter((player) => !stayed.has(player)),
    lineup,
    state,
    random
  );
  return { lineup, vacated };
}

/** Spread a set of players across a set of slots, evening out past duty. */
function fillSlots(
  slots: FieldPosition[],
  players: string[],
  lineup: Record<FieldPosition, string>,
  state: RotationState,
  random: () => number
) {
  const jitter = jitterFor(players, random);
  const defenseSlots = slots.filter((slot) =>
    (DEFENSE_POSITIONS as readonly string[]).includes(slot)
  );
  const forwardSlots = slots.filter(
    (slot) => !(DEFENSE_POSITIONS as readonly string[]).includes(slot)
  );

  // Players carrying the most defense relative to forward get pushed up top.
  const byLineNeed = [...players].sort((a, b) => {
    const aNeed = state.defense[a] - state.forward[a] + jitter[a];
    const bNeed = state.defense[b] - state.forward[b] + jitter[b];
    return aNeed - bNeed;
  });

  const lines: [FieldPosition[], string[]][] = [
    [defenseSlots, byLineNeed.slice(0, defenseSlots.length)],
    [forwardSlots, byLineNeed.slice(defenseSlots.length)],
  ];

  for (const [line, group] of lines) {
    const available = [...group];
    for (const slot of shuffled(line, random)) {
      let best = available[0];
      let bestCost = Infinity;
      for (const player of available) {
        // Least-used slot wins, with a nudge toward keeping a player where
        // they already are so the pitch doesn't reshuffle for no reason.
        const cost =
          state.slot[player][slot] -
          (state.lastPosition[player] === slot ? 0.6 : 0) +
          jitter[player];
        if (cost < bestCost) {
          bestCost = cost;
          best = player;
        }
      }
      lineup[slot] = best;
      available.splice(available.indexOf(best), 1);
    }
  }
}

/**
 * Read the substitutions straight off the slots that changed hands: whoever now
 * stands in a vacated slot replaced whoever was standing there. The keeper swap
 * at half time is a handover too, so it leads the list.
 */
function handovers(
  previous: Record<Position, string>,
  lineup: Record<Position, string>,
  vacated: FieldPosition[]
): SubPair[] {
  const slots: Position[] = [
    ...(previous.GK === lineup.GK ? [] : (["GK"] as Position[])),
    ...vacated,
  ];
  return slots.map((position) => ({
    out: previous[position],
    in: lineup[position],
    position,
  }));
}

export function generatePlan({
  players,
  firstHalfGoalie,
  secondHalfGoalie,
  seed,
}: PlanInput): Plan {
  const random = mulberry32(seed);
  const roster = [...players];

  const goalLoad: Record<string, number> = {};
  const fieldCapacity: Record<string, number> = {};
  for (const player of roster) {
    const halvesInGoal =
      (player === firstHalfGoalie ? 1 : 0) +
      (player === secondHalfGoalie ? 1 : 0);
    goalLoad[player] = halvesInGoal * GK_SECTION_WEIGHT;
    // A keeper can only take the field during the half they aren't in goal.
    fieldCapacity[player] = (2 - halvesInGoal) * SECTIONS_PER_HALF;
  }

  const field = fieldTargets(roster, goalLoad, fieldCapacity, random);
  const [firstHalfNeed, secondHalfNeed] = halfTargets(
    roster,
    firstHalfGoalie,
    secondHalfGoalie,
    field,
    random
  );

  const state: RotationState = {
    defense: {},
    forward: {},
    slot: {},
    lastPosition: {},
    lineStreak: {},
  };
  for (const player of roster) {
    state.defense[player] = 0;
    state.forward[player] = 0;
    state.lastPosition[player] = null;
    state.lineStreak[player] = 0;
    state.slot[player] = { LD: 0, CD: 0, RD: 0, LF: 0, CF: 0, RF: 0 };
  }

  const sections: Section[] = [];
  let previous: Record<Position, string> | null = null;
  const benchStreak: Record<string, number> = {};
  for (const player of roster) benchStreak[player] = 0;

  for (const half of [1, 2] as const) {
    const goalie = half === 1 ? firstHalfGoalie : secondHalfGoalie;
    const need = { ...(half === 1 ? firstHalfNeed : secondHalfNeed) };
    const eligible = roster.filter((p) => p !== goalie);

    for (let i = 0; i < SECTIONS_PER_HALF; i++) {
      const onField = pickFieldPlayers(
        eligible,
        need,
        SECTIONS_PER_HALF - i,
        benchStreak,
        state.lineStreak,
        random
      );
      const { lineup: fieldLineup, vacated } = assignPositions(
        onField,
        previous,
        state,
        random
      );
      const lineup: Record<Position, string> = { GK: goalie, ...fieldLineup };

      for (const slot of FIELD_POSITIONS) {
        const player = lineup[slot];
        need[player] = Math.max(0, need[player] - 1);
        state.slot[player][slot] += 1;
        if ((DEFENSE_POSITIONS as readonly string[]).includes(slot)) {
          state.defense[player] += 1;
        } else {
          state.forward[player] += 1;
        }
      }

      const current = new Set<string>([goalie, ...onField]);
      const bench = roster.filter((p) => !current.has(p));
      const changedPositions: Position[] = previous
        ? POSITIONS.filter((pos) => previous![pos] !== lineup[pos])
        : [];

      sections.push({
        index: sections.length,
        half,
        sectionInHalf: i + 1,
        lineup,
        bench,
        subs: previous ? handovers(previous, lineup, vacated) : [],
        changedPositions,
      });

      for (const player of roster) {
        const wasDefense = (DEFENSE_POSITIONS as readonly string[]).includes(
          String(state.lastPosition[player])
        );
        const slot = FIELD_POSITIONS.find((pos) => lineup[pos] === player);
        const isDefense =
          slot !== undefined &&
          (DEFENSE_POSITIONS as readonly string[]).includes(slot);
        state.lineStreak[player] =
          slot === undefined
            ? 0
            : wasDefense === isDefense && state.lineStreak[player] > 0
              ? state.lineStreak[player] + 1
              : 1;
        state.lastPosition[player] = null;
        benchStreak[player] = current.has(player) ? 0 : benchStreak[player] + 1;
      }
      for (const pos of POSITIONS) state.lastPosition[lineup[pos]] = pos;
      previous = lineup;
    }
  }

  const summary: PlayerSummary[] = roster
    .map((player) => {
      const gk = sections.filter((s) => s.lineup.GK === player).length;
      const defense = state.defense[player];
      const forward = state.forward[player];
      const sectionsPlayed = gk + defense + forward;
      return {
        player,
        sectionsPlayed,
        gk,
        defense,
        forward,
        bench: TOTAL_SECTIONS - sectionsPlayed,
        weightedLoad:
          defense + forward + (gk / SECTIONS_PER_HALF) * GK_SECTION_WEIGHT,
      };
    })
    .sort(
      (a, b) =>
        b.weightedLoad - a.weightedLoad || a.player.localeCompare(b.player)
    );

  return { sections, summary, seed };
}

export function randomSeed() {
  return Math.floor(Math.random() * 0xffffffff);
}
