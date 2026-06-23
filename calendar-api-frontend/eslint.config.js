import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";


export default [
  {
    files: ["src/**/*.ts", "src/**/*.tsx", "src/**/*.js", "src/**/*.jsx"],
  },
  {languageOptions: { globals: globals.browser }},
  {settings: { react: { version: 'detect' } }},
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  // New JSX runtime ("jsx": "react-jsx") — no `import React` needed.
  // Must come after `recommended`, which otherwise re-enables react-in-jsx-scope.
  pluginReact.configs.flat['jsx-runtime'],
];