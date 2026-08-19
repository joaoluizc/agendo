import { useEffect } from "react";

/**
 * Set the browser-tab title while a page is mounted, restoring the previous title on
 * unmount. Local copy of JiraBacklog's usePageTitle — duplicated rather than imported so
 * Reports stays self-contained (see src/reports/README.md on the backend side for why
 * that matters for this feature).
 */
export function usePageTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    return () => {
      document.title = prev;
    };
  }, [title]);
}
