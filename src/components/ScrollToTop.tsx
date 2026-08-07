import { useEffect } from "react";

/**
 * Scrolls the page to the top whenever `routeKey` changes.
 * Uses the document/window as the scroll container (sidebar scrolls with content).
 */
export default function ScrollToTop({ routeKey }: { routeKey: string }) {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [routeKey]);

  return null;
}
