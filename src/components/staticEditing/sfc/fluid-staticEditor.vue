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
            // Where the source edited is shown on GitHub, and the last commit a person made to it - see
            // fluid.staticEditing.showHistory
            pathHref: "",
            updatedHidden: true,
            updatedBy: "",
            updatedByHref: "",
            updatedDate: "",
            updatedHref: "",
            updatedTitle: "",
            status: "",
            statusKind: "",
            // A notice that a base of the site has moved on since it was built, offering to rebuild it
            basesHidden: true,
            basesText: "",
            basesDisabled: false,
            stateText: "",
            claimState: "none",
            commitDisabled: true,
            discardDisabled: true,
            buttonsHidden: true,
            framingRowHidden: true,
            configHidden: true,
            newHidden: true,
            framing: false,
            sourceHidden: true,
            sourceOpen: false,
            // The site's widgets which may be inserted, as `{layer, note}`, whether published or held in this browser,
            // the one chosen, and whether any are unused - see fluid.staticEditing.refreshWidgets
            widgetLayers: [],
            widgetChoice: "",
            widgetsHidden: true,
            cleanupDisabled: true,
            // Naming the layers it would delete - see fluid.staticEditing.cleanupTitle
            cleanupTitle: "Clean up unused layers",
            // Whether the "Ask me anything" panel is disclosed at the panel's foot - see fluid.staticEditing.toggleAI
            // The logo of the header, beside the editor's own SFCs - see fluid.staticEditing.bind
            logoSrc: "",
            aiHidden: true,
            aiOpen: false,
            // Whether the tabs of the sources opened are shown, and the kind of the one shown - see fluid.staticEditing.renderTabs
            tabsHidden: true,
            tabKind: "",
            // Whether Insert is offered - only once a widget is chosen
            insertDisabled: true
        }
    },
    layerPicker: {
        $component: {
            $layers: "fluid.layerPicker",
            layers: "{staticEditor}.state.widgetLayers",
            choice: "{staticEditor}.state.widgetChoice",
            title: "The site's widgets - choose one to insert, or delete one"
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
    widgetChosen: {
        $method: {
            func: "fluid.staticEditing.widgetChosen",
            args: ["{self}.controller", "{0}:event"]
        }
    },
    widgetDelete: {
        $method: {
            func: "fluid.staticEditing.widgetDelete",
            args: ["{self}.controller", "{0}:event"]
        }
    },
    insertWidget: {
        $method: {
            func: "fluid.staticEditing.insertWidget",
            args: ["{self}.controller"]
        }
    },
    toggleAI: {
        $method: {
            func: "fluid.staticEditing.toggleAI",
            args: ["{self}.controller"]
        }
    },
    cleanUpLayers: {
        $method: {
            func: "fluid.staticEditing.cleanUpLayers",
            args: ["{self}.controller"]
        }
    },
    framingChanged: {
        $method: {
            func: "fluid.staticEditing.framingChanged",
            args: ["{self}.controller", "{0}:event"]
        }
    },
    rebuildBases: {
        $method: {
            func: "fluid.staticEditing.rebuildBases",
            args: ["{self}.controller"]
        }
    },
    editConfig: {
        $method: {
            func: "fluid.staticEditing.editConfig",
            args: ["{self}.controller"]
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
        <header><img class="fluid-edit-logo" src="@{state.logoSrc}" width="24" height="24" alt=""><strong>Edit in Infusion</strong>
            <button class="fluid-edit-close" title="Close the editor" aria-label="Close the editor" @onclick="{self}.close()">×</button></header>
        <!-- What edits the page, scrolling within the share of the panel's height which "Ask me anything" leaves it, so
             that a long source never pushes that panel out of view -->
        <div class="fluid-edit-main">
            <!-- Beneath the header, so that it is in view however long the source shown below it -->
            <div class="fluid-edit-status" data-fluid-status-kind="@{state.statusKind}" role="status">@{state.status}</div>
            <div class="fluid-edit-bases" hidden="@{state.basesHidden}"><span>@{state.basesText}</span>
                <button class="fluid-edit-rebuild" disabled="@{state.basesDisabled}" @onclick="{self}.rebuildBases()">Rebuild from it</button></div>
            <div class="fluid-edit-framing-row" hidden="@{state.framingRowHidden}">
                <label><input type="checkbox" class="fluid-edit-framing" checked="@{state.framing}"
                              @onchange="{self}.framingChanged({0})"> Also edit framing</label>
                <button class="fluid-edit-icon-button fluid-edit-config" hidden="@{state.configHidden}" aria-label="Site configuration"
                        title="Site configuration - edit the site's configuration, wend.json, in a tab of its own"
                        @onclick="{self}.editConfig()"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10.5 2a2.5 2.5 0 0 1 2.5 2.5V5h4a1 1 0 0 1 1 1v4h.5a2.5 2.5 0 0 1 0 5H18v4a1 1 0 0 1-1 1h-4v-.5a2.5 2.5 0 0 0-5 0v.5H4a1 1 0 0 1-1-1v-4h.5a2.5 2.5 0 0 0 0-5H3V6a1 1 0 0 1 1-1h4v-.5A2.5 2.5 0 0 1 10.5 2z"></path></svg></button>
                <!-- The site's widgets, whether published or held in this browser - see fluid.staticEditing.refreshWidgets -->
                <span class="fluid-edit-widgets" hidden="@{state.widgetsHidden}" @onfluidlayerchoose="{self}.widgetChosen({0})"
                      @onfluidlayerdelete="{self}.widgetDelete({0})"><span @id="layerPicker"></span><button
                      class="fluid-edit-icon-button fluid-edit-widget-insert" disabled="@{state.insertDisabled}" aria-label="Insert"
                      title="Insert the chosen widget at the source's cursor" @onclick="{self}.insertWidget()"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M12 3v11M7 9.5l5 5 5-5M5 20h14"></path></svg></button><button
                      class="fluid-edit-icon-button fluid-edit-cleanup" disabled="@{state.cleanupDisabled}" aria-label="Clean up unused layers"
                      title="@{state.cleanupTitle}"
                      @onclick="{self}.cleanUpLayers()"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"></path></svg></button></span>
            </div>
            <div class="fluid-edit-tab-body" data-fluid-tab-kind="@{state.tabKind}">
                <div class="fluid-edit-updated" hidden="@{state.updatedHidden}"><a class="fluid-edit-path" href="@{state.pathHref}"
                    target="_blank" rel="noopener" title="Show this source on GitHub">@{state.path}</a> - last updated by <a class="fluid-edit-updated-by"
                    href="@{state.updatedByHref}" target="_blank" rel="noopener">@{state.updatedBy}</a> at <a class="fluid-edit-updated-at"
                    href="@{state.updatedHref}" title="@{state.updatedTitle}" target="_blank" rel="noopener">@{state.updatedDate}</a></div>
                <div class="fluid-edit-new" hidden="@{state.newHidden}">
                    <label>Title <input type="text" class="fluid-edit-new-title" placeholder="The title of the new post"
                                        @oninput="{self}.titleInput({0})"></label>
                </div>
                <div class="fluid-edit-state">@{state.stateText}</div>
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
                    <!-- A tab for each source opened - the page's own, each of its framing, the site's configuration, a new
                         post - as the tabs of the layers of tldraw's Inspector, joined to the top of the editor, and spotted
                         while it holds an edit not yet committed. Written by the controller - see fluid.staticEditing.renderTabs -->
                    <div class="fluid-edit-tabs" role="tablist" hidden="@{state.tabsHidden}"></div>
                    <div class="fluid-edit-source-host" @id="sourceView"></div>
                </details>
                <div class="fluid-edit-buttons" hidden="@{state.buttonsHidden}">
                    <button class="fluid-edit-commit" disabled="@{state.commitDisabled}" @onclick="{self}.commit()">Commit</button>
                    <button class="fluid-edit-discard" disabled="@{state.discardDisabled}" @onclick="{self}.discard()">Discard edits</button>
                </div>
            </div>
        </div>
        <!-- The "Ask me anything" panel, popped out from the sparkles at the panel's foot, set off from what is above it
             by a bar sharing the panel's height between them - made once, and thereafter only shown and hidden, keeping
             its conversation and the share the bar last gave it - see fluid.staticEditing.toggleAI -->
        <div class="fluid-edit-ai-bar" hidden="@{state.aiHidden}"></div>
        <div class="fluid-edit-ai" hidden="@{state.aiHidden}"></div>
        <footer class="fluid-edit-foot">
            <button class="fluid-edit-ai-toggle" title="Ask me anything - converse with an AI about this page and its widgets"
                    aria-expanded="@{state.aiOpen}" @onclick="{self}.toggleAI()"><svg width="16" height="16"
                    viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9zM19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9zM5 15l.7 1.8 1.8.7-1.8.7L5 20l-.7-1.8-1.8-.7 1.8-.7z"></path></svg>
                <span>Ask me anything</span></button>
        </footer>
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

/* The row labelling the page's blocks with their claim's state - the label, and beside it, of the same height, the
   buttons committing and discarding the edit, as the panel's do */
.fluid-edit-label-row {
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
    gap: 6px;
    margin-bottom: 10px;
    font: 600 12px/1.6 system-ui, sans-serif;
}

.fluid-edit-label {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 3px;
    color: #fff;
}

.fluid-edit-label-button {
    margin: 0;
    padding: 0 10px;
    border: 1px solid #a0aec0;
    border-radius: 3px;
    background: #fff;
    color: #1a202c;
    font: inherit;
    cursor: pointer;
}

.fluid-edit-label-button:hover {
    background: #edf2f7;
}

.fluid-edit-label-button[hidden] {
    display: none;
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
    /* Its height is fixed, and shared between what edits the page, which scrolls, and "Ask me anything" */
    overflow: hidden;
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

/* "Also edit framing" with the site's configuration beside it, then, after a small fixed gap, the site's widgets */
.fluid-edit-framing-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 6px;
    align-items: center;
}

.fluid-edit-widgets {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 18px;
}

.fluid-edit-widgets[hidden] {
    display: none;
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
    align-items: center;
}

.fluid-edit-panel header strong {
    flex: 1;
    font-size: 16px;
}

.fluid-edit-logo {
    flex: none;
    display: block;
}

.fluid-edit-logo:not([src]), .fluid-edit-logo[src=""] {
    visibility: hidden;
}

.fluid-edit-panel .fluid-edit-close {
    flex: none;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: 3px;
    background: none;
    color: #555;
    font: 18px/1 system-ui, sans-serif;
    cursor: pointer;
}

.fluid-edit-panel .fluid-edit-close:hover {
    background: #e2e8f0;
    color: #1a202c;
}

.fluid-edit-path {
    font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
}

.fluid-edit-updated {
    font-size: 12px;
    opacity: 0.85;
}

/* The source's own <textarea>, shown should the source view be unavailable - not Ask Anything's, which holds free text */
.fluid-edit-source textarea {
    flex: 1;
    width: 100%;
    box-sizing: border-box;
    resize: none;
    font: 13px/1.5 ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
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

/* A notice that a base of the site has moved on, offering to rebuild it */
.fluid-edit-bases {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    padding: 6px 10px;
    border-left: 4px solid #2b6cb0;
    border-radius: 3px;
    background: #ebf4ff;
    font-size: 13px;
}

.fluid-edit-bases[hidden] {
    display: none;
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
/* Its label is placed against it - an element the page positions statically is positioned relatively for it, but one the
   page positions itself, e.g. a navbar fixed at the top, is left as it is, lest its layout be lost - see
   fluid.staticEditing.anchorFraming */
[data-fluid-framing][data-fluid-framing-anchor] {
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
/* Unfolded, the source takes what the panel's other controls leave, its editor shrinking first, to show a scrollbar of
   its own, so that the buttons beneath it stay in view */
/* Each shrinks no further than what it holds at its least - the editor's least height, its tabs and its fold - so that
   only the editor gives up room, and nothing overflows onto the buttons beneath */
.fluid-edit-source[open] {
    flex: 1 1 auto;
    min-height: auto;
    display: flex;
    flex-direction: column;
}

.fluid-edit-source[open]::details-content {
    flex: 1 1 0;
    min-height: auto;
    display: flex;
    flex-direction: column;
}

.fluid-edit-source > summary {
    margin-bottom: 6px;
}

.fluid-edit-source-host {
    flex: 1 1 0;
    min-height: 36px;
    display: flex;
    flex-direction: column;
}

/* Beneath the editor, never shrunk - the editor shrinks to leave room for them */
.fluid-edit-buttons {
    flex: none;
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
    min-height: 80px;
}

/* Framing edited in place - its literal text may be typed into, and what its template interpolates is set off as
   templated, read-only, its tooltip suggesting Ask Anything instead - see fluid.staticEditing.framingInPlace */
[data-fluid-framing-editable]:focus-within {
    outline-style: solid;
}

[data-fluid-framing-editable] [data-fluid-templated] {
    outline: 1.5px dashed #2b6cb0;
    outline-offset: 1px;
    border-radius: 2px;
    background: rgba(66, 153, 225, 0.18);
    cursor: help;
}

/* Material of the page another source supplies through its templates - another page, or the site's configuration -
   shift-clicked to go there - see fluid.staticEditing.markSourced */
[data-fluid-sourced] {
    outline: 1.5px dashed #2b6cb0;
    outline-offset: 1px;
    border-radius: 2px;
    background-color: rgba(66, 153, 225, 0.12);
}

/* The text of the framing rendered from where the source view's cursor stands - see
   fluid.staticEditing.showFramingPosition */
::highlight(fluid-framing-cursor) {
    background-color: rgba(43, 108, 176, 0.28);
}

/* What edits the page scrolls within its share of the panel, whose own height is fixed */
.fluid-edit-main {
    flex: 1 1 0;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

/* The tabs of the sources opened, as the tabs of the layers of tldraw's Inspector (fluid-demos-inspector.vue) - square,
   each tinted by its kind, the one shown underlined - joined to the top of the editor beneath them */
.fluid-edit-panel {
    --fluid-tab-content: #dbe8fb;
    --fluid-tab-framing: #d9f2e6;
    --fluid-tab-config: #ebe1fb;
    --fluid-tab-new: #fbecd3;
}

.fluid-edit-tabs {
    display: flex;
    flex: 0 0 auto;
    overflow-x: auto;
}

.fluid-edit-tab {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    max-width: 16em;
    height: 28px;
    box-sizing: border-box;
    padding: 4px 6px 3px;
    background: var(--fluid-tab-content);
    color: #222;
    font-size: 13px;
    white-space: nowrap;
    cursor: pointer;
}

.fluid-edit-tab[data-fluid-tab-kind="framing"] { background: var(--fluid-tab-framing); }
.fluid-edit-tab[data-fluid-tab-kind="config"] { background: var(--fluid-tab-config); }
.fluid-edit-tab[data-fluid-tab-kind="new"] { background: var(--fluid-tab-new); }

.fluid-edit-tab[aria-selected="true"] {
    border-bottom: #747a80 solid 3px;
}

.fluid-edit-tab:focus-visible {
    outline: 2px solid #2b6cb0;
    outline-offset: -2px;
}

.fluid-edit-tab-label {
    overflow: hidden;
    text-overflow: ellipsis;
}

/* The mark of a tab holding an edit not yet committed - a small spot in the colour of its text */
.fluid-edit-tab-dirty {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
}

.fluid-edit-panel .fluid-edit-tab-close {
    padding: 0 2px;
    border: 0;
    background: none;
    color: inherit;
    font: 14px/1 system-ui, sans-serif;
    opacity: 0.55;
    cursor: pointer;
}

.fluid-edit-tab-close:hover {
    opacity: 1;
}

/* The tabs, once shown, are joined to the top of the editor */
.fluid-edit-tabs:not([hidden]) + .fluid-edit-source-host .fluid-edit-source-view {
    border-top-left-radius: 0;
}

.fluid-edit-tab-body {
    flex: 1 1 auto;
    min-height: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

/* Icons standing for the panel's lesser controls, each named by its tooltip */
.fluid-edit-panel .fluid-edit-icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 3px 5px;
    border: 1px solid #cbd5e0;
    border-radius: 3px;
    background: #fff;
    color: #2d3748;
    cursor: pointer;
}

.fluid-edit-icon-button:hover:not(:disabled) {
    background: #edf2f7;
}

.fluid-edit-icon-button:disabled {
    color: #a0aec0;
    cursor: default;
}

/* The foot of the panel, from which the sparkles pop out "Ask me anything" */
.fluid-edit-foot {
    flex: none;
    display: flex;
    margin: 0 -12px -12px;
    padding: 4px 8px;
    border-top: 1px solid #e2e8f0;
}

.fluid-edit-panel .fluid-edit-ai-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    border: 0;
    border-radius: 4px;
    background: none;
    color: #6b46c1;
    font-size: 13px;
    cursor: pointer;
}

.fluid-edit-ai-toggle:hover {
    background: #f3eefe;
}

.fluid-edit-ai-toggle[aria-expanded="true"] {
    color: #fff;
    background: #6b46c1;
}

.fluid-edit-ai-bar {
    flex: none;
    height: 6px;
    margin: 0 -12px;
    background: #e2e8f0;
    cursor: row-resize;
}

/* Slid open from the sparkles beneath it, and closed into them, by its basis - see fluid.staticEditing.toggleAI */
/* It gives up room too, to its least height, should what edits the page need more than its share leaves it */
.fluid-edit-ai {
    flex: 0 1 40%;
    min-height: 160px;
    overflow: hidden;
}

.fluid-edit-ai.fluid-edit-ai-sliding {
    min-height: 0;
    transition: flex-basis 0.2s ease;
}

.fluid-edit-ai-bar[hidden], .fluid-edit-ai[hidden] {
    display: none;
}

/* Whilst the source is folded away, as whilst the page's blocks are edited in place, the panel is a narrow column */
.fluid-edit-panel:has(.fluid-edit-source:not([open])) {
    flex-basis: 320px;
}
</style>
