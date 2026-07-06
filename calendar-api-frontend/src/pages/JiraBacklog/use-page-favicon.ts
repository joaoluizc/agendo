import { useEffect } from "react";

/**
 * Swap the browser-tab favicon while a page is mounted, restoring the previous icon on
 * unmount. Lets the Jira Backlog + Tasks pages carry their own icon without affecting the
 * rest of agendo. `href` should be a bundled asset URL (import the .svg so Vite fingerprints
 * it) — see favicon.svg in this folder.
 */
export function usePageFavicon(href: string) {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (!link) return;

    const prevHref = link.getAttribute("href");
    const prevType = link.getAttribute("type");
    link.setAttribute("type", "image/svg+xml");
    link.setAttribute("href", href);

    return () => {
      // Only restore if we're still the active icon, so navigating straight to the other
      // page (which sets the same icon) doesn't get clobbered back to the default.
      if (link.getAttribute("href") !== href) return;
      if (prevHref != null) link.setAttribute("href", prevHref);
      else link.removeAttribute("href");
      if (prevType != null) link.setAttribute("type", prevType);
      else link.removeAttribute("type");
    };
  }, [href]);
}
