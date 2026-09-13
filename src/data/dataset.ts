import type { EventEntry, OrgStint, Player, PlayerResult, Region, TournamentEvent } from './types';

/**
 * Read-only query layer shared by every game.
 *
 * Games never touch the raw arrays or a data module — they take a `Dataset` and
 * ask it questions, so swapping in a real API only means feeding this class a
 * different set of rows.
 *
 * Two player collections exist on purpose:
 *
 *   `roster`   everyone in the dataset, including the one-off regional winners
 *              we know little else about. Use it for name lookup and search, so
 *              a player typing any real winner gets a match.
 *   `players`  the subset with enough recorded history to be a fair puzzle
 *              answer. Games pick their secrets from here.
 */
export class Dataset {
  /** Puzzle-eligible players (see `isPuzzleWorthy`). */
  readonly players: Player[];
  /** Every player in the dataset, puzzle-eligible or not. */
  readonly roster: Player[];
  readonly events: TournamentEvent[];
  readonly entries: EventEntry[];

  private readonly playerById = new Map<string, Player>();
  private readonly eventById = new Map<string, TournamentEvent>();
  private readonly entryById = new Map<string, EventEntry>();
  /** eventId -> results, sorted by placement. */
  private readonly resultsByEvent = new Map<string, { player: Player; result: PlayerResult }[]>();
  private readonly entriesByEvent = new Map<string, EventEntry[]>();

  constructor(players: Player[], events: TournamentEvent[], entries: EventEntry[] = []) {
    this.roster = players;
    this.events = events;
    this.entries = entries;
    for (const player of players) this.playerById.set(player.id, player);
    for (const event of events) this.eventById.set(event.id, event);
    for (const entry of entries) {
      this.entryById.set(entry.id, entry);
      const list = this.entriesByEvent.get(entry.eventId);
      if (list) list.push(entry);
      else this.entriesByEvent.set(entry.eventId, [entry]);
    }
    for (const list of this.entriesByEvent.values()) list.sort((a, b) => a.placement - b.placement);

    for (const player of players) {
      for (const result of player.results) {
        if (!this.eventById.has(result.eventId)) continue; // ignore results for unknown events
        const list = this.resultsByEvent.get(result.eventId);
        if (list) list.push({ player, result });
        else this.resultsByEvent.set(result.eventId, [{ player, result }]);
      }
    }
    for (const list of this.resultsByEvent.values()) {
      list.sort((a, b) => a.result.placement - b.result.placement || (a.player.name < b.player.name ? -1 : 1));
    }

    this.players = players.filter((player) => this.isPuzzleWorthy(player));
  }

  /**
   * Whether a player has enough recorded history to be guessable.
   *
   * A player who shows up once as part of a regional trio, with no earnings
   * figure and no birthday, gives a guesser nothing to work with — they stay in
   * `roster` (so searching for them works) but never become the answer.
   */
  private isPuzzleWorthy(player: Player): boolean {
    const facts =
      (player.earningsKnown ? 1 : 0) + (player.birthDate ? 1 : 0) + (player.team ? 1 : 0);
    return player.results.length >= 2 || (player.earnings >= 100_000 && facts >= 2);
  }

  // ---------------------------------------------------------------- lookups

  getPlayer(id: string): Player | undefined {
    return this.playerById.get(id);
  }

  getEvent(id: string): TournamentEvent | undefined {
    return this.eventById.get(id);
  }

  getEntry(id: string): EventEntry | undefined {
    return this.entryById.get(id);
  }

  /** A player's results with their event objects attached, oldest first. */
  careerOf(player: Player): { event: TournamentEvent; result: PlayerResult }[] {
    return player.results
      .map((result) => ({ event: this.eventById.get(result.eventId), result }))
      .filter((entry): entry is { event: TournamentEvent; result: PlayerResult } => Boolean(entry.event))
      .sort((a, b) => (a.event.date < b.event.date ? -1 : a.event.date > b.event.date ? 1 : 0));
  }

  /** Every roster that placed at an event, best placement first. */
  entriesOf(eventId: string): EventEntry[] {
    return this.entriesByEvent.get(eventId) ?? [];
  }

  /** The players making up an entry, in roster order. */
  rosterOf(entry: EventEntry): Player[] {
    return entry.playerIds
      .map((id) => this.playerById.get(id))
      .filter((player): player is Player => Boolean(player));
  }

  /** Everyone who played a given event, best placement first. */
  standings(eventId: string): { player: Player; result: PlayerResult }[] {
    return this.resultsByEvent.get(eventId) ?? [];
  }

  winnersOf(eventId: string): Player[] {
    return this.standings(eventId)
      .filter((entry) => entry.result.placement === 1)
      .map((entry) => entry.player);
  }

  participantsOf(eventId: string): Player[] {
    return this.standings(eventId).map((entry) => entry.player);
  }

  teammatesOf(player: Player): { player: Player; events: number; eventIds: string[] }[] {
    return player.teammates
      .map((link) => ({
        player: this.playerById.get(link.playerId),
        events: link.events,
        eventIds: link.eventIds,
      }))
      .filter((entry): entry is { player: Player; events: number; eventIds: string[] } =>
        Boolean(entry.player),
      )
      .sort((a, b) => b.events - a.events || (a.player.name < b.player.name ? -1 : 1));
  }

  /** Events two players played together, or 0 if they never teamed up. */
  eventsTogether(a: Player, b: Player): number {
    return a.teammates.find((link) => link.playerId === b.id)?.events ?? 0;
  }

  /** The organisations a player has represented, oldest first. */
  orgsOf(player: Player): OrgStint[] {
    return player.orgHistory;
  }

  earningsIn(player: Player, year: number): number {
    return player.earningsByYear[String(year)] ?? 0;
  }

  // -------------------------------------------------------------- groupings

  get teams(): string[] {
    const set = new Set<string>();
    for (const player of this.players) if (player.team) set.add(player.team);
    return [...set].sort();
  }

  /** Every organisation that appears anywhere in the dataset, current or past. */
  get allOrgs(): string[] {
    const set = new Set<string>();
    for (const player of this.roster) for (const stint of player.orgHistory) set.add(stint.org);
    return [...set].sort();
  }

  get countries(): string[] {
    const set = new Set<string>();
    for (const player of this.players) set.add(player.country);
    return [...set].sort();
  }

  get regions(): Region[] {
    const set = new Set<Region>();
    for (const player of this.players) set.add(player.region);
    return [...set];
  }

  /** Every calendar year that appears in the earnings data. */
  get years(): number[] {
    const set = new Set<number>();
    for (const player of this.players) {
      for (const year of Object.keys(player.earningsByYear)) set.add(Number(year));
    }
    return [...set].sort((a, b) => a - b);
  }

  byTeam(team: string): Player[] {
    return this.players.filter((p) => p.team === team);
  }

  /** Everyone who has ever represented an org, including former players. */
  everPlayedFor(org: string): Player[] {
    return this.roster.filter((p) => p.orgHistory.some((stint) => stint.org === org));
  }

  byCountry(country: string): Player[] {
    return this.players.filter((p) => p.country === country);
  }

  byRegion(region: Region): Player[] {
    return this.players.filter((p) => p.region === region);
  }

  countryName(code: string): string {
    return this.roster.find((p) => p.country === code)?.countryName ?? code;
  }

  fncsWinners(): Player[] {
    return this.players.filter((p) => p.fncsWins > 0);
  }

  /** Players who have won any event of the given tiers. */
  winnersByTier(tiers: TournamentEvent['tier'][]): Player[] {
    const set = new Set(tiers);
    return this.players.filter((p) =>
      p.results.some((r) => r.placement === 1 && set.has(this.eventById.get(r.eventId)?.tier ?? 'major')),
    );
  }

  /** Top `count` players by a numeric field, ties broken by name for stability. */
  topBy(count: number, value: (player: Player) => number): { player: Player; value: number }[] {
    return this.players
      .map((player) => ({ player, value: value(player) }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value || (a.player.name < b.player.name ? -1 : 1))
      .slice(0, count);
  }

  /** Events with at least `min` known participants — safe to build puzzles from. */
  eventsWithParticipants(min: number, filter?: (event: TournamentEvent) => boolean): TournamentEvent[] {
    return this.events.filter(
      (event) => (!filter || filter(event)) && this.standings(event.id).length >= min,
    );
  }
}
