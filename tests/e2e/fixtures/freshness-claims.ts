/**
 * Claims the dashboard must never make: it can't vouch that data is live or fresh. A LIVE
 * badge is all caps, so case matters there; an honest "Live menus · unavailable" is fine.
 */
export const LIVE_BADGE = /\bLIVE\b/;
export const FRESHNESS_CLAIM = /just now|all clear/i;
