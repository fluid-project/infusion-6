// Persists the canvas as an Infusion "arena" through fluid.persistenceAdapter - its tldraw content, the layers, potentia
// and live state of the widgets it hosts, all as transmitted to the AI as PTF, together with the arena's undoable
// histories of widget state and of layer definitions - and restores it when the page is loaded. Also binds the
// keyboard shortcuts which step through those histories.

import {infusionInstances, registerPendingParts, lookupPendingParts, awaitInstantiation, awaitReport} from "./tldraw-clipboard.js";

const arenaPreamble = "This is a Potentia Transmission Format (PTF) document holding a persisted tldraw arena - its "
    + "shapes, the layers and potentia of the Infusion components they host, and its undoable histories.";

// How long after a change the arena is saved, so that a burst of changes is saved once
const saveDelay = 500;

// How often the arena is checked for changes which were not signalled, e.g. writes to widgets' live state which are not
// recorded in the history
const saveCheckInterval = 5000;

/**
 * Determine whether a component belongs to the arena - that is, is part of a widget hosted on the canvas, rather than,
 * e.g., the "Ask me anything" panel. Suitable as `fluid.arenaContains`.
 * @param {Shadow} shadow - The shadow of the component
 * @return {Boolean} `true` if the component is part of a widget hosted on the canvas
 */
export const containsWidget = function (shadow) {
    return fluid.tldraw.findWidget(shadow, infusionInstances) !== null;
};

// The creation and deletion of widgets, recorded in fluid.liveHistory beside the updates to their state

/**
 * @typedef {Object} WidgetRecord
 * @property {TLShape} shape - The record of the shape hosting the widget, as it was when created or deleted
 * @property {PTFPart[]|null} parts - The parts from which the widget is reconstructed, as it was when deleted, or
 * `null` for a widget which was created afresh from its layer
 */

/**
 * @typedef {Object} WidgetsHistoryRec
 * @property {String} type - "widgets"
 * @property {Boolean} created - `true` if the widgets were created, `false` if they were deleted
 * @property {WidgetRecord[]} widgets - The widgets created or deleted together
 */

// Set whilst a widgets record is applied, so that the deletions it makes are not themselves recorded
let applyingWidgets = false;

/**
 * Record the shape of a widget in a form which can be recreated and persisted
 * @param {TLShape} shape - The shape
 * @param {PTFPart[]|null} parts - The parts from which the widget is to be reconstructed, if any
 * @return {WidgetRecord} The record
 */
const widgetRecord = function (shape, parts) {
    // The token resolving to any pending parts is not retained, since fresh tokens are registered on recreation
    // eslint-disable-next-line no-unused-vars
    const {ptfToken, ...meta} = shape.meta;
    return {shape: JSON.parse(JSON.stringify({...shape, meta})), parts};
};

/**
 * Record the creation of fresh widgets, e.g. from the "New shape" menu, in `fluid.liveHistory`
 * @param {Editor} editor - The tldraw editor
 * @param {String[]} shapeIds - The ids of the shapes hosting the fresh widgets
 */
export const recordWidgetCreation = function (editor, shapeIds) {
    const widgets = shapeIds.map(id => editor.getShape(id)).filter(shape => shape).map(shape => widgetRecord(shape, null));
    fluid.ptf.pushToStack(fluid.liveHistory, {type: "widgets", created: true, widgets});
};

/**
 * Apply one side of a widgets record, creating or deleting its widgets. A widget is recreated with its original shape
 * id, so that records of updates to its state, which refer to it through its shape, apply to it once more.
 * @param {Editor} editor - The tldraw editor
 * @param {WidgetsHistoryRec} record - The record
 * @param {String} side - "old" or "new"
 * @return {Boolean} `true` if any widget was created or deleted
 */
const applyWidgetsRecord = function (editor, record, side) {
    const present = (side === "new") === record.created;
    const absent = record.widgets.filter(widget => !editor.getShape(widget.shape.id));
    const existing = record.widgets.filter(widget => editor.getShape(widget.shape.id)).map(widget => widget.shape.id);
    applyingWidgets = true;
    try {
        editor.run(() => {
            if (present) {
                editor.createShapes(absent.map(({shape, parts}) => {
                    const {id, type, x, y, rotation, isLocked, opacity, props, meta, parentId} = shape;
                    return {id, type, x, y, rotation, isLocked, opacity, props,
                        meta: parts ? {...meta, ptfToken: registerPendingParts(parts)} : meta,
                        // The shape returns to its original parent, e.g. a frame, if this still exists
                        ...(editor.getShape(parentId) ? {parentId} : {})};
                }));
            } else {
                editor.deleteShapes(existing);
            }
        }, {history: "ignore"});
    } finally {
        applyingWidgets = false;
    }
    return present ? absent.length > 0 : existing.length > 0;
};

/**
 * Begin recording the deletion of widgets in `fluid.liveHistory`, and applying records of their creation and
 * deletion. Widgets deleted together, e.g. as a selection, are recorded together.
 * @param {Editor} editor - The tldraw editor
 * @return {Function} A function which stops recording and applying such records
 */
export const bindWidgetHistory = function (editor) {
    let deleted = [];
    fluid.ptf.liveRecordAppliers.widgets = (record, side) => applyWidgetsRecord(editor, record, side);
    const unregister = editor.sideEffects.registerBeforeDeleteHandler("shape", (shape, source) => {
        if (shape.type === "infusion" && source === "user" && !applyingWidgets) {
            // Captured whilst the widget's component still exists
            const that = infusionInstances.get(shape.id);
            deleted.push(widgetRecord(shape, that ? fluid.ptf.componentToParts(that) : lookupPendingParts(shape.meta.ptfToken) || null));
            if (deleted.length === 1) {
                queueMicrotask(() => {
                    fluid.ptf.pushToStack(fluid.liveHistory, {type: "widgets", created: false, widgets: deleted});
                    deleted = [];
                });
            }
        }
    });
    return () => {
        unregister();
        delete fluid.ptf.liveRecordAppliers.widgets;
    };
};

/**
 * Determine whether a record of `fluid.liveHistory` is a step written by a gesture which is still in progress, e.g. a
 * search whose results have yet to arrive
 * @param {Object} record - The record
 * @return {Boolean} `true` if the record is a step whose gesture is in progress
 */
const isInFlight = function (record) {
    return record.type === "group" && record.gesture !== undefined && fluid.ptf.openGestures.get(record.key) === record.gesture;
};

/**
 * Render a record of `fluid.liveHistory` in a form which can be persisted - a group through each of its records, and
 * records of widgets as they are, since they are already so. A step whose gesture is still in progress is incomplete,
 * and is not persisted, just as the state it has written so far is not - see `settledParts`.
 * @param {Object} record - The record
 * @return {Object|null} The persistable record, or `null` if it cannot be persisted
 */
const encodeArenaRecord = function (record) {
    return isInFlight(record) ? null :
        record.type === "group" ? fluid.ptf.transformGroupRecord(record, encodeArenaRecord) :
        record.type === "live" ? fluid.ptf.encodeLiveRecord(record, site => fluid.tldraw.siteToRef(site, infusionInstances)) : record;
};

/**
 * Restore a record of `fluid.liveHistory` from its persisted form
 * @param {Object} persisted - The persisted record
 * @return {Object|null} The record, or `null` if it cannot be restored
 */
const decodeArenaRecord = function (persisted) {
    return persisted.type === "group" ? fluid.ptf.transformGroupRecord(persisted, decodeArenaRecord) :
        persisted.type === "live" ? fluid.ptf.decodeLiveRecord(persisted, ref => fluid.tldraw.refToSite(ref, infusionInstances)) : persisted;
};

/**
 * Determine the burst key of a site in the arena - writes to the same widget are coalesced into single steps of the
 * history, whichever of its components they are made to. Suitable as `fluid.arenaBurstKey`.
 * @param {String} site - The site, as rendered by `fluid.renderSite`, or the bare component reference `{path}`
 * @return {String} The id of the shape hosting the widget holding the site, or the site's component if it is in none
 */
export const widgetBurstKey = function (site) {
    return fluid.tldraw.siteToRef(site, infusionInstances)?.shapeId ?? fluid.parseContextReference(site).context;
};

/**
 * Revert the writes of any gesture still in progress for a widget, e.g. a search whose results have yet to arrive,
 * within the parts persisting it - so that the widget is persisted in the settled state it held before the gesture
 * began, rather than in a transient one, e.g. showing a search in progress, which nothing would ever complete once
 * restored. The values to revert to are the old values of the step the gesture is writing to `fluid.liveHistory`.
 * @param {String} shapeId - The id of the shape hosting the widget
 * @param {PTFPart[]} parts - The parts of the widget's component, as assembled by `fluid.ptf.componentToParts`
 * @return {PTFPart[]} The parts, with the live parts holding the widget's settled state
 */
const settledParts = function (shapeId, parts) {
    const step = fluid.liveHistory.records.get().find(record => record.key === shapeId && isInFlight(record));
    const reverts = step ? step.records.filter(record => record.type === "live" && record.ref?.shapeId === shapeId) : [];
    return reverts.length === 0 ? parts : parts.map(part => {
        const forPart = reverts.filter(record => part.kind === "live" && record.ref.component === part.filename);
        let togo = part;
        if (forPart.length > 0) {
            const live = JSON.parse(part.body);
            forPart.forEach(record => {
                const amenable = fluid.ptf.toJSONAmenable(record.oldValue);
                if (amenable === undefined) {
                    delete live[record.ref.path];
                } else {
                    live[record.ref.path] = amenable;
                }
            });
            togo = {...part, body: JSON.stringify(live, null, 4)};
        }
        return togo;
    });
};

/**
 * Assemble the part persisting a widget - a nested document of kind "component" whose filename is the id of the shape
 * hosting it, as in the workspace sent to the AI. It holds a part of kind "shape" recording the widget's layer and the
 * geometry of its shape, followed by the parts of its component, in their settled state, from which it is regenerated -
 * or, for a widget still to be constructed, those from which it is to be constructed.
 * @param {TLShape} shape - The shape hosting the widget
 * @return {PTFPart} The part
 */
const widgetToPart = function (shape) {
    const that = infusionInstances.get(shape.id);
    const componentParts = that ? settledParts(shape.id, fluid.ptf.componentToParts(that)) : lookupPendingParts(shape.meta.ptfToken) || [];
    const {x, y, rotation, index, parentId, props: {layerName, w, h}} = shape;
    const geometry = {layerName, x, y, w, h, rotation, index, ...(parentId.startsWith("shape:") ? {parentId} : {})};
    return {
        kind: "component",
        filename: shape.id,
        parts: [{kind: "shape", contentType: "application/json", filename: "shape", body: JSON.stringify(geometry, null, 4)}, ...componentParts]
    };
};

/**
 * Assemble the parts of the PTF document persisting the arena. The canvas's native tldraw shapes are held in a part of
 * kind "tldraw" as for a copy of them, but its widgets are not - each is held in a part of its own, as assembled by
 * `widgetToPart`, from which it is regenerated rather than restored as a tldraw shape. These are followed by a part of
 * kind "history" holding the arena's histories.
 * @param {Editor} editor - The tldraw editor
 * @return {PTFPart[]} The parts
 */
export const arenaToParts = function (editor) {
    const shapes = editor.getCurrentPageShapes();
    const widgets = shapes.filter(shape => shape.type === "infusion");
    const widgetIds = new Set(widgets.map(shape => shape.id));
    const nativeIds = shapes.filter(shape => !widgetIds.has(shape.id)).map(shape => shape.id);
    const copied = nativeIds.length > 0 ? editor.getContentFromCurrentPage(nativeIds) : null;
    // A widget within a native shape, e.g. a frame, is copied as one of its descendants, and is removed again
    const content = copied && {
        ...copied,
        shapes: copied.shapes.filter(shape => !widgetIds.has(shape.id)),
        rootShapeIds: copied.rootShapeIds.filter(id => !widgetIds.has(id)),
        bindings: copied.bindings.filter(binding => !widgetIds.has(binding.fromId) && !widgetIds.has(binding.toId))
    };
    const history = {
        live: fluid.ptf.historyToJSON(fluid.liveHistory, encodeArenaRecord),
        definitions: fluid.ptf.historyToJSON(fluid.definitionHistory)
    };
    const contentPart = {kind: "tldraw", contentType: "application/json", filename: "tldraw-content", body: JSON.stringify(content, null, 4)};
    return [...(content ? [contentPart] : []), ...widgets.map(widgetToPart), {
        kind: "history",
        contentType: "application/json",
        filename: "history",
        body: JSON.stringify(history, null, 4)
    }];
};

/**
 * Determine the source with which each layer redefined or deleted within the arena was left - the new source of its
 * latest redefinition or deletion which is applied, or the old source of its earliest one if all have been undone
 * @param {PersistedHistory} definitions - The persisted definition history
 * @return {Map<String, LayerSource|null>} The source of each such layer, keyed by layer name, or `null` for a layer
 * left deleted
 */
const redefinedSources = function (definitions) {
    const sources = new Map();
    definitions.records.forEach((record, i) => {
        if (i < definitions.index) {
            sources.set(record.layerName, record.newSource);
        } else if (!sources.has(record.layerName)) {
            sources.set(record.layerName, record.oldSource);
        }
    });
    return sources;
};

/**
 * Await the injection of all SFCs imported by the page, so that layers restored over them are not overwritten as
 * they finish loading
 * @return {Promise} A promise which resolves once all injections are complete
 */
const awaitPageInjections = function () {
    const injections = fluid.documentInjections.get(document);
    // A failed injection is reported where it occurs, and is no reason not to restore
    return injections ? fluid.cell.waitFor(injections.injectionsComplete).catch(() => {}) : Promise.resolve();
};

/**
 * Restore a persisted arena onto the canvas. Layers which were redefined within the arena are restored over those
 * loaded by the page, and its native tldraw shapes are restored with their original ids and positions. Each widget is
 * then regenerated from its persisted parts, in a fresh shape with its original id and geometry. Once the widgets
 * have been reconstructed, the arena's histories are restored, with records of widget state referring to the
 * reconstructed components. Nothing restored is recorded in the histories, nor in tldraw's own undo history.
 * @param {Editor} editor - The tldraw editor
 * @param {String|null} text - The persisted PTF document, as loaded by `fluid.persistenceAdapter`
 * @return {Promise<Boolean>} A promise for `true` if an arena was restored
 */
export const restoreArena = async function (editor, text) {
    const parts = text ? fluid.ptf.decode(text) : null;
    let togo = false;
    if (parts === null) {
        console.log("No persisted arena found");
    } else if (fluid.isUnavailable(parts)) {
        console.warn("Ignoring persisted arena which is not a PTF document");
    } else {
        const contentPart = parts.find(part => part.kind === "tldraw");
        const historyPart = parts.find(part => part.kind === "history");
        const history = historyPart ? JSON.parse(historyPart.body) : null;
        let shapeCount = 0;
        if (history) {
            await awaitPageInjections();
            redefinedSources(history.definitions).forEach((source, layerName) => {
                const current = fluid.layerRecToUnavailable(fluid.readLayer(layerName).get()) === null ? fluid.ptf.layerSource(layerName) : null;
                if (source === null && current !== null) {
                    // A layer deleted within the arena, which the page has loaded once more
                    fluid.ptf.deleteLayerQuietly(layerName);
                } else if (source !== null && current?.body !== source.body) {
                    fluid.ptf.registerLayerPartQuietly({kind: "layer", filename: layerName, ...source});
                }
            });
        }
        const componentParts = parts.filter(part => part.kind === "component" && part.parts);
        const instantiations = [];
        if (contentPart) {
            const content = JSON.parse(contentPart.body);
            // An arena persisted before widgets were persisted through their parts alone holds them in its content
            content.shapes.filter(shape => shape.type === "infusion").forEach(shape => {
                const part = componentParts.find(onePart => onePart.filename === shape.id);
                const ptfToken = part ? registerPendingParts(part.parts) : null;
                shape.meta = ptfToken ? {...shape.meta, ptfToken} : shape.meta;
                instantiations.push(...(ptfToken ? [awaitInstantiation(ptfToken)] : []));
            });
            editor.run(() => editor.putContentOntoCurrentPage(content, {preserveIds: true, preservePosition: true, select: false}),
                {history: "ignore"});
            shapeCount += content.shapes.length;
        }
        const widgets = componentParts.map(part => ({part, shapePart: part.parts.find(nested => nested.kind === "shape")}))
            .filter(({part, shapePart}) => shapePart && !editor.getShape(part.filename));
        editor.run(() => editor.createShapes(widgets.map(({part, shapePart}) => {
            const {layerName, x, y, w, h, rotation, index, parentId} = JSON.parse(shapePart.body);
            const widgetParts = part.parts.filter(nested => nested !== shapePart);
            // A widget persisted before it had been constructed, and without parts, is constructed afresh from its layer
            const ptfToken = widgetParts.length > 0 ? registerPendingParts(widgetParts) : null;
            instantiations.push(...(ptfToken ? [awaitInstantiation(ptfToken)] : []));
            return {id: part.filename, type: "infusion", x, y, rotation, index, props: {layerName, w, h}, meta: ptfToken ? {ptfToken} : {},
                // The widget returns to its parent, e.g. a frame, if this has been restored
                ...(parentId && editor.getShape(parentId) ? {parentId} : {})};
        })), {history: "ignore"});
        shapeCount += widgets.length;
        await Promise.all(instantiations.map(awaitReport));
        if (history) {
            fluid.ptf.historyFromJSON(fluid.liveHistory, history.live, decodeArenaRecord);
            fluid.ptf.historyFromJSON(fluid.definitionHistory, history.definitions);
        }
        console.log(`Restored arena with ${shapeCount} shapes`);
        togo = true;
    }
    return togo;
};

/**
 * Begin saving the arena through `fluid.persistenceAdapter` whenever it changes - shortly after any change to the
 * canvas's document or to the arena's histories, on a regular check for any other changes, and as the page is hidden.
 * The arena is only written when its content has changed since it was last saved.
 * @param {Editor} editor - The tldraw editor
 * @return {Function} A function which stops saving the arena, saving it a final time
 */
export const persistArena = function (editor) {
    let lastSaved = null;
    let timer = null;
    const save = function () {
        clearTimeout(timer);
        timer = null;
        const parts = arenaToParts(editor);
        // Compared before encoding, since each encoding allocates fresh boundaries
        const signature = JSON.stringify(parts);
        if (signature !== lastSaved) {
            fluid.persistenceAdapter.save(fluid.ptf.encode(parts, arenaPreamble));
            lastSaved = signature;
        }
    };
    const schedule = function () {
        if (timer === null) {
            timer = setTimeout(save, saveDelay);
        }
    };
    const onVisibilityChange = function () {
        if (document.visibilityState === "hidden") {
            save();
        }
    };
    const stopListening = editor.store.listen(schedule, {scope: "document", source: "all"});
    const historyEffect = fluid.cell.effect(schedule, [fluid.liveHistory.records, fluid.liveHistory.index,
        fluid.definitionHistory.records, fluid.definitionHistory.index], {name: "Arena persistence on history change", isFree: true});
    const interval = setInterval(save, saveCheckInterval);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", save);
    return () => {
        save();
        stopListening();
        historyEffect.dispose();
        clearInterval(interval);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        window.removeEventListener("pagehide", save);
    };
};

/**
 * Bind the keyboard shortcuts of the history commands described by `fluid.tldraw.historyCommands`, in place of
 * tldraw's own undo and redo shortcuts - tldraw's undo and redo remain available from its toolbar. A shortcut typed
 * whilst editing text, e.g. in a widget's input or a note being edited, is left to the browser.
 * @return {Function} A function which unbinds the shortcuts
 */
export const bindHistoryKeys = function () {
    const isApple = fluid.tldraw.isApple();
    const listener = function (event) {
        const command = fluid.tldraw.commandForKey(event, isApple);
        if (command && !fluid.tldraw.isTextEditing(document.activeElement)) {
            // Captured before tldraw's own handlers, which are attached to the document
            event.preventDefault();
            event.stopPropagation();
            fluid.tldraw.runHistoryCommand(command);
        }
    };
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
};
