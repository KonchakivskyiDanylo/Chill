import type { Player, PlayerResult, Region, TournamentEvent } from './types';

/**
 * Read-only query layer shared by every game.
 *
 * Games never touch the raw arrays or the sample module — they take a
 * `Dataset` and ask it questions. Swapping in a real API therefore only means
 * feeding this class a different `Player[]`.
 */
export class Dataset {
  readonly players: Player[];
  readonly events: TournamentEvent[];

  private readonly playerById = new Map<string, Player>();
  private readonly eventById = new Map<string, TournamentEvent>();
  /** eventId -> results, sorted by placement. */
  private readonly resultsByEvent = new Map<string, { player: Player; result: PlayerResult }[]>();

  constructor(players: Player[], events: TournamentEvent[]) {
    this.players = players;
    this.events = events;
    for (const player of players) this.playerById.set(player.id, player);
    for (const event of events) this.eventById.set(event.id, event);

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
  }

  // ---------------------------------------------------------------- lookups

  getPlayer(id: string): Player | undefined {
    return this.playerById.get(id);
  }

  getEvent(id: string): TournamentEvent | undefined {
    return this.eventById.get(id);
  }

  /** A player's major results with their event objects attached, oldest first. */
  careerOf(player: Player): { event: TournamentEvent; result: PlayerResult }[] {
    return player.results
      .map((result) => ({ event: this.eventById.get(result.eventId), result }))
      .filter((entry): entry is { event: TournamentEvent; result: PlayerResult } => Boolean(entry.event))
      .sort((a, b) => (a.event.date < b.event.date ? -1 : a.event.date > b.event.date ? 1 : 0));
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

  teammatesOf(player: Player): { player: Player; matches: number }[] {
    return player.teammates
      .map((link) => ({ player: this.playerById.get(link.playerId), matches: link.matches }))
      .filter((entry): entry is { player: Player; matches: number } => Boolean(entry.player))
      .sort((a, b) => b.matches - a.matches || (a.player.name < b.player.name ? -1 : 1));
  }

  /** Matches two players played together, or 0 if they never teamed up. */
  matchesTogether(a: Player, b: Player): number {
    return a.teammates.find((link) => link.playerId === b.id)?.matches ?? 0;
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

  byCountry(country: string): Player[] {
    return this.players.filter((p) => p.country === country);
  }

  byRegion(region: Region): Player[] {
    return this.players.filter((p) => p.region === region);
  }

  countryName(code: string): string {
    return this.players.find((p) => p.country === code)?.countryName ?? code;
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
