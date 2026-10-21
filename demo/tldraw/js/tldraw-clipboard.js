// Replaces tldraw's clipboard format with the Potentia Transmission Format (PTF) whenever Infusion shapes are copied
// or cut, and sniffs pastes for PTF documents. Other plain text pasted onto the canvas is offered to the "Ask me
// anything" panel, and tldraw's own handling is deferred to for anything else.
// See https://github.com/fluid-project/infusion-6/issues/15 and https://github.com/fluid-project/infusion-6/issues/24

/**
 * The live Infusion component hosted by each Infusion shape, keyed by shape id. Maintained by InfusionHost.
 * @type {Map<String, fluid.component>}
 */
export const infusionInstances = new Map();

/**
 * Decoded PTF parts awaiting construction by InfusionHost, keyed by the token written into a pasted shape's
 * `meta.ptfToken`. Entries are retained so that a shape restored by undo/redo can be reconstructed again.
 * @type {Map<String, PTFPart[]>}
 */
const pendingParts = new Map();

/**
 * Look up the PTF parts from which the Infusion shape bearing the supplied token should be constructed.
 * @param {String} [ptfToken] - The token found in the shape's `meta.ptfToken`, if any
 * @return {PTFPart[]|undefined} The parts, or `undefined` if the shape should be constructed afresh from its layer name
 */
export const lookupPendingParts = function (ptfToken) {
    return ptfToken ? pendingParts.get(ptfToken) : undefined;
};

/**
 * Register PTF parts from which an Infusion shape is to be constructed, under a fresh token which should be written
 * into the shape's `meta.ptfToken`.
 * @param {PTFPart[]} parts - The parts from which the shape's component is to be constructed
 * @return {String} The fresh token
 */
export const registerPendingParts = function (parts) {
    const ptfToken = "ptf-" + crypto.randomUUID();
    pendingParts.set(ptfToken, parts);
    return ptfToken;
};

/**
 * Resolvers of promises awaiting the reconstruction of a shape's component from the parts registered under a token,
 * keyed by that token
 * @type {Map<String, Function[]>}
 */
const instantiationWaiters = new Map();

/**
 * @typedef {Object} InstantiationReport
 * @property {fluid.component} [that] - The reconstructed component, if it could be constructed
 * @property {String[]} [unresolved] - The filenames of any parts which could not be applied to it
 * @property {Error|Unavailable} [error] - Why reconstruction failed, if it did
 */

/**
 * Await the next reconstruction of a shape's component from the parts registered under a token
 * @param {String} ptfToken - The token
 * @return {Promise<InstantiationReport>} A promise for the outcome of reconstruction, which never rejects
 */
export const awaitInstantiation = function (ptfToken) {
    return new Promise(resolve => {
        instantiationWaiters.set(ptfToken, [...(instantiationWaiters.get(ptfToken) || []), resolve]);
    });
};

/**
 * Report the outcome of reconstructing a shape's component from the parts registered under a token to anyone
 * awaiting it. Called by InfusionHost.
 * @param {String} ptfToken - The token
 * @param {InstantiationReport} report - The outcome of reconstruction
 */
export const notifyInstantiation = function (ptfToken, report) {
    const waiters = instantiationWaiters.get(ptfToken) || [];
    instantiationWaiters.delete(ptfToken);
    waiters.forEach(resolve => resolve(report));
};

// How long to wait for a widget to be constructed and become available before diagnosing it
export const instantiationTimeout = 8000;

/**
 * Returns a promise which resolves after the supplied delay
 * @param {Number} delay - The delay in milliseconds
 * @param {any} [value] - The value with which the promise resolves
 * @return {Promise} A promise resolving to `value` after `delay`
 */
export const wait = (delay, value) => new Promise(resolve => setTimeout(() => resolve(value), delay));

/**
 * Await the outcome of the next reconstruction of a shape's component, for no longer than `instantiationTimeout`
 * @param {Promise<InstantiationReport>} instantiation - The promise from `awaitInstantiation` for the shape's token
 * @return {Promise<InstantiationReport|null>} A promise for the outcome, or for `null` if there was none in time
 */
export const awaitReport = function (instantiation) {
    return Promise.race([instantiation, wait(instantiationTimeout, null)]);
};

/**
 * Determine whether the widget hosted by a shape has been constructed and is available
 * @param {String} shapeId - The id of the shape
 * @return {Boolean} `true` if the widget is available
 */
export const isWidgetAvailable = function (shapeId) {
    const that = infusionInstances.get(shapeId);
    return !!that && !fluid.isUnavailable(fluid.ptf.componentToShadow(that).availableInstance.get());
};

/**
 * Describe why the widget hosted by a shape is not available, e.g. once it has not become available within
 * `instantiationTimeout` of its construction - either it was never constructed since its layer never became
 * available, or it was constructed but some of its material is unavailable
 * @param {String} shapeId - The id of the shape
 * @param {String} layerName - The name of the widget's layer
 * @param {String} what - How the widget is to be described, e.g. "The widget \"counter\""
 * @return {String[]} Descriptions of the problems found
 */
export const diagnoseWidget = function (shapeId, layerName, what) {
    const that = infusionInstances.get(shapeId);
    let togo;
    if (that) {
        const diagnosis = fluid.tldraw.ai.diagnose(that, true);
        togo = diagnosis.length > 0 ? diagnosis.map(problem => `${what}: ${problem}`) :
            [`${what} did not become available within ${instantiationTimeout / 1000} seconds`];
    } else {
        const unavailable = fluid.layerRecToUnavailable(fluid.readLayer(layerName).get());
        const why = unavailable ? ` (${fluid.tldraw.ai.describeError(unavailable)})` : "";
        togo = [`${what} was never constructed, since its layer ${layerName} never became available${why} - `
            + "check that the layer is defined, either already or by a layer part"];
    }
    return togo;
};

/**
 * Describe any problems with the reconstruction of a widget from PTF parts
 * @param {InstantiationReport|null} report - The outcome of reconstruction as resolved by `awaitReport`
 * @param {String} shapeId - The id of the shape hosting the widget
 * @param {String} layerName - The name of the widget's layer
 * @param {String} what - How the widget is to be described in the descriptions
 * @return {String[]} Descriptions of any problems found
 */
export const describeInstantiation = function (report, shapeId, layerName, what) {
    let togo;
    if (report === null) {
        togo = diagnoseWidget(shapeId, layerName, what);
    } else if (report.error) {
        togo = [`${what} could not be constructed: ${fluid.tldraw.ai.describeError(report.error)}`];
    } else {
        togo = report.unresolved.map(filename => `${what} has no subcomponent at path ${filename} to which its parts could be applied`);
    }
    return togo;
};

/**
 * Report a problem found in pasting onto the canvas - to the console, and to the "Ask me anything" panel if it is
 * present
 * @param {String} problem - A description of the problem
 * @param {String} [detail] - Further material, e.g. the text which was pasted
 */
export const reportPasteProblem = function (problem, detail) {
    console.warn(problem);
    // The panel's SFC may not have loaded
    if (fluid.demos?.askAnything?.offer) {
        fluid.demos.askAnything.offer({problem, detail});
    }
};

const ptfPreamble = "This is a Potentia Transmission Format (PTF) document holding tldraw shapes together with the " +
    "layers and potentia of the Infusion components they host.";

/**
 * Assemble the parts of a PTF document holding tldraw content. The content itself, holding the positions and ids of
 * its shapes including any native tldraw shapes, is held in a part of kind "tldraw", and each Infusion shape is
 * accompanied by a nested PTF document of kind "component" whose filename is the shape's id. This is assembled from
 * the shape's component if it has been constructed, or else from the parts from which it is still to be constructed.
 * @param {TLContent} content - The content, as supplied by tldraw
 * @return {PTFPart[]} The parts
 */
export const contentToParts = function (content) {
    const componentParts = content.shapes.filter(shape => shape.type === "infusion").map(shape => {
        const that = infusionInstances.get(shape.id);
        const parts = that ? fluid.ptf.componentToParts(that) : lookupPendingParts(shape.meta.ptfToken);
        return parts ? {kind: "component", filename: shape.id, parts} : null;
    }).filter(part => part !== null);
    return [{
        kind: "tldraw",
        contentType: "application/json",
        filename: "tldraw-content",
        body: JSON.stringify(content, null, 4)
    }, ...componentParts];
};

/**
 * Encode copied tldraw content as a PTF document, as assembled by `contentToParts`
 * @param {TLContent} content - The content being copied, as supplied by tldraw
 * @return {String} The text of the PTF document
 */
export const contentToPTF = function (content) {
    return fluid.ptf.encode(contentToParts(content), ptfPreamble);
};

/**
 * Before Infusion shapes are deleted or replaced, e.g. by a cut, write a fresh token into each one resolving to a snapshot
 * of its component, so that if the change is undone, the restored shape is reconstructed with the state it had before.
 * The token is written outside the undo history so that the record captured by the deletion carries it.
 * @param {Editor} editor - The tldraw editor
 * @param {TLShape[]} shapes - The shapes about to be deleted, including any descendants of the selected shapes
 */
export const snapshotForUndo = function (editor, shapes) {
    const updates = shapes.filter(shape => shape.type === "infusion" && infusionInstances.has(shape.id)).map(shape => {
        const ptfToken = registerPendingParts(fluid.ptf.componentToParts(infusionInstances.get(shape.id)));
        return {id: shape.id, type: shape.type, meta: {...editor.getShape(shape.id)?.meta, ptfToken}};
    });
    editor.run(() => editor.updateShapes(updates), {history: "ignore"});
};

/**
 * Parse the body of a JSON part of a PTF document, describing the part in any error thrown
 * @param {PTFPart} part - The part
 * @param {String} where - A description of where the part was found, e.g. "in component shape:abc"
 * @return {any} The parsed body
 */
const parseJSONPart = function (part, where) {
    let togo;
    try {
        togo = JSON.parse(part.body);
    } catch (error) {
        throw new Error(`The ${part.kind} part ${JSON.stringify(part.filename)} ${where} could not be parsed as JSON: ${error.message}`);
    }
    return togo;
};

/**
 * Check the parts of a component held in a PTF document for formatting problems which would prevent its
 * reconstruction, i.e. a missing or malformed root potentia, or any malformed JSON part
 * @param {PTFPart[]} parts - The component's parts
 * @param {String} where - A description of where the parts were found, e.g. "in component shape:abc"
 * @return {String} The name of the component's layer
 */
const checkComponentParts = function (parts, where) {
    parts.filter(part => part.contentType === "application/json").forEach(part => parseJSONPart(part, where));
    const rootPart = parts.find(fluid.ptf.isRootPotentiaPart);
    const layerName = rootPart && fluid.makeArray(parseJSONPart(rootPart, where).$layers)[0];
    if (!layerName) {
        throw new Error(`There is no potentia part naming the layer of the root component ${where}`);
    }
    return layerName;
};

/**
 * Await the reconstruction of each widget pasted from a PTF document, and report any problems with it
 * @param {Editor} editor - The tldraw editor
 * @param {Object[]} pasted - A record for each pasted widget, holding its `ptfToken`, `layerName` and `instantiation`,
 * the promise from `awaitInstantiation` for its token
 * @param {String} text - The text which was pasted
 * @return {Promise} A promise which resolves once every widget has been reconstructed or diagnosed
 */
const checkPastedWidgets = async function (editor, pasted, text) {
    const reports = await Promise.all(pasted.map(({instantiation}) => awaitReport(instantiation)));
    const problems = reports.flatMap((report, i) => {
        const {ptfToken, layerName} = pasted[i];
        // tldraw remaps the ids of pasted shapes, so the shape is found by its token
        const shape = editor.getCurrentPageShapes().find(oneShape => oneShape.meta.ptfToken === ptfToken);
        return shape ? describeInstantiation(report, shape.id, layerName, `The widget ${shape.id} (${layerName})`) : [];
    });
    if (problems.length > 0) {
        reportPasteProblem("A PTF document was pasted, but its widgets could not all be reconstructed:\n"
            + fluid.tldraw.ai.listProblems(problems), text);
    }
};

/**
 * Paste a PTF document onto the canvas. A document produced by `contentToPTF` is pasted through tldraw's own handling
 * of its content, so that shape ids are remapped and positions resolved as for a native paste, after each Infusion shape
 * has been marked with a token resolving to the parts of its component. A bare component document, as produced by
 * `fluid.ptf.componentToPTF`, is pasted as a single fresh Infusion shape. A document which cannot be read is reported
 * as a formatting problem, and nothing is pasted from it - any widget which then cannot be reconstructed is reported as
 * an instantiation problem.
 * @param {Editor} editor - The tldraw editor
 * @param {String} text - The text of the PTF document
 * @param {VecLike} [point] - The page point at which to paste, if any
 * @return {Promise} A promise which resolves once any pasted widgets have been reconstructed or diagnosed
 */
export const pastePTF = function (editor, text, point) {
    const pasted = [];
    const register = (parts, layerName) => {
        const ptfToken = registerPendingParts(parts);
        pasted.push({ptfToken, layerName, instantiation: awaitInstantiation(ptfToken)});
        return ptfToken;
    };
    try {
        const parts = fluid.ptf.decode(text);
        const contentPart = fluid.isUnavailable(parts) ? null : parts.find(part => part.kind === "tldraw");
        if (fluid.isUnavailable(parts)) {
            throw parts;
        } else if (contentPart) {
            const content = parseJSONPart(contentPart, "holding the tldraw content");
            const componentParts = parts.filter(part => part.kind === "component" && part.parts);
            // All components are checked before anything is pasted
            const layerNames = componentParts.map(part => checkComponentParts(part.parts, `in component ${part.filename}`));
            componentParts.forEach((part, i) => {
                const shape = content.shapes.find(oneShape => oneShape.id === part.filename);
                if (shape) {
                    shape.meta = {...shape.meta, ptfToken: register(part.parts, layerNames[i])};
                }
            });
            editor.putExternalContent({type: "tldraw", content, point});
        } else if (parts.some(fluid.ptf.isRootPotentiaPart)) {
            const layerName = checkComponentParts(parts, "in the document");
            const ptfToken = register(parts, layerName);
            const center = point || editor.getViewportPageBounds().center;
            // Sized as for a fresh widget - see tldraw-driver.js
            const {w, h} = fluid.tldraw.shapeSizeFor(layerName);
            editor.markHistoryStoppingPoint("paste");
            editor.createShape({
                type: "infusion",
                x: center.x - w / 2,
                y: center.y - h / 2,
                props: {layerName, w, h},
                meta: {ptfToken}
            });
        } else {
            throw new Error("It holds neither tldraw content nor the potentia of a root component");
        }
    } catch (error) {
        reportPasteProblem("A PTF document was pasted, but it is malformed, so nothing was pasted from it: "
            + fluid.tldraw.ai.describeError(error), text);
    }
    return checkPastedWidgets(editor, pasted, text);
};

/**
 * Offer plain text pasted onto the canvas which is not a PTF document to the "Ask me anything" panel, as a direction
 * for the AI. If there is no panel, it is pasted onto the canvas as tldraw would.
 * @param {Editor} editor - The tldraw editor
 * @param {String} text - The pasted text
 * @param {VecLike} [point] - The page point at which to paste, if any
 */
export const pasteText = function (editor, text, point) {
    // The panel's SFC may not have loaded
    const offered = !!fluid.demos?.askAnything?.offer && fluid.demos.askAnything.offer({text});
    if (!offered) {
        editor.markHistoryStoppingPoint("paste");
        editor.putExternalContent({type: "text", text, point});
    }
};

/**
 * Keep copies and cuts made outside the canvas, e.g. of text selected in the "Ask me anything" panel, from reaching
 * tldraw's handlers. These are attached to the whole document and, whilst the editor holds a selection, would write
 * that selection to the clipboard in place of the text the user selected - see fluid-project/infusion-6#23.
 * @param {Element} element - An element outside the canvas, from which copies and cuts are to be left to the browser
 * @return {Function} A function which removes the guard
 */
export const guardClipboardEvents = function (element) {
    const stop = e => e.stopPropagation();
    element.addEventListener("copy", stop);
    element.addEventListener("cut", stop);
    return () => {
        element.removeEventListener("copy", stop);
        element.removeEventListener("cut", stop);
    };
};

/**
 * Construct tldraw editor options which install PTF as the clipboard format for Infusion shapes.
 * @return {Object} Options to be supplied as the `options` prop of the `Tldraw` component
 */
export const makeClipboardOptions = function () {
    return {
        /**
         * Write a PTF document to the clipboard in place of tldraw's own format if any Infusion shapes are being
         * copied or cut. Since cancelling tldraw's write also cancels its removal of cut shapes, these are removed here.
         * @param {Object} info - The copy information supplied by tldraw
         * @param {Editor} info.editor - The tldraw editor
         * @param {TLContent} info.content - The content being copied
         * @param {String} info.operation - Either "copy" or "cut"
         * @return {Promise<Boolean|undefined>} `false` if the clipboard was written here, otherwise `undefined` to let
         * tldraw write its own format
         */
        onBeforeCopyToClipboard: async function ({editor, content, operation}) {
            let togo;
            if (content.shapes.some(shape => shape.type === "infusion")) {
                const text = contentToPTF(content);
                await editor.getContainerWindow().navigator.clipboard.writeText(text);
                if (operation === "cut") {
                    snapshotForUndo(editor, content.shapes);
                    editor.markHistoryStoppingPoint("cut");
                    editor.deleteShapes(editor.getSelectedShapeIds());
                }
                togo = false;
            }
            return togo;
        },
        /**
         * Claim any paste of plain text alone, which is what onBeforeCopyToClipboard writes - as opposed to tldraw,
         * which also writes HTML. If it holds a PTF document this is pasted, and otherwise the text is offered to the
         * "Ask me anything" panel. A keyboard paste supplies its clipboard data synchronously so it can be sniffed
         * directly. A menu paste supplies ClipboardItems which can only be read asynchronously.
         * @param {TLClipboardPasteRawInfo} info - The paste information supplied by tldraw
         * @param {Editor} info.editor - The tldraw editor
         * @param {String} info.source - Either "native-event" for a keyboard paste or "clipboard-read" for a menu paste
         * @param {DataTransfer} [info.clipboardData] - For a keyboard paste, the event's clipboard data
         * @param {ClipboardItem[]} [info.clipboardItems] - For a menu paste, the items read from the clipboard
         * @param {VecLike} [info.point] - The page point at which to paste, if any
         * @return {Boolean|undefined} `false` if the paste was claimed, otherwise `undefined` to let tldraw handle it
         */
        onClipboardPasteRaw: function ({editor, source, clipboardData, clipboardItems, point}) {
            let togo;
            if (source === "native-event") {
                const text = clipboardData?.getData("text/plain");
                const types = [...(clipboardData?.types || [])];
                if (fluid.ptf.isPTF(text)) {
                    pastePTF(editor, text, point);
                    togo = false;
                } else if (text?.trim() && !types.includes("text/html") && !types.includes("Files")) {
                    pasteText(editor, text, point);
                    togo = false;
                }
            } else {
                const item = clipboardItems?.length === 1 ? clipboardItems[0] : null;
                if (item && item.types.includes("text/plain") && !item.types.includes("text/html")) {
                    item.getType("text/plain").then(blob => blob.text()).then(text => {
                        if (fluid.ptf.isPTF(text)) {
                            pastePTF(editor, text, point);
                        } else {
                            pasteText(editor, text, point);
                        }
                    });
                    togo = false;
                }
            }
            return togo;
        }
    };
};
