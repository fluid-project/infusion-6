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

* [Preact signals core](https://www.npmjs.com/package/@preact/signals-core)
(Hacked, [lithified](https://ponder.org.uk/term/lithification/) distribution)

Development dependencies will be installed by running the following from the project root:

```bash
npm install
```
