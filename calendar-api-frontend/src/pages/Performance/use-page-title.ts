import { useEffect } from "react";

/**
 * Set the browser-tab title while the page is mounted. Local copy of the Reports one, so
 * this feature stays removable as a folder.
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
