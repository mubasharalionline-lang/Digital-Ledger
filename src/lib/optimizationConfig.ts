/**
 * Database Egress Optimization Config
 *
 * Set to `true` to temporarily disable/lock egress-heavy background features:
 * - Recent Message Center (global feed on dashboard)
 * - Recent Log Activity (system logs feed on dashboard)
 * - Message notifications / realtime background listeners across all tasks
 *
 * Set to `false` to fully re-enable all original features.
 */
export const EGRESS_OPTIMIZATION_MODE = true;
