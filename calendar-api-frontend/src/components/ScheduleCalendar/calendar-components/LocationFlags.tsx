/**
 * The four flags the location filter uses, as inline SVG.
 *
 * Hand-drawn rather than emoji because Windows has no flag glyphs at all — Chrome there
 * renders 🇧🇷 as the letters "BR", so an emoji row would read as flags on half the team's
 * machines and as letter pairs on the other half. A package would work too, but four
 * rectangles is not worth a dependency.
 *
 * Each is a plain 3:2 rectangle with a hairline border applied by the caller, drawn from
 * the official proportions only as far as they read at 16px — the Brazilian globe is a
 * plain disc, the Philippine sun has no rays. At this size the extra detail turns to mud.
 */

type FlagProps = { className?: string };

const BOX = { viewBox: "0 0 24 16", xmlns: "http://www.w3.org/2000/svg" } as const;

/** Colorado. */
export const UnitedStatesFlag = ({ className }: FlagProps) => (
  <svg {...BOX} className={className} aria-hidden="true">
    <rect width="24" height="16" fill="#f7f7f7" />
    {[0, 1, 2, 3, 4, 5, 6].map((i) => (
      <rect key={i} y={i * 2.46} width="24" height="1.23" fill="#b22234" />
    ))}
    <rect width="10" height="8.6" fill="#3c3b6e" />
  </svg>
);

/** LATAM. */
export const BrazilFlag = ({ className }: FlagProps) => (
  <svg {...BOX} className={className} aria-hidden="true">
    <rect width="24" height="16" fill="#009c3b" />
    <path d="M12 2.2 21.6 8 12 13.8 2.4 8Z" fill="#ffdf00" />
    <circle cx="12" cy="8" r="3.1" fill="#002776" />
  </svg>
);

/** Israel. */
export const IsraelFlag = ({ className }: FlagProps) => (
  <svg {...BOX} className={className} aria-hidden="true">
    <rect width="24" height="16" fill="#f7f7f7" />
    <rect y="1.6" width="24" height="2.2" fill="#0038b8" />
    <rect y="12.2" width="24" height="2.2" fill="#0038b8" />
    <path
      d="M12 4.6 14.5 9 9.5 9Z M12 11.4 9.5 7 14.5 7Z"
      fill="none"
      stroke="#0038b8"
      strokeWidth="0.9"
    />
  </svg>
);

/** APAC. */
export const PhilippinesFlag = ({ className }: FlagProps) => (
  <svg {...BOX} className={className} aria-hidden="true">
    <rect width="24" height="8" fill="#0038a8" />
    <rect y="8" width="24" height="8" fill="#ce1126" />
    <path d="M0 0 10.5 8 0 16Z" fill="#f7f7f7" />
    <circle cx="3.1" cy="8" r="1.9" fill="#fcd116" />
  </svg>
);
