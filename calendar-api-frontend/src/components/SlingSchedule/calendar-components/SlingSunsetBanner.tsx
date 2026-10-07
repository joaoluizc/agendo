import { Megaphone } from "lucide-react";
import { Link } from "react-router-dom";
import { useUserSettings } from "@/providers/useUserSettings.tsx";

type SlingSunsetBannerProps = {
  /** The day on screen, as its `YYYY-MM-DD` URL param, so the link opens the same day. */
  dateKey: string;
};

/**
 * Tells admins that scheduling has moved to agendo and when the Sling screen goes away.
 *
 * Admins only: they are the ones who build the day, so they are the ones to move.
 *
 * Styled like agendo's own `PublishDraftsBar`, so it reads as the app speaking rather than
 * an error. The link keeps the day, so switching over drops nobody back on today.
 */
const SlingSunsetBanner = ({ dateKey }: SlingSunsetBannerProps) => {
  const canEditSchedule = useUserSettings().can("scheduling", "edit");
  if (!canEditSchedule) return null;

  return (
    <div className="mx-2 mb-4 flex items-center gap-3 rounded-lg border border-warn/35 bg-warn-bg px-3.5 py-2.5">
      <Megaphone size={16} className="shrink-0 text-warn" />
      <p className="min-w-0 text-[12.5px] leading-snug">
        <span className="font-semibold">
          As of October 1, 2026, please do your scheduling in{" "}
          <Link
            to={`/app/schedule?date=${dateKey}`}
            className="text-primary underline-offset-2 hover:underline"
          >
            Agendo
          </Link>
          .
        </span>{" "}
        <span className="text-muted-foreground">
          The Sling integration will be discontinued on November 1, 2026.
        </span>
      </p>
    </div>
  );
};

export default SlingSunsetBanner;
