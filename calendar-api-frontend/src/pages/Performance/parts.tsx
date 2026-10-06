import { AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { MethodologyConfig } from "./api";
import { flagText, gradeClass, num } from "./format";

export function GradeBadge({ grade }: { grade: string | null }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-[2rem] justify-center rounded px-1.5 py-0.5 text-xs font-semibold",
        gradeClass(grade),
      )}
    >
      {grade ?? "—"}
    </span>
  );
}

/** "+1.2σ" next to a rate; loud when it crosses the outlier threshold. */
export function ZBadge({ z, outlierZ }: { z: number | null | undefined; outlierZ: number }) {
  if (z == null) return null;
  const outlier = Math.abs(z) >= outlierZ;
  return (
    <span
      className={cn(
        "ml-1 text-[10px] tabular-nums",
        outlier ? "font-semibold text-amber-600 dark:text-amber-400" : "text-muted-foreground",
      )}
      title={`${num(z, 2)} standard deviations from the cohort mean`}
    >
      {z > 0 ? "+" : ""}
      {num(z, 1)}σ
    </span>
  );
}

/** A signed change, green up / red down (or the other way round when `lowerIsBetter`). */
export function Delta({
  value,
  digits = 0,
  suffix = "",
  lowerIsBetter = false,
}: {
  value: number | null | undefined;
  digits?: number;
  suffix?: string;
  lowerIsBetter?: boolean;
}) {
  if (value == null || !Number.isFinite(value)) return <span className="text-muted-foreground">—</span>;
  const good = lowerIsBetter ? value < 0 : value > 0;
  const rounded = Number(value.toFixed(digits));
  return (
    <span
      className={cn(
        "tabular-nums",
        rounded === 0
          ? "text-muted-foreground"
          : good
            ? "text-emerald-700 dark:text-emerald-400"
            : "text-rose-700 dark:text-rose-400",
      )}
    >
      {rounded > 0 ? "+" : ""}
      {value.toFixed(digits)}
      {suffix}
    </span>
  );
}

/** A warning icon listing a row's flags, for flags worth a look. */
export function FlagsHint({ flags, config }: { flags: string[]; config: MethodologyConfig }) {
  if (!flags.length) return null;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="ml-1 inline-flex align-middle text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[320px]">
          <ul className="list-disc space-y-1 pl-4 text-xs">
            {flags.map((flag) => (
              <li key={flag}>{flagText(flag, config)}</li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** The table cell class shared by the numeric columns. */
export const NUM = "text-right tabular-nums";

/** Every Performance table: small type, short rows, tight columns — wide data on one screen. */
export const DENSE_TABLE =
  "text-xs [&_td]:px-2 [&_td]:py-1 [&_th]:h-8 [&_th]:px-2 [&_th]:text-[11px] [&_th]:font-medium";
