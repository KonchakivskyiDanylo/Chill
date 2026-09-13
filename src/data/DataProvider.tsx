import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Dataset } from './dataset';
import { loadDataset } from './repository';

interface DataState {
  dataset: Dataset | null;
  error: string | null;
}

const DataContext = createContext<DataState>({ dataset: null, error: null });

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>({ dataset: null, error: null });

  useEffect(() => {
    let cancelled = false;
    loadDataset()
      .then((dataset) => {
        if (!cancelled) setState({ dataset, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ dataset: null, error: err instanceof Error ? err.message : 'Failed to load player data' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <DataContext.Provider value={state}>{children}</DataContext.Provider>;
}

export function useDataState(): DataState {
  return useContext(DataContext);
}

/**
 * For components rendered inside `<RequireData>`, where the dataset is
 * guaranteed to be loaded.
 */
export function useDataset(): Dataset {
  const { dataset } = useContext(DataContext);
  if (!dataset) throw new Error('useDataset() used outside <RequireData>');
  return dataset;
}

/** Renders children only once player data is available. */
export function RequireData({ children }: { children: ReactNode }) {
  const { dataset, error } = useDataState();

  if (error) {
    return (
      <div className="card banner banner--danger">
        <div>
          <div className="banner__title">Player data unavailable</div>
          <div className="small">{error}</div>
        </div>
      </div>
    );
  }
  if (!dataset) {
    return <div className="card center muted">Loading players…</div>;
  }
  return <>{children}</>;
}
