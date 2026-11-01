/* global QUnit */

"use strict";

fluid.registerNamespace("fluid.tests.resizeBar");

QUnit.module("fluid.resizeBar Tests");

QUnit.config.reorder = false;

fluid.tests.resizeBar.url = new URL("../../../../src/components/sfc/fluid-resizeBar.vue", document.location.href).href;

/**
 * Fetch and load the resize bar's SFC, and subscribe the current document to its injections. Loading happens only once
 * across all tests.
 * @return {Promise} A promise which resolves once the SFC's injections are complete
 */
fluid.tests.resizeBar.load = function () {
    if (!fluid.tests.resizeBar.loadPromise) {
        fluid.loadSFC("fluid.resizeBar", fluid.tests.resizeBar.url);
        const injDone = fluid.subscribeDocToInjections("fluid.resizeBar", document);
        fluid.tests.resizeBar.loadPromise = fluid.cell.waitFor(injDone);
    }
    return fluid.tests.resizeBar.loadPromise;
};

/**
 * Construct a stand-in for an element of fixed size, with no layout of its own, so that the bar's geometry may be
 * tested identically in any DOM
 * @param {Number} width - The element's width in pixels
 * @param {Number} height - The element's height in pixels
 * @return {Object} The stand-in element
 */
fluid.tests.resizeBar.fakeElement = function (width, height) {
    return {
        width, height,
        style: {},
        getBoundingClientRect() {
            return {width: this.width, height: this.height};
        }
    };
};

/**
 * Construct stand-ins for a bar between two elements, within a parent of the supplied layout
 * @param {Object} options - The layout
 * @param {String} options.display - The parent's computed display style, e.g. "flex" or "block"
 * @param {String} [options.axis] - "horizontal" (the default) or "vertical"
 * @return {Object} A record holding stand-ins for the `bar`, its `before` and `after` elements, its `parent` and the `body`
 */
fluid.tests.resizeBar.fakeLayout = function (options) {
    const body = {style: {}};
    const parent = {
        clientWidth: 904, // 300 + 4 + 600
        clientHeight: 504, // 100 + 4 + 400
        ownerDocument: {
            body,
            defaultView: {
                getComputedStyle: () => ({display: options.display, paddingLeft: "0px", paddingRight: "0px", paddingTop: "0px", paddingBottom: "0px"})
            }
        }
    };
    const classes = new Set();
    const bar = {
        parentElement: parent,
        ownerDocument: parent.ownerDocument,
        listeners: {},
        captured: null,
        classList: {
            add: name => classes.add(name),
            remove: name => classes.delete(name),
            contains: name => classes.has(name)
        },
        setPointerCapture(pointerId) {
            this.captured = pointerId;
        },
        addEventListener(event, handler) {
            this.listeners[event] = handler;
        },
        removeEventListener(event, handler) {
            if (this.listeners[event] === handler) {
                delete this.listeners[event];
            }
        }
    };
    const horizontal = options.axis !== "vertical";
    const before = horizontal ? fluid.tests.resizeBar.fakeElement(300, 100) : fluid.tests.resizeBar.fakeElement(100, 100);
    const after = horizontal ? fluid.tests.resizeBar.fakeElement(600, 100) : fluid.tests.resizeBar.fakeElement(100, 400);
    return {bar, before, after, parent, body};
};

/**
 * Construct a pointer or key event, recording whether its default was prevented
 * @param {Object} fields - The fields of the event
 * @return {Object} The event
 */
fluid.tests.resizeBar.event = function (fields) {
    return {
        button: 0,
        pointerId: 7,
        ...fields,
        prevented: false,
        preventDefault() {
            this.prevented = true;
        }
    };
};

/**
 * Drag the bar from its position by an offset along the horizontal axis
 * @param {Object} layout - The stand-in layout, as returned from `fluid.tests.resizeBar.fakeLayout`
 * @param {Number} offset - The distance to drag the bar, in pixels
 */
fluid.tests.resizeBar.drag = function (layout, offset) {
    const listeners = layout.bar.listeners;
    listeners.pointerdown(fluid.tests.resizeBar.event({clientX: 300, clientY: 100}));
    listeners.pointermove(fluid.tests.resizeBar.event({clientX: 300 + offset, clientY: 100 + offset}));
    listeners.pointerup(fluid.tests.resizeBar.event({}));
};

QUnit.test("Dragging the bar writes flex bases in percentages of the parent", async function (assert) {
    await fluid.tests.resizeBar.load();
    const layout = fluid.tests.resizeBar.fakeLayout({display: "flex"});
    const controller = fluid.resizeBar.bind(layout.bar, layout.before, layout.after, "horizontal", 48, 48);
    assert.deepEqual(Object.keys(layout.bar.listeners).sort(), ["keydown", "pointercancel", "pointerdown", "pointermove", "pointerup"],
        "Listeners bound to the bar");

    const down = fluid.tests.resizeBar.event({clientX: 300});
    layout.bar.listeners.pointerdown(down);
    assert.ok(down.prevented, "Default action of the press prevented");
    assert.equal(layout.bar.captured, 7, "Pointer captured by the bar");
    assert.ok(layout.bar.classList.contains("fl-resize-bar-active"), "Bar marked active during the drag");
    assert.equal(layout.body.style.cursor, "col-resize", "Cursor held across the document during the drag");
    assert.equal(layout.body.style.userSelect, "none", "Selection suppressed during the drag");

    layout.bar.listeners.pointermove(fluid.tests.resizeBar.event({clientX: 200}));
    assert.equal(layout.before.style.flexBasis, (200 / 904 * 100).toFixed(4) + "%", "Before element's basis written as a percentage of the parent");
    assert.equal(layout.after.style.flexBasis, (700 / 904 * 100).toFixed(4) + "%", "After element takes up the remainder");
    assert.equal(layout.before.style.flexGrow, "0", "Before element no longer grows");
    assert.equal(layout.after.style.flexGrow, "0", "After element no longer grows");
    assert.equal(layout.before.style.width, undefined, "No width written within a flex container");

    layout.bar.listeners.pointerup(fluid.tests.resizeBar.event({}));
    assert.notOk(layout.bar.classList.contains("fl-resize-bar-active"), "Bar no longer active");
    assert.equal(layout.body.style.cursor, "", "Document's cursor restored");
    assert.equal(layout.body.style.userSelect, "", "Document's selection restored");

    layout.bar.listeners.pointermove(fluid.tests.resizeBar.event({clientX: 100}));
    assert.equal(layout.before.style.flexBasis, (200 / 904 * 100).toFixed(4) + "%", "Pointer moves after the drag are ignored");

    fluid.resizeBar.unbind(controller);
    assert.deepEqual(Object.keys(layout.bar.listeners), [], "Listeners removed on unbinding");
});

QUnit.test("Sizes are clamped to the minimum of each element", async function (assert) {
    await fluid.tests.resizeBar.load();
    const layout = fluid.tests.resizeBar.fakeLayout({display: "flex"});
    fluid.resizeBar.bind(layout.bar, layout.before, layout.after, "horizontal", 100, 200);
    fluid.tests.resizeBar.drag(layout, -1000);
    assert.equal(layout.before.style.flexBasis, (100 / 904 * 100).toFixed(4) + "%", "Before element held at its minimum");
    assert.equal(layout.after.style.flexBasis, (800 / 904 * 100).toFixed(4) + "%", "After element takes the rest");
    fluid.tests.resizeBar.drag(layout, 1000);
    assert.equal(layout.after.style.flexBasis, (200 / 904 * 100).toFixed(4) + "%", "After element held at its minimum");
});

QUnit.test("Outside a flex container, widths are written, and a vertical bar writes heights", async function (assert) {
    await fluid.tests.resizeBar.load();
    const layout = fluid.tests.resizeBar.fakeLayout({display: "block"});
    fluid.resizeBar.bind(layout.bar, layout.before, layout.after, "horizontal", 48, 48);
    fluid.tests.resizeBar.drag(layout, 100);
    assert.equal(layout.before.style.width, (400 / 904 * 100).toFixed(4) + "%", "Width of before element written");
    assert.equal(layout.after.style.width, (500 / 904 * 100).toFixed(4) + "%", "Width of after element written");
    assert.equal(layout.before.style.flexBasis, undefined, "No basis written outside a flex container");

    const vertical = fluid.tests.resizeBar.fakeLayout({display: "block", axis: "vertical"});
    fluid.resizeBar.bind(vertical.bar, vertical.before, vertical.after, "vertical", 48, 48);
    vertical.bar.listeners.pointerdown(fluid.tests.resizeBar.event({clientX: 0, clientY: 100}));
    assert.equal(vertical.body.style.cursor, "row-resize", "Vertical bar holds the row cursor");
    vertical.bar.listeners.pointermove(fluid.tests.resizeBar.event({clientX: 500, clientY: 150}));
    assert.equal(vertical.before.style.height, (150 / 504 * 100).toFixed(4) + "%", "Height of before element follows the vertical pointer position");
    assert.equal(vertical.after.style.height, (350 / 504 * 100).toFixed(4) + "%", "Height of after element written");
    assert.equal(vertical.before.style.width, undefined, "No width written by a vertical bar");
});

QUnit.test("Only the primary button starts a drag", async function (assert) {
    await fluid.tests.resizeBar.load();
    const layout = fluid.tests.resizeBar.fakeLayout({display: "flex"});
    fluid.resizeBar.bind(layout.bar, layout.before, layout.after, "horizontal", 48, 48);
    const down = fluid.tests.resizeBar.event({clientX: 300, button: 2});
    layout.bar.listeners.pointerdown(down);
    layout.bar.listeners.pointermove(fluid.tests.resizeBar.event({clientX: 200}));
    assert.notOk(down.prevented, "Press of another button left alone");
    assert.equal(layout.before.style.flexBasis, undefined, "No resize from a press of another button");
});

QUnit.test("The arrow keys along the bar's axis nudge it", async function (assert) {
    await fluid.tests.resizeBar.load();
    const layout = fluid.tests.resizeBar.fakeLayout({display: "flex"});
    fluid.resizeBar.bind(layout.bar, layout.before, layout.after, "horizontal", 48, 48);
    const keydown = layout.bar.listeners.keydown;
    const right = fluid.tests.resizeBar.event({key: "ArrowRight"});
    keydown(right);
    assert.ok(right.prevented, "Default action of the key prevented");
    assert.equal(layout.before.style.flexBasis, (316 / 904 * 100).toFixed(4) + "%", "ArrowRight grows the before element by 16 pixels");
    keydown(fluid.tests.resizeBar.event({key: "ArrowLeft", shiftKey: true}));
    assert.equal(layout.before.style.flexBasis, (296 / 904 * 100).toFixed(4) + "%",
        "Shift+ArrowLeft shrinks by 4 pixels, from the rendered size, which stand-ins do not update");
    const up = fluid.tests.resizeBar.event({key: "ArrowUp"});
    keydown(up);
    assert.notOk(up.prevented, "Arrow key across the bar's axis left alone");
});

fluid.tests.resizeBar.panes = () => ({
    before: document.querySelector(".panes .before"),
    after: document.querySelector(".panes .after"),
    holder: document.querySelector(".panes .bar-holder")
});

QUnit.test("The bar is rendered as a separator and bound to its elements", async function (assert) {
    await fluid.tests.resizeBar.load();
    const {before, after, holder} = fluid.tests.resizeBar.panes();
    const that = fluid.resizeBar({
        before, after,
        minBefore: 100,
        view: {
            $component: {
                container: holder,
                elideParent: true
            }
        }
    });
    fluid.cell.stabilize();
    assert.ok(holder.classList.contains("fl-resize-bar"), "Bar rendered into its container");
    assert.ok(holder.classList.contains("fl-resize-bar-horizontal"), "Bar marked with its axis");
    assert.equal(holder.getAttribute("role"), "separator", "Bar is a separator");
    assert.equal(holder.getAttribute("aria-orientation"), "vertical", "Bar dividing elements side by side is oriented vertically");
    assert.equal(holder.getAttribute("tabindex"), "0", "Bar may be focused");
    const controller = that.controller;
    assert.equal(controller.bar, holder, "Controller bound to the rendered bar");
    assert.equal(controller.before, before, "Controller bound to the before element");
    assert.equal(controller.minBefore, 100, "Configured minimum supplied to the controller");

    that.axis = "vertical";
    fluid.cell.stabilize();
    assert.equal(holder.getAttribute("aria-orientation"), "horizontal", "Orientation follows a change of axis");
    assert.equal(that.controller.isHorizontal, false, "Controller rebound for the new axis");
    that.destroy();
});

QUnit.test("A key press resizes elements laid out by the browser", async function (assert) {
    await fluid.tests.resizeBar.load();
    const {before, after, holder} = fluid.tests.resizeBar.panes();
    // linkedom, as used by npm test, has no layout - this test is run in a browser by npm run test:browser-qunit
    if (before.getBoundingClientRect().width > 0) {
        const that = fluid.resizeBar({
            before, after,
            view: {
                $component: {
                    container: holder,
                    elideParent: true
                }
            }
        });
        fluid.cell.stabilize();
        const startBefore = before.getBoundingClientRect().width;
        const startAfter = after.getBoundingClientRect().width;
        holder.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowRight", bubbles: true}));
        assert.equal(Math.round(before.getBoundingClientRect().width), Math.round(startBefore + 16), "Before element grown by 16 pixels");
        assert.equal(Math.round(after.getBoundingClientRect().width), Math.round(startAfter - 16), "After element shrunk by 16 pixels");
        that.destroy();
    } else {
        assert.ok(true, "This DOM has no layout, so resizing laid out elements cannot be tested - run in a browser");
    }
});
