# fluid-lint

Linting of Infusion 6 JavaScript and Single File Components, for CodeMirror 6 and for node.

## What it reads

- **JavaScript** is parsed by `@lezer/javascript`. Within it, the grammar of configuration's runes,
  [`grammar/fluid-runes.grammar`](grammar/fluid-runes.grammar), is nested over the interior of each String and
  template literal which configures a layer: those within the record written to `fluid.def`, passing through objects
  and arrays but never into code, e.g. the body of a function written as a `func`. A String held at `template` or
  `partialTemplate` is read as a template, unless it is a reference or a compact record.
- **SFCs** are parsed by `@lezer/html` in its self-closing dialect. The JavaScript of each top-level `<script>` is
  read as above, and the interpolations of its `<template>`.
- **The grammar of runes** has three top rules:
  - `Value` - a configuration String, read as Infusion reads it, by its first character: a reference
    `{context selector}.path:label`, a compact record `$type:fn(args)`, a backslash-escaped literal, or a plain literal.
  - `Template` - text holding interpolations `@{...}`, in which `@@{` is literal.
  - `CallBody` - a call without its rune, e.g. the `forward` of a `$lens`.

## What it checks

- **Syntax.** JavaScript and HTML syntax, and the syntax of every rune, down to its interior. Examples: an unclosed
  reference or call, a malformed interpolation, a `$` beginning a literal, which should be written `\\$`.
- **Compact records.** The directive of each compact record, which must be `$compute`, `$effect` or `$method`.
  `$effect` must list its arguments. A quoted argument draws a warning, since compact arguments are not unquoted.
- **Directives of layer records.**
  - `$layers`, `$variety` and `$importMap` belong to a record.
  - `$for` and `$if` belong to the record of a `$component`.
  - A member's directives (`$compute`, `$effect`, `$method`, `$lens`, `$bindable`, `$linkage`, `$component`,
    `$reactiveRoot`, `$transient`) stand alone as the single key of the member's record.
- **Full forms.** Their keys and required members, e.g. a function record's `func`, a `$lens`'s `source`, or a
  `$for`'s `source`. A `$component`'s record is linted in turn as a layer record.
- **Recovery.** A missing comma between the members of an object or the elements of an array is reported, and repaired
  in place for the rest of the linting, so that one slip doesn't hide the errors after it. A mismatched or unclosed
  bracket is reported with the line of the bracket left open. Errors within a rune are described by what is missing,
  e.g. an unclosed reference or call, an empty argument, or text after a whole rune.
- **Fragments.** A fragment of a record, e.g. `view: {$component: {...}}`, as documentation shows, is linted as if
  within a record. `isFragment` tells whether a text is one.

## Use

- **In node:** `lint(text, kind)` in [`src/fluidLint.js`](src/fluidLint.js) returns diagnostics
  `{from, to, severity, message}`. `kind` is `"js"` or `"vue"`, and by default is guessed from the text.
- **Through ESLint:** [`eslint-plugin-fluid-lint`](../eslint-plugin-fluid-lint/README.md) reports its diagnostics as
  ESLint rules. Infusion's own `npm run lint` applies it.
- **A summary of ESLint's run:** [`eslint-summary-formatter.cjs`](eslint-summary-formatter.cjs) is a formatter for
  ESLint 8 or later, an optional peer dependency. It prints ESLint's own "stylish" report, followed by a count of the
  files free of errors and warnings, e.g. `138/138 files lint free`. Use it as
  `eslint --format ./node_modules/fluid-lint/eslint-summary-formatter.cjs ...`. Infusion's `npm run lint` uses it.
- **For CodeMirror 6:** [`src/codemirror.js`](src/codemirror.js) provides the languages (`fluidJavaScript`,
  `fluidSfc`), the linter (`fluidLinter`), and `fluidEditor`, which makes an editor of either.
- **The bundle:** `npm run build` regenerates the parser from the grammar, and bundles `src/codemirror.js` with
  CodeMirror as the browser global `fluid.codemirror6`, into Infusion's `src/lib/fluid-lint/fluid-lint.js`.
  [`fluid.liveExample`](../../src/components/sfc/fluid-liveExample.vue) loads that bundle; it is the live example of
  Infusion's documentation.
- **Tests:** `npm test` runs [`test/lintTests.js`](test/lintTests.js). The live example's own tests are in
  `tests/framework-tests/components/html/LiveExampleTests.html`.

The package is ESM, as the parser `lezer-generator` writes is. `@codemirror/view` and `@codemirror/state` are pinned to
the versions `@codemirror/lint` requires, since a second copy of either within the bundle silently disables the linter.
