# Static site editor with live preview

## User

I am planning to build a technology with a direct editing UI similar to WordPress but which is backed by an underlying static publishing workflow pushing to GitHub pages. It will feature an immediate live preview of any edits made to the site via optimistic concurrency. What existing technologies are similar to this - I am aware of sveltia and Gatsby in this area, but what is the most similar existing solution?

## Claude

The closest existing match is probably **CloudCannon**, with **TinaCMS** a close second. One clarification first: Gatsby is a static site generator rather than an editing layer, so it sits a level below what you're describing. Sveltia (like Decap CMS, which it descends from) is a form-based Git CMS with a side preview pane rather than true on-page direct editing.

**CloudCannon** is the nearest to "WordPress-style editing over a static Git workflow." Its Visual Editor lets you click directly on rendered page content and edit it in place, with a live preview. Changes are committed back to a Git repository (GitHub, GitLab, Bitbucket), and it supports Jekyll, Hugo, Eleventy, Astro, SvelteKit, and others. The main differences from your plan are that it's a commercial hosted service and it builds and hosts the site itself, though you can sync to a repo and deploy elsewhere.

**TinaCMS** (formerly Forestry) is the closest open-source option. It offers contextual "click-to-edit" visual editing with real-time preview inside your actual site, and it stores content as Markdown, MDX, or JSON committed to GitHub. It works best with React-based frameworks like Next.js and Astro. You can use Tina Cloud or self-host the backend. Its live preview works by streaming form state into the page on the client before anything is committed, which is conceptually close to your optimistic-preview idea.

Several other tools are worth knowing:

- **Netlify Create** (formerly Stackbit) did Git-backed visual page editing, but it has been wound down or folded into Netlify's offerings. It's worth studying as prior art.
- **Keystatic** (by Thinkmill) is a Git-backed CMS with a GitHub mode that commits directly via the GitHub API. It uses form-based editing rather than in-place editing.
- **Pages CMS**, **Front Matter CMS** (a VS Code extension), **Siteleaf**, and the older **Prose.io** are all GitHub-backed, but closer to Sveltia/Decap in feel.
- **Publii** is a desktop WordPress-like editor that generates a static site and can sync to GitHub Pages. It's arguably the most "WordPress-feeling" option, but it isn't Git-native or collaborative.
- **Statamic** is flat-file and Git-aware, but it's a PHP server app rather than a static editor.

On the optimistic concurrency piece, the GitHub Contents and Git Data APIs already give you a natural mechanism. Every file update requires the current blob SHA, and ref updates can be non-forced, so a stale write fails and you can rebase or merge. Most of the tools above lean on this. Where you could differentiate is by pairing instant client-side preview with that conflict handling, plus true in-page editing that works independently of the framework. Neither TinaCMS (React-leaning) nor CloudCannon (proprietary) fully covers that combination.

## User

What is TinaCMS own UI written in, e.g. the "Add Section" UI - can you give me a source link, and explain how the available sections are populated?

## Claude

TinaCMS's editing UI is written in **TypeScript and React**. It lives in the main `tinacms` package of the monorepo, under the "toolkit" folder. Forms are managed with **Final Form**, and the drag-to-reorder lists use a drag-and-drop library. The "Add Section" button you see on a page-builder field is the **blocks field plugin**.

**Source links**

The source is in the `tinacms/tinacms` monorepo, at roughly `packages/tinacms/src/toolkit/fields/plugins/blocks-field-plugin/`. I'm inferring that GitHub path from the compiled package, so treat it as approximate. The published build confirms the folder, at tinacms/dist/toolkit/fields/plugins/blocks-field-plugin. You can browse the shipped type definitions here: https://app.unpkg.com/tinacms@2.7.9/files/dist/toolkit/fields/plugins/blocks-field-plugin/index.d.ts

Blocks is one of a set of built-in field plugins. The same directory also holds plugins for color, group, group-list, list, image, MDX, number, select, text, reference fields and more. An early commit shows the original version of the component, when it lived at `packages/tinacms/src/plugins/fields/BlocksFieldPlugin.tsx`: https://github.com/tinacms/tinacms/commit/cac4d86

**How the available sections are populated**

The sections come entirely from your schema in `tina/config.ts`, not from scanning your components.

1. **You declare templates in the schema.** An object field takes either a `fields` or a `templates` property, and if you supply `templates` with `list: true`, you get the blocks API. Each template is one section type, such as "Hero", "Features", or "CTA".

2. **The schema becomes a form field definition.** The blocks field definition carries a `templates` map, keyed by template name. Each `BlockTemplate` has a `label`, an optional `defaultItem` (an object or a function returning one), an optional array of `fields`, and optional `itemProps` for the list item's key and label.

3. **The "Add" menu iterates that map.** The original component simply does `Object.entries(field.templates).map(([name, template]) => ...)` to render the menu entries. Clicking one calls a Final Form array mutator to insert a new item, built from the template's `defaultItem` and tagged with the template name.

4. **Each item records its type.** The discriminator key on polymorphic objects (formerly blocks) is `_template`. When an item is expanded, the plugin looks up `field.templates[item._template]` and maps that template's fields to nested names like `${field.name}.${index}.${subField.name}`, then renders them with the shared `FieldsBuilder`.

5. **Your frontend renders the sections, not Tina.** The live page uses your own component switch on `__typename` or `_template`. Tina just streams the updated form values into it through `useTina`, which is how the instant preview works.

Newer versions also support a visual block selector, enabled with a `ui.visualSelector` option. This shows thumbnails taken from each template's `ui.previewSrc` instead of a plain list. It still comes from the same templates map.

For your project, the key takeaway is that Tina's section palette is schema-driven. It is a static, declared list of templates with defaults, so there's no runtime component discovery to replicate.

## User

The list of blocks is statically configured, it couldn't be adjusted dynamically by the user selecting from a palette?

## Claude

Yes, that's right. In TinaCMS the set of block types is fixed by the schema, and an editor can't add a new kind of section to the palette from inside the UI.

The reason is structural. The templates in `tina/config.ts` are compiled ahead of time into a GraphQL schema and generated types, and the content layer validates documents against that schema. A new block type therefore means editing the config and rebuilding, which is a developer task rather than an editor one. At runtime, editors can choose *which* of the declared templates to insert, reorder them, and remove them, but they can't define new ones.

There are a few partial workarounds:

- **Reference a collection of reusable blocks.** You define a "sections" collection and use a reference field to it. Editors can then create new block *instances* (a saved "Spring promo banner", say) and pick them from a list that grows at runtime. The underlying *shapes* are still fixed, though.
- **Use a generic escape-hatch block.** A template with a rich-text, MDX, or raw HTML/JSON field lets editors put arbitrary content in. You lose structured editing for that block.
- **Write a custom field plugin.** Since the UI is pluggable via `cms.fields.add`, you could build your own palette component that, for example, loads options from a JSON file in the repo. Anything it saves still has to fit a field declared in the schema, so in practice this means storing loosely typed data in a string or JSON-ish field.

This is a real gap you could target. If your tool discovered or registered block types at runtime, for example from components or manifest files in the repo, editors could compose from a palette that grows without a rebuild of the editor. The tradeoff is losing Tina's build-time type safety. You'd need runtime validation, such as a JSON Schema per block, to keep the content in the static site consistent.

## User

The live editing setup guide appears to explain that this requires SSR - it is not capable of rendering the editing interface from static hosting?

## Claude

Not quite. Tina's editing interface itself doesn't need SSR. The requirement in the guide is about how your *page* gets data in preview, and it mostly comes from the Next.js setup the guide is written around.

The admin UI is static. `tinacms build` outputs a static single-page app into your public folder (typically `/admin`), so it can be served from GitHub Pages or any static host. That admin app loads your site in an iframe and talks to a content API, either Tina Cloud or a self-hosted backend. That backend is the actual server dependency, since something has to serve GraphQL and commit to GitHub. It isn't SSR of your pages.

Live preview needs your page to re-render on the client. Visual editing works by passing query results through the `useTina` React hook, which swaps in the in-progress form values as the editor types. So the page must be a React tree that hydrates and can receive new props in the browser. In the Next.js App Router, that means a client component wrapper around the page. The guide's server-side mentions are about fetching the initial data and Next's draft mode, which do need a running Next server. A statically exported site where the component hydrates and calls `useTina` can still preview live.

For non-React or purely static output, such as Hugo, Jekyll, or Astro pages without React islands, Tina's click-to-edit visual mode is unavailable or limited. You get the form-based sidebar editing, but not instant in-page preview. This is the real constraint, and Tina's docs on framework support may have changed recently, so it's worth checking the current guide for your framework.

For your design, this points to a clear approach. If you want instant preview on a purely static site, your editor has to be able to re-render the page in the browser. That means either running the same templates client-side (a JS-based generator you can execute in the browser) or patching the rendered DOM directly with mappings from data to elements. Tina avoids the problem by depending on React.

