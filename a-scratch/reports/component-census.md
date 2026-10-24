# Census of the components of the ponder build

This census looks at what the components of a full ponder build are, and how they differ from one another. It was
taken to judge two ideas for simplifying components' book-keeping:

- sharing a single shadow per chain of layer definitions (`DefinitionChainMerge`), for instance through prototypal
  inheritance or shared entries in the shadow maps;
- not allocating instances or shadows at all for components that are provably static.

## Method

The census is one instrumented run of `infusion/js/buildSite.js` from `ponder-infusion` against the current Infusion
working tree. After the build finished, every shadow in `fluid.globalInstantiator.pathToComponent` was examined:

- **Chain:** the shadow's `def` merge records give its chain of layer definitions.
- **Own records:** all the other merge records (subcomponent, template, variables, dynamicLayers, user), apart from
  `defParents`. Each own record's material was described up to a bounded depth, so that records of the same shape and
  content compare equal, and its leaves were classified as literals, IL references, directives or reactive roots.
- **Subtree:** the component's path, with numbers replaced, shows which part of its page it lies in.

The census is taken by two scripts in `a-scratch/census`. Each builds the site into the directory it is given and writes
its results as JSON:

- `chainCensus.js` groups components by chain and gives the leaf classes, the distinct own records, the most frequent
  values of each own key, and the sizes of the shadow fields.
- `subtreeCensus.js` gives the counts by page subtree and per page.

For example, from the Infusion checkout:

```
node a-scratch/census/chainCensus.js . ../ponder-infusion /tmp/census-out census.json
node a-scratch/census/subtreeCensus.js . ../ponder-infusion /tmp/census-out subtrees.json
```

## Totals

| | |
|---|---|
| Components | 6,279 |
| Cells | 259,311 (about 41 per component) |
| Distinct definition chains | 46 |
| Pages (documents) | 59, plus 7 alias documents |
| Components per page | 76 minimum, 95 median, 206 maximum |

Earlier analysis quoted a figure of about 115,000. That figure counted the reference-resolution cells among these
cells, not components.

## Histogram by definition chain

The chain is named by its strongest layer.

| Components | Cumulative | Chain | What they are | Own records differ by |
|---|---|---|---|---|
| 1,977 | 31% | `fluid.sfcTemplateViewComponent` | the `view` of each SFC-backed component | 38 distinct own records; template is one of 28 SFC layers; 509 also carry a `container`/`parentTemplate` cell |
| 467 | 39% | `fluid.componentList` | drivers of `$for` | 3 distinct; a `list` cell |
| 429 | 46% | `fluid.templateViewComponent` | inline-template views, e.g. nav child links and content | 6 distinct; the template string |
| 419 | 52% | `fluid.listViewComponent` | views of those lists | 2 distinct; the `container` cell |
| 413 | 59% | `ponder.stylesheetTag` | `$for` items, 7 per page | only the variables layer, `stylesheet: "{doc}.stylesheets.X"` |
| 413 | 66% | `ponder.navItem` | `$for` items, 7 per page | only `item`, plus 2 variants of a dynamic layer (leaf or parent) |
| 307 | 70% | `fluid.component` | nav children and term links (`$for`) | only the variables layer |
| 295 | 75% | `ponder.scriptTag` | `$for` items, 5 per page | only the variables layer |
| 211 + 211 | 82% | `fluid.templateBlock` / `fluid.templateBlockView` | `if-` blocks and their views | the `parentTemplate` fragment (96 distinct) |
| 121 | 84% | `ponder.content` | page and preview bodies | 2 variants: the `html` source |
| 111 | 86% | `ponder.tags` | tag lists | 2 variants |
| 59 each | | `ponder.head`, `ponder.navbar`, `ponder.footer`, `ponder.pageMeta`, `ponder.header.bigimg`, … | one per page | 1 distinct own record across all 59 pages |
| (32 chains) | about 14% | everything else | | |

## What the components differ by

The components sort into four kinds:

1. **Views, about 50% of components.** These are the `fluid.sfcTemplateViewComponent`, `fluid.templateViewComponent`,
   `fluid.listViewComponent` and `fluid.templateBlockView` chains. They differ only by which template they hold, from a
   few dozen, and by the `container` and `parentTemplate` cells their parent passes down.
2. **`$for` iterations, 1,560 components (25%).** Their own records are identical within each chain. The only
   difference is one reference in the variables layer, such as `{/site-11.documents.0}.stylesheets.katex`.
3. **Per-page singletons.** Each has the same own record on every page and differs only in its context, `{document}`.
4. **Genuinely varied material.** `if-` block fragments, page content, the pager and share links. This is a small
   minority.

## Where the components sit in each page

Totals across all 59 pages, by subtree:

| Subtree | Components | Per page |
|---|---|---|
| `navbar` | 1,770 | 30 |
| `head` | 1,298 | 22 |
| `footerScriptTags` | 590 | 10 |
| `footer`, `pageMeta` | 236 | 4 |
| `main` | 1,886 | varies |
| `header` | 358 | varies |

About 63% of all components are page chrome: the head, navbar, footer and script tags. This chrome is built again for
every page, from the same own records. The census did not check whether the rendered chrome is byte-identical across
pages. The navbar probably differs at least in its active item and its relative URLs.

## Book-keeping held by shadows

These are the total entries across all shadows, for the shadow fields that hold maps or objects:

| Field | Total entries | Shadows with any |
|---|---|---|
| `layerMap` | 57,223 | 6,277 |
| `shadowMap` | 57,223 | 6,277 |
| `mergeRecords` | 48,102 | 6,277 |
| `contextReferenceMap` | 26,219 | 5,597 |
| `lastMerge` | 25,108 | 6,277 |
| `sitedRefMap` | 19,194 | 6,013 |
| `oldShadowMap` | 17,642 | 2,619 |
| `frameworkEffects` | 16,244 | 6,279 |
| `ownScope` / `appliedContexts` | 10,482 each | 5,970 |
| `childrenScope` | 7,371 | 3,118 |
| `variablesLayer` | 1,560 | 1,560 |

For instances that share a chain, the entries in `layerMap`, `shadowMap`, `mergeRecords` and `lastMerge` are mostly
identical.

## Implications for the two ideas

- **Sharing a chain's book-keeping from one shadow object is well supported.** About 90% of components fall into the 20
  largest chains, and within a chain the own records are nearly always one of a few shapes. Many components differ only
  by a variables-layer reference or a cell passed in from the parent. So a shared shadow per chain and own-record shape,
  with a small per-instance overlay for the variables layer and the injected cells, would cover most of the tree.
- **"Provably static" components cannot be decided from the definitions alone.** Every chain contains directives: each
  view chain has 6–8 (its render cells), and even plain `fluid.component` has one. Only about 2,800 components have own
  records free of references and cells, and even those inherit directives from their chain. The static part is the
  *inputs*. In a one-shot build, `{document}`, the variables-layer references and the site model never change once they
  resolve. So "static" would have to be something the build declares, for example a mode in which reactive roots are
  frozen, rather than something deduced from the definitions.
- **A third lever is the page chrome.** If the head, footer and script tags were rendered once per distinct set of
  inputs and reused across pages, it would remove most of the 63%. That subtree only needs `{document}` for a handful of
  values. This is narrower than general shadow sharing, but probably the larger single saving for this site.
