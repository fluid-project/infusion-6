# eslint-plugin-fluid-lint

Reports the diagnostics of [fluid-lint](../fluid-lint/README.md) through ESLint - the syntax of configuration's runes,
and the directives and full forms of the layer records written to `fluid.def`, in JavaScript and Single File Components.

## What it provides

- **Rules.**
  - `fluid-lint/errors` reports fluid-lint's errors in JavaScript, and `fluid-lint/warnings` its warnings.
  - Each may be configured, or disabled by a comment, as any other rule, e.g. `// eslint-disable-next-line fluid-lint/errors`.
- **A processor.**
  - `fluid-lint/vue` lints an SFC whole: the JavaScript of its top-level `<script>`s and the interpolations of its
    `<template>`.
  - ESLint parses no part of the SFC itself, so other rules don't apply to it.
  - Its diagnostics are reported under the same rule names, at the severity fluid-lint gives them.
- **A configuration.** `plugin:fluid-lint/recommended` enables both rules, and the processor for `*.vue`.

A fix which fluid-lint proposes, e.g. inserting a missing `}`, is offered as a suggestion, e.g. in an editor, rather
than applied by `eslint --fix`, since it is a guess at what was meant.

## Use

Infusion's `.eslintrc.json` extends `plugin:fluid-lint/recommended`, and `npm run lint` passes `--ext .js,.vue`. The
plugin is a devDependency of Infusion, installed from this directory (`file:packages/eslint-plugin-fluid-lint`).

The plugin loads fluid-lint's ES module with `require`, which needs node 22.12 or later. fluid-lint's own packages must
be installed in `packages/fluid-lint`.

**Tests:** run `npm test` in this directory to run [`test/pluginTests.js`](test/pluginTests.js) through ESLint's API.
