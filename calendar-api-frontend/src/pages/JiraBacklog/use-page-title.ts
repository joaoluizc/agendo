import { useEffect } from "react";

/**
 * Set the browser-tab title while a page is mounted, restoring the previous title on unmount.
 * Mirrors usePageFavicon so a page can own its tab chrome without affecting the rest of agendo.
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
