import { ReactElement } from "react";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@radix-ui/react-avatar";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useDialogContentElement } from "@/components/ui/dialog";
import { UserSafeInfo } from "@/types/userTypes";
import { useUserSettings } from "@/providers/useUserSettings";
import { useTimeFormat } from "@/utils/timeFormat";
import { PreferencesContent, hasPreferences } from "./PreferencesContent";

type PreferencesHoverCardProps = {
  /** The agent whose name is the trigger. */
  user: UserSafeInfo | undefined;
  /** The trigger itself: one element that can take a ref (a div or span). */
  children: ReactElement;
  side?: "top" | "right" | "bottom" | "left";
};

/**
 * An agent's scheduling preferences, on hover over their name.
 *
 * Schedule builders (scheduling:edit) only, and only for an agent with a note: otherwise
 * the trigger is returned untouched, so wrapping a name costs nothing for everyone else.
 * `preferences` only ever arrives in /user/all for admins and schedule builders, so the
 * check here is a second gate, not the first. See docs/knowledge/user-preferences.md.
 */
const PreferencesHoverCard = ({
  user,
  children,
  side = "right",
}: PreferencesHoverCardProps) => {
  const { can, allUsers } = useUserSettings();
  const { clock } = useTimeFormat();
  // Inside a modal dialog the card has to portal into it, or the dialog makes it inert —
  // and the dialog then has to be the collision boundary too, because it clips overflow
  // (same arrangement as PositionCombobox). null, i.e. body and viewport, elsewhere.
  const container = useDialogContentElement();

  if (!can("scheduling", "edit") || !user || !hasPreferences(user)) return children;

  const editor = user.preferencesUpdatedBy
    ? allUsers.find((candidate) => candidate.id === user.preferencesUpdatedBy)
    : undefined;

  return (
    <HoverCard openDelay={300} closeDelay={150}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        container={container}
        collisionBoundary={container ?? undefined}
        collisionPadding={8}
        side={side}
        align="start"
        className="w-80 overflow-hidden p-0"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <Avatar className="shrink-0">
            <AvatarImage
              src={user.imageUrl}
              className="h-7 w-7 rounded-full"
            />
            <AvatarFallback className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
              {`${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold leading-tight">
              {user.firstName} {user.lastName}
            </div>
            <div className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
              User preferences
            </div>
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto px-4 py-3">
          <PreferencesContent html={user.preferences ?? ""} />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-band px-4 py-2 text-[11px] text-muted-foreground">
          <span className="truncate">
            {user.preferencesUpdatedAt &&
              `Edited${editor ? ` by ${editor.firstName}` : ""} · ${clock.dateTime(
                user.preferencesUpdatedAt,
                { month: "short", day: "numeric", year: "numeric" }
              )}`}
          </span>
          <Link
            to={`/app/settings/users?user=${encodeURIComponent(user.id)}`}
            className="shrink-0 font-semibold text-primary hover:underline"
          >
            Edit
          </Link>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

export default PreferencesHoverCard;
