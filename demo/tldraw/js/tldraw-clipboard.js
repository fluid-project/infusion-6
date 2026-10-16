// Replaces tldraw's clipboard format with the Potentia Transmission Format (PTF) whenever Infusion shapes are copied
// or cut, and sniffs pastes for PTF documents, deferring to tldraw's own handling for anything else.
// See https://github.com/fluid-project/infusion-6/issues/15

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

const ptfPreamble = "This is a Potentia Transmission Format (PTF) document holding tldraw shapes together with the " +
    "layers and potentia of the Infusion components they host.";

/**
 * Encode copied tldraw content as a PTF document. The content itself, holding the positions and ids of all copied shapes
 * including any native tldraw shapes, is held in a part of kind "tldraw", and each copied Infusion shape whose component
 * has been constructed is accompanied by a nested PTF document of kind "component" whose filename is the shape's id.
 * @param {TLContent} content - The content being copied, as supplied by tldraw
 * @return {String} The text of the PTF document
 */
export const contentToPTF = function (content) {
    const componentParts = content.shapes
        .filter(shape => shape.type === "infusion" && infusionInstances.has(shape.id))
        .map(shape => ({
            kind: "component",
            filename: shape.id,
            parts: fluid.ptf.componentToParts(infusionInstances.get(shape.id))
        }));
    return fluid.ptf.encode([{
        kind: "tldraw",
        contentType: "application/json",
        filename: "tldraw-content",
        body: JSON.stringify(content, null, 4)
    }, ...componentParts], ptfPreamble);
};

/**
 * Before Infusion shapes are deleted by a cut, write a fresh token into each one resolving to a snapshot of its
 * component, so that if the cut is undone, the restored shape is reconstructed with the state it had when it was cut.
 * The token is written outside the undo history so that the record captured by the deletion carries it.
 * @param {Editor} editor - The tldraw editor
 * @param {TLShape[]} shapes - The shapes about to be deleted, including any descendants of the selected shapes
 */
const snapshotForUndo = function (editor, shapes) {
    const updates = shapes.filter(shape => shape.type === "infusion" && infusionInstances.has(shape.id)).map(shape => {
        const ptfToken = "ptf-" + crypto.randomUUID();
        pendingParts.set(ptfToken, fluid.ptf.componentToParts(infusionInstances.get(shape.id)));
        return {id: shape.id, type: shape.type, meta: {...editor.getShape(shape.id)?.meta, ptfToken}};
    });
    editor.run(() => editor.updateShapes(updates), {history: "ignore"});
};

/**
 * Paste a PTF document onto the canvas. A document produced by `contentToPTF` is pasted through tldraw's own handling
 * of its content, so that shape ids are remapped and positions resolved as for a native paste, after each Infusion shape
 * has been marked with a token resolving to the parts of its component. A bare component document, as produced by
 * `fluid.ptf.componentToPTF`, is pasted as a single fresh Infusion shape.
 * @param {Editor} editor - The tldraw editor
 * @param {String} text - The text of the PTF document
 * @param {VecLike} [point] - The page point at which to paste, if any
 * @param {Object} shapeDefaults - Defaults for a freshly created Infusion shape
 * @param {Number} shapeDefaults.w - The default width of a fresh shape
 * @param {Number} shapeDefaults.h - The default height of a fresh shape
 */
export const pastePTF = function (editor, text, point, shapeDefaults) {
    const parts = fluid.ptf.decode(text);
    const contentPart = parts.find(part => part.kind === "tldraw");
    if (contentPart) {
        const content = JSON.parse(contentPart.body);
        parts.filter(part => part.kind === "component" && part.parts).forEach(part => {
            const shape = content.shapes.find(oneShape => oneShape.id === part.filename);
            if (shape) {
                const ptfToken = "ptf-" + crypto.randomUUID();
                pendingParts.set(ptfToken, part.parts);
                shape.meta = {...shape.meta, ptfToken};
            }
        });
        editor.putExternalContent({type: "tldraw", content, point});
    } else {
        const rootPart = parts.find(part => part.kind === "potentia" && fluid.ptf.filenameToSegs(part.filename).length === 0);
        const layerName = rootPart && fluid.makeArray(JSON.parse(rootPart.body).$layers)[0];
        if (layerName) {
            const ptfToken = "ptf-" + crypto.randomUUID();
            pendingParts.set(ptfToken, parts);
            const center = point || editor.getViewportPageBounds().center;
            const preferredSize = fluid.def(layerName)?.preferredSize;
            const w = preferredSize?.w || shapeDefaults.w;
            const h = preferredSize?.h || shapeDefaults.h;
            editor.markHistoryStoppingPoint("paste");
            editor.createShape({
                type: "infusion",
                x: center.x - w / 2,
                y: center.y - h / 2,
                props: {layerName, w, h},
                meta: {ptfToken}
            });
        } else {
            console.warn("Ignoring pasted PTF document which holds neither tldraw content nor a root component");
        }
    }
};

/**
 * Construct tldraw editor options which install PTF as the clipboard format for Infusion shapes.
 * @param {Object} shapeDefaults - Defaults for a freshly created Infusion shape, as for `pastePTF`
 * @return {Object} Options to be supplied as the `options` prop of the `Tldraw` component
 */
export const makeClipboardOptions = function (shapeDefaults) {
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
         * Claim any paste whose plain text is a PTF document. A keyboard paste supplies its clipboard data synchronously
         * so it can be sniffed directly. A menu paste supplies ClipboardItems which can only be read asynchronously, so
         * any paste of plain text alone, which is what onBeforeCopyToClipboard writes, is claimed, and if it turns out
         * not to be PTF it is pasted as ordinary text.
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
                if (fluid.ptf.isPTF(text)) {
                    pastePTF(editor, text, point, shapeDefaults);
                    togo = false;
                }
            } else {
                const item = clipboardItems?.length === 1 ? clipboardItems[0] : null;
                if (item && item.types.includes("text/plain") && !item.types.includes("text/html")) {
                    item.getType("text/plain").then(blob => blob.text()).then(text => {
                        if (fluid.ptf.isPTF(text)) {
                            pastePTF(editor, text, point, shapeDefaults);
                        } else {
                            editor.markHistoryStoppingPoint("paste");
                            editor.putExternalContent({type: "text", text, point});
                        }
                    });
                    togo = false;
                }
            }
            return togo;
        }
    };
};
