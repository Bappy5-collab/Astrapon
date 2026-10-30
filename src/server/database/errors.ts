import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Turns a database error into a message safe to show the farmer. Messages raised by our own
 * triggers/functions (P0001/P0002/22023/23514 with a custom text) are written for people; other
 * errors are summarised without echoing internals.
 */
export function describeDbError(error: PostgrestError): string {
  switch (error.code) {
    case "23503":
      return "That record was not found in your account.";
    case "23505":
      return "A record with that name already exists here.";
    case "42501":
      return error.message.startsWith("new row violates") || error.message.startsWith("permission denied")
        ? "You do not have permission to change that record."
        : error.message;
    case "P0001":
    case "P0002":
    case "22023":
      return error.message;
    case "23514":
      return error.message.startsWith("new row for relation") ? "A value is outside the allowed range." : error.message;
    case "XX000":
      // PostGIS parse errors from malformed GeoJSON.
      return "The boundary could not be read as GeoJSON.";
    default:
      return "Saving failed. Please try again.";
  }
}
