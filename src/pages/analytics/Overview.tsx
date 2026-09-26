import { Link } from 'react-router-dom';
import type { Dashboard, GameOverview, Mix } from '@/analytics/aggregate';
import { Stat } from '@/components/ui';
import type { Pools } from '@/data/liquipedia/pools';
import { useScope } from './api';
import { categoryLabel, eventLabel, gameTitle, pct, regionLabel, words } from './labels';
import { Card, countItems, DataTable, DayColumns, ShareBars, sourceItems } from './ui';

/**
 * `#/analytics` — every game at once: how much is played, how it goes, and
 * how people set their rounds up.
 */
export function Overview({ data, pools }: { data: Dashboard | null; pools: Pools | null }) {
  const { search } = useScope();
  if (!data) return <p className="muted">Loading…</p>;

  const share = (game: GameOverview, source: string) =>
    pct(game.mix.source.find((s) => s.label === source)?.count ?? 0, game.rounds);

  return (
    <div className="stack">
      <Headline data={data} />

      <Card title="Rounds per day">
        <DayColumns series={data.series} />
      </Card>

      <MixCard mix={data.mix} pools={pools} />

      <Card title="By game">
        <DataTable
          columns={[
            {
              head: 'Game',
              cell: (g) => (
                <Link to={{ pathname: `/analytics/game/${g.game}`, search: `?${search}` }}>{gameTitle(g.game)}</Link>
              ),
              sort: (g) => gameTitle(g.game),
            },
            { head: 'Rounds', cell: (g) => g.rounds, sort: (g) => g.rounds, align: 'right' },
            {
              head: 'Won',
              cell: (g) => pct(g.outcomes.won + g.outcomes.cleared, g.rounds),
              sort: (g) => (g.rounds ? (g.outcomes.won + g.outcomes.cleared) / g.rounds : -1),
              align: 'right',
            },
            {
              head: 'Gave up',
              cell: (g) => pct(g.outcomes['gave-up'], g.rounds),
              sort: (g) => (g.rounds ? g.outcomes['gave-up'] / g.rounds : -1),
              align: 'right',
            },
            { head: 'Random', cell: (g) => share(g, 'random'), align: 'right' },
            { head: 'Chosen', cell: (g) => share(g, 'chosen'), align: 'right' },
            { head: 'Event', cell: (g) => share(g, 'event'), align: 'right' },
            { head: 'Own setup', cell: (g) => share(g, 'own'), align: 'right' },
          ]}
          rows={[...data.games].sort((a, b) => b.rounds - a.rounds)}
        />
      </Card>
    </div>
  );
}

/** The four numbers a page leads with. */
export function Headline({ data }: { data: Dashboard }) {
  const won = data.outcomes.won + data.outcomes.cleared;
  return (
    <div className="stats">
      <Stat label="Rounds" value={data.rounds} />
      <Stat label="Won" value={pct(won, data.rounds)} />
      <Stat label="Lost" value={pct(data.outcomes.lost, data.rounds)} />
      <Stat label="Gave up" value={pct(data.outcomes['gave-up'], data.rounds)} />
    </div>
  );
}

/**
 * How the rounds were set up, one question at a time.
 *
 * Each breakdown is over the rounds it applies to — regions over Chosen
 * rounds, fields over event rounds — and says so, so "Europe 60%" means
 * sixty percent of the rounds where somebody picked a region.
 */
export function MixCard({ mix, pools, oneGame }: { mix: Mix; pools: Pools | null; oneGame?: boolean }) {
  const sources = sourceItems(mix.source).filter((item) => !oneGame || item.count > 0 || item.key === 'event');
  const chosen = mix.source.find((s) => s.label === 'chosen')?.count ?? 0;
  const events = mix.source.find((s) => s.label === 'event')?.count ?? 0;
  const levelled = mix.level.reduce((n, c) => n + c.count, 0);

  return (
    <Card title="How rounds were set up">
      {mix.rounds === 0 ? (
        <p className="small muted">No rounds in this view.</p>
      ) : (
        <div className="an-mix">
          <div className="stack-sm">
            <div className="field-label">Where the players came from</div>
            <ShareBars items={sources} total={mix.rounds} />
          </div>
          {mix.events.length ? (
            <div className="stack-sm">
              <div className="field-label">Event mode — which field ({events})</div>
              <ShareBars items={countItems(mix.events, (v) => eventLabel(v, pools))} />
            </div>
          ) : null}
          {mix.regions.length ? (
            <div className="stack-sm">
              <div className="field-label">Chosen — region ({chosen})</div>
              <ShareBars items={countItems(mix.regions, regionLabel)} />
            </div>
          ) : null}
          {mix.difficulty.length ? (
            <div className="stack-sm">
              <div className="field-label">Chosen — difficulty ({chosen})</div>
              <ShareBars items={countItems(mix.difficulty, words)} />
            </div>
          ) : null}
          {mix.level.length ? (
            <div className="stack-sm">
              <div className="field-label">Level ({levelled})</div>
              <ShareBars items={countItems(mix.level, words)} />
              <p className="tiny faint" style={{ margin: 0 }}>
                A game’s own Easy / Medium / Hard; for Fortnitedle, the level the round was played at.
              </p>
            </div>
          ) : null}
          {mix.mode.length ? (
            <div className="stack-sm">
              <div className="field-label">Game mode</div>
              <ShareBars items={countItems(mix.mode, words)} />
            </div>
          ) : null}
          {mix.category.length ? (
            <div className="stack-sm">
              <div className="field-label">Category</div>
              <ShareBars items={countItems(mix.category, categoryLabel)} />
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
