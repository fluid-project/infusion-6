<script>
/**
 * A bar which may be dragged, or nudged with the arrow keys, to share the space between the elements on either side
 * of it. Ported from the hortis.resizeBar component of bagatelle.
 *
 * The bar renders into its own view container, which its creator should position between the elements supplied as
 * `before` and `after`. Sizes are written to these as percentages of the space they share, so that their ratio is
 * preserved if their container is later resized. If their container is a flex container, the sizes are written as
 * `flex-basis` with `flex-grow` of 0, leaving `flex-shrink` alone so that the bar's own size is absorbed by the panes -
 * otherwise they are written as `width` or `height`.
 */
fluid.def("fluid.resizeBar", {
    $layers: "fluid.component",
    // {Element} The element before the bar - must be supplied by the creator
    before: fluid.unavailable({cause: "Element before resize bar not configured", variety: "config"}),
    // {Element} The element after the bar - must be supplied by the creator
    after: fluid.unavailable({cause: "Element after resize bar not configured", variety: "config"}),
    // "horizontal" for a bar dividing elements laid out side by side, or "vertical" for one dividing a stack
    axis: "horizontal",
    // Minimum size in pixels of the before element
    minBefore: 48,
    // Minimum size in pixels of the after element
    minAfter: 48,
    // The orientation of the bar itself, which is perpendicular to the axis along which it resizes
    orientation: {
        $compute: {
            func: axis => axis === "horizontal" ? "vertical" : "horizontal",
            args: "{self}.axis"
        }
    },
    // Drag state is held outside the reactive system so that dragging the bar is not recorded in history
    controller: {
        $bindable: {
            bind: "fluid.resizeBar.bind({self}.view.renderedContainer, {self}.before, {self}.after, {self}.axis, {self}.minBefore, {self}.minAfter)",
            unbind: "fluid.resizeBar.unbind({boundValue})"
        }
    },
    $variety: "frameworkAux"
});

/**
 * @typedef {Object} ResizeBarController
 * @property {Element} bar - The element of the bar
 * @property {Element} before - The element before the bar
 * @property {Element} after - The element after the bar
 * @property {Boolean} isHorizontal - `true` if the bar divides elements laid out side by side
 * @property {Number} minBefore - Minimum size in pixels of the before element
 * @property {Number} minAfter - Minimum size in pixels of the after element
 * @property {Object<String, Function>} listeners - The listeners bound to the bar, keyed by event name
 * @property {Object} dragState - The state of any drag in progress, holding `active`, and the pointer position
 * `startPos` and sizes in pixels `startBefore` and `startAfter` captured when it started
 */

/**
 * Bind listeners to the rendered bar, returning a controller holding the state of any drag
 * @param {Element} bar - The element of the bar
 * @param {Element} before - The element before the bar
 * @param {Element} after - The element after the bar
 * @param {String} axis - "horizontal" or "vertical"
 * @param {Number} minBefore - Minimum size in pixels of the before element
 * @param {Number} minAfter - Minimum size in pixels of the after element
 * @return {ResizeBarController} The controller for the bar
 */
fluid.resizeBar.bind = function (bar, before, after, axis, minBefore, minAfter) {
    const controller = {
        bar, before, after, minBefore, minAfter,
        isHorizontal: axis === "horizontal",
        dragState: {
            active: false,
            startPos: 0,
            startBefore: 0,
            startAfter: 0
        }
    };
    controller.listeners = {
        pointerdown: e => fluid.resizeBar.pointerDown(controller, e),
        pointermove: e => fluid.resizeBar.pointerMove(controller, e),
        pointerup: () => fluid.resizeBar.pointerUp(controller),
        pointercancel: () => fluid.resizeBar.pointerUp(controller),
        keydown: e => fluid.resizeBar.keyDown(controller, e)
    };
    Object.entries(controller.listeners).forEach(([event, handler]) => bar.addEventListener(event, handler));
    return controller;
};

/**
 * Remove the listeners bound to the bar, ending any drag in progress
 * @param {ResizeBarController} controller - The controller for the bar
 */
fluid.resizeBar.unbind = function (controller) {
    fluid.resizeBar.pointerUp(controller);
    Object.entries(controller.listeners).forEach(([event, handler]) => controller.bar.removeEventListener(event, handler));
};

/**
 * Measure the rendered size of an element along the bar's axis
 * @param {ResizeBarController} controller - The controller for the bar
 * @param {Element} element - The element to be measured
 * @return {Number} The element's size in pixels
 */
fluid.resizeBar.sizeOf = function (controller, element) {
    const rect = element.getBoundingClientRect();
    return controller.isHorizontal ? rect.width : rect.height;
};

/**
 * Capture the current sizes of the elements on either side of the bar, against which a drag or nudge is applied
 * @param {ResizeBarController} controller - The controller for the bar
 */
fluid.resizeBar.captureSizes = function (controller) {
    controller.dragState.startBefore = fluid.resizeBar.sizeOf(controller, controller.before);
    controller.dragState.startAfter = fluid.resizeBar.sizeOf(controller, controller.after);
};

/**
 * Write new sizes to the elements on either side of the bar, as percentages of the size of the content box of the
 * bar's parent, against which percentage sizes of its children resolve
 * @param {ResizeBarController} controller - The controller for the bar
 * @param {Number} newBefore - The new size in pixels of the before element
 * @param {Number} newAfter - The new size in pixels of the after element
 */
fluid.resizeBar.applySize = function (controller, newBefore, newAfter) {
    const parent = controller.bar.parentElement;
    const parentStyle = parent.ownerDocument.defaultView.getComputedStyle(parent);
    const isFlex = parentStyle.display.includes("flex");
    const dimension = controller.isHorizontal ? "width" : "height";
    const padding = controller.isHorizontal ? ["paddingLeft", "paddingRight"] : ["paddingTop", "paddingBottom"];
    const parentSize = (controller.isHorizontal ? parent.clientWidth : parent.clientHeight) -
        padding.reduce((sum, side) => sum + parseFloat(parentStyle[side]), 0);
    [[controller.before, newBefore], [controller.after, newAfter]].forEach(([element, size]) => {
        const percent = (size / parentSize * 100).toFixed(4) + "%";
        if (isFlex) {
            element.style.flexGrow = "0";
            element.style.flexBasis = percent;
        } else {
            element.style[dimension] = percent;
        }
    });
};

/**
 * Clamp a candidate size for the before element so that neither element falls below its minimum size, and apply it
 * @param {ResizeBarController} controller - The controller for the bar
 * @param {Number} rawBefore - The unclamped candidate size in pixels of the before element
 */
fluid.resizeBar.clampAndApply = function (controller, rawBefore) {
    const total = controller.dragState.startBefore + controller.dragState.startAfter;
    const newBefore = Math.min(Math.max(rawBefore, controller.minBefore), total - controller.minAfter);
    fluid.resizeBar.applySize(controller, newBefore, total - newBefore);
};

/**
 * Begin a drag with the primary button, capturing the pointer and the sizes against which the drag is applied
 * @param {ResizeBarController} controller - The controller for the bar
 * @param {PointerEvent} e - The pointerdown event
 */
fluid.resizeBar.pointerDown = function (controller, e) {
    if (e.button === 0) {
        const {bar, dragState} = controller;
        dragState.active = true;
        dragState.startPos = controller.isHorizontal ? e.clientX : e.clientY;
        fluid.resizeBar.captureSizes(controller);
        bar.setPointerCapture(e.pointerId);
        bar.classList.add("fl-resize-bar-active");
        // Hold the cursor and suppress selection over the whole document, which the pointer may leave the bar to cross
        const body = bar.ownerDocument.body;
        body.style.cursor = controller.isHorizontal ? "col-resize" : "row-resize";
        body.style.userSelect = "none";
        e.preventDefault();
    }
};

/**
 * Resize the elements during a drag by the distance the pointer has moved since it started
 * @param {ResizeBarController} controller - The controller for the bar
 * @param {PointerEvent} e - The pointermove event
 */
fluid.resizeBar.pointerMove = function (controller, e) {
    const dragState = controller.dragState;
    if (dragState.active) {
        const pos = controller.isHorizontal ? e.clientX : e.clientY;
        fluid.resizeBar.clampAndApply(controller, dragState.startBefore + pos - dragState.startPos);
    }
};

/**
 * End any drag in progress, restoring the document's cursor and selection
 * @param {ResizeBarController} controller - The controller for the bar
 */
fluid.resizeBar.pointerUp = function (controller) {
    if (controller.dragState.active) {
        controller.dragState.active = false;
        controller.bar.classList.remove("fl-resize-bar-active");
        const body = controller.bar.ownerDocument.body;
        body.style.cursor = "";
        body.style.userSelect = "";
    }
};

/**
 * Nudge the bar by 16 pixels with the arrow keys along its axis, or by 4 pixels with Shift held
 * @param {ResizeBarController} controller - The controller for the bar
 * @param {KeyboardEvent} e - The keydown event
 */
fluid.resizeBar.keyDown = function (controller, e) {
    const shrink = controller.isHorizontal ? "ArrowLeft" : "ArrowUp";
    const grow = controller.isHorizontal ? "ArrowRight" : "ArrowDown";
    if (e.key === shrink || e.key === grow) {
        e.preventDefault();
        const step = e.shiftKey ? 4 : 16;
        // Capture the sizes afresh so that the nudge is relative to the current layout rather than to any earlier drag
        fluid.resizeBar.captureSizes(controller);
        fluid.resizeBar.clampAndApply(controller, controller.dragState.startBefore + (e.key === grow ? step : -step));
    }
};
</script>

<template>
    <div class="fl-resize-bar fl-resize-bar-@{axis}" role="separator" aria-orientation="@{orientation}" tabindex="0" aria-label="Resize panels"></div>
</template>

<style>
.fl-resize-bar {
    flex-shrink: 0;
    position: relative;
    z-index: 5;
    user-select: none;
    -webkit-user-select: none;
    box-sizing: border-box;

    /* The bar takes up only the width of its visible ridge, with a more generous hit target overlapping its neighbours */
    --fl-resize-bar-hit-size: 12px;
    --fl-resize-bar-ridge-width: 4px;
    --fl-resize-bar-colour: rgba(128, 128, 128, 0.35);
    --fl-resize-bar-colour-hover: rgba(128, 128, 128, 0.6);
    --fl-resize-bar-colour-active: rgba(128, 128, 128, 0.8);
}

.fl-resize-bar::before {
    content: "";
    position: absolute;
    inset: 0;
}

.fl-resize-bar-horizontal {
    width: var(--fl-resize-bar-ridge-width);
    cursor: col-resize;
    border-left: var(--fl-resize-bar-ridge-width) ridge var(--fl-resize-bar-colour);
}

.fl-resize-bar-horizontal::before {
    left: calc(var(--fl-resize-bar-ridge-width) / -2 - var(--fl-resize-bar-hit-size) / 2);
    right: calc(var(--fl-resize-bar-ridge-width) / 2 - var(--fl-resize-bar-hit-size) / 2);
}

.fl-resize-bar-vertical {
    height: var(--fl-resize-bar-ridge-width);
    cursor: row-resize;
    border-top: var(--fl-resize-bar-ridge-width) ridge var(--fl-resize-bar-colour);
}

.fl-resize-bar-vertical::before {
    top: calc(var(--fl-resize-bar-ridge-width) / -2 - var(--fl-resize-bar-hit-size) / 2);
    bottom: calc(var(--fl-resize-bar-ridge-width) / 2 - var(--fl-resize-bar-hit-size) / 2);
}

.fl-resize-bar:hover {
    --fl-resize-bar-colour: var(--fl-resize-bar-colour-hover);
}

.fl-resize-bar.fl-resize-bar-active {
    --fl-resize-bar-colour: var(--fl-resize-bar-colour-active);
}

.fl-resize-bar:focus-visible {
    outline: 2px solid Highlight;
    outline-offset: 2px;
}

@media (prefers-color-scheme: dark) {
    .fl-resize-bar {
        --fl-resize-bar-colour: rgba(255, 255, 255, 0.2);
        --fl-resize-bar-colour-hover: rgba(255, 255, 255, 0.4);
        --fl-resize-bar-colour-active: rgba(255, 255, 255, 0.6);
    }
}
</style>
