/**
 * v1/v2 auto-discovery sync removed in v3. The "discover senders from your
 * inbox" model produced too much noise; v3 enriches per known contact via
 * `src/lib/mailbox/gmail.ts:searchByContact`.
 *
 * This module survives only as a re-export of `getAuthClient` for legacy
 * imports. Use `@/lib/google/auth` directly in new code.
 */
export { getAuthClient } from "@/lib/google/auth";
