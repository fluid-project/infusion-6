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
    return isJavaScript && node.getAttribute("fluid-hydrated") !== "%infusion-6" && fluid.classifyScriptNode(node) !== "client" &&
        fluid.classifyScriptNode(node) !== "injection";
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
    const token = "fluid-injection-" + fluid.injectionId++;
    const wrapped = fluid.wrapScriptSource(material.text, material.sourceUrl, injRec.scope, token);
    const fresh = dokkument.createElement("script");
    fresh.text = wrapped;
    fresh.id = injRec.nodeId;
    fluid.swapInjectedNode(dokkument, existing, fresh);
    try {
        vm.runInContext(wrapped, fluid.V8Context, {filename: material.sourceUrl});
        togo = fluid.lastCompletedInjection === token ? true :
            fluid.unavailable({message: `Failure evaluating script at ${material.sourceUrl} - completion marker not reached`});
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
    return fluid.fetchInjectionText(new URL(resolved, dokkument.location).href).then(text => ({text, sourceUrl: resolved}));
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
    if (existing?.localName === "link") {
        existing.href = resolved;
    } else {
        const fresh = dokkument.createElement("link");
        fresh.rel = "stylesheet";
        fresh.href = resolved;
        fresh.id = injRec.nodeId;
        fluid.swapInjectedNode(dokkument, existing, fresh);
    }
    const url = new URL(resolved, dokkument.location);
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
 * Write a booted document once the reactive graph has settled, so that all the injections and rendering it triggers
 * are complete. A free effect watching the document's readiness is pending whilst it is, e.g. whilst any injection is
 * in progress, and so holds its fit open until then. Once settled, nothing further can happen without some external
 * event, so a document which is not then ready never will be.
 * @param {Document} dokkument - The document which has been booted
 * @param {String} outFilename - The file to write the hydrated document to
 * @return {Promise} A promise which resolves once the document has been written, and rejects with the reason the
 * document is not ready if the graph settles without it becoming so
 */
fluid.writeDocumentWhenSettled = async function (dokkument, outFilename) {
    const outcome = await fluid.writeDocumentsWhenSettled([{dokkument, filename: outFilename}]);
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

fluid.loadAndBootDocument = function (filename) {
    const text = fluid.readTextFile(filename);

    const dokkument = fluid.serverDocumentParser(text);
    dokkument.location = new URL("file://" + filename);

    // fluid.activateDocument(dokkument);

    fluid.bootDocument(dokkument);
    return dokkument;
};
