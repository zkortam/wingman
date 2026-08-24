// Bounds for reads that would otherwise grow with an organisation's data.
export const QUERY_LIMITS = {
  /** Rows returned by an operator list view. */
  listPage: 200,
  /** Rows sampled when computing a baseline, a rate, or a retention sweep. */
  analyticsRows: 5_000,
} as const
