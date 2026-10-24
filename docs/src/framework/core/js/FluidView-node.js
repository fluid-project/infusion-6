"use strict";

// import fluid from "./FluidView.js"

const $fluidViewNodeScope = function (fluid) {

    const $m = fluid.metadataSymbol;

    // Currently disused
    /**
     * Parses an HTML string into a DOM element.
     *
     * @param {String} template - The HTML string to parse.
     * @return {HTMLElement|null} The first element in the parsed DOM fragment, or null if none exists.
     */
    fluid.parseDOM = template => fluid.serverDocumentParser(template);

    // Noop stub to discard event handler registration on server
    fluid.applyOns = () => {};

    // On the server assume that the document is always ready - need to check MutationObserver behaviour in linkedom
    fluid.applyOnLoad = function (func) {
        func();
    };

    // Output documents - documents created by fluid.createOutputDocument, which views render into without executing any
    // script in them, e.g. each page of a site rendered as one component tree. Only the server creates them, since a
    // client observes at most one document, its own - see fluid.outputDocumentView in FluidView-browser.js. The documents
    // are parsed by fluid.parseOutputDocument and their locations resolved by fluid.resolveOutputLocation, both supplied
    // by server-support.js, and written by fluid.writeOutputDocumentsWhenSettled.

    /**
     * @typedef {Object} OutputDocumentRecord
     * @property {Document} dokkument - A document created by `fluid.createOutputDocument`
     * @property {String} location - The location at which the document is to be written, as supplied on creation
     * @property {URL} url - The location resolved to an absolute URL, against which the document's relative URLs resolve
     */

    // Documents created by fluid.createOutputDocument, which views render into without executing any script in them -
    // e.g. the pages of a site rendered as one component tree. Held as a cell so that a writer may enumerate them, in
    // order of creation
    /** @type {Cell<OutputDocumentRecord[]>} */
    fluid.outputDocuments = fluid.cell([], {name: "Fluid output documents"});

    /** @type {WeakMap<Document, OutputDocumentRecord>} */
    fluid.outputDocumentRecords = new WeakMap();

    // The markup from which an output document is created
    fluid.outputDocumentMarkup = "<!DOCTYPE html><html><head></head><body></body></html>";

    /**
     * Create a fresh output document, into which a view may render as its container's document - see
     * `fluid.outputDocumentView`. No script executes in it, including the scripts of any Single File Component whose
     * injections are recorded in it - see `fluid.subscribeOutputDocumentInjections`. The document is registered in
     * `fluid.outputDocuments` until released by `fluid.releaseOutputDocument`.
     * Should the document be a page of a site with a base URL, its root element records the relative URL of the site's
     * root, bearing `fluid.siteRootAttribute`. A root rendering onto the element leaves it, having not written it.
     * @param {String} location - The location at which the document is to be written, e.g. "posts/first/index.html",
     * which is resolved as by `fluid.resolveOutputLocation`
     * @param {String} [baseURL] - The base URL of the site to which the document belongs, if any
     * @return {Document} The fresh document
     */
    fluid.createOutputDocument = function (location, baseURL) {
        const dokkument = fluid.parseOutputDocument(fluid.outputDocumentMarkup);
        if (baseURL) {
            const siteBase = fluid.siteDirectoryOf(baseURL);
            const sitePath = fluid.sitePathOf(location, siteBase, siteBase);
            if (sitePath !== undefined) {
                dokkument.documentElement.setAttribute(fluid.siteRootAttribute, fluid.relativeSiteRoot(sitePath));
            }
        }
        const record = {dokkument, location, url: fluid.resolveOutputLocation(location)};
        fluid.outputDocumentRecords.set(dokkument, record);
        fluid.outputDocuments.set([...fluid.outputDocuments._value, record]);
        return dokkument;
    };

    /**
     * Release an output document created by `fluid.createOutputDocument`, removing it from `fluid.outputDocuments`
     * @param {Document} dokkument - The document to be released
     */
    fluid.releaseOutputDocument = function (dokkument) {
        if (fluid.outputDocumentRecords.has(dokkument)) {
            fluid.outputDocumentRecords.delete(dokkument);
            fluid.outputDocuments.set(fluid.outputDocuments._value.filter(record => record.dokkument !== dokkument));
        }
    };

    /**
     * Node version of `fluid.isOutputDocument` from FluidView.js - whether a document was created by
     * `fluid.createOutputDocument`
     * @param {Document} dokkument - The document
     * @return {Boolean} `true` if it is an output document
     */
    fluid.isOutputDocument = function (dokkument) {
        return !!dokkument && fluid.outputDocumentRecords.has(dokkument);
    };

    /**
     * Node version of `fluid.documentLocation` from FluidView.js - for an output document, which may have no location
     * of its own, the location with which it was created
     * @param {Document} dokkument - The document
     * @return {URL|Location} The document's location
     */
    fluid.documentLocation = function (dokkument) {
        return fluid.outputDocumentRecords.get(dokkument)?.url ?? dokkument.location;
    };

    /**
     * Node version of `fluid.subscribeOutputDocumentInjections` from FluidView.js. Record in an output document the
     * injections of the Single File Components defining the layers of a component rendering into it, and of its view,
     * so that the document holds the same styles as a document hosting the component would - and the scripts too, as
     * inert records - see `fluid.outputScriptInjectionStyles`. Layers which were not imported from Single File
     * Components are skipped.
     * @param {ComponentComputer} view - The view of the component which is rendering
     * @param {Document} dokkument - The document into which it renders
     */
    fluid.subscribeOutputDocumentInjections = function (view, dokkument) {
        if (fluid.isOutputDocument(dokkument)) {
            fluid.cell.untracked(() => {
                const owner = view[$m].parentShadow.that;
                const layerNames = [...new Set([...fluid.makeArray(owner?.$layers), ...fluid.makeArray(view.$layers)])];
                layerNames.filter(layerName => fluid.importMap[layerName]).forEach(layerName =>
                    fluid.subscribeDocToInjections(layerName, dokkument));
            });
        }
    };

    /**
     * Commit the injection of a Single File Component's script into an output document, where no script executes. The
     * script is recorded as an inert node of type `fluid.inertScriptType` holding the SFC's script text, or its `src`,
     * so that the document records everything that a document hosting the component would hold - e.g. so that it can
     * be made live once more - but executes nothing when loaded.
     * @param {DocInjectionRecord} docInjRec - The injection payload
     * @param {Element|null} existing - Any existing node with the injection's id
     * @return {Boolean} `true`, since the injection cannot fail
     */
    fluid.applyOutputScriptInjection = function ({dokkument, injRec}, existing) {
        const fresh = dokkument.createElement("script");
        fresh.setAttribute("type", fluid.inertScriptType);
        if (injRec.url) {
            fresh.setAttribute("src", injRec.url);
        } else {
            fresh.textContent = injRec.text;
        }
        fresh.id = injRec.nodeId;
        fluid.swapInjectedNode(dokkument, existing, fresh);
        return true;
    };

    // Script injection styles for output documents, which record a script without fetching or executing it
    fluid.outputScriptInjectionStyles = {
        literal: {
            apply: fluid.applyOutputScriptInjection
        },
        link: {
            apply: fluid.applyOutputScriptInjection
        }
    };

    /**
     * Node version of `fluid.scriptInjectionStylesFor` from FluidView.js - the scripts of Single File Components are
     * recorded in an output document without being fetched or executed
     * @param {Document} dokkument - The document
     * @return {Object<String, InjectionStyle>} The injection styles, keyed by `literal` and `link`
     */
    fluid.scriptInjectionStylesFor = function (dokkument) {
        return fluid.isOutputDocument(dokkument) ? fluid.outputScriptInjectionStyles : fluid.scriptInjectionStyles;
    };

    // A view which renders into the whole of a fresh output document - see fluid.createOutputDocument - as the root
    // element of its template, e.g. <html>. The document is created whilst `documentLocation` is available, and released
    // once it is not, or once the view is destroyed - a changed location creates a fresh document. Mixed into the
    // layers of a view alongside those supplying its template, e.g.
    // view: {$component: {$layers: ["fluid.sfcTemplateViewComponent", "fluid.outputDocumentView"], documentLocation: "{page}.path"}}
    fluid.def("fluid.outputDocumentView", {
        $layers: "fluid.viewComponent",
        documentLocation: fluid.unavailable({cause: "Location of output document not configured", variety: "config"}),
        // The base URL of the site to which the document belongs, if any - by which the document records the relative
        // URL of the site's root, so that on the client it recognises itself wherever the site is served - see
        // fluid.hostDocumentElement in FluidView-browser.js
        baseURL: "",
        outputDocument: {
            $bindable: {
                bind: "fluid.createOutputDocument({self}.documentLocation, {self}.baseURL)",
                unbind: "fluid.releaseOutputDocument({boundValue})"
            }
        },
        container: "$compute:fluid.documentElementOf({self}.outputDocument)",
        $variety: "framework"
    });

};

if (typeof(fluid) !== "undefined") {
    $fluidViewNodeScope(fluid);
}
