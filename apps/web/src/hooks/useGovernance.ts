"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchGovernanceConfig,
  fetchProposal,
  fetchProposalPage,
  GOVERNANCE_PAGE_SIZE,
  type GovernanceConfig,
  type GovernanceProposal,
} from "@/lib/governance";

export function useProposalList(pageSize: number = GOVERNANCE_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const [state, setState] = useState({
    proposals: [] as GovernanceProposal[],
    loading: true,
    error: null as string | null,
    hasNext: false,
  });

  const load = useCallback(
    async (targetPage: number) => {
      setState((previous) => ({ ...previous, loading: true, error: null }));
      try {
        const result = await fetchProposalPage(targetPage, pageSize);
        setState({
          proposals: result.proposals,
          loading: false,
          error: null,
          hasNext: result.hasNext,
        });
      } catch (error) {
        setState((previous) => ({
          ...previous,
          loading: false,
          error: error instanceof Error ? error.message : "Failed to load proposals",
        }));
      }
    },
    [pageSize]
  );

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const next = useCallback(() => setPage((current) => current + 1), []);
  const previous = useCallback(() => setPage((current) => Math.max(1, current - 1)), []);
  const refresh = useCallback(() => load(page), [load, page]);

  return {
    ...state,
    page,
    hasPrev: page > 1,
    next,
    previous,
    refresh,
  };
}

export function useProposal(id: string | null) {
  const [proposal, setProposal] = useState<GovernanceProposal | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setProposal(await fetchProposal(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load this proposal");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return { proposal, loading, error, refresh: load };
}

export function useGovernanceConfig() {
  const [config, setConfig] = useState<GovernanceConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchGovernanceConfig()
      .then((next) => {
        if (active) setConfig(next);
      })
      .catch((err) => {
        if (active)
          setError(err instanceof Error ? err.message : "Failed to load governance config");
      });
    return () => {
      active = false;
    };
  }, []);

  return { config, error };
}
