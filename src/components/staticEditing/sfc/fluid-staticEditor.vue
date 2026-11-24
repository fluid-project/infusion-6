<script>
// The panel editing a statically published page in place, docked beside the page - its content edited in place in the
// page's own blocks (fluid-blockEditor.vue) and as source (fluid-sourceView.vue), its framing, and new posts of a list.
// Made by an editing client, e.g. the "Edit in Infusion" extension's bridge, into a container of its own beside the
// page's <body>, once the page has been made live - its component tree booted over it from the site's own copy of
// Infusion. Its logic is that of fluid-staticEditing.js, beside this, which must be loaded first, as must Infusion's
// bundle of CodeMirror 6, src/lib/fluid-lint/fluid-lint.js, which the source view uses. What only the editing client may
// do - hold claims, read the repository and commit to it - is asked of it through the relay - see fluid.staticEditing.send

fluid.def("fluid.staticEditor", {
    $layers: "fluid.component",
    // {Object} The page's provenance record - must be supplied by the creator
    provenance: fluid.unavailable({cause: "Provenance of the page edited not configured", variety: "config"}),
    // {Object} The editing client's configuration - `prefs`, the user's preferences, and `pollInterval`, in ms
    config: {},
    // What the panel shows, written by its controller - see fluid.staticEditing.bind
    state: {
        $reactiveRoot: {
            hidden: true,
            // Whether the panel shows the source it edits, so that what drives it may proceed
            ready: false,
            path: "",
            status: "",
            statusKind: "",
            stateText: "",
            claimState: "none",
            commitDisabled: true,
            discardDisabled: true,
            buttonsHidden: true,
            modeHidden: true,
            framingRowHidden: true,
            configHidden: true,
            newHidden: true,
            framing: false,
            inPage: true,
            sourceHidden: true,
            sourceOpen: false
        }
    },
    sourceView: {
        $component: {
            $layers: "fluid.sourceView"
        }
    },
    controller: {
        $bindable: {
            bind: "fluid.staticEditing.bind({self}.state, {self}.sourceView.controller, {self}.view.renderedContainer, {self}.provenance, {self}.config)",
            unbind: "fluid.staticEditing.unbind({boundValue})",
            // Bound once, since its arguments include the reactive state which it writes
            onceOnly: true
        }
    },
    // Each control of the panel is answered by its controller
    close: {
        $method: {
            func: "fluid.staticEditing.dock",
            args: ["{self}.controller", false]
        }
    },
    commit: {
        $method: {
            func: "fluid.staticEditing.commit",
            args: ["{self}.controller"]
        }
    },
    discard: {
        $method: {
            func: "fluid.staticEditing.discard",
            args: ["{self}.controller"]
        }
    },
    framingChanged: {
        $method: {
            func: "fluid.staticEditing.framingChanged",
            args: ["{self}.controller", "{0}:event"]
        }
    },
    editConfig: {
        $method: {
            func: "fluid.staticEditing.editConfig",
            args: ["{self}.controller"]
        }
    },
    inPageChanged: {
        $method: {
            func: "fluid.staticEditing.inPageChanged",
            args: ["{self}.controller", "{0}:event"]
        }
    },
    titleInput: {
        $method: {
            func: "fluid.staticEditing.titleInput",
            args: ["{self}.controller", "{0}:event"]
        }
    },
    sourceChanged: {
        $method: {
            func: "fluid.staticEditing.sourceChanged",
            args: ["{self}.controller", "{0}:event"]
        }
    },
    sourceCursor: {
        $method: {
            func: "fluid.staticEditing.sourceCursor",
            args: ["{self}.controller", "{0}:event"]
        }
    },
    sourcePaste: {
        $method: {
            func: "fluid.staticEditing.sourcePaste",
            args: ["{self}.controller", "{0}:event"]
        }
    },
    sourceDrop: {
        $method: {
            func: "fluid.staticEditing.sourceDrop",
            args: ["{self}.controller", "{0}:event"]
        }
    },
    sourceSite: {
        $method: {
            func: "fluid.staticEditing.sourceSite",
            args: ["{self}.controller", "{0}:event"]
        }
    }
});
</script>

<template>
    <!-- The editing client's own, which it keeps out of the page while the page's component tree is first booted -->
    <div class="fluid-edit-panel" data-fluid-edit-ui="" hidden="@{state.hidden}" data-fluid-edit-ready="@{state.ready}"
         data-fluid-claim-state="@{state.claimState}">
        <header><strong>Edit in Infusion</strong> <span class="fluid-edit-path">@{state.path}</span>
            <button class="fluid-edit-close" title="Close the editor" @onclick="{self}.close()">×</button></header>
        <!-- Beneath the header, so that it is in view however long the source shown below it -->
        <div class="fluid-edit-status" data-fluid-status-kind="@{state.statusKind}" role="status">@{state.status}</div>
        <div class="fluid-edit-framing-row" hidden="@{state.framingRowHidden}">
            <label><input type="checkbox" class="fluid-edit-framing" checked="@{state.framing}"
                          @onchange="{self}.framingChanged({0})"> Also edit framing</label>
            <button class="fluid-edit-config" hidden="@{state.configHidden}" title="Edit the site's configuration"
                    @onclick="{self}.editConfig()">Site configuration</button>
        </div>
        <div class="fluid-edit-new" hidden="@{state.newHidden}">
            <label>Title <input type="text" class="fluid-edit-new-title" placeholder="The title of the new post"
                                @oninput="{self}.titleInput({0})"></label>
        </div>
        <div class="fluid-edit-state">@{state.stateText}</div>
        <div class="fluid-edit-mode" hidden="@{state.modeHidden}">
            <label><input type="checkbox" class="fluid-edit-inpage" checked="@{state.inPage}"
                          @onchange="{self}.inPageChanged({0})"> Edit in the page</label>
        </div>
        <!-- The source view announces what happens in it as events, which bubble to here - see fluid.sourceView.bind. Its
             fold's "toggle", which does not bubble, is listened for by the controller - see fluid.staticEditing.bind -->
        <details class="fluid-edit-source" hidden="@{state.sourceHidden}" open="@{state.sourceOpen}"
                 @onfluidsourcechange="{self}.sourceChanged({0})"
                 @onfluidsourcecursor="{self}.sourceCursor({0})" @onfluidsourcepaste="{self}.sourcePaste({0})"
                 @onfluidsourcedrop="{self}.sourceDrop({0})" @onfluidsourcesite="{self}.sourceSite({0})">
            <!-- The fold control of the source, as in the filter panels of imerss-bioinfo - a chevron turned down when unfolded -->
            <summary><svg class="fluid-edit-chev" width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
                      stroke-linejoin="round"></path></svg> Edit as source</summary>
            <div @id="sourceView"></div>
        </details>
        <div class="fluid-edit-buttons" hidden="@{state.buttonsHidden}">
            <button class="fluid-edit-commit" disabled="@{state.commitDisabled}" @onclick="{self}.commit()">Commit</button>
            <button class="fluid-edit-discard" disabled="@{state.discardDisabled}" @onclick="{self}.discard()">Discard edits</button>
        </div>
    </div>
</template>

<style>
/* The states of claims shown on a page's blocks, its framing and its list, and the editing panel. Every selector is
   keyed off a fluid-edit class or a data-fluid-claim-state attribute which only the page's editing writes, so that
   nothing here touches a page which is not being edited. */

:root {
    --fluid-edit-uncommitted: #c77800;
    --fluid-edit-committed: #2b6cb0;
    --fluid-edit-conflict: #c53030;
    --fluid-edit-published: #2f855a;
}

[data-fluid-claim-state] {
    outline-offset: 6px;
    transition: outline-color 0.3s;
}

[data-fluid-claim-state="uncommitted"] {
    outline: 3px dashed var(--fluid-edit-uncommitted);
}

[data-fluid-claim-state="committed"] {
    outline: 3px solid var(--fluid-edit-committed);
    animation: fluid-edit-pulse 2s ease-in-out infinite;
}

[data-fluid-claim-state="conflict"] {
    outline: 3px solid var(--fluid-edit-conflict);
}

[data-fluid-claim-state="published"] {
    outline: 3px solid var(--fluid-edit-published);
}

@keyframes fluid-edit-pulse {
    50% { outline-color: color-mix(in srgb, var(--fluid-edit-committed) 35%, transparent); }
}

.fluid-edit-label {
    display: inline-block;
    margin-bottom: 10px;
    padding: 2px 8px;
    border-radius: 3px;
    font: 600 12px/1.6 system-ui, sans-serif;
    color: #fff;
}

.fluid-edit-label-uncommitted { background: var(--fluid-edit-uncommitted); }
.fluid-edit-label-committed { background: var(--fluid-edit-committed); }
.fluid-edit-label-conflict { background: var(--fluid-edit-conflict); }
.fluid-edit-label-published { background: var(--fluid-edit-published); }

/* The panel is docked beside the page's <body>, outside it - as Infusion's full-page editor docks its own, see
   src/framework/edit/css/FluidEdit.css - so that the page's layout is disturbed as little as possible, and its
   scrollbar is drawn beside its own content. Whilst the panel is shown, the root element lays out the body, the resize
   bar setting off the panel (Infusion's fluid.resizeBar, see fluid.staticEditing.dock) and the panel side
   by side; the body scrolls within its share. A fixed element of the page is laid out within the body, which contains
   its paint */
html[fl-docking-area-mode~="edge"] {
    display: flex;
    height: 100vh;
    overflow: hidden;
}

html[fl-docking-area-mode~="edge"] > body {
    flex: 1 1 auto;
    min-width: 0;
    height: 100vh;
    box-sizing: border-box;
    overflow-y: auto;
    contain: paint;
}

html[fl-docking-area-mode~="minimized"] > .fluid-edit-panel,
html[fl-docking-area-mode~="minimized"] > .fluid-edit-resize-bar,
html:not([fl-docking-area-mode]) > .fluid-edit-panel,
html:not([fl-docking-area-mode]) > .fluid-edit-resize-bar,
html[fl-docking-area-mode~="minimized"] > .fl-resize-bar {
    display: none;
}

/* Until it is bound as a fluid.resizeBar, a ridge setting the panel off */
.fluid-edit-resize-bar {
    flex: 0 0 4px;
    background: rgba(128, 128, 128, 0.35);
}

.fluid-edit-panel {
    flex: 0 0 min(40vw, 640px);
    min-width: 0;
    height: 100vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-sizing: border-box;
    padding: 12px;
    background: #fbfbfa;
    color: #1a1a1a;
    border-left: 4px solid #888;
    font: 14px/1.4 system-ui, sans-serif;
}

.fluid-edit-panel[hidden] {
    display: none;
}

/* Shown once, settled - see fluid.staticEditing.activate */
.fluid-edit-panel:not([hidden]) {
    animation: fluid-edit-panel-in 0.15s ease-out;
}

@keyframes fluid-edit-panel-in {
    from { opacity: 0; }
}

/* The page's own styles, e.g. Bootstrap's, would otherwise reach the panel's controls */
.fluid-edit-panel label {
    display: flex;
    gap: 6px;
    align-items: center;
    margin: 0;
    font-weight: normal;
}

.fluid-edit-panel [hidden] {
    display: none !important;
}

.fluid-edit-framing-row {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
}

.fluid-edit-new input {
    flex: 1;
    font: inherit;
    padding: 4px 6px;
}

.fluid-edit-panel[data-fluid-claim-state="uncommitted"] { border-left-color: var(--fluid-edit-uncommitted); }
.fluid-edit-panel[data-fluid-claim-state="committed"] { border-left-color: var(--fluid-edit-committed); }
.fluid-edit-panel[data-fluid-claim-state="conflict"] { border-left-color: var(--fluid-edit-conflict); }

.fluid-edit-panel header {
    display: flex;
    gap: 8px;
    align-items: baseline;
}

.fluid-edit-path {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: ui-monospace, monospace;
    font-size: 12px;
}

.fluid-edit-panel textarea {
    flex: 1;
    width: 100%;
    box-sizing: border-box;
    resize: none;
    font: 13px/1.5 ui-monospace, monospace;
    padding: 8px;
}

.fluid-edit-panel button {
    font: inherit;
    padding: 4px 12px;
}

.fluid-edit-state {
    font-weight: 600;
}

.fluid-edit-status {
    min-height: 1.4em;
    font-size: 12px;
    color: #555;
    overflow-wrap: anywhere;
}

/* An error, in the colour the extension's popup shows its own in, set apart from the notes of progress */
.fluid-edit-status[data-fluid-status-kind="error"] {
    padding: 6px 10px;
    border-left: 4px solid #b7410e;
    border-radius: 3px;
    background: #fdf0ea;
    color: #b7410e;
    font-size: 13px;
    font-weight: 600;
}

/* The framing of a page - e.g. its footer, rendered by an SFC shared by every page - marked by attributes alone, since
   the page's live tree renders it, and a label inserted amongst its nodes would be removed as it renders afresh */
[data-fluid-framing] {
    position: relative;
}

[data-fluid-framing]::before {
    content: attr(data-fluid-claim-label);
    position: absolute;
    top: -22px;
    left: 0;
    z-index: 1;
    padding: 2px 8px;
    border-radius: 3px;
    font: 600 12px/1.6 system-ui, sans-serif;
    color: #fff;
    background: var(--fluid-edit-uncommitted);
}

[data-fluid-framing][data-fluid-claim-state="committed"]::before { background: var(--fluid-edit-committed); }
[data-fluid-framing][data-fluid-claim-state="conflict"]::before { background: var(--fluid-edit-conflict); }
[data-fluid-framing][data-fluid-claim-state="published"]::before { background: var(--fluid-edit-published); }
[data-fluid-framing][data-fluid-claim-state="editable"] { outline: 2px dotted #888; }
[data-fluid-framing][data-fluid-claim-state="editable"]::before { background: #666; }
[data-fluid-framing][data-fluid-claim-state="editable"] { cursor: pointer; }
[data-fluid-framing][data-fluid-claim-state="editing"] { outline: 2px solid var(--fluid-edit-committed); }
[data-fluid-framing][data-fluid-claim-state="editing"]::before { background: var(--fluid-edit-committed); }

/* The head of a list of posts - "+" to write a new one, and the new posts not yet published */
.fluid-edit-list-head {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 16px 0;
    font: 14px/1.4 system-ui, sans-serif;
}

.fluid-edit-list-head:empty {
    display: none;
}

.fluid-edit-new-post {
    align-self: flex-start;
    width: 36px;
    height: 36px;
    border: 2px dashed #888;
    border-radius: 50%;
    background: transparent;
    font: 600 22px/1 system-ui, sans-serif;
    color: #555;
    cursor: pointer;
}

.fluid-edit-new-post:hover {
    border-color: var(--fluid-edit-committed);
    color: var(--fluid-edit-committed);
}

.fluid-edit-pending {
    padding: 4px 8px;
    outline-offset: 2px;
}

/* The markdown source, folded away while the page's blocks are edited in place - the panel is then a narrow card, leaving
   the page to be edited; unfolded, it fills the panel beside the page */
/* It is never shrunk below its content - the source view's height is fixed, so shrunk, it would overflow onto the
   buttons beneath it, e.g. in a short window, or with a status long enough to wrap - but the panel scrolls instead */
.fluid-edit-source[open] {
    flex: 1 0 auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.fluid-edit-source[hidden] {
    display: none;
}

/* The fold control, as in the filter panels of imerss-bioinfo - a chevron, turned down while unfolded */
.fluid-edit-source summary {
    display: flex;
    gap: 6px;
    align-items: center;
    cursor: pointer;
    color: #444;
    list-style: none;
    user-select: none;
}

.fluid-edit-source summary::-webkit-details-marker {
    display: none;
}

.fluid-edit-chev {
    flex: none;
    color: #777;
    transition: transform 0.16s ease;
}

.fluid-edit-source[open] > summary > .fluid-edit-chev {
    transform: rotate(90deg);
}

.fluid-edit-source textarea {
    min-height: 200px;
}

/* Whilst the source is folded away, as whilst the page's blocks are edited in place, the panel is a narrow column */
.fluid-edit-panel:has(.fluid-edit-source:not([open])) {
    flex-basis: 320px;
}

.fluid-edit-mode label {
    display: flex;
    gap: 6px;
    align-items: center;
}
</style>
