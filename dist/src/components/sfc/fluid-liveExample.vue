<script>
/**
 * A live example of Infusion code, e.g. as Infusion's documentation shows its examples: its source in an editor at the
 * right, linted by fluid-lint (see packages/fluid-lint). An example has one of two modes:
 *  - "live" - a complete, self-contained example, editable, and run whenever it lints without error, with a console
 *    below showing what it logs. If it is JavaScript defining a layer bearing a view which it does not itself
 *    instantiate, the last such layer is instantiated at the left, into the example's own container. If it is a Single
 *    File Component, the layer it defines is loaded from it, and instantiated at the left as its preview;
 *  - "syntax" - an example indicative of syntax alone, e.g. a fragment of a layer record, or one using variables it does
 *    not define, shown highlighted and linted, but neither editable nor run.
 *
 * JavaScript is run as the body of a function receiving `console`, the example's console, and `container`, an element
 * at the left - so that a view may be instantiated by the code itself, e.g. `my.greeting({container})`. The container is
 * a fresh element within the pane at the left, since a view renders the root of its template onto its container, which
 * must not share its node, and so its styling, with the pane. The components it creates are destroyed before it is run
 * again, the contents of their live layers - state which has been set on them, e.g. by the user's interaction - being
 * reapplied to those which it creates afresh from the same layers, so that an edit, e.g. to a style, does not lose it.
 *
 * Rendered statically, e.g. into a page built by wend, the example shows its code alone, as a block of code - the
 * editor, the console and any instance are added once the page is booted in the browser.
 */
fluid.def("fluid.liveExample", {
    $layers: "fluid.topLevelWidget",
    // {String} The example's code
    code: "",
    // {String} "js" for JavaScript, or "vue" for a Single File Component
    kind: "js",
    // {String} "live" for a complete example, edited and run, or "syntax" for one indicative of syntax alone, shown
    // but neither editable nor run
    mode: "live",
    controller: {
        $bindable: {
            bind: "fluid.liveExample.bind({self}, {self}.view.renderedContainer)",
            unbind: "fluid.liveExample.unbind({boundValue})"
        }
    }
});

// The module path of the bundle of fluid-lint and CodeMirror 6 which the editor uses - published with Infusion
fluid.liveExample.lintBundle = "%infusion-6/src/lib/fluid-lint/fluid-lint.js";

/**
 * Load the bundle of fluid-lint, once for the whole document
 * @param {Document} dokkument - The document
 * @return {Promise<Object>} Resolves to the global `fluidLint` once it is loaded
 */
fluid.liveExample.loadLint = function (dokkument) {
    if (!fluid.liveExample.lintPromise) {
        fluid.liveExample.lintPromise = window.fluidLint ? Promise.resolve(window.fluidLint) : new Promise((resolve, reject) => {
            const script = dokkument.createElement("script");
            script.src = fluid.module.resolvePath(fluid.liveExample.lintBundle);
            script.onload = () => resolve(window.fluidLint);
            script.onerror = () => reject(new Error("Couldn't load " + script.src));
            dokkument.head.appendChild(script);
        });
    }
    return fluid.liveExample.lintPromise;
};

/**
 * Determine whether a layer bears a view which can be instantiated - is itself a view component, or it or one of its
 * ancestors holds one as its `view`: a record naming the view's `$layers`, or a reference to another's view. A layer
 * contributing only options to an inherited view, e.g. a partial template, bears none of its own.
 * @param {String} layerName - The layer's name
 * @return {Boolean} `true` if it bears a view
 */
fluid.liveExample.bearsView = function (layerName) {
    const ancestors = fluid.ptf.layerAncestors(layerName);
    const holdsView = name => {
        const raw = fluid.def(name);
        const view = raw && raw.view;
        return typeof(view) === "string" || !!(view && view.$component && view.$component.$layers);
    };
    return ancestors.has("fluid.viewComponent") || holdsView(layerName) || [...ancestors].some(holdsView);
};

/**
 * Write a line to an example's console, as its code's `console` does
 * @param {Element} pane - The console's element
 * @param {String} level - "log", "info", "warn" or "error"
 * @param {Any[]} args - What was logged
 */
fluid.liveExample.writeLine = function (pane, level, args) {
    const line = pane.ownerDocument.createElement("div");
    line.className = "fl-live-example-line fl-live-example-" + level;
    line.textContent = args.map(arg => typeof(arg) === "string" ? arg : fluid.liveExample.render(arg)).join(" ");
    pane.appendChild(line);
    pane.scrollTop = pane.scrollHeight;
};

/**
 * Render a value logged to an example's console
 * @param {Any} value - The value
 * @return {String} Its rendering
 */
fluid.liveExample.render = function (value) {
    let togo;
    if (value instanceof Error) {
        togo = value.message;
    } else if (fluid.isUnavailable(value)) {
        togo = "Unavailable: " + fluid.renderUnavailable(fluid.deproxyUnavailable(value));
    } else {
        try {
            togo = JSON.stringify(value);
        } catch (e) {
            togo = String(value);
        }
    }
    return togo === undefined ? String(value) : togo;
};

/**
 * Make the console handed to an example's code - writing to its pane, and passing through to the browser's console
 * @param {Element} pane - The console's element
 * @return {Object} The console
 */
fluid.liveExample.makeConsole = function (pane) {
    return Object.fromEntries(["log", "info", "warn", "error"].map(level => [level, (...args) => {
        fluid.liveExample.writeLine(pane, level, args);
        console[level](...args);
    }]));
};

/**
 * Note a component which an example's code created, under the layers it was created from - a key under which the
 * contents of its live layers are kept between runs. The key is taken from the creation rather than read from the
 * component, which may not yet be available, e.g. whilst the SFC defining its layer is injected.
 * @param {Object} state - The state of the example, as made by `fluid.liveExample.bind`
 * @param {fluid.component} component - The component
 * @param {String|String[]} layers - The layers it was created from
 */
fluid.liveExample.noteCreated = function (state, component, layers) {
    state.created.push(component);
    state.createdKeys.set(component, JSON.stringify(fluid.makeArray(layers)));
};

/**
 * Capture the contents of the live layers of the components an example's code created, as the PTF parts which would
 * reapply them, keyed by the components' layers. A component which cannot be read, e.g. one not yet available, is
 * skipped.
 * @param {Object} state - The state of the example, as made by `fluid.liveExample.bind`
 * @return {Map<String, PTFPart[]>} The live parts of each, by the key noted by `fluid.liveExample.noteCreated`
 */
fluid.liveExample.captureLive = function (state) {
    const togo = new Map();
    state.created.forEach(component => {
        try {
            const liveParts = fluid.ptf.componentToParts(component).filter(part => part.kind === "live");
            if (liveParts.length > 0) {
                togo.set(state.createdKeys.get(component), liveParts);
            }
        } catch (e) {
            // A component which cannot be read has no state worth keeping
        }
    });
    return togo;
};

/**
 * Reapply the contents of live layers captured from the components of an example's previous run to those of its
 * current run made from the same layers. A value at a path which the redefined layers no longer hold is dropped.
 * @param {Object} state - The state of the example, as made by `fluid.liveExample.bind`
 * @param {Map<String, PTFPart[]>} captured - The live parts, as captured by `fluid.liveExample.captureLive`
 */
fluid.liveExample.restoreLive = function (state, captured) {
    state.created.forEach(component => {
        const liveParts = captured.get(state.createdKeys.get(component));
        if (liveParts) {
            fluid.ptf.applyParts(component, liveParts).catch(error => state.console.warn("Could not restore state: " + error.message));
        }
    });
};

/**
 * Delete the layers which an example's code introduced when last run - those not defined before it defined them - so
 * that a rerun starts from the same registry as the first run did, e.g. code which defines a layer only after showing
 * a component without it. A layer still borne by a component elsewhere on the page, e.g. one of another example, is
 * kept, so that redefining it identically leaves that component untouched.
 * @param {Object} state - The state of the example, as made by `fluid.liveExample.bind`
 */
fluid.liveExample.deleteIntroduced = function (state) {
    const root = fluid.globalInstantiator.rootComponent;
    [...state.introduced].forEach(layerName => {
        // An inert component, e.g. the layer's own avatar, which deleting the layer destroys, bears it for no one
        const bearers = fluid.queryILSelector(root, layerName).filter(component => !fluid.isUnavailable(component) &&
            !component[fluid.metadataSymbol].inert);
        if (bearers.length === 0) {
            fluid.deleteLayer(layerName);
            state.introduced.delete(layerName);
        }
    });
};

/**
 * Destroy what an example's code created when last run, delete the layers it introduced, and clear its panes, making
 * a fresh container within the pane at the left
 * @param {Object} state - The state of the example, as made by `fluid.liveExample.bind`
 * @return {Map<String, PTFPart[]>} The contents of the live layers of what was destroyed, as captured by
 * `fluid.liveExample.captureLive`
 */
fluid.liveExample.reset = function (state) {
    const captured = fluid.liveExample.captureLive(state);
    state.created.forEach(component => component.destroy());
    state.created = [];
    state.createdKeys = new Map();
    // Destruction takes effect as the graph stabilises, after which the destroyed bear no layers
    fluid.cell.stabilize();
    fluid.liveExample.deleteIntroduced(state);
    state.instancePane.innerHTML = "";
    state.container = state.instancePane.ownerDocument.createElement("div");
    state.container.className = "fl-live-example-container";
    state.instancePane.appendChild(state.container);
    state.consoleLines.innerHTML = "";
    return captured;
};

/**
 * Run an example's code, having destroyed what it created when last run
 * @param {Object} state - The state of the example, as made by `fluid.liveExample.bind`
 * @param {String} code - The code
 */
fluid.liveExample.run = function (state, code) {
    const captured = fluid.liveExample.reset(state);
    const defined = [];
    const originalDef = fluid.def, originalInit = fluid.initFreeComponent;
    // Whatever the code defines and creates is noted, so that a view it defines is instantiated, and what it creates
    // is destroyed when it is next run
    fluid.def = function (layerName, layer) {
        if (layer !== undefined) {
            defined.push(layerName);
            if (!fluid.isLayerDefined(layerName)) {
                state.introduced.add(layerName);
            }
        }
        return originalDef.apply(this, arguments);
    };
    fluid.initFreeComponent = function (layers) {
        const component = originalInit.apply(this, arguments);
        fluid.liveExample.noteCreated(state, component, layers);
        return component;
    };
    try {
        // eslint-disable-next-line no-new-func
        new Function("console", "container", code)(state.console, state.container);
    } catch (e) {
        state.console.error(e);
    } finally {
        fluid.def = originalDef;
        fluid.initFreeComponent = originalInit;
    }
    const views = defined.filter(fluid.liveExample.bearsView);
    const rendered = () => state.container.childNodes.length > 0 || state.instancePane.childNodes.length > 1;
    if (!rendered() && views.length > 0 && state.created.length === 0) {
        try {
            const layerName = views[views.length - 1];
            fluid.liveExample.noteCreated(state, originalInit(layerName, {container: state.container}), layerName);
        } catch (e) {
            state.console.error(e);
        }
    }
    fluid.liveExample.restoreLive(state, captured);
    state.root.classList.toggle("fl-live-example-has-instance", rendered() || views.length > 0);
};

/**
 * Run an example which is a Single File Component - loading the layer its <script> defines from its text, and
 * instantiating the layer at the left, as its preview
 * @param {Object} state - The state of the example, as made by `fluid.liveExample.bind`
 * @param {String} text - The SFC's text
 */
fluid.liveExample.runSfc = function (state, text) {
    const captured = fluid.liveExample.reset(state);
    const match = /fluid\.def\(\s*["'`]([\w$.]+)["'`]/.exec(text);
    if (match) {
        const layerName = match[1];
        try {
            fluid.loadSFCText(layerName, text);
            fluid.liveExample.noteCreated(state, fluid.initFreeComponent(layerName, {container: state.container}), layerName);
            fluid.liveExample.restoreLive(state, captured);
        } catch (e) {
            state.console.error(e);
        }
        state.root.classList.add("fl-live-example-has-instance");
    } else {
        state.console.error("A Single File Component defines its layer in its <script>, e.g. fluid.def(\"my.widget\", {...})");
    }
};

/**
 * Bind an example to its rendered markup - replacing its static code with an editor, and running it
 * @param {fluid.liveExample} self - The example
 * @param {Element} root - The example's rendered container
 * @return {Object} The state of the example, to be unbound
 */
fluid.liveExample.bind = function (self, root) {
    const state = {root, created: [], createdKeys: new Map(), introduced: new Set(), destroyed: false, view: null};
    // Rendered statically, e.g. into a page built by wend, the example is its code alone
    if (!fluid.isOutputDocument(root.ownerDocument)) {
        const code = self.code, kind = self.kind;
        state.instancePane = root.querySelector(".fl-live-example-instance");
        state.consoleLines = root.querySelector(".fl-live-example-console-lines");
        state.console = fluid.liveExample.makeConsole(state.consoleLines);
        const sourcePane = root.querySelector(".fl-live-example-source");
        fluid.liveExample.loadLint(root.ownerDocument).then(fluidLint => {
            if (!state.destroyed) {
                // A fragment of a layer record, e.g. `view: {...}`, can only be shown, whatever its mode
                const live = self.mode !== "syntax" && !(kind === "js" && fluidLint.isFragment(code));
                root.classList.toggle("fl-live-example-syntax", !live);
                sourcePane.innerHTML = "";
                const runOnce = text => kind === "vue" ? fluid.liveExample.runSfc(state, text) : fluid.liveExample.run(state, text);
                let last = null;
                state.view = fluidLint.fluidEditor({
                    parent: sourcePane, doc: code, kind, readOnly: !live,
                    onDiagnostics: (diagnostics, text) => {
                        const clean = !diagnostics.some(diagnostic => diagnostic.severity === "error");
                        if (live && clean && text !== last) {
                            last = text;
                            runOnce(text);
                        }
                    }
                });
                if (live) {
                    root.classList.add("fl-live-example-live");
                    last = code;
                    runOnce(code);
                }
            }
        }, error => fluid.liveExample.writeLine(state.consoleLines, "error", [error]));
    }
    return state;
};

/**
 * Unbind an example, destroying its editor and what its code created
 * @param {Object} state - The state made by `fluid.liveExample.bind`
 */
fluid.liveExample.unbind = function (state) {
    state.destroyed = true;
    (state.created || []).forEach(component => component.destroy());
    if (state.view) {
        state.view.destroy();
    }
};
</script>

<template>
    <div class="fl-live-example">
        <div class="fl-live-example-instance"></div>
        <div class="fl-live-example-source"><pre><code>@{code}</code></pre></div>
        <div class="fl-live-example-console"><div class="fl-live-example-console-title">Console</div><div class="fl-live-example-console-lines"></div></div>
    </div>
</template>

<style>
.fl-live-example {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "source" "console";
    border: 1px solid #ccc;
    border-radius: 4px;
    margin: 1em 0;
    overflow: hidden;
}

.fl-live-example.fl-live-example-has-instance {
    grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
    grid-template-areas: "instance source" "console console";
}

.fl-live-example-instance {
    grid-area: instance;
    display: none;
    padding: 0.75em;
    border-right: 1px solid #ccc;
    overflow: auto;
}

.fl-live-example-has-instance .fl-live-example-instance {
    display: block;
}

.fl-live-example-source {
    grid-area: source;
    min-width: 0;
}

/* The code as rendered statically, before the editor replaces it, takes the editor's size, so that the page does not
   shift as it is booted */
/* The editor's font, which is also that of the code rendered statically */
.fl-live-example-source pre,
.fl-live-example-source .cm-editor .cm-scroller {
    font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
}

.fl-live-example-source pre {
    margin: 0;
    border: none;
    max-height: 32em;
    overflow: auto;
    font-size: 13px;
    line-height: 1.4;
}

.fl-live-example-source .cm-editor {
    max-height: 32em;
    font-size: 13px;
}

/* The console is shown only once the example is live - not statically, nor for an example of syntax alone */
.fl-live-example-console {
    grid-area: console;
    display: none;
    border-top: 1px solid #ccc;
    background: #f7f7f7;
    font-size: 12px;
}

.fl-live-example-live .fl-live-example-console {
    display: block;
}

.fl-live-example-console-title {
    padding: 0.15em 0.75em;
    color: #777;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid #e4e4e4;
}

.fl-live-example-console-lines {
    max-height: 10em;
    min-height: 1.6em;
    overflow: auto;
    padding: 0.2em 0.75em;
    font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
}

.fl-live-example-console-lines:empty::before {
    content: "No output";
    color: #aaa;
    font-style: italic;
}

/* An example of syntax alone is shown, not edited */
.fl-live-example-syntax .fl-live-example-source .cm-editor {
    background: #fafafa;
}

.fl-live-example-syntax .cm-activeLine,
.fl-live-example-syntax .cm-activeLineGutter {
    background: transparent;
}

.fl-live-example-warn {
    color: #8a6d00;
}

.fl-live-example-error {
    color: #b00020;
}

@media (max-width: 640px) {
    .fl-live-example.fl-live-example-has-instance {
        grid-template-columns: minmax(0, 1fr);
        grid-template-areas: "instance" "source" "console";
    }

    .fl-live-example-instance {
        border-right: none;
        border-bottom: 1px solid #ccc;
    }
}
</style>
