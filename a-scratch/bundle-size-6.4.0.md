# Bundle size of core Infusion at 6.4.0

Measured on 2026-11-22 from the working tree, by minifying the sources with terser under the settings used by `build.js`
(`mangle: false, compress: false` - whitespace and comments are removed, but names are not shortened nor code
compressed). gzip is measured at level 9, Brotli at its defaults. The minified size agrees with `dist/fluid.core.min.js`
as last built.

## The core bundle

Core Infusion is the seven files listed as `coreSource` in `build.js`, bundled as `dist/fluid.core.min.js`:

|                                   | Raw    | gzip   | Brotli |
|-----------------------------------|--------|--------|--------|
| Source                            | 900 KB | 218 KB | 172 KB |
| Minified as by `build.js`         | 299 KB | 75 KB  | 64 KB  |
| Minified, mangled and compressed  | 203 KB | 60 KB  | 52 KB  |

Enabling terser's mangling and compression would save a further 96 KB minified, or 15 KB (about 20%) gzipped.

## By file

In bundle order, each minified on its own as by `build.js`:

| File                                   | Lines  | Minified | Minified + gzip |
|----------------------------------------|--------|----------|-----------------|
| `src/framework/core/js/FluidCore.js`    | 467    | 5.6 KB   | 1.9 KB          |
| `src/framework/core/js/FluidSignals.js` | 2,006  | 27.8 KB  | 7.3 KB          |
| `src/framework/core/js/Fluid.js`        | 4,323  | 66.7 KB  | 18.1 KB         |
| `src/framework/core/js/FluidModules.js` | 157    | 2.2 KB   | 0.8 KB          |
| `src/framework/core/js/FluidIL.js`      | 4,502  | 89.9 KB  | 21.4 KB         |
| `src/framework/core/js/FluidView.js`    | 4,635  | 85.6 KB  | 22.6 KB         |
| `src/framework/core/js/FluidPTF.js`     | 1,086  | 20.9 KB  | 5.9 KB          |
| **Total**                               | 17,176 | 298.7 KB | 78.0 KB         |

The gzipped sizes of the files sum to slightly more than the 75 KB of the bundle, since they compress better together.
`FluidIL.js`, `FluidView.js` and `Fluid.js` make up about 80% of the whole.

Not included are the boot bundle (`dist/fluid.boot.min.js`) and libraries loaded on demand, e.g. the fluid-lint bundle
of CodeMirror 6 (`src/lib/fluid-lint/fluid-lint.js`, 536 KB, itself already minified).

## Comparison with jQuery

jQuery's minified bundle reached its peak size of about 95 KB at 1.12.0, before the 2.x and 3.x lines shed support for
old browsers. jQuery's own build mangles and compresses, so the fair comparison is with the third row above:

|                                              | Minified | vs. jQuery 1.12.0 |
|----------------------------------------------|----------|-------------------|
| jQuery 1.12.0                                | ~95 KB   | 1.0×              |
| Core Infusion, mangled and compressed        | 203 KB   | ~2.1×             |
| Core Infusion, as built by `build.js`        | 299 KB   | ~3.1×             |

Core Infusion is therefore roughly twice the size of jQuery at its largest, measured like for like - or three times as
currently built, since `build.js` leaves names unmangled. Unlike jQuery, it brings its own reactive signals, component
system (IL), templating and rendering (View) and transmission format (PTF), so that it stands in for a framework
together with its state management rather than for a DOM utility library alone.
