<script>
/**
 * A dropdown listing layers, e.g. those of the widgets which may be made, each of which may be chosen, or deleted
 * through a trash can at its right, which appears as the pointer passes over it. It stands in for a native select,
 * whose options can't hold buttons. Ported from the LayerPicker of Infusion's tldraw demo.
 *
 * What the user does is announced as DOM events on the picker's element, which bubble: "fluidlayerchoose" {layer} as
 * a layer is chosen, and "fluidlayerdelete" {layer} as one is asked to be deleted - the picker deletes nothing itself.
 * Its creator supplies the layers listed, and the one chosen, which it should update on "fluidlayerchoose".
 */
fluid.def("fluid.layerPicker", {
    $layers: "fluid.viewComponent",
    // {LayerPickerEntry[]} The layers listed, as `{layer, note}`, where `note` describes it beside its name, e.g. "held in
    // this browser" - must be supplied by the creator, as a signal if it changes
    layers: [],
    // {String} The name of the layer chosen, or "" for none
    choice: "",
    // {String} What the button shows when no layers are listed
    emptyText: "No widget layers",
    // {String} The tooltip of the button
    title: "Widget layers",
    state: {
        $reactiveRoot: {
            open: false
        }
    },
    shownChoice: "$compute:fluid.layerPicker.shownChoice({self}.layers, {self}.choice, {self}.emptyText)",
    listTree: {
        $component: {
            $layers: "fluid.component",
            view: {
                $component: {
                    $layers: "fluid.viewComponent",
                    elideParent: false,
                    templateTree: "$compute:fluid.layerPicker.listTree({layerPicker}.layers, {layerPicker}.choice, {layerPicker}.state.open)"
                }
            }
        }
    },
    toggle: {
        $method: {
            func: "fluid.layerPicker.toggle",
            args: ["{self}.state", "{self}.layers"]
        }
    },
    // A press on a name chooses it, one on a trash can asks for its layer's deletion
    listClick: {
        $method: {
            func: "fluid.layerPicker.listClick",
            args: ["{self}.state", "{self}.view.renderedContainer", "{0}:event"]
        }
    },
    // The list is closed by a press anywhere outside it
    closer: {
        $bindable: {
            bind: "fluid.layerPicker.bindCloser({self}.state, {self}.view.renderedContainer)",
            unbind: "fluid.layerPicker.unbindCloser({boundValue})"
        }
    },
    $variety: "frameworkAux"
});

/**
 * @typedef {Object} LayerPickerEntry
 * @property {String} layer - The name of the layer
 * @property {String} [note] - A description shown beside it, e.g. "held in this browser"
 */

/**
 * The text of the picker's button - the layer chosen, or else the first listed, or the text shown when none are
 * @param {LayerPickerEntry[]} layers - The layers listed
 * @param {String} choice - The layer chosen
 * @param {String} emptyText - What is shown when none are listed
 * @return {String} The text
 */
fluid.layerPicker.shownChoice = function (layers, choice, emptyText) {
    const names = layers.map(entry => entry.layer);
    return names.includes(choice) ? choice : names[0] || emptyText;
};

// A small trash can, drawn in the current colour
fluid.layerPicker.trashIcon = {
    tag: "svg",
    attrs: {width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2",
        "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true"},
    children: [{tag: "path", attrs: {d: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"}}]
};

/**
 * Open the picker's list, unless it is open or lists nothing, or else close it
 * @param {Object} state - The picker's reactive state
 * @param {LayerPickerEntry[]} layers - The layers listed
 */
fluid.layerPicker.toggle = function (state, layers) {
    state.open = !state.open && layers.length > 0;
};

/**
 * Render the picker's list of layers, while it is open
 * @param {LayerPickerEntry[]} layers - The layers listed
 * @param {String} choice - The layer chosen
 * @param {Boolean} open - `true` if the list is open
 * @return {VNode} The tree of the list
 */
fluid.layerPicker.listTree = function (layers, choice, open) {
    return {
        tag: "ul",
        attrs: {"class": "fluid-layer-picker-list", role: "listbox", ...(open ? {} : {hidden: "hidden"})},
        children: layers.map(({layer, note}) => ({
            tag: "li",
            attrs: {"class": "fluid-layer-picker-option" + (layer === choice ? " fluid-layer-picker-chosen" : ""),
                role: "option", "aria-selected": String(layer === choice), "data-fluid-layer": layer},
            children: [{
                tag: "button",
                attrs: {type: "button", "class": "fluid-layer-picker-name"},
                children: [{text: layer}, ...(note ? [{tag: "span", attrs: {"class": "fluid-layer-picker-note"}, children: [{text: note}]}] : [])]
            }, {
                tag: "button",
                attrs: {type: "button", "class": "fluid-layer-picker-delete", title: "Delete the layer " + layer, "aria-label": "Delete the layer " + layer},
                children: [fluid.layerPicker.trashIcon]
            }]
        }))
    };
};

/**
 * Respond to a press within the picker's list - choosing the layer whose name is pressed, closing the list, or asking
 * for the deletion of the one whose trash can is
 * @param {Object} state - The picker's reactive state
 * @param {Element} container - The picker's element, on which its events are announced
 * @param {Event} event - The click
 */
fluid.layerPicker.listClick = function (state, container, event) {
    const option = event.target.closest(".fluid-layer-picker-option");
    if (option) {
        const layer = option.getAttribute("data-fluid-layer");
        const deleting = !!event.target.closest(".fluid-layer-picker-delete");
        if (!deleting) {
            state.open = false;
        }
        container.dispatchEvent(new CustomEvent(deleting ? "fluidlayerdelete" : "fluidlayerchoose", {detail: {layer}, bubbles: true}));
    }
};

/**
 * Close the picker's list on any press outside it
 * @param {Object} state - The picker's reactive state
 * @param {Element} container - The picker's element
 * @return {Function} The listener bound, to be unbound
 */
fluid.layerPicker.bindCloser = function (state, container) {
    const close = event => {
        if (state.open && !container.contains(event.target)) {
            state.open = false;
        }
    };
    document.addEventListener("pointerdown", close, true);
    return close;
};

/**
 * Unbind the listener closing the picker's list
 * @param {Function} close - The listener, as bound by `bindCloser`
 */
fluid.layerPicker.unbindCloser = function (close) {
    document.removeEventListener("pointerdown", close, true);
};
</script>

<template>
    <div class="fluid-layer-picker">
        <button type="button" class="fluid-layer-picker-button" title="@{title}" aria-haspopup="listbox"
                aria-expanded="@{state.open}" @onclick="{self}.toggle()"><span class="fluid-layer-picker-choice">@{shownChoice}</span><span
                aria-hidden="true">▾</span></button>
        <div class="fluid-layer-picker-holder" @onclick="{self}.listClick({0})"><ul @id="listTree"></ul></div>
    </div>
</template>

<style>
.fluid-layer-picker {
    position: relative;
    display: inline-block;
    font: 13px/1.4 system-ui, sans-serif;
}

.fluid-layer-picker-button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 260px;
    padding: 2px 8px;
    border: 1px solid #a0aec0;
    border-radius: 3px;
    background: #fff;
    color: #1a202c;
    font: inherit;
    cursor: pointer;
}

.fluid-layer-picker-choice {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.fluid-layer-picker-list {
    position: absolute;
    z-index: 10;
    top: 100%;
    left: 0;
    min-width: 100%;
    max-height: 300px;
    overflow-y: auto;
    margin: 2px 0 0;
    padding: 2px 0;
    list-style: none;
    border: 1px solid #a0aec0;
    border-radius: 3px;
    background: #fff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.fluid-layer-picker-list[hidden] {
    display: none;
}

.fluid-layer-picker-option {
    display: flex;
    align-items: center;
}

.fluid-layer-picker-option:hover, .fluid-layer-picker-chosen {
    background: #ebf4ff;
}

.fluid-layer-picker-name {
    flex: 1;
    padding: 3px 8px;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
}

.fluid-layer-picker-note {
    margin-left: 6px;
    color: #718096;
    font-size: 11px;
}

/* The trash can appears as the pointer passes over its option */
.fluid-layer-picker-delete {
    visibility: hidden;
    padding: 2px 6px;
    border: 0;
    background: none;
    color: #b7410e;
    cursor: pointer;
}

.fluid-layer-picker-option:hover .fluid-layer-picker-delete {
    visibility: visible;
}
</style>
