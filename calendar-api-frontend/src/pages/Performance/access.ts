import { useEffect, useState } from "react";

/**
 * Whether the signed-in user may use Performance. Not "is admin": access is a named
 * allowlist on the backend (PERFORMANCE_ACCESS_EMAILS, see src/performance/lib/access.js),
 * so the frontend asks rather than guessing. Fetched once per page load and shared by the
 * nav links and the page itself; this only decides what to show — the backend enforces.
 */
let cached: Promise<boolean> | null = null;

function fetchAccess(): Promise<boolean> {
  if (!cached) {
    cached = fetch("/api/performance/access", { credentials: "include", mode: "cors" })
      .then((res) => (res.ok ? res.json() : { allowed: false }))
      .then((body: { allowed?: boolean }) => body.allowed === true)
      .catch(() => {
        cached = null; // a network blip shouldn't hide the page for the whole visit
        return false;
      });
  }
  return cached;
}

/** null while unknown, then true/false. Pass `enabled: false` when signed out. */
export function usePerformanceAccess(enabled = true): boolean | null {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void fetchAccess().then((value) => alive && setAllowed(value));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return enabled ? allowed : false;
}
