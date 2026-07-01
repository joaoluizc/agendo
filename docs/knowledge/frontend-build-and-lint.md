# Frontend build & lint

_What actually gates a frontend build, and why ESLint is noisy._

_Last updated: 2026-06-23_

For `calendar-api-frontend`:

## Build

`npm run build` = **`tsc && vite build`**. The TypeScript compile is the real
gate — if types pass, the Vite bundle almost always succeeds. ESLint is **not**
part of the build.

`vite build` emits some always-present warnings (font `.ttf` resolve notices,
`eval` in `lottie-web`, a >500 kB chunk-size warning). These are benign and
pre-existing — don't chase them.

## Lint

`npm run lint` = `eslint .`, run separately. The repo has a backlog of
pre-existing lint errors (~51 as of 2026-06-23) — mostly
`no-irregular-whitespace` in generated/data files and a few
`@typescript-eslint/no-explicit-any`. So **a green build does not mean green
lint**; when checking your own work, lint the specific files you touched rather
than the whole tree.

## ESLint flat-config gotcha

`eslint.config.js` is flat config, where **later entries win**. Rule overrides
must come **after** `pluginReact.configs.flat.recommended` — spreading
`recommended` after an override silently re-enables rules it sets (this had
re-enabled `react/react-in-jsx-scope`, flagging every `.tsx` file even though the
project uses the new JSX runtime).

The project's tsconfig sets `"jsx": "react-jsx"`, so **no `import React` is
needed**. The correct setup is `pluginReact.configs.flat['jsx-runtime']` placed
after `recommended`, plus `settings: { react: { version: 'detect' } }` to
silence the version warning. (Fixed 2026-06-23.)
