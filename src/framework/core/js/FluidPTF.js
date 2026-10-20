"use strict";

// import fluid from "./FluidView.js"

// The "Potentia Transmission Format" (PTF) - a MIME multipart (RFC 1341, RFC 2046) document holding all of the layer
// definitions, user potentia and live layer contents required to reconstruct a component instance at another location.
// See https://github.com/fluid-project/infusion-6/issues/15

const fluidPTFScope = function (fluid) {
    const $t = fluid.proxySymbol;

    fluid.registerNamespace("fluid.ptf");

    /** MIME types for each of the representations a layer may be transmitted or edited in */
    fluid.layerMimeTypes = {
        sfc: "text/x-vue",
        javascript: "text/javascript",
        json: "application/json"
    };

    /**
     * Determine the MIME type in which the named layer should be transmitted or edited. Live layers, whose names are
     * rendered sites beginning with `{`, are JSON. Layers whose own definition carries the tag layer
     * `fluid.sfcLayer` were loaded from a Single File Component. All other layers are JavaScript.
     * @param {String} layerName - The name of the layer
     * @return {String} The MIME type for the layer, one of the values in `fluid.layerMimeTypes`
     */
    fluid.layerMimeType = function (layerName) {
        let togo = fluid.layerMimeTypes.javascript;
        if (layerName.startsWith("{")) {
            togo = fluid.layerMimeTypes.json;
        } else {
            const layerDef = fluid.deSignal(fluid.readLayer(layerName).get().raw);
            if (fluid.isPlainObject(layerDef, true) && !fluid.isUnavailable(layerDef)
                && fluid.makeArray(layerDef.$layers).includes("fluid.sfcLayer")) {
                togo = fluid.layerMimeTypes.sfc;
            }
        }
        return togo;
    };

    // Matches the beginning of a function's source which may stand as an expression in its own right, as opposed to
    // a method shorthand such as `foo(a) {...}` which may only appear inside an object literal
    const functionExpressionRE = /^(async\s+)?(function\b|class\b|\(|[A-Za-z_$][\w$]*\s*=>)/;

    /**
     * Render a value as JavaScript source text. Plain objects and arrays are rendered recursively, functions by means
     * of their own source text and all other values as JSON.
     * @param {any} value - The value to be rendered
     * @param {String} indent - The indentation of the line on which the value begins
     * @return {String} JavaScript source text for the value
     */
    fluid.ptf.valueToJavaScript = function (value, indent = "") {
        const inner = indent + "    ";
        let togo;
        if (typeof(value) === "function") {
            const source = value.toString();
            if (source.includes("[native code]")) {
                togo = `fluid.unavailable(${JSON.stringify("Native function " + value.name + " cannot be transmitted")})`;
            } else {
                togo = functionExpressionRE.test(source) ? source : "function " + source;
            }
        } else if (Array.isArray(value)) {
            const elements = value.map(element => inner + fluid.ptf.valueToJavaScript(element, inner));
            togo = value.length === 0 ? "[]" : "[\n" + elements.join(",\n") + "\n" + indent + "]";
        } else if (fluid.isPlainObject(value, true)) {
            const keys = Object.keys(value);
            const members = keys.map(key => {
                const keyText = /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
                return inner + keyText + ": " + fluid.ptf.valueToJavaScript(value[key], inner);
            });
            togo = keys.length === 0 ? "{}" : "{\n" + members.join(",\n") + "\n" + indent + "}";
        } else {
            togo = value === undefined ? "undefined" : JSON.stringify(value);
        }
        return togo;
    };

    /**
     * Determine the source text for the named layer in the representation given by `fluid.layerMimeType`.
     * @param {String} layerName - The name of the layer
     * @return {PTFPart} A layer part holding the layer's source text and MIME type
     */
    fluid.ptf.layerToPart = function (layerName) {
        const mimeType = fluid.layerMimeType(layerName);
        const sfcText = mimeType === fluid.layerMimeTypes.sfc ? fluid.sfcStore[layerName]?.textSignal.get() : undefined;
        let togo;
        if (typeof(sfcText) === "string") {
            togo = {kind: "layer", contentType: mimeType, filename: layerName, body: sfcText};
        } else {
            togo = {
                kind: "layer",
                contentType: fluid.layerMimeTypes.javascript,
                filename: layerName,
                body: fluid.layerToJavaScript(layerName, fluid.readLayer(layerName).get().raw)
            };
        }
        return togo;
    };

    /**
     * A single part of a PTF document.
     * @typedef {Object} PTFPart
     * @property {String} kind - The part's kind, transmitted as its Content-Description - "layer" for a layer
     * definition ("Potentia I"), "potentia" for a user potentia or "live" for a component's live layer ("Potentia II")
     * @property {String} contentType - The MIME type of the part's body
     * @property {String} filename - For a layer part, the layer name - otherwise, the path of the component relative to
     * the transmitted component as rendered by `fluid.ptf.segsToFilename`
     * @property {String} body - The text of the part
     * @property {PTFPart[]} [parts] - For a part which is itself a multipart entity, its nested parts. When encoding, these
     * are supplied in place of `body`
     * @property {Object<String, String>} [headers] - All headers of a decoded part, keyed by lower-cased header name
     */

    /**
     * Render the path segments of a component relative to the transmitted component as a part filename. The
     * transmitted component itself is rendered as `/`.
     * @param {String[]} segs - Path segments relative to the transmitted component
     * @return {String} The filename for the component's parts
     */
    fluid.ptf.segsToFilename = function (segs) {
        return "/" + segs.map(seg => encodeURIComponent(seg)).join("/");
    };

    /**
     * Parse a part filename rendered by `fluid.ptf.segsToFilename` back into path segments.
     * @param {String} filename - The part filename
     * @return {String[]} The path segments relative to the transmitted component
     */
    fluid.ptf.filenameToSegs = function (filename) {
        return filename.split("/").filter(seg => seg !== "").map(seg => decodeURIComponent(seg));
    };

    /**
     * Flatten a live layer, which holds signals at the paths which have been written during the component's
     * lifetime, into a map of paths to the current values of those signals.
     * @param {Object} liveLayer - The live layer of a component's shadow
     * @param {String[]} segs - The path segments of `liveLayer` within the component's live layer
     * @param {Object<String, any>} togo - Accumulates the flattened paths and values
     * @return {Object<String, any>} The map of paths to values
     */
    fluid.ptf.flattenLiveLayer = function (liveLayer, segs = [], togo = {}) {
        fluid.each(liveLayer, (value, key) => {
            const childSegs = [...segs, key];
            if (fluid.isSignal(value)) {
                const amenable = fluid.ptf.toJSONAmenable(fluid.deSignal(value.get()));
                if (amenable !== undefined) {
                    togo[fluid.composeSegments(childSegs)] = amenable;
                }
            } else {
                fluid.ptf.flattenLiveLayer(value, childSegs, togo);
            }
        });
        return togo;
    };

    /**
     * Reduce a value to the parts of it which can be faithfully transmitted as JSON. Primitives, plain objects and
     * arrays are retained, whereas any other values such as functions or DOM nodes, which are typically supplied by the
     * host environment (for example the `container` of a component's view), are discarded, as are any objects all of
     * whose members are discarded.
     * @param {any} value - The value to be reduced
     * @return {any} The JSON-amenable parts of the value, or `undefined` if none of it is amenable
     */
    fluid.ptf.toJSONAmenable = function (value) {
        let togo;
        if (Array.isArray(value)) {
            togo = value.map(element => fluid.ptf.toJSONAmenable(element) ?? null);
        } else if (fluid.isPlainObject(value, true)) {
            const amenable = {};
            fluid.each(value, (member, key) => {
                const amenableMember = fluid.ptf.toJSONAmenable(member);
                if (amenableMember !== undefined) {
                    amenable[key] = amenableMember;
                }
            });
            // An object all of whose members were discarded, e.g. a view holding just a container, is itself discarded
            const allDiscarded = Object.keys(value).length > 0 && Object.keys(amenable).length === 0;
            togo = allDiscarded ? undefined : amenable;
        } else if (value === null || ["string", "number", "boolean"].includes(typeof(value))) {
            togo = value;
        }
        return togo;
    };

    /**
     * Render the user potentia of a component as a JSON-amenable object. For the transmitted component, its full list
     * of directly applied layer names is written as `$layers`.
     * @param {Shadow} shadow - The shadow of the component
     * @param {Boolean} isRoot - `true` if this is the transmitted component
     * @return {Object|null} The component's user potentia, or `null` if it has none
     */
    fluid.ptf.shadowToPotentia = function (shadow, isRoot) {
        const potentia = shadow.potentia.get();
        const userRecords = potentia.mergeRecords.filter(mergeRecord => mergeRecord.mergeRecordType === "user" && mergeRecord.layer);
        const merged = fluid.ptf.toJSONAmenable(Object.assign({}, ...userRecords.map(mergeRecord => mergeRecord.layer)));
        let togo = null;
        if (isRoot) {
            // Written first for legibility, and last so that it overrides any partial $layers in the user records
            togo = Object.assign({$layers: potentia.layerNames}, merged, {$layers: potentia.layerNames});
        } else if (userRecords.length > 0) {
            togo = merged;
        }
        return togo;
    };

    /**
     * Retrieve the shadow of a component from its proxy. Unlike reading its metadata, this succeeds even while the
     * component is unavailable, for example while its layers are loading.
     * @param {fluid.component} component - The proxy for the component
     * @return {Shadow} The component's shadow
     */
    fluid.ptf.componentToShadow = function (component) {
        return component[$t].shadow;
    };

    /**
     * Assemble all of the parts required to reconstruct the supplied component at another location. These are
     * i) the definitions of all user layers resolved in the `$layers` of the component and any of its subcomponents,
     * ii) the user potentia of the component and any subcomponents having one and iii) the contents of the live layers
     * of the component and its subcomponents.
     * @param {fluid.component} component - The component to be transmitted
     * @return {PTFPart[]} The parts required to reconstruct the component
     */
    fluid.ptf.componentToParts = function (component) {
        const rootShadow = fluid.ptf.componentToShadow(component);
        const layerNames = new Set();
        const potentiaParts = [];
        const liveParts = [];
        const visit = function (shadow, segs) {
            const isRoot = segs.length === 0;
            fluid.deSignal(shadow.that.$layers).forEach(layerName => {
                if (fluid.isUserLayer(layerName)) {
                    layerNames.add(layerName);
                }
            });
            const filename = fluid.ptf.segsToFilename(segs);
            const potentia = fluid.ptf.shadowToPotentia(shadow, isRoot);
            if (potentia) {
                potentiaParts.push({kind: "potentia", contentType: fluid.layerMimeTypes.json, filename, body: JSON.stringify(potentia, null, 4)});
            }
            const live = fluid.ptf.flattenLiveLayer(shadow.liveLayer);
            if (Object.keys(live).length > 0) {
                liveParts.push({kind: "live", contentType: fluid.layerMimeTypes.json, filename, body: JSON.stringify(live, null, 4)});
            }
            fluid.each(shadow.childComponents, (childShadow, memberName) => {
                // Only visit components created in place - one injected from elsewhere, perhaps an ancestor, will be
                // reconstructed from the reference held in its parent's potentia
                if (childShadow.path === fluid.composeSegment(shadow.path, memberName)) {
                    visit(childShadow, [...segs, memberName]);
                }
            });
        };
        visit(rootShadow, []);
        const layerParts = [...layerNames].map(layerName => fluid.ptf.layerToPart(layerName));
        return [...layerParts, ...potentiaParts, ...liveParts];
    };

    fluid.ptf.preamble = "This is a Potentia Transmission Format (PTF) document holding the layers and potentia of an Infusion component.";

    /**
     * Allocate a multipart boundary which does not occur in any of the supplied texts.
     * @param {String[]} texts - The texts of the parts to be encoded
     * @return {String} A suitable boundary
     */
    fluid.ptf.allocateBoundary = function (texts) {
        let boundary;
        do {
            boundary = "ptf-boundary-" + Math.random().toString(36).substring(2, 12);
        } while (texts.some(text => text.includes(boundary)));
        return boundary;
    };

    /**
     * Encode a set of parts as the body of a multipart entity. A part holding nested `parts` rather than a `body` is
     * encoded as a nested multipart entity with its own boundary, as described in RFC 2046 section 5.1.1.
     * @param {PTFPart[]} parts - The parts to be encoded
     * @param {String} [preamble] - Text to be placed before the first part, which is ignored on decoding
     * @return {Object} A record with members `boundary` holding the allocated boundary and `body` holding the encoded body
     */
    fluid.ptf.encodeBody = function (parts, preamble) {
        const encoded = parts.map(part => {
            let togo;
            if (part.parts) {
                const nested = fluid.ptf.encodeBody(part.parts);
                togo = {contentType: `multipart/mixed; boundary="${nested.boundary}"`, body: nested.body};
            } else {
                togo = {contentType: `${part.contentType}; charset=utf-8`, body: part.body};
            }
            return togo;
        });
        const boundary = fluid.ptf.allocateBoundary(encoded.map(rec => rec.body));
        const blocks = parts.map((part, i) =>
            `--${boundary}\n` +
            `Content-Type: ${encoded[i].contentType}\n` +
            `Content-Disposition: attachment; filename=${JSON.stringify(part.filename)}\n` +
            `Content-Description: ${part.kind}\n` +
            "\n" +
            // The line break preceding each delimiter belongs to the delimiter rather than the body
            encoded[i].body + "\n"
        );
        const body = (preamble ? preamble + "\n" : "") + blocks.join("") + `--${boundary}--`;
        return {boundary, body};
    };

    /**
     * Encode a set of parts as a PTF document. Lines are separated with plain LF rather than the CRLF of RFC 1341 so
     * that the document can be read and edited as ordinary text - `fluid.ptf.decode` accepts either.
     * @param {PTFPart[]} parts - The parts to be encoded
     * @param {String} [preamble] - Text to be placed before the first part, defaulting to `fluid.ptf.preamble`
     * @return {String} The text of the PTF document
     */
    fluid.ptf.encode = function (parts, preamble = fluid.ptf.preamble) {
        const {boundary, body} = fluid.ptf.encodeBody(parts, preamble);
        return "MIME-Version: 1.0\n" +
            `Content-Type: multipart/mixed; boundary="${boundary}"\n` +
            "\n" +
            body + "\n";
    };

    /**
     * Encode the supplied component as a PTF document.
     * @param {fluid.component} component - The component to be transmitted
     * @return {String} The text of the PTF document
     */
    fluid.ptf.componentToPTF = function (component) {
        return fluid.ptf.encode(fluid.ptf.componentToParts(component));
    };

    /**
     * Parse a block of MIME headers into a map keyed by lower-cased header name. Folded continuation lines are joined.
     * @param {String[]} lines - The header lines
     * @return {Object<String, String>} The parsed headers
     */
    fluid.ptf.parseHeaders = function (lines) {
        const headers = {};
        let lastKey = null;
        lines.forEach(line => {
            if (/^[ \t]/.test(line)) {
                if (lastKey) {
                    headers[lastKey] += " " + line.trim();
                }
            } else {
                const colon = line.indexOf(":");
                if (colon !== -1) {
                    lastKey = line.substring(0, colon).trim().toLowerCase();
                    headers[lastKey] = line.substring(colon + 1).trim();
                }
            }
        });
        return headers;
    };

    /**
     * Parse a structured header value such as `multipart/mixed; boundary="xyz"` into its main value and parameters.
     * @param {String} [value] - The header value
     * @return {Object} A record with member `value` holding the main value (lower-cased) and `params` holding the parameters keyed
     * by lower-cased name
     */
    fluid.ptf.parseHeaderValue = function (value = "") {
        const semi = value.indexOf(";");
        const main = semi === -1 ? value : value.substring(0, semi);
        const params = {};
        const paramRE = /;\s*([^=;\s]+)\s*=\s*("((?:[^"\\]|\\.)*)"|[^;\s]*)/g;
        let match;
        while ((match = paramRE.exec(value)) !== null) {
            params[match[1].toLowerCase()] = match[3] !== undefined ? match[3].replace(/\\(.)/g, "$1") : match[2];
        }
        return {value: main.trim().toLowerCase(), params};
    };

    /**
     * Split text into a header block and body at the first empty line.
     * @param {String} text - Text with LF line endings beginning with a header block
     * @return {Object} A record with members `headers` holding the parsed headers and `body` holding the remaining text
     */
    fluid.ptf.splitHeaders = function (text) {
        const blank = text.indexOf("\n\n");
        const headerText = blank === -1 ? text : text.substring(0, blank);
        const body = blank === -1 ? "" : text.substring(blank + 2);
        return {headers: fluid.ptf.parseHeaders(headerText.split("\n")), body};
    };

    /**
     * Determine whether the supplied text is a PTF document - that is, a multipart MIME document whose top-level
     * Content-Type specifies a boundary. Suitable for sniffing clipboard contents on paste.
     * @param {String} text - The text to be tested
     * @return {Boolean} `true` if the text appears to be a PTF document
     */
    fluid.ptf.isPTF = function (text) {
        let togo = false;
        if (typeof(text) === "string" && /^MIME-Version:/i.test(text.trimStart())) {
            const {headers} = fluid.ptf.splitHeaders(text.trimStart().replace(/\r\n/g, "\n"));
            const contentType = fluid.ptf.parseHeaderValue(headers["content-type"]);
            togo = contentType.value.startsWith("multipart/") && !!contentType.params.boundary;
        }
        return togo;
    };

    /**
     * Decode the body of a multipart entity into its parts. Any part which is itself a multipart entity is decoded
     * recursively into its `parts` member.
     * @param {String} body - The body of the multipart entity, with LF line endings
     * @param {String} boundary - The entity's boundary
     * @return {PTFPart[]} The decoded parts
     */
    fluid.ptf.decodeBody = function (body, boundary) {
        const delimiter = "--" + boundary;
        // Each delimiter must begin a line - the first may begin the body if the preamble is empty
        const segments = ("\n" + body).split("\n" + delimiter);
        // Discard the preamble and anything following the close delimiter
        const closeIndex = segments.findIndex(segment => segment.startsWith("--"));
        const partSegments = segments.slice(1, closeIndex === -1 ? segments.length : closeIndex);
        return partSegments.map(segment => {
            // Discard any transport padding and the line break following the delimiter
            const partText = segment.replace(/^[ \t]*\n/, "");
            const split = fluid.ptf.splitHeaders(partText);
            const contentType = fluid.ptf.parseHeaderValue(split.headers["content-type"] || "text/plain");
            const disposition = fluid.ptf.parseHeaderValue(split.headers["content-disposition"]);
            const part = {
                kind: (split.headers["content-description"] || "").trim().toLowerCase(),
                contentType: contentType.value,
                filename: disposition.params.filename,
                body: split.body,
                headers: split.headers
            };
            if (contentType.value.startsWith("multipart/") && contentType.params.boundary) {
                part.parts = fluid.ptf.decodeBody(split.body, contentType.params.boundary);
            }
            return part;
        });
    };

    /**
     * Decode a PTF document into its parts.
     * @param {String} text - The text of the PTF document, with either LF or CRLF line endings
     * @return {PTFPart[]|Unavailable} The decoded parts, or an unavailable value if the text is not a PTF document
     */
    fluid.ptf.decode = function (text) {
        let togo;
        if (fluid.ptf.isPTF(text)) {
            const normalised = text.trimStart().replace(/\r\n/g, "\n");
            const {headers, body} = fluid.ptf.splitHeaders(normalised);
            const boundary = fluid.ptf.parseHeaderValue(headers["content-type"]).params.boundary;
            togo = fluid.ptf.decodeBody(body, boundary);
        } else {
            togo = fluid.unavailable("Text is not a Potentia Transmission Format document", "error");
        }
        return togo;
    };

    /**
     * Register a Single File Component whose text is supplied directly rather than fetched from a URL, and
     * arrange that its injections will be bound into documents when the layer is demanded.
     * @param {String} layerName - The name of the layer defined by the SFC
     * @param {String} text - The text of the SFC
     * @return {SFCRecord} The record tracking the SFC
     */
    fluid.loadSFCText = function (layerName, text) {
        const rec = fluid.readSFC(layerName);
        if (!rec.parseEffect) {
            rec.loadCompletion = fluid.cell(fluid.unavailable(`SFC for ${layerName} is loading`, "pending"),
                {name: `load completion for SFC for layer ${layerName}`});
            rec.textSignal.set(text);
            rec.parseEffect = fluid.parseSFC(rec, layerName);
        } else {
            rec.textSignal.set(text);
        }
        fluid.importMap[layerName] ||= {loadStyle: "sfc"};
        return rec;
    };

    /**
     * Register the layer definition held in a PTF layer part.
     * @param {PTFPart} part - The layer part
     */
    fluid.ptf.registerLayerPart = function (part) {
        if (part.contentType === fluid.layerMimeTypes.sfc) {
            fluid.loadSFCText(part.filename, part.body);
        } else if (part.contentType === fluid.layerMimeTypes.javascript) {
            // Evaluating a transmitted layer is equivalent in trust to loading an SFC from the same source
            new Function("fluid", part.body)(fluid);
        } else if (part.contentType === fluid.layerMimeTypes.json) {
            fluid.def(part.filename, JSON.parse(part.body));
        } else {
            fluid.log(fluid.logLevel.WARN, `Ignoring PTF layer part for ${part.filename} with unrecognised content type ${part.contentType}`);
        }
    };

    /**
     * Resolve the shadow of the component found at the supplied path segments relative to a root shadow.
     * @param {Shadow} rootShadow - The shadow from which to resolve
     * @param {String[]} segs - Path segments relative to the root shadow
     * @return {Shadow|undefined} The resolved shadow, or `undefined` if there is no component at the path
     */
    fluid.ptf.resolveShadow = function (rootShadow, segs) {
        return segs.reduce((shadow, seg) => shadow?.childComponents[seg], rootShadow);
    };

    /**
     * Await the availability of a component.
     * @param {Shadow} shadow - The shadow of the component
     * @return {Promise<fluid.component>} A promise resolving once the component is available
     */
    fluid.ptf.awaitAvailable = function (shadow) {
        return fluid.cell.waitFor(shadow.availableInstance);
    };

    /**
     * @typedef {Object} PTFInstantiation
     * @property {fluid.component} that - The reconstructed component
     * @property {String[]} unresolved - The filenames of any potentia or live parts which could not be applied since
     * no component was found at their path
     */

    /**
     * Reconstruct a component from the parts of a PTF document. Any layers which are not already defined are registered, unless
     * `options.overrideLayers` is set in which case all transmitted layers are registered. The component is
     * constructed as a free component from the root potentia, and once it becomes available, any further potentia and
     * live layer contents are applied to it and its subcomponents.
     * @param {PTFPart[]} parts - The decoded parts of the PTF document
     * @param {Object} [options] - Options governing reconstruction
     * @param {Boolean} [options.overrideLayers] - If `true`, transmitted layers override any existing definitions
     * @param {Object} [options.potentia] - Further potentia supplied by the receiving environment, for example a
     * `container`, which is merged over the transmitted root potentia
     * @return {Promise<PTFInstantiation>} A promise resolving once the component and its transmitted state are available
     */
    fluid.ptf.instantiateParts = async function (parts, options = {}) {
        let togo;
        parts.filter(part => part.kind === "layer").forEach(part => {
            const existing = fluid.readLayer(part.filename).get();
            if (options.overrideLayers || fluid.isUnavailable(existing) || fluid.isUnavailable(fluid.deSignal(existing.raw))) {
                fluid.ptf.registerLayerPart(part);
            }
        });
        const rootPart = parts.find(part => part.kind === "potentia" && fluid.ptf.filenameToSegs(part.filename).length === 0);
        if (!rootPart) {
            togo = Promise.reject(fluid.unavailable("PTF document has no potentia for its root component", "error"));
        } else {
            const rootPotentia = JSON.parse(rootPart.body);
            const [componentName, ...layerNames] = fluid.makeArray(rootPotentia.$layers);
            const that = fluid.initFreeComponent(componentName, {...rootPotentia, ...options.potentia, $layers: layerNames});
            const rootShadow = fluid.ptf.componentToShadow(that);
            await fluid.ptf.awaitAvailable(rootShadow);
            const unresolved = [];
            parts.filter(part => part !== rootPart && part.kind === "potentia").forEach(part => {
                const segs = fluid.ptf.filenameToSegs(part.filename);
                const parentShadow = fluid.ptf.resolveShadow(rootShadow, segs.slice(0, -1));
                if (parentShadow) {
                    const layer = JSON.parse(part.body);
                    fluid.pushPotentia(parentShadow, fluid.peek(segs), [{mergeRecordType: "user", layer}], fluid.makeArray(layer.$layers));
                } else {
                    unresolved.push(part.filename);
                }
            });
            fluid.cell.stabilize();
            for (const part of parts.filter(part => part.kind === "live")) {
                const shadow = fluid.ptf.resolveShadow(rootShadow, fluid.ptf.filenameToSegs(part.filename));
                if (shadow) {
                    await fluid.ptf.awaitAvailable(shadow);
                    fluid.each(JSON.parse(part.body), (value, path) => {
                        fluid.setForComponent(shadow.that, path, value);
                    });
                } else {
                    unresolved.push(part.filename);
                }
            }
            fluid.cell.stabilize();
            togo = {that, unresolved};
        }
        return togo;
    };

    /**
     * Reconstruct a component from a PTF document - see `fluid.ptf.instantiateParts`.
     * @param {String} text - The text of the PTF document
     * @param {Object} [options] - Options governing reconstruction, as for `fluid.ptf.instantiateParts`
     * @return {Promise<PTFInstantiation>} A promise resolving once the component and its transmitted state are available
     */
    fluid.ptf.instantiate = function (text, options) {
        const parts = fluid.ptf.decode(text);
        return fluid.isUnavailable(parts) ? Promise.reject(parts) : fluid.ptf.instantiateParts(parts, options);
    };
};

if (typeof(fluid) !== "undefined") {
    fluidPTFScope(fluid);
}
