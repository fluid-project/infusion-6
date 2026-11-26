/*
Copyright 2017-2026 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

"use strict";

// Tooltips which follow the pointer, placed by Popper lite (src/lib/popper/popper-lite.min.js, @popperjs/core's
// popper-lite.js) against a virtual element at the pointer - ported from hortis.withTooltip and hortis.titleTooltips of
// imerss-bioinfo's src/client/js/i6/tooltip.js. fluid.titleTooltips shows the title of whatever element is hovered
// within its scope in a tooltip of its own, in place of the browser's, which is slow to appear and can't be styled.
// Without Popper, a tooltip is placed at the pointer by its own styles.

fluid.registerNamespace("fluid.tooltip");

// Distance in pixels of the tooltip from the pointer
fluid.tooltip.pointerOffset = {x: 12, y: 8};

// Least distance in pixels to keep between the tooltip and the window's edge
fluid.tooltip.windowMargin = 8;

/**
 * Displace a tooltip from the pointer, flipping it to the pointer's left if it would overflow the window's right
 * edge, and lifting it if it would overflow the bottom. Popper lite omits the offset, flip and preventOverflow
 * modifiers, so this does the work of all three for a tooltip at the pointer.
 * @param {Object} options - Popper's arguments to a modifier
 * @param {Object} options.state - Popper's state, whose `modifiersData.popperOffsets` are adjusted in place
 */
fluid.tooltip.placeAtPointer = function ({state}) {
    const offsets = state.modifiersData.popperOffsets;
    if (offsets) {
        const {x: dx, y: dy} = fluid.tooltip.pointerOffset;
        const {width, height} = state.rects.popper;
        const window = state.elements.popper.ownerDocument.defaultView;
        const margin = fluid.tooltip.windowMargin;
        offsets.x = offsets.x + dx + width + margin <= window.innerWidth ?
            offsets.x + dx : Math.max(margin, offsets.x - dx - width);
        offsets.y = offsets.y + dy + height + margin <= window.innerHeight ?
            offsets.y + dy : Math.max(margin, window.innerHeight - height - margin);
    }
};

fluid.tooltip.pointerOffsetModifier = {
    name: "pointerOffset",
    enabled: true,
    phase: "main",
    requires: ["popperOffsets"],
    fn: fluid.tooltip.placeAtPointer
};

/**
 * A tooltip's element, the virtual element at the pointer against which it is placed, and the Popper instance
 * placing it.
 * @typedef {Object} TooltipRecord
 * @property {HTMLElement} node - The tooltip's element
 * @property {Object} anchor - A virtual element whose bounds are the pointer's position, as held at `pos`
 * @property {Object} [popper] - The Popper instance, if Popper is loaded
 */

/**
 * Create a tooltip's element and the Popper instance placing it.
 * @param {Document} dokkument - The document to hold the tooltip
 * @param {Object} global - The global object, which may supply the Popper lite library as `Popper`
 * @param {String} [className] - A further class for the tooltip's element
 * @return {TooltipRecord} The tooltip
 */
fluid.tooltip.make = function (dokkument, global, className) {
    const Popper = global.Popper;
    const node = dokkument.createElement("div");
    node.className = "fl-tooltip-holder" + (className ? " " + className : "");
    node.setAttribute("role", "tooltip");
    node.hidden = true;
    (dokkument.body || dokkument.documentElement).appendChild(node);
    const anchor = {
        pos: {x: 0, y: 0},
        getBoundingClientRect: () => {
            const {x, y} = anchor.pos;
            return {x, y, left: x, top: y, right: x, bottom: y, width: 0, height: 0};
        }
    };
    const popper = Popper ? Popper.createPopper(anchor, node, {
        placement: "bottom-start",
        strategy: "fixed",
        modifiers: [fluid.tooltip.pointerOffsetModifier]
    }) : null;
    return {node, anchor, popper};
};

/**
 * Destroy a tooltip, removing its element
 * @param {TooltipRecord} tooltip - The tooltip
 */
fluid.tooltip.destroy = function (tooltip) {
    tooltip.popper?.destroy();
    tooltip.node.remove();
};

/**
 * Show, place or hide a tooltip holding text
 * @param {TooltipRecord} tooltip - The tooltip
 * @param {String|null} text - The tooltip's text, or null if it is to be hidden
 * @param {Object|null} pos - The pointer's position, as {x, y} in client coordinates
 */
fluid.tooltip.show = function (tooltip, text, pos) {
    const node = tooltip.node;
    if (text && pos) {
        if (node.textContent !== text) {
            node.textContent = text;
        }
        // Kept beside the page's last element, e.g. one appended after it was made, so that it is drawn over it
        if (node.nextSibling) {
            node.parentNode.appendChild(node);
        }
        node.hidden = false;
        tooltip.anchor.pos = pos;
        if (tooltip.popper) {
            tooltip.popper.update();
        } else {
            node.style.position = "fixed";
            node.style.left = (pos.x + fluid.tooltip.pointerOffset.x) + "px";
            node.style.top = (pos.y + fluid.tooltip.pointerOffset.y) + "px";
        }
    } else {
        node.hidden = true;
    }
};

/** Tooltips of elements bearing a title **/

fluid.registerNamespace("fluid.titleTooltips");

/**
 * Find the element whose title is to be shown for a hovered node - the nearest bearing a title, within the scope and
 * not itself within a tooltip.
 * @param {Node} target - The hovered node
 * @param {String} scope - Selector for the elements within which titles are shown
 * @return {Element|null} The titled element, if any
 */
fluid.titleTooltips.titled = function (target, scope) {
    const element = target?.closest ? target.closest("[title], [data-fl-title]") : null;
    return element && element.closest(scope) && !element.closest(".fl-tooltip-holder") ? element : null;
};

/**
 * Take the title of a hovered element into its data-fl-title attribute, so that the browser shows no tooltip of its own.
 * @param {Element} element - The hovered element
 * @return {String} The element's title
 */
fluid.titleTooltips.take = function (element) {
    const title = element.getAttribute("title");
    if (title !== null) {
        element.setAttribute("data-fl-title", title);
        element.removeAttribute("title");
    }
    return element.getAttribute("data-fl-title");
};

/**
 * Restore the title of an element no longer hovered, unless it has been given a new one in the meantime.
 * @param {Element} element - The element
 */
fluid.titleTooltips.restore = function (element) {
    const title = element.getAttribute("data-fl-title");
    if (title !== null && element.getAttribute("title") === null) {
        element.setAttribute("title", title);
    }
    element.removeAttribute("data-fl-title");
};

/**
 * Show the titles of hovered elements within a scope as tooltips placed by Popper. Whilst an element is hovered, its
 * title is held in its attribute data-fl-title, so that the browser shows nothing, and it is restored once the pointer
 * leaves. The tooltip is hidden on scrolling, since it would otherwise be left where the element was, and on pressing.
 * A tooltip is shown a little after the pointer comes to an element, so that one is not flashed up on every element
 * the pointer crosses.
 * @param {Document} dokkument - The document
 * @param {String} scope - Selector for the elements within which titles are shown
 * @param {Object} [options] - `{className, global, delay}` - a further class for the tooltip's element, the global
 * object supplying Popper, and the delay in ms before a tooltip is shown
 * @return {Object} A record of the listeners, to be supplied to `fluid.titleTooltips.unbind`
 */
fluid.titleTooltips.bind = function (dokkument, scope, options = {}) {
    const tooltip = fluid.tooltip.make(dokkument, options.global || dokkument.defaultView || {}, options.className);
    const delay = options.delay === undefined ? 300 : options.delay;
    const record = {dokkument, tooltip, current: null, pos: null, timer: null, shown: false};
    const show = () => {
        record.shown = true;
        fluid.tooltip.show(tooltip, record.current ? record.current.getAttribute("data-fl-title") : null, record.pos);
    };
    const leave = () => {
        clearTimeout(record.timer);
        if (record.current) {
            fluid.titleTooltips.restore(record.current);
            record.current = null;
        }
        record.shown = false;
        fluid.tooltip.show(tooltip, null, null);
    };
    record.over = event => {
        const element = fluid.titleTooltips.titled(event.target, scope);
        if (element !== record.current) {
            leave();
            if (element) {
                record.current = element;
                record.pos = {x: event.clientX, y: event.clientY};
                if (fluid.titleTooltips.take(element)) {
                    record.timer = setTimeout(show, delay);
                }
            }
        }
    };
    record.move = event => {
        if (record.current) {
            record.pos = {x: event.clientX, y: event.clientY};
            if (record.shown) {
                show();
            }
        }
    };
    record.out = event => {
        if (record.current && !(event.relatedTarget && record.current.contains(event.relatedTarget))) {
            leave();
        }
    };
    record.leave = leave;
    dokkument.addEventListener("mouseover", record.over);
    dokkument.addEventListener("mousemove", record.move);
    dokkument.addEventListener("mouseout", record.out);
    dokkument.addEventListener("scroll", leave, true);
    dokkument.addEventListener("mousedown", leave, true);
    return record;
};

/**
 * Cease showing titles as tooltips, removing the tooltip's element
 * @param {Object} record - The record returned by `fluid.titleTooltips.bind`
 */
fluid.titleTooltips.unbind = function (record) {
    record.leave();
    record.dokkument.removeEventListener("mouseover", record.over);
    record.dokkument.removeEventListener("mousemove", record.move);
    record.dokkument.removeEventListener("mouseout", record.out);
    record.dokkument.removeEventListener("scroll", record.leave, true);
    record.dokkument.removeEventListener("mousedown", record.leave, true);
    fluid.tooltip.destroy(record.tooltip);
};
