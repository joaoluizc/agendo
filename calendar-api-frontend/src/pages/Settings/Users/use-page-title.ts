import { useEffect } from "react";

/**
 * Set the browser-tab title while a page is mounted, restoring the previous title on
 * unmount. Local copy, as Reports and JiraBacklog each keep one.
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
