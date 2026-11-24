# wend-theme-beautiful

A theme for wend sites: the page furniture of [Beautiful Hugo](https://github.com/halogenica/beautifulhugo), as
Infusion 6 layers. Published to npm from Infusion 6's repository, independently of Infusion itself.

- `sfc/` - the document and its head, headers, navigation bar, footer, the main block of each kind of page, previews,
  pagers, tags, share links, related posts, comments and translated strings.
- `adapt/` - optional adaptations, each switched on by the site's configuration (`wend.json`), e.g. highlighting code,
  Google search and Piwik.
- `static/` - the theme's stylesheets, scripts and fonts, copied into the published site beneath the site's own.

A site changes one of these files without editing the theme: its fork of it, at
`<overrides>/beautifulWend/<path within the theme>` (see `wend.site.json`), stands in its place. The "Edit in Infusion"
extension makes that fork on the first edit of the footer, say - see `framing` in the site's editing configuration (`editing` in `wend.site.json`).

## Component tree

```
beautifulWend.site                         (fluid.resolveRoot: {site} visible everywhere)
├─ i18n          [beautifulWend.i18n, beautifulWend.i18n.<lang>]
├─ gcse, piwik, selfHosted, ...     $if on a site parameter; each holds a $linkage
└─ documents     $for page in pages
   └─ beautifulWend.document  + dynamic [beautifulWend.type.<type>, beautifulWend.kind.<kind>]
      ├─ head      beautifulWend.head      (stylesheetTags, scriptTags: $for over keyed asset records)
      ├─ navbar    beautifulWend.navbar    (items: $for over menu + extraItems, each with a variant layer)
      ├─ header    beautifulWend.header    (+ beautifulWend.header.home / .post / .page by kind or type)
      ├─ main      beautifulWend.main.single | .list | .home | .terms | .notFound
      ├─ pageMeta  ($if type page)
      ├─ footer    beautifulWend.footer
      └─ footerScriptTags
```

## From Hugo's templates to Infusion's layers

How the constructs of Hugo's templates, as Beautiful Hugo uses them, are written as Infusion layers here.

| Hugo | Infusion |
|---|---|
| `.Site`, `.Site.Params` | `{site}.config`, a `$reactiveRoot` on the resolve-root `beautifulWend.site` |
| A page and its front matter | `{document}.page`, the `$for` variable of `beautifulWend.document` |
| `baseof.html` blocks `header`, `main` | Subcomponent slots of `beautifulWend.document` |
| Layout lookup by kind and type | Dynamic layers `beautifulWend.kind.*` and `beautifulWend.type.*`, which re-target the slots |
| `{{ partial "x.html" . }}` | A subcomponent with an `@id` element |
| `{{ range }}` | `$component` with `$for` |
| `{{ if }}` around markup that belongs to the component | `$component` with `$if` and a self-template (`@id` element) |
| `{{ if eq .Type "post" }}` inside a partial | A variant layer (`beautifulWend.header.post`) applied by the type layer |
| `{{ if .Site.Params.gcse }}` and other environmental cascades | A holder under `beautifulWend.site` with `$if`, whose `$linkage` broadcasts adaptation layers |
| `{{ if .Site.Params.selfHosted }} A {{ else }} B {{ end }}` | Keyed data records (`stylesheets.katex.href`) overridden by an adaptation layer |
| `$.Scratch` | Computed members |
| `i18n "key"` | `{i18n}.strings.key`, from a per-language layer |
| Filters such as `urlize`, `dateFormat` and `urlquery` | `$compute` members calling `beautifulWend.urlize`, `beautifulWend.formatDate`, ... |
| `relativeURLs` | Site-absolute URLs in templates, relativised just before each document is written |
| `.Content` | `wend.content`, a verbatim view |
| Shortcodes | Component islands `<div fluid-layers="wend.shortcode.x">` in content |
| `{{ if }}` around an element | `@if` on the element |
| `{{ range }}` emitting siblings, e.g. in `<head>` | A `$for` rendered into a `<fluid-fragment @id>` slot |
| Aliases (`page/1/`) | `wend.alias`, a component list rendering redirect documents |
