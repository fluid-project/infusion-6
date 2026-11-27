# Representations searched as text rather than parsed

Status as of 2026-11-27: a survey of the editing work of recent months (Edit in Infusion's static editing, its source
view and Ask Anything panel, and wend's build). The survey lists each place where the text underlying a structured
representation is picked through by `indexOf` or regular expressions, instead of being read in a parsed form. All
of them are now fixed (see "The worklist, as done" below), apart from the few kept deliberately, listed at the end.

## Why it matters

A text search matches by appearance, not by meaning. Two values that are written alike can't be told apart. A match
can also land inside some other construct, such as a key, a code block, prose quoting markup, or a longer number.
Every such site already has a parsed form available, whether a parser, a syntax tree, a DOM, or the framework's own
record of where a value came from.

## Fixed: where the site's configuration supplies a value

Shift-click on material of the page drawn from `wend.json` used to find the value by `indexOf` over the file's raw
text. When two keys held the same value, the first one in the file won. A number such as `1` could match inside
`2019`. Text that merely equalled a configuration value got the configuration's halo. Post dates were mis-marked this
way, because they are formatted using `config.params.dateFormat`.

It is now found by path:

1. **The references themselves.** The renderer records on each bound text node the live references it interpolates
   (`flTemplateTokens`, `FluidView.js`).
2. **Traced back to the configuration** by the framework's `fluid.terminalSiteOf`, then by `configPath` in
   `fluid-staticEditing.js`. It follows:
   - references in layer definitions;
   - `$for` iteration variables, through the list's source, which `FluidIL.js` now records on the list's shadow;
   - `$compute` arguments, read from the layer's definition where the page was booted with the computation's
     value.
3. **Located in a hand-written JSON parser that keeps offsets** (`fluid.staticEditing.parseJSON`). Past a computation
   that reorganises its input, such as the menu's `buildMenu`, the value is looked for only beneath the input it read,
   and only if exactly one value there matches.

The regex in `boundValues`, which recovered interpolated values by matching rendered text against template text, is
gone too.

## The worklist, as done

1. **A new post's title in its front matter** (`fluid-staticEditing.js`: `beginNewPost`, `retitleNewPost`, and the
   list of new posts). The title was read and rewritten by `^title:` regexes over the whole file, so a quoted title
   came back with its escapes, and any `title:` line in the body could be taken for it. Now:
   - `fluid.staticEditing.frontMatter` reads the top-level entries of the front matter block, keeping each value's
     range. It understands plain, double-quoted and single-quoted scalars, and lists a block value with no scalar.
     The YAML parser `yaml` is used only by the build, and is not shipped to the browser, so this covers just what
     the editor reads and writes.
   - The title is written back into its value's range as a double-quoted scalar.
   - The list scenario's title now holds a colon and quotes.
2. **Ask Anything's widgets by `fluid-id`** (`fluid-editAskAnything.vue`).
   - `fluid.blockEditor.islandsOf` lists the island blocks of the source as markdown parses it, reading each
     element's `fluid-id` and `fluid-layers` from the parsed element.
   - `replaceIsland` finds the widget's lines through it.
   - `widgetFromParts` now takes the id to give a rebuilt widget and returns the id it gave, so no regex rewrites or
     reads ids from markup.
   - The AI scenario now quotes the widget's element in a code block ahead of it, and deleting the widget leaves the
     code block alone.
3. **`fluid-layers` attributes.**
   - `fluid.staticEditing.layersOf` reads islands from parsed markdown, or elements from markup the browser parses,
     by the file's extension.
   - `wend.trace.layersOf` walks the tree of Infusion's `fluid.parseHTMLToTree`.
4. **An SFC's template** (`templateOf`). It is now the top-level `<template>` block of the SFC parsed as Infusion
   parses it (`fluid.sfcBlocks`), so a tag with attributes, or `<template>` inside a script, no longer misleads it.
5. **Comparing a block with the rendering of its source** (`fluid-blockEditor.vue`). Compared by
   `fluid.markdownSerializer.canonicalChildren`.
6. **Completions in the source view** (`fluid-sourceView.vue`). `matchBefore` stays, since it is CodeMirror's way of
   reading a token still being typed, which the syntax tree can't yet parse. What it lacked was the syntax:
   - Completions of links, widget layers and template references no longer fire within code, whether markdown's
     code, or an SFC's scripts and styles, as the syntax tree tells.
   - `syntaxTree` is now exported from Infusion's CodeMirror bundle (`packages/fluid-lint/src/codemirror.js`), and
     `src/lib/fluid-lint/fluid-lint.js` was rebuilt.
7. **wend's text and trace keys.**
   - `siteModel.plainText` takes the text of the HTML as linkedom parses it, so its hand-written entity decoder is
     gone.
   - `trace.siteKey` composes the key of an input at a path of the site's root from that path, not by rewriting the
     key with a regex. Both forms were checked to give identical keys over the test site's build, since keys are
     compared from one build to the next.

Kept deliberately:

- **`searchedRange` and the regex in `commitFramingText`.** The search is the agreed fallback for when the range the
  renderer carried is stale.
- **`allocateId`'s `source.includes('fluid-id="…"')`.** It can only err towards skipping an id that is free.
- **wend's `<!--more-->` divider.** Hugo defines it as that literal marker in the rendered content. Written in a code
  block, it is escaped, so it can't be matched there.
- **Shortcode expansion in `wendMarkdown.expandShortcodes`.** This is Hugo's own syntax, tokenised as Hugo tokenises
  it.
- **Path, slug and URL manipulation.** These are strings, not representations of anything else.
