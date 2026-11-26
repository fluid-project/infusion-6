import {contentToParts, ptfPreamble} from "./tldraw-clipboard.js";

// Dragging a widget out of the arena, onto another page or application, as the PTF document a copy of it would put on
// the clipboard - see a-scratch/reports/dragging-widgets-out.md. A shape's ordinary gestures are tldraw's, which drives
// them with pointer events and marks its shapes as not natively draggable. So a press over a widget with Shift held is
// kept from tldraw, and the element pressed made natively draggable while it lasts: if the pointer moves, the browser
// begins a native drag carrying the widget's PTF;
// if it is released without moving, what tldraw would have made of the Shift-click is done here instead - the shape is
// added to the selection or removed from it. The cost is tldraw's Shift-drag of a widget, constraining its move to one
// axis, which may still be had by pressing Shift once the move is under way.

// The type under which the PTF document is carried - a type of its own, read only by a drop which understands it, as
// Chrome carries custom types between its pages, though not to other applications
export const ptfDragType = "application/x-ptf";

/**
 * Find the shape of the arena's widget over which a pointer gesture begins, and its element, if the gesture is to drag
 * the widget out - the primary button is pressed on the widget's grip (see DragGrip in tldraw-driver.js), or with Shift
 * held, and the gesture is not one which belongs to the
 * widget, e.g. editing text within it, or pressing one of its buttons
 * @param {PointerEvent} event - The pointerdown
 * @return {Object|null} `{shapeId, element, draggable, grip}` - the id of the widget's shape, its element, made
 * draggable, the value its `draggable` attribute had, and `true` if it is the widget's grip - or `null`
 */
fluid.tldraw.dragOutTarget = function (event) {
    let togo = null;
    const grip = event.target instanceof Element ? event.target.closest(".fl-tldraw-drag-grip") : null;
    if (grip && event.button === 0) {
        const shapeElement = grip.closest(".tl-shape[data-shape-type='infusion']");
        togo = shapeElement ? {shapeId: shapeElement.getAttribute("data-shape-id"), element: grip, draggable: grip.getAttribute("draggable"), grip: true} : null;
    } else if (event.shiftKey && event.button === 0 && event.target instanceof Element) {
        const shapeElement = event.target.closest(".tl-shape[data-shape-type='infusion']");
        // The element pressed is itself made draggable, since what forbids its text being selected must be lifted from
        // it too - see onPointerDown in bindDragOut
        const element = shapeElement && event.target;
        if (element && !fluid.tldraw.isTextEditing(event.target) && !fluid.tldraw.isInteractiveTarget(event.target, shapeElement)) {
            togo = {shapeId: shapeElement.getAttribute("data-shape-id"), element, draggable: element.getAttribute("draggable")};
        }
    }
    return togo;
};

/**
 * Encode a widget dragged out of the arena as PTF, as its copy would be, but without where its shape stood in the
 * arena, which means nothing where it is dropped
 * @param {TLContent} content - The content of the widget's shape
 * @return {String} The text of the PTF document
 */
fluid.tldraw.dragOutPTF = function (content) {
    const parts = contentToParts(content).map(part => part.kind === "component" && part.parts ?
        {...part, parts: fluid.tldraw.writeShapeConfig(part.parts, null, null)} : part);
    return fluid.ptf.encode(parts, ptfPreamble);
};

/**
 * Add a shape to the editor's selection or remove it, as tldraw does on a Shift-click
 * @param {Editor} editor - The tldraw editor
 * @param {String} shapeId - The id of the shape
 */
fluid.tldraw.toggleSelected = function (editor, shapeId) {
    const selected = editor.getSelectedShapeIds();
    if (selected.includes(shapeId)) {
        editor.setSelectedShapes(selected.filter(id => id !== shapeId));
    } else {
        editor.setSelectedShapes([...selected, shapeId]);
    }
};

/**
 * Let the user drag widgets out of the arena with Shift held, carrying each as the PTF document its copy would be
 * @param {Editor} editor - The tldraw editor
 * @return {Function} A function unbinding the listeners
 */
export const bindDragOut = function (editor) {
    let pending = null;
    const release = () => {
        if (pending) {
            // tldraw marks its shapes as not draggable, which they become again
            if (pending.draggable === null) {
                pending.element.removeAttribute("draggable");
            } else {
                pending.element.setAttribute("draggable", pending.draggable);
            }
            pending.element.style.removeProperty("-webkit-user-drag");
            pending.element.style.removeProperty("user-select");
            pending = null;
        }
    };
    // Bound in the capture phase on the window, so as to precede tldraw's own listeners
    const onPointerDown = event => {
        release();
        pending = fluid.tldraw.dragOutTarget(event);
        if (pending) {
            pending.element.setAttribute("draggable", "true");
            // tldraw's style forbids dragging its shapes natively, which would otherwise override the attribute
            pending.element.style.setProperty("-webkit-user-drag", "element");
            // Chrome takes a Shift-press on text which may not be selected, as tldraw makes all its shapes', as extending
            // a selection rather than beginning a drag - though it does begin one from text which may be
            pending.element.style.setProperty("user-select", "auto");
            event.stopPropagation();
        }
    };
    // A press kept from tldraw is kept from it throughout, as is its release - which, if no drag began, is a Shift-click
    const onPointerUp = event => {
        if (pending) {
            event.stopPropagation();
            // A press on the grip which drags nothing selects the widget, as a click on it would
            if (!pending.dragging && pending.grip) {
                editor.select(pending.shapeId);
            } else if (!pending.dragging) {
                fluid.tldraw.toggleSelected(editor, pending.shapeId);
            }
        }
        release();
    };
    const onPointerMove = event => {
        if (pending) {
            event.stopPropagation();
        }
    };
    // tldraw captures the pointer to its canvas on a press it receives, which would forbid the browser beginning a native
    // drag - should it capture one kept from it, the capture is released
    const onGotCapture = event => {
        if (pending && event.target instanceof Element) {
            event.target.releasePointerCapture(event.pointerId);
        }
    };
    const onDragStart = event => {
        if (pending && event.target === pending.element) {
            const content = editor.getContentFromCurrentPage([pending.shapeId]);
            if (content) {
                pending.dragging = true;
                event.dataTransfer.setData(ptfDragType, fluid.tldraw.dragOutPTF(content));
                event.dataTransfer.effectAllowed = "copy";
                // What is dragged is pictured as the whole of the widget's shape, from the point at which it was pressed
                const frame = pending.element.closest(".tl-html-container") || pending.element;
                const rect = frame.getBoundingClientRect();
                event.dataTransfer.setDragImage(frame, event.clientX - rect.left, event.clientY - rect.top);
            } else {
                event.preventDefault();
            }
        }
    };
    const listeners = {pointerdown: onPointerDown, pointerup: onPointerUp, pointermove: onPointerMove, gotpointercapture: onGotCapture,
        dragstart: onDragStart, dragend: release};
    Object.entries(listeners).forEach(([type, listener]) => window.addEventListener(type, listener, true));
    return () => {
        release();
        Object.entries(listeners).forEach(([type, listener]) => window.removeEventListener(type, listener, true));
    };
};
