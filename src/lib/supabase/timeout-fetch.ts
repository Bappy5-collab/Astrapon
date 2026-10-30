/**
 * fetch with an upper time limit, for server-side Supabase calls. Without it a stalled
 * connection to Supabase leaves every page loading indefinitely; with it the request fails and
 * the page reports that the account service is unreachable.
 */
export function timeoutFetch(ms: number): typeof fetch {
  return (input, init) => {
    const timeout = AbortSignal.timeout(ms);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return fetch(input, { ...init, signal });
  };
}
