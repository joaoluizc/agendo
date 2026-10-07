import { Link, NavLink } from "react-router-dom";
import { useUserSettings } from "@/providers/useUserSettings";
import { Requirement } from "@/permissions/permissions";
import { cn } from "@/lib/utils";

/**
 * General's sections, in the order they render. Each `id` must match the section card's
 * own `id` — a link with no target silently does nothing, which is how "Manage Locations"
 * went dead and "Positions" never got a link at all. `requires` mirrors the section's own
 * gate in Settings.tsx, so nobody is offered links to cards they cannot see.
 */
const SECTIONS: { id: string; label: string; requires: Requirement | null }[] = [
  { id: "shifts-to-add-to-cal", label: "Synced shifts", requires: null },
  { id: "timezone", label: "Your timezone", requires: null },
  { id: "generate-api-token", label: "API Token", requires: "admin" },
  { id: "manage-locations", label: "Locations", requires: "admin" },
  { id: "manage-positions", label: "Positions", requires: "admin" },
  { id: "coverage-targets", label: "Coverage targets", requires: "scheduling:edit" },
  { id: "report-groups", label: "Report groups", requires: "reports:edit" },
];

const pageLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    "rounded-md px-2.5 py-1.5 font-semibold transition-colors",
    isActive
      ? "bg-muted text-foreground"
      : "text-muted-foreground hover:text-foreground"
  );

/**
 * The sidebar every settings page shares (see SettingsLayout).
 *
 * Pages are the top-level entries; General's sections sit under it as jump links. Those
 * are route links with a hash rather than bare `#anchors`, so they work from any settings
 * page — Settings.tsx scrolls to the hash once it has rendered, which React Router does not
 * do by itself.
 *
 * General will later split into grouped pages (Your account, Team, Scheduling, Reports,
 * Developer); each group then becomes a top-level entry here.
 */
export default function SettingsNav() {
  const { isAdmin, meets } = useUserSettings();

  return (
    <nav className="grid gap-1 text-sm md:sticky md:top-20" aria-label="Settings">
      <NavLink to="/app/settings" end className={pageLink}>
        General
      </NavLink>
      <div className="mb-2 grid gap-0.5">
        {SECTIONS.filter((section) => !section.requires || meets(section.requires)).map(
          (section) => (
            <Link
              key={section.id}
              to={`/app/settings#${section.id}`}
              className="rounded-md py-1 pl-6 pr-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {section.label}
            </Link>
          )
        )}
      </div>
      {isAdmin && (
        <NavLink to="/app/settings/users" className={pageLink}>
          Users
        </NavLink>
      )}
    </nav>
  );
}
