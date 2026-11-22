# Visual layout builder for static site generators

## User

I am trying to design a malleable programming system that will allow something like the affordances of visual layout builders such as Divi for WordPress, or SquareSpace, but targetted at the backend of static site builders currently covered by systems like hugo, Jekyll, etc.
The notion is for users of the visual layout to be undisturbed by backend considerations, but unlike the proprietary CMSes for the authored format to be something intelligible to some reasonably wide community of developers and amenable to being worked on by their tools.
I am considering in detail the strategy for integrating with CSS layout rules and existing frameworks. Many of the major CSS frameworks seem unpalatable for various reasons - bootstrap is massive and authoritarian and requires a heavyweight build process. tailwind is more lightweight but fundamentally violates the premise of CSS that it is possible to use class names as a self-standing abstraction to restyle sites, and for them to be semantically meaningful in their own right.
That said, I am starting to think that the best route might be for me to abandon my developer-led distaste for tailwind since it is clearly catering for an increasingly massive constituency, and seems at least in its current incarnation more fitted to build chains that can idiomatically run 100% in the browser than other frameworks.
Can you consider this reasoning, and also do a survey of relatively popular CSS libraries for their appropriateness for this use case, and also for any current work that is similarly motivated.

## Claude

This is a rich design space and your reasoning is largely sound. Let me give you a thorough analysis.

---

## On the Core Architecture Problem

Your framing is exactly right: the tension is between *author experience* (WYSIWYG, drag-and-drop, no backend leaking through) and *developer intelligibility* (open, portable, inspectable output). The proprietary CMSes solve this by collapsing both into one system at the cost of lock-in; Hugo/Jekyll etc. solve the developer side but abandon non-technical users entirely. You're trying to split the difference.

The critical insight your framing implies — but worth stating explicitly — is that **the authored format and the rendering/styling system are separable concerns**, and decisions in one domain don't have to propagate into the other. A visual builder can write clean, developer-legible structured content (Markdown + YAML frontmatter, or a structured JSON document) while the CSS layer it uses for live preview in the builder is entirely decoupled from what the static site generator later applies.

---

## On Your Tailwind Ambivalence

Your distaste is intellectually well-founded. The core objection — that Tailwind violates the CSS promise of class-as-abstraction — is precisely correct. Moving away from semantic class names, Tailwind introduces the "utility-first" approach where style is composed directly in HTML, meaning that the class names themselves carry no semantic meaning about what the element *is*, only what it looks like at a point in time. This is a genuine philosophical break, not just a taste preference.

However, your instinct to reconsider is also defensible. A few factors shift the calculus for your specific use case:

**The generated-output problem.** In a visual builder, the *human author* never writes the class names — the builder does. So the "HTML is unreadable with 20 utility classes" critique largely dissolves. The user sees their button in the canvas; the `bg-blue-500 rounded px-4 py-2` is generated output in files that developers may want to read, but non-technical authors never touch. The abstraction violation hurts humans who write HTML by hand; it matters less when HTML is emitted programmatically.

**Tailwind v4 and browser-native operation.** Tailwind v4 is a reimagined version with zero configuration required, a simplified setup of just a single `@import` line, and uses Lightning CSS under the hood for vendor prefixing and modern syntax transforms — no external plugins required. More relevantly for your use case: the Play CDN lets you use Tailwind right in the browser without any build step, via a single script tag. However, the v4 Play CDN is explicitly designed for development and prototypes only — for production, Tailwind recommends the CLI or Vite. `@apply` isn't available on CDN, as it needs a build step through PostCSS.

This is an important constraint. **Tailwind in the browser is fundamentally hobbled** — it scans the DOM live for classes but can't support `@apply`, plugins, or full config customization. If your builder's output pipeline includes a build step (which static site generators inevitably do), that's fine; but if you wanted to run the whole thing 100% in the browser for the live preview layer, you'd be working with a degraded Tailwind.

**The abstraction escape valve.** Tailwind's `@apply` directive lets you merge utility classes and apply them into one CSS class, combining BEM-style naming with Tailwind's utility system — allowing separation of concerns and ensuring readability. So if a developer wants to restyle a site by writing `.hero { @apply ... }` rules in a separate stylesheet, they can — though this requires the build step, not the CDN.

**My assessment:** The pragmatic argument for Tailwind is strongest when you accept that the builder owns the output and developers will interact primarily with the structured content files (Markdown/YAML), not the HTML. But the CDN limitation means you'd be locked into at least a lightweight build step for the live preview unless you architect around it carefully.

---

## CSS Framework Survey

Here is a systematic survey organised by category:

### Category 1: The Major Frameworks (likely unsuitable)

**Bootstrap** — Your assessment is correct. Bootstrap is on version 5.3 and has the strongest WCAG 2.2 documentation, but its opinionated component system means sites look similar, and it genuinely requires a heavyweight Node build chain for customisation. Not appropriate.

**Foundation** — Foundation v6.9.0 modernised the build system with Dart Sass and requires Node.js 18+, with enterprise-focused features and a separate framework for responsive HTML emails. Accessibility comes baked in with ARIA attributes and keyboard navigation. More principled than Bootstrap, but similarly heavyweight and relatively niche.

### Category 2: Semantic/Classless CSS (very interesting for this use case)

These frameworks are the most philosophically aligned with your project. They style raw HTML based on element semantics — drop in a stylesheet, write plain HTML, get a decent-looking site. The developer can understand and restyle the page by changing the HTML structure or overriding CSS variables. Classless CSS frameworks style webpages using semantic HTML concepts — just copy-paste a stylesheet CDN link to your web page and preview, with CSS variables available for customisation.

**Pico CSS** — Pico.css offers both classless and class-based features for flexibility. It includes responsive typography, dark mode support, and semantic form styling, around ~10KB gzipped. It has active maintenance, thoughtful defaults, and a CDN-first philosophy. You can use the `.classless` version with a single link tag, then write pure HTML and it looks great without any configuration. Probably the strongest single candidate in this category for your use case.

**Simple.css** — Simple.css focuses on typography and readability at about 4KB. Extremely minimal, great for content-first sites, but limited for complex layouts.

**MVP.css** — MVP.css styles raw HTML elements with sensible defaults, perfect for shipping functional interfaces in minutes at ~3.27KB. Even more minimal than Simple.css.

**Water.css / new.css / sakura** — A cluster of similar minimal classless themes. Water.css and Simple.css work beautifully with Markdown-to-HTML generators. Good for document-style sites, limited for complex page-builder use cases.

### Category 3: Lightweight Class-Minimal Frameworks

**Bulma** — Bulma is a CSS-only framework built on Flexbox with readable class names and clean defaults. v1.0.0 released in March 2025 with CSS variables throughout and official dark mode — it requires no JavaScript and has ~93,000 weekly downloads. Importantly, it's modular and has genuinely semantic class names (`.column`, `.card`, `.hero`). No build step required for basic use. A strong candidate — the class names read naturally and would compose well from a visual builder's output.

**Chota / Milligram / Spectre** — Class-light frameworks like Chota and Milligram style semantic HTML and behave like classless CSS frameworks even though advertised as micro CSS frameworks. Useful but smaller communities and somewhat dated.

### Category 4: Design Token Systems

**Open Props** — This is perhaps the most architecturally interesting option for your project. Open Props provides expertly crafted web design tokens — CSS custom properties for spacing, typography, colors, shadows, animations, and more — with an `@import` from a CDN and no JavaScript required. It's CDN-ready, framework-agnostic, lightweight by design, and the theming model means you switch to dark mode or brand colors simply by redefining tokens.

The key distinction: Open Props is *not a framework*, it's a token vocabulary. The most basic use of CSS custom properties is design tokens — colors, fonts, spacings, timings, and other atomic bits of design that you pull from as you design a site. If you choose from pre-configured tokens, the design ends up fairly consistent and professional-looking, somewhat like the constraint appeal of utility class frameworks.

For a visual builder, Open Props is interesting because it gives you the *constraint vocabulary* (the builder can expose token-backed controls rather than raw colour pickers) without prescribing class names. Developers then write their own semantic classes that pull from the token set, which is legible and portable.

### Category 5: Web Components

**Shoelace (now rebranded as Web Awesome)** — Worth knowing about. Shoelace components can be customised at a high level through design tokens — CSS custom properties — with control over theme colors and general styling, using pure CSS with no preprocessor required. Components expose CSS parts that can be targeted with the `::part()` selector. Framework-agnostic, works as plain HTML custom elements, genuinely powerful. The Shadow DOM encapsulation is a double-edged sword for a theming/builder context — it protects component internals but makes sweeping visual changes harder.

### Category 6: Methodology (not a library)

**CUBE CSS** — CUBE CSS is a methodology from Andy Bell oriented towards simplicity, pragmatism, and consistency, designed to work *with* the browser medium rather than against it, with roots in large projects and small websites alike. Not a library to install, but a structural approach (Composition, Utility, Block, Exception) that could inform how your builder emits CSS classes. Worth studying as an architectural pattern for the generated output.

---

## The Existing Landscape for Similarly-Motivated Projects

Several projects are working in this space:

**TinaCMS** is the most mature attempt at the visual-editor-over-git-content model. Tina is a headless CMS supporting Markdown, MDX, JSON, YAML, and more, offering live preview that makes editing Markdown files intuitive for non-technical people. The UX aims to feel like Wix, but under the hood it's connected to a headless CMS with an open-source framework, with content stored in files in sync with your Git repository. The critical limitation: Tina is deeply tied to React/Next.js and its schema system, which somewhat undercuts the "broadly intelligible" authoring format goal.

**Keystatic** (by Thinkmill) is a newer, more developer-principled take. Keystatic is designed for developers who want structured content editing inside their codebase, supporting Markdown, JSON, and YAML files through a web-based admin UI, with schemas defined in TypeScript and content stored locally or in GitHub. More portable than Tina, less visually polished.

**Decap CMS** (formerly Netlify CMS) is the battle-tested incumbent. It's the most established Git-based CMS with nearly a decade of production use, integrating with the widest range of Git backends and static site generators. However, development slowed after Netlify handed the project to the community in 2023, and the editing UI hasn't kept pace with newer tools.

**CloudCannon** is the commercial leader in this space, with a genuinely good visual editor. CloudCannon is a Git-based headless CMS offering a range of editing options from an intuitive Visual Editor to a Markdown-centric Content Editor, working with Hugo, Eleventy, Jekyll, Gatsby, Next.js, and others. The catch: it's proprietary and cloud-hosted — exactly the kind of lock-in you're trying to avoid.

**Typemill** — Author-friendly with a visual block editor and raw Markdown editor, developer-friendly with Twig templates and YAML definitions, flexible with plugins, themes, and custom layouts. Closer to a flat-file PHP CMS than a static site generator backend, but the philosophy is aligned.

---

## Synthesis and Recommendations

Given your goals, here is how I'd think about the decision tree:

**On the CSS framework question**, I'd suggest your real choice is between three philosophically distinct paths:

1. **Adopt Tailwind v4** and accept that the builder owns the class-soup output while developers interact with the structured content. Build a layer on top that translates builder state to Tailwind classes, and ship a build step as part of the developer toolchain (not the author toolchain). This gets you the largest ecosystem and the best tooling support, at the cost of generated HTML that is visually unpleasant but functionally fine.

2. **Use Bulma or Pico CSS** and map your builder's layout primitives to their semantic class vocabulary. The output is more readable, genuinely semantically named, CDN-deployable with no build step, and easily overridable by developers writing plain CSS. You lose Tailwind's enormous community but gain philosophical coherence.

3. **Build on Open Props as a token foundation** and emit your own semantic class names from the builder, backed by the token set. This is the most principled approach — the authored format is cleanest, developers can restyle by writing their own CSS against a well-defined token vocabulary, and nothing is proprietary. But it's the most work to implement.

**On the authoring format**, the strongest precedent for "intelligible to a wide developer community" is frontmatter Markdown with structured YAML for layout configuration — exactly what Hugo, Jekyll, and Eleventy already consume. The challenge is that visual page builders typically need to express layout structure (sections, columns, component nesting) that doesn't map cleanly to flat Markdown. MDX lets you embed components but ties content to a specific JavaScript framework, reducing the portability that plain Markdown offers.

The most promising unexplored direction may be **YAML/TOML-based layout block definitions** as a separate layer from the prose content — something like how Hugo's front matter can express complex structured data, extended to describe page sections. This keeps the prose in clean Markdown (legible, portable, future-proof) while the layout intent is expressed as structured data that both the visual builder and the SSG template layer can interpret.

The fact that no existing open-source tool has nailed this combination — visual authoring over a truly portable, developer-legible format, without framework lock-in — suggests there's genuine unsatisfied demand here, and also that the problem is genuinely hard.

## User

I already have an architecture in mind, based on hierarchically merged JSON layers, for determining the semantic of the structured data underlying the site being edited. What I am looking for, and what I am puzzled by in looking at "classless" frameworks is some idiomatic scheme for resolving CSS definitions against the structure of the site that allows for development of richly interactive content based on reusable components, but yet preserves the ability to reach in to restyle deeply nested content based on its context - the way that the "cascading" idiom for CSS originally allowed for. What I see in most of these classless frameworks really looks more like "themes" - the markup is assumed to be semantically flat and generic which is at odds with what I am after. If you can, please look at this article on "Classless CSS based on tailwind" https://medium.com/@AntonShevchuk/classless-css-based-on-tailwind-57d4ef745c1f which proposes various styles for applying styling to a simple interface in which each rendition appears quite unacceptable to me. All of the framework-laden stylings (Tailwind, BEM, etc.) are hugely verbose but at the other extreme the "classless" styling is completely bare, pushing 100% of the semantic into the styling layer. I am after a framework or idiom that offers a reasonable compromise, much as a 2000s developer might have sought, with a light sprinkling of semantic CSS classnames used to supply "landmarks" around a document and the styling reliably yet flexibly keyed off those.

## Claude

Good — I have a thorough picture now. Let me engage with this at the level of depth it deserves.

---

## The Exact Problem You've Identified, Named Precisely

The article illustrates your objection perfectly. Shevchuk's "hybrid" approach is genuinely interesting, but notice what it actually achieves: `header a:first-of-type` and `header a:last-of-type` to distinguish two buttons. He even flags this himself as an anti-pattern. The moment you have a second header, or the buttons appear in a different order, the selector breaks. The classless approach displaced the semantic problem from the HTML into the CSS, but didn't solve it — it just moved the fragility. You are completely right that "classless" as a category is mostly "themes": it assumes flat, generic, document-like HTML and provides sensible defaults for `h1`, `p`, `table`. It cannot reason about *context*.

What you're actually after is something that existed in practice in roughly 2005–2012, when web developers wrote things like:

```css
.sidebar .widget h3 { ... }
.content .callout a { ... }
#hero .cta-group button { ... }
```

This is **contextual cascade CSS** — a light sprinkling of semantic landmark classes whose descendants are styled by context. It was idiomatic, readable, portable, and required zero build tools. It fell out of fashion for legitimate reasons (specificity wars, large team collision, hard-to-purge dead selectors) but those failure modes are largely irrelevant to your use case because: (a) you control the class name vocabulary via the builder, (b) the site is static and doesn't grow organically from many authors writing CSS independently, and (c) your JSON layer merge system can enforce a coherent class namespace.

The frameworks that arose to replace this idiom (BEM, CSS Modules, Tailwind) all solved the team-scale problem, but at the cost of exactly the capability you want: the ability to reach into deeply nested content and restyle it based on its positional context, without touching the inner markup.

---

## What Modern CSS Has Delivered That Solves This Properly

Two features now exist at native CSS level that are directly relevant and weren't available in the 2000s idiom:

**CSS `@scope`** is almost purpose-built for your problem. `@scope` enables true contextual styling without relying on heavy or deeply nested class naming conventions, letting you confine styles to a DOM subtree and set hard boundaries. The crucial capability is the **"donut scope"**: you can set a scoping root and a scoping limit, so a scoped style rule only targets elements placed between the two selectors in the ancestor tree. This means you can write:

```css
@scope (.sidebar) to (.widget) {
  h3 { font-size: 0.9rem; }
}
@scope (.widget) {
  h3 { font-size: 1.1rem; }
}
```

…and the `h3` inside a `.widget` that is inside a `.sidebar` is correctly resolved by the inner scope, not leaked by the outer one. This is the cascade-with-containment that your architecture implies. With `@scope` now supported in all major browsers as of Firefox 146 going Baseline, this is production-ready.

**CSS `@layer`** gives you the architectural scaffolding for your JSON-layer analogy. The layer priority order is declared explicitly, and styles not in any layer always override layered styles — giving you a clean escalation path from defaults through theme through component through context-specific overrides. This maps almost directly onto your hierarchically merged JSON layers: each layer in your data model can correspond to a `@layer` in the CSS model, and the merge semantics are analogous. A site-level theme layer sits below a component-specific layer sits below a contextual override layer.

---

## The Idiom I'd Recommend: Landmark-Contextual CSS with `@scope`

Here is a concrete proposal for the CSS idiom your builder should emit, which I think is exactly the 2000s compromise you're seeking, but grounded in modern CSS:

**Tier 1 — Element defaults** (truly classless, via a minimal base stylesheet):
```css
@layer base {
  h1, h2, h3 { ... }
  p { ... }
  a { ... }
}
```

**Tier 2 — Landmark classes** (light semantic anchors emitted by the builder — not presentational, not BEM-verbose, just structural names from your component vocabulary):
```css
@layer components {
  .hero { ... }
  .sidebar { ... }
  .card-grid { ... }
  .callout { ... }
}
```

**Tier 3 — Contextual styling** using `@scope` and descendant selectors keyed off landmark classes:
```css
@layer context {
  @scope (.sidebar) {
    h3 { font-size: 0.85rem; color: var(--color-muted); }
    a { text-decoration: none; display: block; }
  }

  @scope (.hero) {
    h1 { font-size: clamp(2rem, 5vw, 4rem); }
    p { font-size: 1.25rem; max-width: 60ch; }
  }

  @scope (.callout) to (.callout-body) {
    /* Style the callout chrome without touching nested callout content */
  }
}
```

**Tier 4 — Open Props or CSS custom properties** as the token vocabulary underlying all of the above, so developers can retheme by redefining `--color-primary`, `--space-md`, etc. rather than touching selectors.

This stack gives you:

- Clean HTML from the builder (a handful of meaningful class names as landmarks, nothing else)
- Developer-legible CSS that reads like intent, not instruction lists
- Contextual cascade fully restored via `@scope`, without the old specificity collision problems
- Theming via token overrides, not selector overrides
- No build step required (all of this is native CSS, deliverable as a single linked stylesheet)

---

## On Existing Libraries That Come Closest

None of the major frameworks hits this precisely, which is arguably what makes your project worthwhile. The closest precedents:

**Every Layout** (Bell & Pickering) is philosophically adjacent. Its layout primitives — Box, Stack, Sidebar, Cluster — are self-governing and free from media queries, responding to intrinsic available space rather than viewport breakpoints, making them genuinely modular and composable. Their components use single-purpose class names (`.stack`, `.sidebar`, `.cluster`) which are exactly the kind of landmark anchors your builder would emit. Every Layout doesn't solve the contextual theming problem but the layout primitive model is directly compatible with your architecture.

**CUBE CSS** (Bell's methodology) explicitly embraces the cascade rather than fighting it, and uses what he calls "exceptions" (small modifier classes or data attributes) for contextual variants. It sits between BEM's verbosity and classless's opacity — closer to what you want, though still a methodology rather than a library.

**Open Props** as a token layer under your own landmark classes is the most natural fit. It provides a stable, CDN-available vocabulary of CSS custom properties (`--size-3`, `--font-size-2`, `--color-blue-6`) that your contextual rules can reference, so the cascade logic lives in selectors and the visual values live in tokens — a clean separation.

---

## The Key Architectural Implication

What emerges from this is a clear principle for your builder's CSS generation strategy: **the builder's job is to emit the right landmark class on the right container element, and then step back**. The CSS file — which can be authored or overridden by a developer — does the rest via contextual rules. The author never sees classes; the developer sees a small, meaningful vocabulary of component classes plus a CSS file where every rule says something legible about intent.

This is genuinely different from every existing framework, because existing frameworks are designed for human markup authors. You have the advantage of a machine emitting the HTML, which means you can guarantee the landmark classes are always present and correctly placed, solving the historical failure mode of contextual CSS (humans forgetting to add the class, or adding it inconsistently).

The `@scope` + `@layer` + Open Props combination is, I think, the closest thing to a native CSS answer to what you're describing — and it's all now Baseline and requires no build tooling whatsoever.

## User

This - @scope - sounds appropriate as a technical mechanism, but sociologically (and perhaps impossibly) I am looking for a solution that preserves access to some sizable community of practice, with a rich repertoire of components and UI solutions. Of things in existence, Tailwind's community seems the most rich and vigorous but it's hard to see how to square the circle of getting crosswalk with it without sacrificing engineering values. Bell & Pickering's approach is indeed attractive and does seem admirably "landmark-based" but seems structured more as a pattern language of "recipes" rather than readily reusable "components". That is, its philosophy is primarily aimed at those inhabiting the design at the code level. Perhaps this is an area where an overarching system offering visual tooling could add value. But "every layout"'s content also seems focused on "solutions for layout challenges in a context" rather than providing a grab-bag of off-the-shelf yet repurposable components. All the same I find their philosophy and structuring appealing and wonder if there is some community of component-builders adjacent to it.

## Claude

This is a genuinely hard problem — you're asking for community richness at the intersection of engineering principle and stylistic openness, which is a point of tension the current ecosystem hasn't resolved. Let me be honest about the landscape and then try to map a path.

---

## The Fundamental Sociological Problem

The community richness you're looking for is mostly downstream of tooling lock-in. Tailwind's ecosystem is large precisely *because* it's coupled to React/Next.js and the shadcn/Radix/Headless UI stack — millions of developers using the same build chain produce a rich library of copy-pasteable components. Every Layout's community is small precisely because it's principled: it attracts developers who understand CSS deeply and don't need a grab-bag of ready-made parts. The community and the philosophy are in tension, not alignment.

So the question is really: **can you construct a crosswalk between the Tailwind ecosystem's component wealth and a landmark-contextual CSS idiom?** And there's a more honest sub-question underneath it: do you need to preserve the *class names* from the Tailwind ecosystem, or just the *component structures and interaction patterns*?

---

## DaisyUI as the Least-Bad Crosswalk

The most interesting development in your direction is daisyUI, and it's worth examining carefully because it's already doing something philosophically close to what you want — it just doesn't know it.

daisyUI classes are a combination of multiple CSS rules named semantically for each part of the UI. Where Tailwind CSS class names decide if padding should be 4px or 8px, daisyUI class names decide if an HTML element should look like a card, a button, or a toggle — the same way you'd name them semantically in a design system. That's your landmark vocabulary. `btn`, `card`, `hero`, `navbar` are exactly the kind of one-word semantic anchors you described wanting.

DaisyUI v5 now provides micro CSS files for no-build environments, so for server-side rendered projects or those without a JS build step, you can use parts of daisyUI without the full library or even Tailwind CSS. This is significant. It means daisyUI's component vocabulary is increasingly decoupling from its Tailwind dependency — the semantic class names can become a standalone layer.

daisyUI adds a set of semantic color names so instead of using constant color names like `bg-blue-500`, you use semantic names like `bg-primary` or `bg-success`, and all colors are CSS variables, meaning you can change the theme of your entire app without editing HTML. This is the token layer you'd want.

The honest limitation: daisyUI's component semantics still assume flat, non-contextual styling. A `.card` inside a `.sidebar` looks the same as a `.card` in `.hero`. It doesn't provide the contextual cascade you want — but crucially, **it also doesn't prevent it**. Because daisyUI uses low-specificity CSS, you can write your contextual `@scope` rules on top and they'll win. daisyUI gives you the vocabulary and the component structures; `@scope` gives you the contextual override mechanism.

---

## The Headless Primitives Layer (for interactive components)

For anything requiring JavaScript — modals, dropdowns, accordions, tooltips — the ecosystem has largely converged on a separation: **headless behaviour primitives** that carry no styling at all, with styling applied by the consumer.

The primitive layer consists of accessible, unstyled, low-level components you compose into your own UI. Radix UI, Base UI, and React Aria sit here. The component layer is pre-built combinations of primitives — shadcn/ui copies Radix primitives plus Tailwind styles into your repo and you own the code. Ark UI offers the same accessibility and state-machine logic beyond React, supporting Vue and Solid as well.

For your use case, the headless layer is actually a good fit even though it's React-oriented, because the behavioural contracts (keyboard navigation, ARIA attributes, focus trapping, state machines) don't need to change when you change the styling. You could in principle ship a builder that wraps headless primitives with your own semantic class names as the styling layer, preserving the interaction correctness without inheriting the visual opinions.

**Web Awesome** (the renamed and upgraded Shoelace) is the most mature non-React option. Web Awesome uses native Web Components that work in any framework without adapters or wrappers, with a three-layer theming system that allows customisation using only standard CSS. It provides built-in accessibility and lazy loading, and components are genuinely framework-agnostic — they work identically in React, Vue, Angular, Svelte, or vanilla JavaScript. Because Web Components with Shadow DOM expose `::part()` selectors, you can restyle any component internals using standard CSS without touching the component's own code — which is a reasonable approximation of the contextual-cascade capability you want.

---

## W3C Design Tokens as Infrastructure

Something important happened in October 2025 that's directly relevant to your architecture: the Design Tokens Community Group released the first stable version of the Design Tokens Specification (v1), with reference implementations in Style Dictionary, Tokens Studio, and Terrazzo, and adoption or in-progress implementation from Penpot, Figma, Sketch, Framer, Knapsack, Supernova, and zeroheight. The organisations involved include Adobe, Google, Microsoft, Meta, Shopify, Disney and dozens more.

This is potentially the infrastructure your hierarchical JSON layer merge system needs. Penpot has introduced native, open-standard design tokens using the W3C DTCG specification, making it the first open-source design tool to fully embrace the standard, which means tokens can move seamlessly across tools, libraries, and pipelines without being locked into a proprietary ecosystem.

Your JSON layer merge system for determining site semantics is structurally isomorphic to the W3C design token hierarchy — both are about merging layers of named design decisions with well-defined override semantics. If you aligned your JSON data model with the DTCG token format (or at least made it output-compatible), you'd get free integration with a growing cross-industry toolchain, and potentially interop with Penpot as a design-side companion to your builder.

---

## A Realistic Ecosystem Strategy

Given all of this, here is how I'd frame the communities you can tap and how:

**Layer 1 — Component structures and interaction patterns:** Draw from the Tailwind/daisyUI/shadcn ecosystem, but only for the *HTML structure and interaction logic*, not the class names. The huge volume of Tailwind components on sites like Flowbite, HyperUI, and daisyUI's own library gives you a rich vocabulary of patterns (how a card should be structured, how a dropdown should nest, what a hero section contains). Your builder can re-emit those patterns with its own semantic landmark classes rather than the original Tailwind utilities. The visual output is the same; the generated markup is yours.

**Layer 2 — Accessible interactive behaviour:** Web Awesome / Shoelace for no-framework-required web components, or Radix/Ark for React-heavy contexts. These provide the behaviour contracts your interactive components need without prescribing styling.

**Layer 3 — Token vocabulary:** W3C DTCG-aligned CSS custom properties (Open Props is close enough, or define your own compliant token set). This is the language your JSON layer merge system speaks to the CSS layer.

**Layer 4 — Layout primitives:** Every Layout's primitives (Stack, Sidebar, Cluster, Grid) as the structural backbone. These are available as standalone CSS classes — not just a book — and their context-independent, intrinsic-sizing philosophy is exactly right for components that will live in builder-determined positions.

**Layer 5 — Contextual override:** `@scope` + `@layer` as the mechanism by which landmark context modifies the token values and component appearances. This is where your system adds value that no existing library provides.

---

## The Honest Gap

What doesn't yet exist — and which your project could plausibly create — is a **coherent component library that uses the daisyUI/Every Layout philosophical combination**: semantic landmark class names, layout primitives that compose intrinsically, CSS custom property theming, and `@scope`-based contextual overrides. The Tailwind community has the component count but the wrong philosophy. Every Layout has the right philosophy but not the component count. daisyUI has semantic names and component richness but not the contextual dimension. Nobody has synthesised these three yet.

That synthesis is exactly what a visual builder with a principled CSS emission strategy could produce and document, creating a community of practice around it. The tooling gap is real, but it's also the opportunity.

