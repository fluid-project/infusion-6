# eslint-config-infusion-6

The ESLint configuration of Infusion 6, as a flat configuration for ESLint 10. It replaces
[eslint-config-fluid](https://github.com/fluid-project/eslint-config-fluid) 2.1.1, together with the settings that
Infusion's own `.eslintrc.json` made over it, and keeps the effective settings they gave.

- **eslint-config-fluid's rules**, at the same severities and options. Its formatting rules, deprecated in ESLint's
  core, come from [@stylistic/eslint-plugin](https://eslint.style). Wherever @stylistic's defaults differ from the
  core's, the core's behaviour is stated: `SwitchCase: 0` for `indent`, and the core's exceptions for `comma-style`.
- **Its JSDoc rules**, through eslint-plugin-jsdoc, in `"jsdoc"` mode as version 39 used. Infusion's own setting
  prefers `any` over `Any`.
- **Its environments** as globals: the browser's and jQuery's, plus `fluid` and `$`.
- **Infusion's own settings:**
  - `strict` is set to `"global"`.
  - `no-console` and `no-loop-func` are off.
  - Double quotes are required, but template literals are allowed, and so are single quotes to avoid escaping.
  - ECMAScript 2022 is used, with `.js` files parsed as scripts.
- **fluid-lint's rules**, plus its processor for Single File Components, from
  [eslint-plugin-fluid-lint](../eslint-plugin-fluid-lint/README.md).

Some defaults changed between ESLint 8 and 10, and the old behaviour is kept:
- `no-unused-vars` doesn't report an unused caught error.
- An unused `eslint-disable` comment isn't reported.

## Use

```js
"use strict";

const infusion = require("eslint-config-infusion-6");

module.exports = [
    {ignores: ["**/lib/**"]},
    ...infusion.recommended,
    // Files run by node: CommonJS, with node's globals - what /* eslint-env node */ once declared
    {files: ["bin/**/*.js"], ...infusion.node},
    // ES modules
    {files: ["src/esm/**/*.js"], ...infusion.module},
    // Other environments, from the globals package, which this package re-exports
    {files: ["extension/**/*.js"], languageOptions: {globals: infusion.globals.webextensions}}
];
```

ESLint 10 reports `/* eslint-env */` comments as errors, so environments must be given in the configuration, by file.
Infusion's own [`eslint.config.js`](../../eslint.config.js) is a complete example.

The package is private for now and is installed from this directory (`file:packages/eslint-config-infusion-6`).
eslint-plugin-fluid-lint, which it requires, is installed the same way.
