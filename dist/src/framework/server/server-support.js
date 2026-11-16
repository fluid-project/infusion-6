/* eslint-env node */
"use strict";

const fs = require("fs"),
    path = require("path");

const linkedom = require("linkedom"),
    vm = require("vm"),
    he = require("he"),
    {fileURLToPath, pathToFileURL} = require("url");

const fluid = global.fluid;

fluid.readTextFile = function (path) {
    const resolved = path;
    const stats = fs.statSync(resolved);
    console.log("Read " + stats.size + " bytes from " + resolved);
    const text = fs.readFileSync(resolved, "utf8");
    return text;
};

/**
 * Creates a memoized (cached) version of a single-argument function.
 *
 * @param {Function} fn - The function to cache.
 * @return {Function} The wrapped function with caching enabled.
 */
fluid.cached = function (fn) {
    const cache = Object.create(null);
    return function (key) {
        if (cache[key] !== undefined) {
            return cache[key];
        }
        return cache[key] = fn(key);
    };
};

fluid.decodeHtmlEntity = fluid.cached(he.decode);

fluid.serverDocument = linkedom.parseHTML("<html />").document;

fluid.serverDocumentParser = function (text) {
    return linkedom.parseHTML(text).document;
};

/**
 * Parse markup into a fresh output document - see `fluid.createOutputDocument` in FluidView-node.js. linkedom
 * executes no script in any document
 * @param {String} markup - The markup of the document
 * @return {Document} The parsed document
 */
fluid.parseOutputDocument = fluid.serverDocumentParser;

/**
 * Resolve the location of an output document to an absolute URL - see `fluid.createOutputDocument` in
 * FluidView-node.js. A location which is not a URL is a file path, resolved against the current directory.
 * @param {String} location - The location
 * @return {URL} The location as an absolute URL
 */
fluid.resolveOutputLocation = function (location) {
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(location) ? new URL(location) : pathToFileURL(path.resolve(location));
};

/**
 * Determine whether the server should evaluate a script element found in a booted document. Infusion's own scripts,
 * which the server already has its own incarnation of, client payload marked with `fluid-client`, inert records of
 * injections and scripts of any type other than JavaScript are not evaluated - see `fluid.classifyScriptNode`.
 * @param {Element} node - The script element
 * @return {Boolean} `true` if the script should be evaluated
 */
fluid.isServerEvaluableScript = function (node) {
    const type = node.getAttribute("type");
    const isJavaScript = !type || /^(text|application)\/(javascript|ecmascript)$/i.test(type);
    return isJavaScript && node.getAttribute("fluid-hydrated") !== "%infusion-6" && !fluid.isBootScript(node) &&
        fluid.classifyScriptNode(node) !== "client" && fluid.classifyScriptNode(node) !== "injection";
};

// The record of Infusion's files which FluidBoot.js loads in the browser
fluid.bootRecord = require("../core/js/FluidBoot.js");

/**
 * Determine whether a script element is the bootstrap of Infusion, FluidBoot.js - see that file
 * @param {Element} node - The script element
 * @return {Boolean} `true` if the element loads FluidBoot.js
 */
fluid.isBootScript = function (node) {
    const src = node.getAttribute("src");
    return !!src && src.replace(/[?#].*$/, "").endsWith(fluid.bootRecord.bootPath);
};

/**
 * Do under node what the bootstrap of Infusion, FluidBoot.js, does in the browser - declare Infusion's module, by a
 * `<fluid-module>` element placed before the bootstrap's script, at the directory holding it. Infusion itself is
 * already loaded under node.
 * @param {Document} dokkument - The document, before it is booted
 * @return {String|null} The `src` of Infusion's module as the document refers to it, or `null` if it has no bootstrap
 */
fluid.expandBootScript = function (dokkument) {
    const script = [...dokkument.querySelectorAll("script[src]")].find(fluid.isBootScript);
    let togo = null;
    if (script) {
        const src = script.getAttribute("src").replace(/[?#].*$/, "");
        togo = src.substring(0, src.length - fluid.bootRecord.bootPath.length);
        if (!dokkument.querySelector(`fluid-module[id="${fluid.bootRecord.moduleName}"]`)) {
            const moduleNode = dokkument.createElement("fluid-module");
            moduleNode.setAttribute("id", fluid.bootRecord.moduleName);
            moduleNode.setAttribute("src", togo);
            script.parentNode.insertBefore(moduleNode, script);
        }
    }
    return togo;
};

/**
 * The paths of Infusion's files, relative to its root, which a page refers to when its bootstrap is written in one of
 * the forms of `fluid.writeBootScript`
 * @param {String} form - "boot", "source" or "built"
 * @return {String[]} The paths
 */
fluid.bootFiles = function (form) {
    const record = fluid.bootRecord;
    return form === "built" ? [record.builtFile] : form === "source" ? record.files : [record.bootPath, ...record.files];
};

/**
 * Write the bootstrap of Infusion into a document about to be written out, in one of three forms - "boot", leaving
 * the document's FluidBoot.js to load Infusion's files, "source", replacing it with a script for each of the files, as
 * FluidBoot.js writes them, or "built", replacing it with the bundle of them built into Infusion's dist
 * @param {Document} dokkument - The document
 * @param {String} [form] - The form of the bootstrap, "boot" by default
 */
fluid.writeBootScript = function (dokkument, form = "boot") {
    const script = [...dokkument.querySelectorAll("script[src]")].find(fluid.isBootScript);
    if (script && form !== "boot") {
        const src = script.getAttribute("src").replace(/[?#].*$/, "");
        const root = src.substring(0, src.length - fluid.bootRecord.bootPath.length);
        fluid.bootFiles(form).forEach((file, i) => {
            const node = dokkument.createElement("script");
            node.setAttribute("src", root + file);
            node.setAttribute("fluid-hydrated", "%" + fluid.bootRecord.moduleName);
            // The first records the bootstrap it replaces, so that dehydrate.js can restore it
            node.setAttribute(fluid.hydratedAttribute, i === 0 ? "boot:" + script.getAttribute("src") : "");
            script.parentNode.insertBefore(node, script);
        });
        script.remove();
    }
};

// The attribute marking what hydration has added to a document, so that dehydrate.js can reverse it. An element added
// beside the document's own, e.g. an injection of a Single File Component, bears it with an empty value. An element on
// which a component booted bears the JSON of a `HydratedHostRecord`, recording its own attributes and content before
// it was rendered into. The first script into which Infusion's bootstrap was expanded bears "boot:" followed by the
// bootstrap's `src`, and the others an empty value - see `fluid.writeBootScript`. Since the browser classes any
// script bearing `fluid-hydrated` as part of Infusion, a distinct attribute is used
fluid.hydratedAttribute = "data-fluid-hydrated";

/**
 * @typedef {Object} HydratedHostRecord
 * @property {Object<String, String>} attrs - The element's attributes before it was rendered into
 * @property {String} html - The element's content before it was rendered into
 */

/**
 * Record the elements of a document as parsed, before it is booted, so that what hydration adds to it can then be
 * marked by `fluid.markHydration`
 * @param {Document} dokkument - The document, as parsed
 */
fluid.recordSourceDocument = function (dokkument) {
    const hosts = new Map();
    dokkument.querySelectorAll("[fluid-layers]").forEach(node => {
        hosts.set(node, {
            attrs: Object.fromEntries([...node.attributes].map(attr => [attr.name, attr.value])),
            html: node.innerHTML
        });
    });
    dokkument.fluidSourceRecord = {
        elements: new Set(dokkument.querySelectorAll("*")),
        hosts
    };
};

// The attribute recording, on an element added by hydration, the newline and indentation written beside it so that
// it begins a line of its own and the page remains legible - its value is the number of spaces, written before the
// element, or else, prefixed by "after:", after it where the element already begins a line. dehydrate.js removes them
fluid.hydratedIndentAttribute = "data-fluid-indent";

/**
 * Find the indentation of the line on which an element of a document's head or body begins, from the whitespace
 * before it or its nearest preceding sibling which is preceded by a newline.
 * @param {Element} node - The element
 * @param {Number} fallback - The indentation assumed if none is found
 * @return {Number} The number of spaces
 */
fluid.indentationOf = function (node, fallback) {
    let indent = null;
    for (let sibling = node.previousSibling; sibling && indent === null; sibling = sibling.previousSibling) {
        const match = sibling.nodeType === 3 ? /\n( *)$/.exec(sibling.nodeValue) : null;
        if (match) {
            indent = match[1].length;
        }
    }
    return indent === null ? fallback : indent;
};

/**
 * Place an element added by hydration on a line of its own, at the indentation of the line before it, recording what
 * was written by `fluid.hydratedIndentAttribute`. If it already begins a line, the newline is written after it.
 * @param {Element} node - The element
 * @param {Number} fallback - The indentation assumed if none is found before it
 */
fluid.indentHydrated = function (node, fallback) {
    const indent = fluid.indentationOf(node, fallback);
    const written = node.ownerDocument.createTextNode("\n" + " ".repeat(indent));
    const before = node.previousSibling;
    if (before && before.nodeType === 3 && /\n *$/.test(before.nodeValue)) {
        node.parentNode.insertBefore(written, node.nextSibling);
        node.setAttribute(fluid.hydratedIndentAttribute, "after:" + indent);
    } else {
        node.parentNode.insertBefore(written, node);
        node.setAttribute(fluid.hydratedIndentAttribute, String(indent));
    }
};

/**
 * Remove the newline and indentation written beside an element by `fluid.indentHydrated`.
 * @param {Element} node - The element, bearing `fluid.hydratedIndentAttribute`
 */
fluid.unindentHydrated = function (node) {
    const value = node.getAttribute(fluid.hydratedIndentAttribute);
    const after = value.startsWith("after:");
    const written = "\n" + " ".repeat(+value.replace("after:", ""));
    const text = after ? node.nextSibling : node.previousSibling;
    if (text && text.nodeType === 3) {
        const content = text.nodeValue;
        const remaining = after ? (content.startsWith(written) ? content.substring(written.length) : content) :
            (content.endsWith(written) ? content.substring(0, content.length - written.length) : content);
        if (remaining === "") {
            text.remove();
        } else {
            text.nodeValue = remaining;
        }
    }
};

/**
 * Mark what hydration has added to a document recorded by `fluid.recordSourceDocument`, just before it is written, by
 * the attribute `fluid.hydratedAttribute`, so that dehydrate.js can reverse it. Each element added to the head or body
 * is begun on a line of its own, as are the symbols within the host of an SFC's symbols.
 * @param {Document} dokkument - The booted document
 */
fluid.markHydration = function (dokkument) {
    const record = dokkument.fluidSourceRecord;
    if (record) {
        const withinHost = node => {
            let host = null;
            for (let parent = node.parentElement; parent && !host; parent = parent.parentElement) {
                if (record.hosts.has(parent)) {
                    host = parent;
                }
            }
            return !!host;
        };
        dokkument.querySelectorAll("*").forEach(node => {
            if (!record.elements.has(node) && record.elements.has(node.parentElement) && !withinHost(node) &&
                !node.hasAttribute(fluid.hydratedAttribute)) {
                node.setAttribute(fluid.hydratedAttribute, "");
            }
        });
        record.hosts.forEach((hostRecord, node) => {
            if (node.isConnected !== false) {
                node.setAttribute(fluid.hydratedAttribute, JSON.stringify(hostRecord));
            }
        });
        [...dokkument.querySelectorAll(`[${fluid.hydratedAttribute}]`)].filter(node => !record.hosts.has(node) &&
            (node.parentNode === dokkument.head || node.parentNode === dokkument.body)).forEach(node => {
            fluid.indentHydrated(node, node.parentNode === dokkument.head ? 8 : 4);
        });
        const symbolsHost = dokkument.getElementById(fluid.symbolsHostId);
        if (symbolsHost && !record.elements.has(symbolsHost)) {
            const indent = fluid.indentationOf(symbolsHost, 4) + 4;
            [...symbolsHost.children].forEach(child => {
                symbolsHost.insertBefore(dokkument.createTextNode("\n" + " ".repeat(indent)), child);
            });
            symbolsHost.appendChild(dokkument.createTextNode("\n" + " ".repeat(indent - 4)));
        }
    }
};

/**
 * Reverse the hydration of a document, as marked by `fluid.markHydration` - every element it added is removed, every
 * element on which a component booted is restored to its attributes and content as written, and any expansion of
 * Infusion's bootstrap is collapsed back into its script
 * @param {Document} dokkument - The hydrated document
 * @return {Number} The number of marked elements found
 */
fluid.dehydrateDocument = function (dokkument) {
    const marked = [...dokkument.querySelectorAll(`[${fluid.hydratedAttribute}]`)];
    const hosts = marked.filter(node => node.getAttribute(fluid.hydratedAttribute).startsWith("{"));
    hosts.forEach(node => {
        const hostRecord = JSON.parse(node.getAttribute(fluid.hydratedAttribute));
        [...node.attributes].map(attr => attr.name).forEach(name => node.removeAttribute(name));
        Object.entries(hostRecord.attrs).forEach(([name, value]) => node.setAttribute(name, value));
        node.innerHTML = hostRecord.html;
    });
    let bootRestored = false;
    marked.filter(node => !hosts.includes(node) && node.isConnected !== false).forEach(node => {
        const value = node.getAttribute(fluid.hydratedAttribute);
        if (node.hasAttribute(fluid.hydratedIndentAttribute)) {
            fluid.unindentHydrated(node);
        }
        if (value.startsWith("boot:") && !bootRestored) {
            const script = dokkument.createElement("script");
            script.setAttribute("src", value.substring("boot:".length));
            node.parentNode.insertBefore(script, node);
            bootRestored = true;
        }
        node.remove();
    });
    return marked.length;
};

/**
 * Evaluate on the server, in document order, the scripts which a document holds as its own - e.g. one defining the
 * layer configuring a visualisation, which the element on which it boots names - as the browser would evaluate them
 * before booting it. Infusion's own scripts, scripts for the browser alone, records of injections and scripts of any
 * type other than JavaScript are not evaluated - see `fluid.isServerEvaluableScript`. A script with a `src` is read
 * from its file relative to the document, and one held elsewhere, e.g. on a CDN, is not evaluated. A script which fails,
 * e.g. one written for the browser alone, is reported, and those after it are still evaluated, as in the browser.
 * @param {Document} dokkument - The document, before it is booted
 */
fluid.evaluatePageScripts = function (dokkument) {
    [...dokkument.querySelectorAll("script")].filter(node => fluid.classifyScriptNode(node) === "page" &&
        fluid.isServerEvaluableScript(node)).forEach(node => {
        const src = node.getAttribute("src");
        const where = src || "inline script of " + fileURLToPath(dokkument.location);
        try {
            if (src) {
                const url = new URL(src, dokkument.location);
                if (url.protocol === "file:") {
                    const filename = fileURLToPath(url);
                    vm.runInContext(fs.readFileSync(filename, "utf8"), fluid.V8Context, {filename});
                } else {
                    fluid.log("Not evaluating remote script on server: ", src);
                }
            } else {
                vm.runInContext(node.textContent, fluid.V8Context, {filename: fileURLToPath(dokkument.location)});
            }
        } catch (error) {
            // As in the browser, a script which fails does not prevent those after it from running - a page's own
            // scripts may be written for the browser alone, e.g. a theme's script reading localStorage
            fluid.log(`Script ${where} failed on the server, as it may if written for the browser alone - ` +
                `continuing: ${error.message}`);
        }
    });
};

// Currently don't actually support script nodes contextualised by a document
fluid.loadScriptNodeInDocument = function (node /*, dokkument */) {
    const src = node.getAttribute("src");
    const evaluable = fluid.isServerEvaluableScript(node);
    if (evaluable && src) {
        fluid.loadInContext(src); // TODO: Convert file URLs, setc.
    } else if (evaluable) {
        const text = node.textContent;
        const match = text.match(/\/\/#\s*sourceURL=(.+)$/m);
        const sourceURL = match?.[1];
        vm.runInContext(text, fluid.V8Context, sourceURL);
    } else {
        fluid.log("Not evaluating script on server: ", src || node.id);
    }
};

// TODO: This should be moved into the client side and listen to script node onload.
fluid.scriptLoadingIdle = fluid.cell(true, {name: "Script loading idle"});

/**
 * Server version of `fluid.applyScriptInjection` from FluidView.js. linkedom does not evaluate script elements on
 * connection, so after writing the same script node into the document as the browser would, its source is evaluated
 * directly and synchronously in the Fluid V8 context - using a MutationObserver would risk an async operation that is
 * hard to track in order to determine when the document can first be written.
 * @param {DocInjectionRecord} docInjRec - The injection payload, whose `material` holds members `text` and `sourceUrl`.
 * @param {Element|null} existing - Any existing node with the injection's id.
 * @return {Boolean|Unavailable} `true` if evaluation completed, otherwise an unavailable value describing the failure.
 */
fluid.applyServerScriptInjection = function ({dokkument, injRec, material}, existing) {
    let togo;
    if (injRec.client) {
        togo = fluid.applyServerClientScriptInjection(dokkument, injRec, material, existing);
    } else {
        togo = fluid.applyServerEvaluatedScriptInjection(dokkument, injRec, material, existing);
    }
    return togo;
};

/**
 * Record in a document a script of a Single File Component which is payload for the browser alone, bearing
 * `fluid-client`, e.g. a widget library. The script is written into the document as a link to its source, as the
 * browser would load it, but is not evaluated.
 * @param {Document} dokkument - The document into which the script is injected
 * @param {InjectRecord} injRec - The injection record
 * @param {Object} material - The injection's material, whose `sourceUrl` is the script's URL
 * @param {Element|null} existing - Any existing node with the injection's id
 * @return {Boolean} `true`, since recording the script cannot fail
 */
fluid.applyServerClientScriptInjection = function (dokkument, injRec, material, existing) {
    const fresh = dokkument.createElement("script");
    const src = fluid.relativeUrl(dokkument.location, material.sourceUrl);
    fresh.setAttribute("src", src);
    fresh.setAttribute("fluid-src", src);
    fresh.setAttribute("fluid-client", "");
    fresh.id = injRec.nodeId;
    fluid.swapInjectedNode(dokkument, existing, fresh);
    return true;
};

/**
 * Inject and evaluate a script of a Single File Component on the server - see `fluid.applyServerScriptInjection`
 * @param {Document} dokkument - The document into which the script is injected
 * @param {InjectRecord} injRec - The injection record
 * @param {Object} material - The injection's material, with members `text` and `sourceUrl`
 * @param {Element|null} existing - Any existing node with the injection's id
 * @return {Boolean|Unavailable} `true` if evaluation completed, otherwise an unavailable value describing the failure.
 */
fluid.applyServerEvaluatedScriptInjection = function (dokkument, injRec, material, existing) {
    let togo;
    // The document records the script's source relative to itself, so that it may be written as a file and served anywhere
    const relativeSource = fluid.relativeUrl(dokkument.location, material.sourceUrl);
    const fresh = dokkument.createElement("script");
    fresh.text = fluid.wrapScriptSource(material.text, relativeSource, injRec.scope);
    fresh.id = injRec.nodeId;
    if (injRec.url) {
        fresh.setAttribute("fluid-src", relativeSource);
    }
    const wrapped = fluid.wrapScriptSource(material.text, material.sourceUrl, injRec.scope);
    fluid.swapInjectedNode(dokkument, existing, fresh);
    try {
        // Evaluation is synchronous, and any failure is thrown
        vm.runInContext(wrapped, fluid.V8Context, {filename: material.sourceUrl});
        togo = true;
    } catch (error) {
        console.error(error);
        togo = fluid.unavailable({
            message: `Failure evaluating script at ${material.sourceUrl}`,
            cause: error
        });
    }
    return togo;
};

/**
 * Server version of the `prepare` method of `fluid.scriptInjectionStyles.link` from FluidView.js. A browser's fetch
 * resolves a relative URL against the document, whereas node's has nothing to resolve it against, so the script is
 * fetched from its absolute URL. Its source URL is left relative to the document, as in the browser.
 * @param {InjectionRecord} injRec - The injection record, whose `url` is relative to its module
 * @param {Document} dokkument - The document into which the script is injected
 * @return {Promise<Object>} A promise for the injection's material, with members `text` and `sourceUrl`
 */
fluid.prepareServerScriptLink = function (injRec, dokkument) {
    const resolved = fluid.module.resolveRelativePath(dokkument.location, injRec.url);
    // A script for the browser alone is not evaluated, so needs no text - see fluid.applyServerClientScriptInjection
    return injRec.client ? Promise.resolve({text: null, sourceUrl: resolved}) :
        fluid.fetchInjectionText(new URL(resolved, dokkument.location).href).then(text => ({text, sourceUrl: resolved}));
};

fluid.scriptInjectionStyles.literal.apply = fluid.applyServerScriptInjection;
fluid.scriptInjectionStyles.link.prepare = fluid.prepareServerScriptLink;
fluid.scriptInjectionStyles.link.apply = fluid.applyServerScriptInjection;

/**
 * Server version of the `apply` method of `fluid.cssInjectionStyles.link` from FluidView.js. The same link node is
 * written into the document as in the browser, but since linkedom neither fetches stylesheets nor fires "load" or
 * "error" on link elements, the stylesheet is considered loaded if its file exists. Remote stylesheets are assumed to
 * load.
 * @param {DocInjectionRecord} docInjRec - The injection payload
 * @param {Element|null} existing - Any existing node with the injection's id
 * @return {Boolean|Unavailable} `true` if the stylesheet exists, otherwise an unavailable value describing the failure
 */
fluid.applyServerLinkInjection = function ({dokkument, injRec}, existing) {
    const resolved = fluid.module.resolveRelativePath(dokkument.location, injRec.url);
    // Written relative to the document, so that it may be written as a file and served anywhere
    const href = fluid.relativeUrl(dokkument.location, resolved);
    if (existing?.localName === "link") {
        existing.setAttribute("href", href);
    } else {
        const fresh = dokkument.createElement("link");
        fresh.rel = "stylesheet";
        fresh.setAttribute("href", href);
        fresh.id = injRec.nodeId;
        fluid.swapInjectedNode(dokkument, existing, fresh);
    }
    // The file is sought where it is read from under node, which may be the source of its module - see fluid.moduleSourceUrl
    const url = new URL(fluid.moduleSourceUrl(new URL(resolved, dokkument.location).href));
    const exists = url.protocol === "file:" ? fs.existsSync(fileURLToPath(url)) : true;
    return exists ? true : fluid.unavailable({message: `Failure loading stylesheet at ${resolved}`});
};

fluid.cssInjectionStyles.link.apply = fluid.applyServerLinkInjection;

/**
 * Write text to a file, creating its directory if necessary
 * @param {String} filename - The path of the file
 * @param {String} data - The text to be written
 */
fluid.writeFile = function (filename, data) {
    fs.mkdirSync(path.dirname(filename), {recursive: true});
    fs.writeFileSync(filename, data, "utf8");
    const stats = fs.statSync(filename);
    console.log("Written " + stats.size + " bytes to " + filename);
};

/**
 * Serialise a document as the text of an HTML file
 * @param {Document} dokkument - The document
 * @return {String} Its markup, preceded by a doctype
 */
fluid.serializeDocument = function (dokkument) {
    return "<!DOCTYPE html>" + dokkument.documentElement.outerHTML;
};

/**
 * Write a document to a file, unless the file already holds exactly its markup - so that a rebuild writes only those
 * documents whose markup has changed
 * @param {String} filename - The path of the file
 * @param {Document} dokkument - The document
 * @return {Boolean} `true` if the file was written, `false` if it was already up to date
 */
fluid.writeDocument = function (filename, dokkument) {
    const outMarkup = fluid.serializeDocument(dokkument);
    const existing = fs.existsSync(filename) ? fs.readFileSync(filename, "utf8") : null;
    const changed = existing !== outMarkup;
    if (changed) {
        fluid.writeFile(filename, outMarkup);
    }
    return changed;
};

/**
 * Construct a signal for whether any component which may render into a document is unavailable. A component whose
 * document cannot be determined, e.g. one with no view, may affect any document.
 * @param {Document} dokkument - The document
 * @return {Cell<Boolean>} A signal which holds `true` if no such component is unavailable, and is otherwise unavailable
 */
fluid.documentComponentsAvailable = function (dokkument) {
    return fluid.cell(undefined, {name: `Components available for ${fluid.documentLocation(dokkument)}`}).computed(() => {
        const paths = Object.keys(fluid.unavailableComponentPaths).filter(componentPath => {
            const shadow = fluid.globalInstantiator.pathToComponent[componentPath];
            const found = shadow ? fluid.findDocument(shadow) : undefined;
            return found === undefined || found === dokkument;
        });
        return paths.length === 0 ? true : fluid.unavailable({message: "Some components are unavailable", paths}, "pending");
    }, [fluid.unavailableComponentsVersion]);
};

/**
 * Construct a signal which is available once a booted or rendered document is ready to be written - when all of its
 * injections are complete, no script is loading and no component which may render into it is unavailable.
 * @param {Document} dokkument - The document
 * @return {Cell<Boolean>} A signal which holds `true` once the document is ready, and is otherwise unavailable
 */
fluid.documentReady = function (dokkument) {
    const injections = fluid.documentInjections.get(dokkument);
    const sources = [...(injections ? [injections.injectionsComplete] : []), fluid.scriptLoadingIdle, fluid.documentComponentsAvailable(dokkument)];
    return fluid.cell(undefined, {name: "Document ready for writing"}).computed(() => true, sources);
};

/**
 * @typedef {Object} DocumentWriteRecord
 * @property {Document} dokkument - A document to be written
 * @property {String} filename - The file to which it is to be written
 */

/**
 * @typedef {Object} DocumentWriteOutcome
 * @property {DocumentWriteRecord[]} written - The records of the documents which were written
 * @property {DocumentWriteRecord[]} unchanged - The records of the documents whose files were already up to date
 * @property {DocumentWriteRecord[]} unready - The records of the documents which were not ready, each with a member
 * `readiness` holding the reason
 */

/**
 * Write several documents once the reactive graph has settled, so that all the injections and rendering they trigger
 * are complete. Each document which is then ready is written unless its file is already up to date - see
 * `fluid.writeDocument` - and a document which is not ready is not written, without affecting the others.
 * @param {DocumentWriteRecord[]} records - The documents to be written, and their files
 * @param {Function} [prepare] - A function receiving each record whose document is ready, just before the document is
 * serialised, e.g. to strip material not wanted in a static build. Since the document is then a rendered one, any
 * change made to it is overwritten should what rendered it change.
 * @return {Promise<DocumentWriteOutcome>} A promise for the outcome of writing each document
 */
fluid.writeDocumentsWhenSettled = async function (records, prepare) {
    const readies = records.map(record => fluid.documentReady(record.dokkument));
    // A free effect watching readiness is pending whilst any document is, and so holds the fit open until then
    const readyWatcher = fluid.cell.effect((...readiness) => readiness.find(fluid.isUnavailable) ?? true, readies,
        {isFree: true, name: "Watch documents ready for writing"});
    readyWatcher.get();
    await fluid.cell.settle();
    readyWatcher.dispose();
    const outcome = {written: [], unchanged: [], unready: []};
    records.forEach((record, i) => {
        const readiness = readies[i].get();
        if (fluid.isUnavailable(readiness)) {
            outcome.unready.push({...record, readiness});
        } else {
            if (prepare) {
                prepare(record);
            }
            const written = fluid.writeDocument(record.filename, record.dokkument);
            (written ? outcome.written : outcome.unchanged).push(record);
        }
    });
    return outcome;
};

/**
 * Wait until the reactive graph has settled with a booted document, so that all the injections and rendering it
 * triggers are complete, without writing it - see `fluid.writeDocumentsWhenSettled`
 * @param {Document} dokkument - The document which has been booted
 * @return {Promise<Boolean|Unavailable>} A promise for `true` if the document is then ready, or else for the
 * unavailable value describing why not
 */
fluid.documentWhenSettled = async function (dokkument) {
    const ready = fluid.documentReady(dokkument);
    const readyWatcher = fluid.cell.effect(readiness => readiness, [ready], {isFree: true, name: "Watch document ready"});
    readyWatcher.get();
    await fluid.cell.settle();
    readyWatcher.dispose();
    return ready.get();
};

/**
 * Write a booted document once the reactive graph has settled, so that all the injections and rendering it triggers
 * are complete. A free effect watching the document's readiness is pending whilst it is, e.g. whilst any injection is
 * in progress, and so holds its fit open until then. Once settled, nothing further can happen without some external
 * event, so a document which is not then ready never will be.
 * @param {Document} dokkument - The document which has been booted
 * @param {String} outFilename - The file to write the hydrated document to
 * @param {Object} [options] - Options for writing
 * @param {String} [options.framework] - The form in which the bootstrap of Infusion is written - see
 * `fluid.writeBootScript`
 * @return {Promise} A promise which resolves once the document has been written, and rejects with the reason the
 * document is not ready if the graph settles without it becoming so
 */
fluid.writeDocumentWhenSettled = async function (dokkument, outFilename, options = {}) {
    const prepare = record => {
        fluid.writeBootScript(record.dokkument, options.framework);
        fluid.markHydration(record.dokkument);
    };
    const outcome = await fluid.writeDocumentsWhenSettled([{dokkument, filename: outFilename}], prepare);
    if (outcome.unready.length > 0) {
        throw new Error("Reactive graph settled but document is not ready: " + JSON.stringify(outcome.unready[0].readiness));
    }
};

/**
 * Write every output document created by `fluid.createOutputDocument` once the reactive graph has settled - e.g. every
 * page of a site rendered as a single component tree, each page's view rendering into a document of its own. The
 * graph is settled first so that all the documents which rendering creates have been created.
 * @param {Function} [filenameFor] - A function receiving an `OutputDocumentRecord` and returning the file to which
 * its document is written - by default, the file at its location
 * @param {Function} [prepare] - A function receiving each record whose document is ready, just before it is
 * serialised - see `fluid.writeDocumentsWhenSettled`
 * @return {Promise<DocumentWriteOutcome>} A promise for the outcome of writing each document
 */
fluid.writeOutputDocumentsWhenSettled = async function (filenameFor = record => fileURLToPath(record.url), prepare) {
    await fluid.cell.settle();
    const records = fluid.outputDocuments.get().map(record => ({...record, filename: filenameFor(record)}));
    return fluid.writeDocumentsWhenSettled(records, prepare);
};

fluid.activateDocument = function (dokkument) {
    const scriptQuery = fluid.liveQuerySelectorAll("script", dokkument, dokkument);
    let oldNodes = [];
    return fluid.cell.effect( (newNodes) => {
        fluid.scriptLoadingIdle.set(fluid.unavailable("Script loading in progress", "pending"));
        newNodes.forEach(newNode => {
            if (!oldNodes.find(node => node === newNode)) {
                fluid.loadScriptNodeInDocument(newNode, dokkument);
            }
        });
        oldNodes = newNodes;
        fluid.scriptLoadingIdle.set(true);
    }, [scriptQuery]);
};

/**
 * Resolve a URL fetched under node as a browser would - a relative URL is resolved against the location of the
 * document most recently booted by `fluid.loadAndBootDocument` - and record it as fetched, e.g. for copyOut.js
 * @param {String|URL} url - The URL to be fetched
 * @return {String} The absolute URL to be fetched
 */
fluid.resolveServerFetchUrl = function (url) {
    const absolute = fluid.serverFetchBase ? new URL(url, fluid.serverFetchBase).href : String(url);
    fluid.serverFetchedUrls.add(absolute);
    return fluid.moduleSourceUrl(absolute);
};

fluid.serverFetchedUrls = new Set();

// Map of the absolute URL of a module's directory as a document declares it with <fluid-module>, ending in "/", to the
// absolute URL of a directory from which its files are fetched under node in its place - see fluid.registerModuleSources
fluid.serverModuleSources = {};

/**
 * Redirect a URL which lies within the directory of a module, as a document declares it, to the corresponding URL
 * within the directory registered as that module's source, if any - see `fluid.registerModuleSources`
 * @param {String} url - An absolute URL
 * @return {String} The URL from which the resource is to be fetched
 */
fluid.moduleSourceUrl = function (url) {
    const declared = Object.keys(fluid.serverModuleSources).filter(prefix => url.startsWith(prefix))
        .sort((a, b) => b.length - a.length)[0];
    return declared ? fluid.serverModuleSources[declared] + url.substring(declared.length) : url;
};

// Map of module id to the absolute path of the directory from which its files are read under node, in place of the one
// at which the document locates it - see fluid.registerModuleSources
fluid.serverModuleSourcesById = {};

/**
 * Record the source of a module which has been registered at a URL, if it has one - see `fluid.registerModuleSources`
 * @param {String} name - The module's name
 * @param {String} url - The absolute URL of its directory, as the document locates it
 */
fluid.registerServerModuleSource = function (name, url) {
    const source = fluid.serverModuleSourcesById[name];
    if (source) {
        fluid.serverModuleSources[fluid.deSlash(url) + "/"] = fluid.deSlash(pathToFileURL(source).href) + "/";
    }
};

// Each module registered, by <fluid-module>, a module map or fluid.module.unregisteredResolver, has its files read from
// its source, if one is registered for it
const fluidModuleRegister = fluid.module.register;
fluid.module.register = function (name, url, origUrl, abs) {
    fluidModuleRegister(name, url, origUrl, abs);
    fluid.registerServerModuleSource(name, url);
};

/**
 * Find the directory of an npm package as node would find it from a directory - in the `node_modules` directory of
 * that directory or of any enclosing it.
 * @param {String} name - The name of the package, which may be scoped
 * @param {String} fromDir - The absolute path of the directory
 * @return {String|null} The absolute path of the package's directory, or `null` if none is found
 */
fluid.findPackageDir = function (name, fromDir) {
    let dir = fromDir;
    let found;
    while (found === undefined) {
        const candidate = path.join(dir, "node_modules", name);
        const parent = path.dirname(dir);
        if (fs.existsSync(path.join(candidate, "package.json"))) {
            found = candidate;
        } else if (parent === dir) {
            found = null;
        } else {
            dir = parent;
        }
    }
    return found;
};

/**
 * Register the directories from which the files of modules are read under node, in place of the directories at
 * which a document locates them - whether by `<fluid-module id="..." src="...">`, by a module map, or through
 * `fluid.module.unregisteredResolver`. Each module's source takes effect once the module is registered. This allows a
 * page to be booted, and so its dependencies discovered, before the files of those modules have been copied to the
 * places it expects - see copyOut.js
 * @param {Document} dokkument - The document, whose location has been set
 * @param {Object<String, String>} moduleSources - Map of module id to the absolute path of its source directory
 * @return {Object<String, String>} Map of module id to the absolute path of its source directory, for all modules
 */
fluid.registerModuleSources = function (dokkument, moduleSources) {
    Object.entries(moduleSources).forEach(([name, source]) => {
        fluid.serverModuleSourcesById[name] = source;
        const registered = fluid.module.modules[name];
        if (registered) {
            fluid.registerServerModuleSource(name, registered.url);
        }
    });
    return fluid.serverModuleSourcesById;
};

// The document against which relative URLs fetched under node are resolved - see fluid.resolveServerFetchUrl
fluid.serverFetchBase = null;

/**
 * @typedef {Object} PlaceholderRecord
 * @property {String} path - The path of a component bearing `fluid.withPlaceholder` whose `url` is a placeholder's
 * @property {String} url - The URL of the placeholder, placeholder://{layerName}/{resourceName}
 * @property {String} fetchUrl - The URL fetched in its place - that of a file, or a Blob URL for material held inline -
 * see `fluid.resolveUrl`
 */

/**
 * List the components of a booted document bearing `fluid.withPlaceholder` which are rendered from placeholders - see
 * FLUID-7032. A document which is a runnable application, rather than a test fixture or an authoring tool, has none.
 * @param {Document} dokkument - The booted document
 * @return {PlaceholderRecord[]} A record for each such component which is live
 */
fluid.documentPlaceholders = function (dokkument) {
    const resolve = url => url.startsWith("blob:") ? url : new URL(url, dokkument.location).href;
    return [...fluid.withPlaceholder.instances].filter(that => !fluid.isDestroyed(that) && that.isPlaceholder).map(that => ({
        path: that[fluid.metadataSymbol].path,
        url: that.url,
        fetchUrl: resolve(that.fetchUrl)
    }));
};

/**
 * Load a document from a file, and boot the components it declares, as a browser would
 * @param {String} filename - The absolute path of the document
 * @param {Object} [options] - Options for booting
 * @param {Object<String, String>} [options.moduleSources] - Map of the id of a module the document declares to a
 * directory from which its files are read in place of the one it declares - see `fluid.registerModuleSources`
 * @return {Document} The booted document
 */
fluid.loadAndBootDocument = function (filename, options = {}) {
    const text = fluid.readTextFile(filename);

    const dokkument = fluid.serverDocumentParser(text);
    dokkument.location = new URL("file://" + filename);
    fluid.serverFetchBase = dokkument.location;
    fluid.renderingStatically = true;
    fluid.recordSourceDocument(dokkument);
    fluid.expandBootScript(dokkument);
    if (options.moduleSources) {
        fluid.registerModuleSources(dokkument, options.moduleSources);
    }

    fluid.evaluatePageScripts(dokkument);

    fluid.bootDocument(dokkument);
    return dokkument;
};
