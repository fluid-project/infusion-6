## What Is Infusion?

<a href="https://fluidproject.org/infusion"><img src="https://ponder.org.uk/img/infusion.png" height="100px"
style="margin-bottom: 30px; margin-top: -10px;"/></a>

Infusion, originally an initiative of the [Fluid community](https://fluidproject.org/) since 2008, is a JavaScript
library enabling the creation of flexible software. Versions 1 through 4 of Infusion, [documented](https://docs.fluidproject.org/infusion/development/)
and hosted on the Fluid project's site, were relatively conventionally structured libraries supporting the development
of various UI widgets.

This repository holds a prototype for a [comprehensive rewrite](https://github.com/fluid-project/infusion-6) of Infusion
which is underway for [version 6](https://github.com/fluid-project/infusion-6) based on reactive primitives throughout,
structuring it as a [software substrate](https://ponder.org.uk/term/substrate) constituting an
[integration domain](https://ponder.org.uk/term/integration-domain).

Infusion 6 is not compatible with previous versions
of Infusion and none of the current code samples or documentation are valid.
Visit the [Fluid Technology](https://matrix.to/#/#fluid-tech:matrix.org) channel on Element for more information.

Work in progress on this implementation can be tracked on Antranig Basman's [Work in Progress](https://ponder.org.uk/wip/) stream.

### Demos

Demos here in [GitHub Pages](https://fluid-project.github.io/infusion-6/demo/).

### Dependencies

Infusion runs in the browser with no dependencies of its own installed - the libraries it uses there are held in
`src/lib`, e.g. a hacked, [lithified](https://ponder.org.uk/term/lithification/) distribution of
[Preact signals core](https://www.npmjs.com/package/@preact/signals-core).

Under node, e.g. when a site rendering its pages statically with `hydrate.js` depends on Infusion through npm, these
are its only hard dependencies, which are installed with it:

* [linkedom](https://www.npmjs.com/package/linkedom) - the document in which pages are booted and rendered under node
* [he](https://www.npmjs.com/package/he) - decoding of HTML entities in templates
* [minimist](https://www.npmjs.com/package/minimist) - argument parsing for the command-line tools
* [json5](https://www.npmjs.com/package/json5) - reading `moduleOverrides.json5` and copyOut's `--sources`

Node 18 or later is required, for its built-in `fetch`.

A site depending on Infusion through npm may run its command-line tools from the scripts of its `package.json` as
`fluid-hydrate`, `fluid-dehydrate` and `fluid-copyout` - see [bin/boot.js](bin/boot.js). If the site holds a
`moduleOverrides.json5`, an entry for `infusion-6` names a checkout of Infusion whose tools are run in place of the
installed one, and `fluid-copyout` reads every module the file names from its checkout.

Development dependencies, e.g. those for linting, testing and building, and the sources of the libraries in `src/lib`,
will be installed by running the following from the project root:

```bash
npm install
```

### Tests

Either run `npm test` or else visit files in tests/framework-tests/core/html in the browser
