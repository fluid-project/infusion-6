<script>
// The block editor - a mixin layer making a block of rendered markdown editable in place, for people who never want to
// see a "#". Broadcast by the extension's editing root, beside fluid.withEditing, onto each component rendering a block
// of content, e.g. wend.content - see bridge.js. A successor of Infusion's pell-edit demo, without execCommand.
//
// The source is segmented by the site's own pipeline into its top-level blocks, each with the lines it was parsed
// from (wendMarkdown.segment). Each block whose rendering the serialiser reproduces (fluid-markdownSerializer.js,
// `roundTrips`) is made contenteditable in place; any other - an island, a table, a fence, raw HTML, a paragraph with a
// footnote - is marked as edited through the source view alone. A moment after the user stops typing in a block
// (fluid.blockEditor.liveDelay), and when they leave it or format it from the toolbar, its DOM is serialised back to
// markdown and spliced into the source in place of its lines alone, so that every other block's source is kept as
// written - see fluid.blockEditor.commitLive. The source is then announced, as the event
// "fluid-block-edit-source" on the document, to the extension, which holds it as the claim and renders it as for any
// edit of the source - so that what is shown is always the site's own rendering of the markdown.
// The serialiser is loaded beforehand by the bridge, as the global fluid.markdownSerializer.
//
// Widgets - components written into content as an island element bearing `fluid-layers`, `fluid-id` and
// `fluid-potentia` (fluid.potentiaAttribute, and the codec fluid.ptf.islandMarkup in Infusion) - may be inserted from
// the toolbar, and copied, cut and pasted as PTF - a paste lands at the caret, splitting a paragraph or heading it falls
// within. The state a widget comes to hold, e.g. a counter's count, is written back into its element's potentia when
// the user leaves it. The layers a pasted widget brings are announced, as the event "fluid-block-edit-files"
// {files: [{path, text, layer, pageDiffers}]}, so that the extension commits them with the source, as SFCs of the
// site's static/sfc - see `widgets` in the page's provenance record - asking first before replacing any it holds otherwise.
// A file dropped onto the blocks - a widget as a ZIP file, or an image - is announced as the event "fluid-block-edit-drop"
// {slot, files: [{name, type, content}]}, `content` its base64: the extension reads it (fluid-zip.js, beside this), holds its
// files, and fills the slot, where it was dropped, with what it makes of it - see fluid.blockEditor.fillSlotById.

fluid.def("fluid.blockEditor", {
    // Whether the block is edited in place - switched by the extension's bridge
    blockEditing: false,
    // The top-level blocks of the source, each with its lines in the whole file
    blocks: "$compute:fluid.blockEditor.segment({self}.editSource, {self}.renderer)",
    bindBlocks: "$effect:fluid.blockEditor.bind({self}, {self}.view.renderedContainer, {self}.editedHtml, {self}.blocks, {self}.blockEditing)"
});

// What is held of each container being edited, keyed by the container - its component, its blocks, the elements
// rendering them, the source, and where to restore focus once the source is next rendered
fluid.blockEditor.records = new WeakMap();

// The widgets which may be inserted - `{layer}` for each, from the page's provenance, as the bridge holds it - joined by
// those whose layers are pasted
fluid.blockEditor.widgets = (window.fluidEditBridge?.widgets?.layers || []).map(widget => ({layer: widget.layer}));
// Where the SFCs of a pasted widget's layers are written in the repository
fluid.blockEditor.widgetDir = window.fluidEditBridge?.widgets?.dir || "static/sfc";

/**
 * Segment the source of the block into its top-level blocks, by the site's own pipeline
 * @param {String|null} source - The whole text of the source, front matter and all, or null if none is held yet
 * @param {String} rendererName - The name of the global holding the site's markdown pipeline
 * @return {Object[]} The blocks, as by wendMarkdown.segment, with `startLine` and `endLine` of the whole text, or
 * an empty array if there is no source
 */
fluid.blockEditor.segment = function (source, rendererName) {
    let togo = [];
    if (source !== null && source !== undefined) {
        const pipeline = window[rendererName];
        const md = fluid.blockEditor.renderer(rendererName);
        const body = pipeline.splitFrontMatter(source).body;
        const offset = source.substring(0, source.length - body.length).split("\n").length - 1;
        togo = pipeline.segment(md, body).map(block => ({...block,
            startLine: block.startLine === null ? null : block.startLine + offset,
            endLine: block.endLine === null ? null : block.endLine + offset}));
    }
    return togo;
};

/**
 * Find the site's markdown renderer, made once - shared with fluid.withEditing
 * @param {String} rendererName - The name of the global holding the pipeline
 * @return {Object} The renderer
 */
fluid.blockEditor.renderer = function (rendererName) {
    const pipeline = window[rendererName];
    fluid.withEditing.renderers[rendererName] = fluid.withEditing.renderers[rendererName] || pipeline.make(pipeline.browserLibs(window));
    return fluid.withEditing.renderers[rendererName];
};

/**
 * Determine whether a node is of no account in matching blocks to the DOM - whitespace between them, or a comment
 * @param {Node} node - The node
 * @return {Boolean} `true` if it is to be passed over
 */
fluid.blockEditor.isInsignificant = node => node.nodeType === 8 || node.nodeType === 3 && node.nodeValue.trim() === "";

/**
 * Bind editing to the elements rendering the blocks, once the block has rendered - or remove it
 * @param {Object} that - The component
 * @param {Element} container - The element the component renders into
 * @param {String} html - The HTML it renders, so that binding follows each rendering
 * @param {Object[]} blocks - The blocks of its source
 * @param {Boolean} on - Whether the block is edited in place
 */
fluid.blockEditor.bind = function (that, container, html, blocks, on) {
    if (container && !fluid.isUnavailable(container)) {
        // After the rendering of `html` has been patched into the container
        requestAnimationFrame(() => fluid.blockEditor.apply(that, container, blocks, on));
    }
};

/**
 * Mark each element rendering a block with how it may be edited, and restore any focus awaiting the rendering
 * @param {Object} that - The component
 * @param {Element} container - The element the component renders into
 * @param {Object[]} blocks - The blocks of its source
 * @param {Boolean} on - Whether the block is edited in place
 */
fluid.blockEditor.apply = function (that, container, blocks, on) {
    const record = fluid.blockEditor.records.get(container) || fluid.blockEditor.listen(container);
    record.that = that;
    record.source = that.editSource;
    record.renderer = that.renderer;
    record.elements = [];
    container.querySelectorAll("[data-fluid-block]").forEach(element => {
        ["contenteditable", "data-fluid-block", "data-fluid-block-index", "data-fluid-block-current"].forEach(name => element.removeAttribute(name));
    });
    container.classList.toggle("fluid-block-editing", !!on);
    if (on) {
        const pipeline = window[that.renderer];
        const md = fluid.blockEditor.renderer(that.renderer);
        const render = markdown => pipeline.renderBody(md, markdown);
        const nodes = [...container.childNodes].filter(node => !fluid.blockEditor.isInsignificant(node));
        let cursor = 0;
        blocks.forEach((block, index) => {
            const holder = document.createElement("template");
            holder.innerHTML = block.html;
            const count = [...holder.content.childNodes].filter(node => !fluid.blockEditor.isInsignificant(node)).length;
            const own = nodes.slice(cursor, cursor + count);
            cursor += count;
            const element = own.length === 1 && own[0].nodeType === 1 ? own[0] : null;
            if (element) {
                const editable = block.startLine !== null && fluid.markdownSerializer.roundTrips(element, render);
                element.setAttribute("data-fluid-block", editable ? "editable" : block.kind === "island" ? "island" : "source");
                element.setAttribute("data-fluid-block-index", String(index));
                if (editable) {
                    element.setAttribute("contenteditable", "true");
                }
                record.elements[index] = element;
            }
        });
        record.blocks = blocks;
        // The widget selected stays so, on its element as rendered afresh
        const selectedId = record.selectedIsland ? record.selectedIsland.getAttribute("fluid-id") : null;
        fluid.blockEditor.selectIsland(record, selectedId ?
            container.querySelector(`[fluid-layers][fluid-id="${CSS.escape(selectedId)}"]`) : null);
        fluid.blockEditor.restoreFocus(record);
        if (fluid.blockEditor.cursorLine !== undefined) {
            const index = blocks.findIndex(block => block.startLine !== null && fluid.blockEditor.cursorLine >= block.startLine &&
                fluid.blockEditor.cursorLine < block.endLine);
            if (record.elements[index]) {
                record.elements[index].setAttribute("data-fluid-block-current", "");
            }
        }
    } else {
        fluid.blockEditor.selectIsland(record, null);
        fluid.blockEditor.toolbar.hide();
    }
};

/**
 * Listen, once, for the user's editing within a container - by delegation, so that elements rendered afresh are
 * edited alike
 * @param {Element} container - The container
 * @return {Object} The container's record
 */
fluid.blockEditor.listen = function (container) {
    const record = {container, elements: [], blocks: [], before: null, focus: null, selectedIsland: null};
    fluid.blockEditor.records.set(container, record);
    const editableOf = target => {
        const element = target && target.nodeType === 1 ? target.closest("[data-fluid-block=\"editable\"]") : target && target.parentElement && target.parentElement.closest("[data-fluid-block=\"editable\"]");
        return element && container.contains(element) ? element : null;
    };
    container.addEventListener("focusin", event => {
        const element = editableOf(event.target);
        if (element) {
            record.before = element.innerHTML;
            fluid.blockEditor.toolbar.show(record, element);
            fluid.blockEditor.announceFocus(record, element);
        }
    });
    const islandOf = target => {
        const element = target && (target.nodeType === 1 ? target : target.parentElement)?.closest("[fluid-layers][fluid-id]");
        return element && container.contains(element) ? element : null;
    };
    // Leaving a widget writes the state it now holds back into its element in the source
    container.addEventListener("focusout", event => {
        const island = islandOf(event.target);
        if (island && !island.contains(event.relatedTarget)) {
            fluid.blockEditor.saveIsland(record, island);
        }
    });
    // A widget pressed on is selected, and shown so, until something else is pressed on or Escape is pressed - see
    // fluid.blockEditor.selectIsland
    container.addEventListener("pointerdown", event => {
        fluid.blockEditor.selectIsland(record, container.classList.contains("fluid-block-editing") ? islandOf(event.target) : null);
    });
    container.addEventListener("focusin", event => {
        const island = islandOf(event.target);
        if (island) {
            fluid.blockEditor.selectIsland(record, island);
        }
    });
    // A widget copied is put on the clipboard as PTF, and as its element - one cut is then removed from the source. A
    // flash over it confirms what was taken
    const copyOrCut = event => {
        const selection = document.getSelection();
        const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        const selected = record.selectedIsland && record.selectedIsland.isConnected ? record.selectedIsland : null;
        const island = selected || islandOf(selection.anchorNode) || islandOf(document.activeElement) ||
            (range ? [...container.querySelectorAll("[fluid-layers][fluid-id]")].find(one => range.intersectsNode(one)) : null);
        if (island) {
            const copied = fluid.blockEditor.copyIsland(record, island);
            if (copied) {
                event.preventDefault();
                event.clipboardData.setData("text/plain", copied.ptf);
                event.clipboardData.setData("text/html", copied.markup);
                fluid.blockEditor.flash(island, event.type === "cut" ? "Cut" : "Copied");
                if (event.type === "cut") {
                    fluid.blockEditor.selectIsland(record, null);
                    fluid.blockEditor.removeIsland(record, island);
                }
            }
        }
    };
    container.addEventListener("copy", copyOrCut);
    container.addEventListener("cut", copyOrCut);
    // A file dropped - a widget as a ZIP file, or an image - is handed to the extension, to fill the slot where it fell
    container.addEventListener("dragover", event => {
        // Text may be dropped onto a widget, e.g. another widget dragged as PTF - only its drop can tell whether it is one
        const textOntoIsland = !!event.dataTransfer && [...event.dataTransfer.types].includes("text/plain") && !!islandOf(event.target);
        if (fluid.blockEditor.carriesFiles(event.dataTransfer) || fluid.blockEditor.carriesPTF(event.dataTransfer) || textOntoIsland) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            fluid.blockEditor.showDropCaret(fluid.blockEditor.dropPlace(record, event, islandOf(event.target), editableOf));
        } else {
            fluid.blockEditor.hideDropCaret();
        }
    });
    container.addEventListener("dragleave", event => {
        if (!container.contains(event.relatedTarget)) {
            fluid.blockEditor.hideDropCaret();
        }
    });
    // A widget dropped onto another takes its place - see fluid.blockEditor.islandSlot
    container.addEventListener("drop", event => {
        fluid.blockEditor.hideDropCaret();
        const files = fluid.blockEditor.carriesFiles(event.dataTransfer) ? [...event.dataTransfer.files] : [];
        // A widget dragged out of another page, e.g. a tldraw arena, as PTF under a type of its own, may fall anywhere
        const ptf = files.length === 0 && fluid.blockEditor.carriesPTF(event.dataTransfer) ? event.dataTransfer.getData(fluid.blockEditor.ptfDragType) : "";
        const text = ptf || (files.length === 0 && event.dataTransfer ? event.dataTransfer.getData("text/plain") : "");
        const island = islandOf(event.target);
        if (files.length > 0 || (ptf && fluid.ptf.isPTF(ptf)) || (island && text && fluid.ptf.isPTF(text))) {
            event.preventDefault();
            event.stopPropagation();
            const range = document.caretRangeFromPoint ? document.caretRangeFromPoint(event.clientX, event.clientY) : null;
            const target = (range && editableOf(range.startContainer)) || event.target.closest?.("[data-fluid-block-index]");
            const element = target && container.contains(target) ? target : fluid.peek(record.elements.filter(one => one));
            if (element) {
                const after = fluid.blockEditor.slotAt(record, element, range);
                const slot = island ? fluid.blockEditor.islandSlot(record, island, after) : after;
                if (files.length > 0) {
                    fluid.blockEditor.dropFiles(record, slot, files);
                } else {
                    fluid.blockEditor.pasteWidget(record, slot, text);
                }
            }
        }
    });
    // What is typed is committed a moment after the typing stops - see fluid.blockEditor.commitLive
    container.addEventListener("input", event => {
        const element = editableOf(event.target);
        if (element && !event.isComposing) {
            fluid.blockEditor.scheduleLive(record, element);
        }
    });
    container.addEventListener("focusout", event => {
        const element = editableOf(event.target);
        // Focus moving into the toolbar keeps the block in hand
        if (element && !fluid.blockEditor.toolbar.holds(event.relatedTarget)) {
            clearTimeout(record.liveTimer);
            // A block already committed, e.g. by Enter, loses focus as its source renders - it is not committed again
            if (record.before !== null && element.isConnected && element.innerHTML !== record.before) {
                fluid.blockEditor.commit(record, element);
            }
            fluid.blockEditor.toolbar.hide();
        }
    });
    container.addEventListener("beforeinput", event => {
        const element = editableOf(event.target);
        if (element) {
            fluid.blockEditor.beforeInput(record, element, event);
        }
    });
    container.addEventListener("keydown", event => {
        const element = editableOf(event.target);
        const command = {b: "strong", i: "em", e: "code"}[event.key.toLowerCase()];
        if (element && (event.ctrlKey || event.metaKey) && command) {
            event.preventDefault();
            fluid.blockEditor.toggleInline(record, element, command);
        } else if (element && event.key === "Escape") {
            element.blur();
        } else if (event.key === "Escape") {
            fluid.blockEditor.selectIsland(record, null);
        }
    });
    // A widget selected is deleted by Delete or Backspace, as text is - unless a field of the widget's own is being
    // typed into. Bound on the document, since a widget pressed on needn't take the focus
    document.addEventListener("keydown", event => {
        const island = record.selectedIsland;
        if (island && island.isConnected && (event.key === "Delete" || event.key === "Backspace") &&
            !event.ctrlKey && !event.metaKey && !event.altKey && !fluid.blockEditor.isTypingInto(document.activeElement)) {
            event.preventDefault();
            fluid.blockEditor.selectIsland(record, null);
            fluid.blockEditor.removeIsland(record, island);
        }
    });
    return record;
};

/**
 * Announce the block in hand, as the event "fluid-block-edit-focus" {startLine, endLine} on the document, so that the
 * extension's source view may show its lines
 * @param {Object} record - The container's record
 * @param {Element} element - The block's element
 */
fluid.blockEditor.announceFocus = function (record, element) {
    const block = record.blocks[+element.dataset.fluidBlockIndex];
    if (block && block.startLine !== null) {
        document.dispatchEvent(new CustomEvent("fluid-block-edit-focus", {detail: JSON.stringify({startLine: block.startLine, endLine: block.endLine})}));
    }
};

/**
 * Mark the block whose source holds a line - that of the cursor in the extension's source view - as the one in hand
 * @param {Number} line - The line, counting from 0, of the whole source
 */
fluid.blockEditor.markLine = function (line) {
    // Remembered, so that it is marked again once the source next renders - see `apply`
    fluid.blockEditor.cursorLine = line;
    document.querySelectorAll("[data-fluid-block-current]").forEach(element => element.removeAttribute("data-fluid-block-current"));
    document.querySelectorAll(".fluid-block-editing").forEach(container => {
        const record = fluid.blockEditor.records.get(container);
        const index = record ? record.blocks.findIndex(block => block.startLine !== null && line >= block.startLine && line < block.endLine) : -1;
        const element = index >= 0 ? record.elements[index] : null;
        if (element) {
            element.setAttribute("data-fluid-block-current", "");
            const bounds = element.getBoundingClientRect();
            if (bounds.top < 0 || bounds.bottom > window.innerHeight) {
                element.scrollIntoView({block: "center", behavior: "smooth"});
            }
        }
    });
};

document.addEventListener("fluid-source-cursor", event => fluid.blockEditor.markLine(JSON.parse(event.detail).line));

/**
 * Handle an input the user is about to make in a block - those which would make markup the source can't hold are
 * made otherwise: a new paragraph splits the block in the source, a paste inserts plain text
 * @param {Object} record - The container's record
 * @param {Element} element - The block's element
 * @param {InputEvent} event - The event
 */
fluid.blockEditor.beforeInput = function (record, element, event) {
    const tag = element.tagName.toLowerCase();
    const selection = document.getSelection();
    if (event.inputType === "insertParagraph" && (tag === "p" || /^h[1-6]$/.test(tag))) {
        event.preventDefault();
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const tail = document.createRange();
        tail.setStart(range.startContainer, range.startOffset);
        tail.setEnd(element, element.childNodes.length);
        const next = document.createElement("p");
        next.appendChild(tail.extractContents());
        const serializer = fluid.markdownSerializer;
        const markdown = serializer.block(element) + "\n\n" + (serializer.inline(next).trim() || "&nbsp;");
        fluid.blockEditor.splice(record, +element.dataset.fluidBlockIndex, +element.dataset.fluidBlockIndex, markdown,
            {index: +element.dataset.fluidBlockIndex + 1, atEnd: false});
    } else if (event.inputType === "deleteContentBackward" && fluid.blockEditor.atStart(element, selection)) {
        const index = +element.dataset.fluidBlockIndex;
        const previous = record.elements[index - 1];
        const previousTag = previous && previous.getAttribute("data-fluid-block") === "editable" ? previous.tagName.toLowerCase() : null;
        if (previousTag === "p" || /^h[1-6]$/.test(previousTag || "")) {
            event.preventDefault();
            const serializer = fluid.markdownSerializer;
            const markdown = serializer.block(previous) + (tag === "p" || /^h[1-6]$/.test(tag) ? serializer.inline(element).trim() : "\n\n" + serializer.block(element));
            fluid.blockEditor.splice(record, index - 1, index, markdown, {index: index - 1, atEnd: true});
        }
    } else if (event.inputType === "insertFromPaste" || event.inputType === "insertFromDrop") {
        const text = event.dataTransfer && event.dataTransfer.getData("text/plain");
        if (text && fluid.ptf.isPTF(text)) {
            // A widget, pasted at the caret
            event.preventDefault();
            fluid.blockEditor.pasteWidget(record, fluid.blockEditor.slotAt(record, element, selection.rangeCount > 0 ? selection.getRangeAt(0) : null), text);
        } else if (text) {
            event.preventDefault();
            const range = selection.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode(text.replace(/\s*\n\s*/g, " ")));
            range.collapse(false);
            // Inserted by hand, which fires no input
            fluid.blockEditor.scheduleLive(record, element);
        }
    }
};

/**
 * Determine whether the selection is a caret at the very start of a block
 * @param {Element} element - The block's element
 * @param {Selection} selection - The selection
 * @return {Boolean} `true` if it is
 */
fluid.blockEditor.atStart = function (element, selection) {
    let togo = false;
    if (selection.rangeCount > 0 && selection.isCollapsed) {
        const before = document.createRange();
        before.selectNodeContents(element);
        before.setEnd(selection.getRangeAt(0).startContainer, selection.getRangeAt(0).startOffset);
        togo = before.toString() === "";
    }
    return togo;
};

/**
 * Commit an edited block - serialise it, and splice it into the source in place of its own lines
 * @param {Object} record - The container's record
 * @param {Element} element - The block's element
 * @param {Object} [focus] - Where to restore focus once the source has rendered, `{index, atEnd}`
 */
fluid.blockEditor.commit = function (record, element, focus) {
    const index = +element.dataset.fluidBlockIndex;
    fluid.blockEditor.splice(record, index, index, fluid.markdownSerializer.block(element), focus);
};

// How long, in ms, after the user stops typing in a block, what they typed is committed to the source
fluid.blockEditor.liveDelay = 300;

/**
 * Commit what is typed in a block a moment after the typing stops - see fluid.blockEditor.commitLive
 * @param {Object} record - The container's record
 * @param {Element} element - The block's element
 */
fluid.blockEditor.scheduleLive = function (record, element) {
    clearTimeout(record.liveTimer);
    record.liveTimer = setTimeout(() => fluid.blockEditor.commitLive(record, element), fluid.blockEditor.liveDelay);
};

/**
 * Commit a block being typed in, keeping it in hand - its source is rendered into the block at once, rather than once
 * the extension has held it, so that nothing typed meanwhile is overwritten - and the caret is put back where it was
 * @param {Object} record - The container's record
 * @param {Element} element - The block's element
 */
fluid.blockEditor.commitLive = function (record, element) {
    if (element.isConnected && record.before !== null && element.innerHTML !== record.before) {
        const index = +element.dataset.fluidBlockIndex;
        const offset = fluid.blockEditor.caretOffset(element);
        fluid.blockEditor.splice(record, index, index, fluid.markdownSerializer.block(element),
            offset === null ? null : {index, offset, text: element.textContent});
        record.before = element.innerHTML;
        fluid.setForComponent(record.that, ["editSource"], record.source);
    }
};

/**
 * Find how far into a block's text the caret lies
 * @param {Element} element - The block's element
 * @return {Number|null} The number of characters of its text before the caret, or null if the caret is not within it
 */
fluid.blockEditor.caretOffset = function (element) {
    const selection = document.getSelection();
    let togo = null;
    if (selection.rangeCount > 0 && element.contains(selection.focusNode)) {
        const before = document.createRange();
        before.selectNodeContents(element);
        before.setEnd(selection.focusNode, selection.focusOffset);
        togo = before.toString().length;
    }
    return togo;
};

/**
 * Put the caret a number of characters into a block's text - at its end if its text is shorter
 * @param {Element} element - The block's element
 * @param {Number} offset - The number of characters of its text before the caret
 */
fluid.blockEditor.placeCaret = function (element, offset) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let remaining = offset;
    let node = walker.nextNode();
    let placed = false;
    while (node && !placed) {
        if (remaining <= node.nodeValue.length) {
            range.setStart(node, remaining);
            placed = true;
        } else {
            remaining -= node.nodeValue.length;
            node = walker.nextNode();
        }
    }
    if (!placed) {
        range.selectNodeContents(element);
        range.collapse(false);
    }
    range.collapse(true);
    document.getSelection().removeAllRanges();
    document.getSelection().addRange(range);
};

/**
 * Replace the lines of a run of blocks in the source with markdown, and announce the source
 * @param {Object} record - The container's record
 * @param {Number} first - The index of the first block replaced
 * @param {Number} last - The index of the last block replaced
 * @param {String} markdown - The markdown replacing them
 * @param {Object} [focus] - Where to restore focus once the source has rendered, `{index, atEnd}`
 */
fluid.blockEditor.splice = function (record, first, last, markdown, focus) {
    const lines = record.source.split("\n");
    const start = record.blocks[first].startLine;
    const end = record.blocks[last].endLine;
    // A block's lines end at its last - the blank line after it, if any, is kept. A paragraph whose source was wrapped
    // over several lines is wrapped again at the same width, so that the source keeps its shape
    const original = lines.slice(start, end);
    const width = Math.max(...original.map(line => line.length));
    const rewrap = original.length > 1 && record.blocks[first].kind === "paragraph";
    // A block of markup, e.g. a widget's element, is never wrapped
    const replaced = (rewrap ? markdown.split("\n\n").map(paragraph => /^[#><-]|^\d+\./.test(paragraph) ? paragraph :
        fluid.markdownSerializer.wrapParagraph(paragraph, width)).join("\n\n") : markdown).split("\n");
    lines.splice(start, end - start, ...replaced);
    const text = lines.join("\n");
    clearTimeout(record.liveTimer);
    record.source = text;
    record.before = null;
    record.focus = focus || null;
    document.dispatchEvent(new CustomEvent("fluid-block-edit-source", {detail: JSON.stringify({text})}));
};

/**
 * Restore the focus a commit asked for, once its source has rendered - to the start or end of a block, or, for one
 * committed as it was typed in, to where its caret was
 * @param {Object} record - The container's record
 */
fluid.blockEditor.restoreFocus = function (record) {
    const focus = record.focus;
    const element = focus && record.elements[focus.index];
    if (element && element.getAttribute("data-fluid-block") === "editable" && record.source === record.that.editSource) {
        record.focus = null;
        if (focus.offset === undefined) {
            element.focus();
            const range = document.createRange();
            range.selectNodeContents(element);
            range.collapse(!focus.atEnd);
            document.getSelection().removeAllRanges();
            document.getSelection().addRange(range);
        } else if (element.textContent === focus.text) {
            // Unless more has been typed since, in which case the caret is where the typing left it
            if (document.activeElement !== element) {
                element.focus();
            }
            fluid.blockEditor.placeCaret(element, focus.offset);
            record.before = element.innerHTML;
        }
    }
};

/**
 * Toggle an inline element around the selection within a block - unwrapping the one holding it, or wrapping it in a
 * new one - and commit the block
 * @param {Object} record - The container's record
 * @param {Element} element - The block's element
 * @param {String} tag - The inline element's tag, e.g. "strong"
 * @param {Object} [attrs] - Its attributes, e.g. the `href` of a link
 */
fluid.blockEditor.toggleInline = function (record, element, tag, attrs = {}) {
    const selection = document.getSelection();
    if (selection.rangeCount > 0 && element.contains(selection.anchorNode)) {
        const range = selection.getRangeAt(0);
        const anchor = range.commonAncestorContainer;
        const existing = (anchor.nodeType === 1 ? anchor : anchor.parentElement).closest(tag);
        if (existing && element.contains(existing)) {
            existing.replaceWith(...existing.childNodes);
        } else if (!range.collapsed) {
            const wrapper = document.createElement(tag);
            Object.entries(attrs).forEach(([name, value]) => wrapper.setAttribute(name, value));
            wrapper.appendChild(range.extractContents());
            range.insertNode(wrapper);
        }
        element.normalize();
        fluid.blockEditor.commit(record, element, {index: +element.dataset.fluidBlockIndex, atEnd: true});
    }
};

/**
 * Change the kind of a block - e.g. a paragraph into a heading, a quotation or a list - and commit it
 * @param {Object} record - The container's record
 * @param {Element} element - The block's element
 * @param {String} kind - The new kind: "p", "h2"..."h4", "blockquote", "ul" or "ol"
 */
fluid.blockEditor.setKind = function (record, element, kind) {
    const tag = element.tagName.toLowerCase();
    // The inline content of the block, whatever its kind - the items of a list are joined as lines of one paragraph
    const inlineHolder = document.createElement("p");
    if (tag === "ul" || tag === "ol" || tag === "blockquote") {
        [...element.children].forEach((child, i) => {
            if (i > 0) {
                inlineHolder.appendChild(document.createElement("br"));
            }
            [...child.childNodes].forEach(node => inlineHolder.appendChild(node.cloneNode(true)));
        });
    } else {
        [...element.childNodes].filter(node => !fluid.markdownSerializer.isGenerated(node)).forEach(node => inlineHolder.appendChild(node.cloneNode(true)));
    }
    let replacement;
    if (kind === "ul" || kind === "ol" || kind === "blockquote") {
        replacement = document.createElement(kind);
        const item = replacement.appendChild(document.createElement(kind === "blockquote" ? "p" : "li"));
        [...inlineHolder.childNodes].forEach(node => item.appendChild(node));
    } else {
        replacement = document.createElement(kind);
        [...inlineHolder.childNodes].forEach(node => replacement.appendChild(node));
    }
    replacement.dataset.fluidBlockIndex = element.dataset.fluidBlockIndex;
    const index = +element.dataset.fluidBlockIndex;
    fluid.blockEditor.splice(record, index, index, fluid.markdownSerializer.block(replacement), {index, atEnd: true});
};

/**
 * Find the component of a widget held in a block, by its element's `fluid-id`
 * @param {Object} record - The container's record
 * @param {Element} island - The widget's element
 * @return {fluid.component|null} Its component, or null if it has none
 */
fluid.blockEditor.islandComponent = function (record, island) {
    const id = island.getAttribute("fluid-id");
    // A child of the block's component, or of its view, whichever renders the markup holding it
    const shadow = record.that[fluid.metadataSymbol].childComponents[id] || record.that.view?.[fluid.metadataSymbol]?.childComponents[id];
    return shadow ? fluid.proxyMat(shadow.computer, shadow, []) : null;
};

/**
 * Find the block of the source holding a widget's element, by its `fluid-id`
 * @param {Object} record - The container's record
 * @param {Element} island - The widget's element
 * @return {Number} The block's index, or -1 if none holds it
 */
fluid.blockEditor.islandBlock = function (record, island) {
    const lines = record.source.split("\n");
    const marker = `fluid-id="${island.getAttribute("fluid-id")}"`;
    return record.blocks.findIndex(block => block.startLine !== null && lines.slice(block.startLine, block.endLine).some(line => line.includes(marker)));
};

/**
 * Write the state a widget now holds back into its element in the source, if it has changed
 * @param {Object} record - The container's record
 * @param {Element} island - The widget's element
 */
fluid.blockEditor.saveIsland = function (record, island) {
    const that = fluid.blockEditor.islandComponent(record, island);
    const index = fluid.blockEditor.islandBlock(record, island);
    if (that && index >= 0) {
        const attrs = fluid.elementAttrs(island);
        const potentia = fluid.ptf.islandPotentia(that, attrs);
        if (JSON.stringify(potentia) !== JSON.stringify(fluid.parsePotentiaText(attrs[fluid.potentiaAttribute]))) {
            const markup = fluid.ptf.islandMarkup({layers: attrs["fluid-layers"].split(/\s+/).filter(layer => layer),
                id: attrs["fluid-id"], potentia, tag: island.tagName.toLowerCase()});
            fluid.blockEditor.splice(record, index, index, markup);
        }
    }
};

/**
 * Determine whether an element takes typed text, so that Delete and Backspace are its own rather than deleting a widget
 * @param {Element|null} element - The element, e.g. the document's active element
 * @return {Boolean} `true` if it takes typed text
 */
fluid.blockEditor.isTypingInto = function (element) {
    return !!element && (["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) || element.isContentEditable === true);
};

// The attribute marking the widget selected, e.g. to be copied - never written into the source, since a widget is
// written from its layers, id and potentia alone. It is marked afresh on the widget's element as the blocks render
// afresh, and removed once they cease to be edited - see fluid.blockEditor.apply
fluid.blockEditor.selectedAttribute = "data-fluid-block-selected";

/**
 * Select a widget of a container, e.g. once pressed on, marking it as selected - or select none
 * @param {Object} record - The container's record
 * @param {Element|null} island - The widget's element, or null to select none
 */
fluid.blockEditor.selectIsland = function (record, island) {
    if (record.selectedIsland && record.selectedIsland !== island) {
        record.selectedIsland.removeAttribute(fluid.blockEditor.selectedAttribute);
    }
    record.selectedIsland = island;
    if (island) {
        island.setAttribute(fluid.blockEditor.selectedAttribute, "");
    }
};

/**
 * Flash a short message over an element, e.g. "Copied" over a widget copied to the clipboard, fading after a moment -
 * in place of any flash still showing
 * @param {Element} element - The element
 * @param {String} message - The message
 * @return {Element} The flash's element, which removes itself once faded
 */
fluid.blockEditor.flash = function (element, message) {
    // Any flash still showing, e.g. from a copy a moment ago, gives way to this one
    document.querySelectorAll(".fluid-block-flash").forEach(previous => previous.remove());
    const bounds = element.getBoundingClientRect();
    const flash = document.createElement("div");
    flash.className = "fluid-block-flash";
    // The extension's own - see bridge.js
    flash.setAttribute("data-fluid-edit-ui", "");
    flash.setAttribute("role", "status");
    flash.textContent = message;
    flash.style.left = (window.scrollX + bounds.left + bounds.width / 2) + "px";
    flash.style.top = (window.scrollY + bounds.top + Math.min(bounds.height / 2, 60)) + "px";
    document.body.appendChild(flash);
    setTimeout(() => flash.classList.add("fluid-block-flash-fading"), 900);
    setTimeout(() => flash.remove(), 1400);
    return flash;
};

/**
 * Make what is put on the clipboard when a widget is copied
 * @param {Object} record - The container's record
 * @param {Element} island - The widget's element
 * @return {Object|null} `{ptf, markup}` - its PTF document, and its element as written in the source - or null if it
 * has no component
 */
fluid.blockEditor.copyIsland = function (record, island) {
    const that = fluid.blockEditor.islandComponent(record, island);
    let togo = null;
    if (that) {
        const attrs = fluid.elementAttrs(island);
        togo = {
            ptf: fluid.ptf.encode(fluid.ptf.islandToParts(that, attrs)),
            markup: fluid.ptf.islandMarkup({layers: attrs["fluid-layers"].split(/\s+/).filter(layer => layer),
                potentia: fluid.ptf.islandPotentia(that, attrs)})
        };
    }
    return togo;
};

/**
 * Allocate a `fluid-id` for a widget, unused in the source - from the last segment of its layer, e.g. "counter-1"
 * @param {String} source - The source
 * @param {String} layer - The widget's layer
 * @return {String} The id
 */
fluid.blockEditor.allocateId = function (source, layer) {
    const stem = layer.split(".").pop().replace(/[^\w-]/g, "") || "widget";
    let n = 1;
    while (source.includes(`fluid-id="${stem}-${n}"`)) {
        ++n;
    }
    return stem + "-" + n;
};

/**
 * @typedef {Object} BlockSlot
 * @property {Number} index - The index of the block replaced by the slot's filling
 * @property {String} head - The markdown preceding the filling in place of the block, or "" for none
 * @property {String} tail - The markdown following it, or "" for none
 */

/**
 * Find the slot at which to insert a block - after the block, or, if a range within an editable paragraph or heading
 * is given, at the range, splitting the block there. A block not drawn from the source, e.g. one its template makes,
 * is passed over for the nearest before it which is
 * @param {Object} record - The container's record
 * @param {Element} element - The block's element
 * @param {Range|null} [range] - The range at which to insert, e.g. the caret, or where a file was dropped
 * @return {BlockSlot} The slot
 */
fluid.blockEditor.slotAt = function (record, element, range) {
    let index = +element.dataset.fluidBlockIndex;
    while (index > 0 && record.blocks[index].startLine === null) {
        --index;
    }
    const own = record.elements[index] === element ? element : null;
    const tag = own ? own.tagName.toLowerCase() : "";
    const splits = own && own.getAttribute("data-fluid-block") === "editable" && (tag === "p" || /^h[1-6]$/.test(tag)) &&
        range && own.contains(range.startContainer) && own.contains(range.endContainer);
    let togo;
    if (splits) {
        const serializer = fluid.markdownSerializer;
        const before = document.createRange();
        before.selectNodeContents(own);
        before.setEnd(range.startContainer, range.startOffset);
        const after = document.createRange();
        after.selectNodeContents(own);
        after.setStart(range.endContainer, range.endOffset);
        const hasHead = before.toString().trim() !== "";
        // The head keeps the block's kind, as does the whole block when the slot is at its start - otherwise the tail is
        // a paragraph, as a new paragraph splitting it is
        const headHolder = own.cloneNode(false);
        headHolder.appendChild(before.cloneContents());
        const tailHolder = hasHead ? document.createElement("p") : own.cloneNode(false);
        tailHolder.appendChild(after.cloneContents());
        togo = {
            index,
            head: hasHead ? serializer.block(headHolder) : "",
            tail: after.toString().trim() !== "" ? serializer.block(tailHolder) : ""
        };
    } else {
        const block = record.elements[index];
        togo = {
            index,
            head: block && block.getAttribute("data-fluid-block") === "editable" ? fluid.markdownSerializer.block(block) :
                record.source.split("\n").slice(record.blocks[index].startLine, record.blocks[index].endLine).join("\n"),
            tail: ""
        };
    }
    return togo;
};

/**
 * Find where something dragged over the blocks would land if dropped, as the drop finds it - see fluid.blockEditor.listen
 * @param {Object} record - The container's record
 * @param {DragEvent} event - The drag
 * @param {Element|null} island - The widget dragged over, which a widget dropped takes the place of, or null
 * @param {Function} editableOf - Finds the editable block holding a node
 * @return {Object|null} `{kind, rect}` - `kind` "island" for a widget displaced, "text" for a caret within a paragraph or
 * heading which the drop splits, "block" for the slot after a block - with `rect` its place in the viewport - or null
 */
fluid.blockEditor.dropPlace = function (record, event, island, editableOf) {
    const range = document.caretRangeFromPoint ? document.caretRangeFromPoint(event.clientX, event.clientY) : null;
    const target = (range && editableOf(range.startContainer)) || event.target.closest?.("[data-fluid-block-index]");
    const element = target && record.container.contains(target) ? target : fluid.peek(record.elements.filter(one => one));
    const tag = element ? element.tagName.toLowerCase() : "";
    const splits = !!element && !!range && element.getAttribute("data-fluid-block") === "editable" &&
        (tag === "p" || /^h[1-6]$/.test(tag)) && element.contains(range.startContainer);
    const caretRect = splits ? [...range.getClientRects()].find(rect => rect.height > 0) || range.getBoundingClientRect() : null;
    let togo = null;
    if (island) {
        togo = {kind: "island", rect: island.getBoundingClientRect()};
    } else if (caretRect && caretRect.height > 0) {
        togo = {kind: "text", rect: caretRect};
    } else if (element) {
        togo = {kind: "block", rect: element.getBoundingClientRect()};
    }
    return togo;
};

/**
 * Show where something dragged would land if dropped - a caret sliding through the text, a bar beneath the block it
 * would follow, or an outline of the widget it would take the place of - see fluid.blockEditor.dropPlace
 * @param {Object|null} place - The place, or null to show none
 */
fluid.blockEditor.showDropCaret = function (place) {
    let caret = document.querySelector(".fluid-block-drop-caret");
    if (place) {
        if (!caret) {
            caret = document.createElement("div");
            caret.className = "fluid-block-drop-caret";
            // The extension's own - see bridge.js
            caret.setAttribute("data-fluid-edit-ui", "");
            caret.setAttribute("aria-hidden", "true");
            document.body.appendChild(caret);
        }
        const rect = place.rect;
        const left = window.scrollX + rect.left, top = window.scrollY + rect.top;
        caret.setAttribute("data-fluid-drop-kind", place.kind);
        Object.assign(caret.style, place.kind === "text" ? {left: left + "px", top: top + "px", width: "", height: rect.height + "px"} :
            place.kind === "block" ? {left: left + "px", top: (top + rect.height + 2) + "px", width: rect.width + "px", height: ""} :
                {left: left + "px", top: top + "px", width: rect.width + "px", height: rect.height + "px"});
    } else if (caret) {
        caret.remove();
    }
};

/**
 * Cease showing where something dragged would land
 */
fluid.blockEditor.hideDropCaret = () => fluid.blockEditor.showDropCaret(null);

// A drag ended anywhere, e.g. abandoned with Escape, leaves no caret behind
document.addEventListener("dragend", fluid.blockEditor.hideDropCaret);
document.addEventListener("drop", fluid.blockEditor.hideDropCaret);

/**
 * Determine whether markdown is a widget's element alone, as fluid.ptf.islandMarkup writes it
 * @param {String} markdown - The markdown
 * @return {Boolean} `true` if it is
 */
fluid.blockEditor.isIsland = markdown => /^\s*<[a-zA-Z][\w-]*\s[^>]*\bfluid-layers\s*=/.test(markdown) && !/\n\s*\n/.test(markdown.trim());

/**
 * Find the slot taking the place of a widget, for another dropped onto it - its line of the source, or the whole block
 * holding it if its element opens the block, so that an element written over several lines is replaced whole. The slot
 * is filled so only by a widget: anything else, e.g. an image, fills `after` instead - see fluid.blockEditor.fillSlotWith
 * @param {Object} record - The container's record
 * @param {Element} island - The widget's element
 * @param {BlockSlot} after - The slot to fill with anything other than a widget
 * @return {BlockSlot} The slot, bearing `displaces` and `after` - or `after` itself if the source holds no such widget
 */
fluid.blockEditor.islandSlot = function (record, island, after) {
    const index = fluid.blockEditor.islandBlock(record, island);
    let togo = after;
    if (index >= 0) {
        const block = record.blocks[index];
        const lines = record.source.split("\n").slice(block.startLine, block.endLine);
        const marker = `fluid-id="${island.getAttribute("fluid-id")}"`;
        const at = lines.findIndex(line => line.includes(marker));
        togo = at === 0 ? {index, head: "", tail: "", displaces: true, after} : {
            index,
            head: lines.slice(0, at).join("\n").trim(),
            tail: lines.slice(at + 1).join("\n").trim(),
            displaces: true,
            after
        };
    }
    return togo;
};

/**
 * Fill a slot with what was made of something dropped or pasted into it - a slot displacing a widget is filled so only
 * by a widget, anything else filling the slot after it - see fluid.blockEditor.islandSlot
 * @param {Object} record - The container's record
 * @param {BlockSlot} slot - The slot
 * @param {String} markdown - What to fill it with
 */
fluid.blockEditor.fillSlotWith = function (record, slot, markdown) {
    fluid.blockEditor.fillSlot(record, slot.displaces && !fluid.blockEditor.isIsland(markdown) ? slot.after : slot, markdown);
};

/**
 * Fill a slot with a block, splicing it into the source as a block of its own
 * @param {Object} record - The container's record
 * @param {BlockSlot} slot - The slot
 * @param {String} markdown - The block, e.g. a widget's element
 */
fluid.blockEditor.fillSlot = function (record, slot, markdown) {
    fluid.blockEditor.splice(record, slot.index, slot.index, [slot.head, markdown, slot.tail].filter(text => text !== "").join("\n\n"));
};

/**
 * Insert a widget after a block, as its own block in the source
 * @param {Object} record - The container's record
 * @param {Element} element - The block after which it is inserted
 * @param {String[]} layers - The widget's layers
 */
fluid.blockEditor.insertWidget = function (record, element, layers) {
    const markup = fluid.ptf.islandMarkup({layers, id: fluid.blockEditor.allocateId(record.source, layers[0])});
    fluid.blockEditor.fillSlot(record, fluid.blockEditor.slotAt(record, element), markup);
};

/**
 * Remove a widget's element from the source, e.g. once it is cut - with the block holding it, if it holds nothing else
 * @param {Object} record - The container's record
 * @param {Element} island - The widget's element
 */
fluid.blockEditor.removeIsland = function (record, island) {
    const index = fluid.blockEditor.islandBlock(record, island);
    if (index >= 0) {
        const block = record.blocks[index];
        const marker = `fluid-id="${island.getAttribute("fluid-id")}"`;
        const lines = record.source.split("\n").slice(block.startLine, block.endLine).filter(line => !line.includes(marker));
        const rest = lines.join("\n").trim();
        if (rest === "") {
            // The whole block goes, with the blank line following it
            const all = record.source.split("\n");
            const end = block.endLine < all.length && all[block.endLine].trim() === "" ? block.endLine + 1 : block.endLine;
            all.splice(block.startLine, end - block.startLine);
            const text = all.join("\n");
            record.source = text;
            record.before = null;
            document.dispatchEvent(new CustomEvent("fluid-block-edit-source", {detail: JSON.stringify({text})}));
        } else {
            fluid.blockEditor.splice(record, index, index, lines.join("\n"));
        }
    }
};

/**
 * Name the file of the repository in which a layer of a pasted widget is written
 * @param {PTFPart} part - The layer's part
 * @return {String} The path, e.g. "static/sfc/fluid-demos-counter.vue"
 */
fluid.blockEditor.layerFile = part => fluid.blockEditor.widgetDir + "/" + part.filename.replace(/\./g, "-") +
    (part.contentType === fluid.layerMimeTypes.sfc ? ".vue" : ".js");

/**
 * Describe the files of the layers a pasted widget brings, for the extension to hold - noting of each whether the page
 * already defines its layer otherwise, so that the extension asks before replacing it. To be called before they are
 * registered
 * @param {PTFPart[]} layerParts - The widget's layer parts
 * @return {Object[]} `{path, text, layer, kind, pageDiffers}` for each
 */
fluid.blockEditor.layerFiles = function (layerParts) {
    return layerParts.map(part => {
        const existing = fluid.readLayer(part.filename).get();
        const defined = !fluid.isUnavailable(existing) && !fluid.isUnavailable(fluid.deSignal(existing.raw));
        return {
            path: fluid.blockEditor.layerFile(part),
            text: part.body,
            layer: part.filename,
            kind: part.contentType === fluid.layerMimeTypes.sfc ? "sfc" : "js",
            pageDiffers: defined && fluid.ptf.layerToPart(part.filename).body !== part.body
        };
    });
};

/**
 * Remove from a widget's potentia where a host such as a tldraw arena placed it - the position and size of its shape,
 * written at its view (see fluid.tldraw.writeShapeConfig) - which mean nothing in a page, together with any records
 * thereby left empty
 * @param {Object} potentia - The widget's potentia, as by `fluid.ptf.islandFromParts`, which is modified
 * @return {Object} The potentia
 */
fluid.blockEditor.stripPlacement = function (potentia) {
    const view = potentia.view && potentia.view.$component;
    if (fluid.isPlainObject(view, true)) {
        delete view.shape;
        delete view.shapeId;
        if (Object.keys(view).length === 0) {
            delete potentia.view.$component;
        }
        if (Object.keys(potentia.view).length === 0) {
            delete potentia.view;
        }
    }
    return potentia;
};

/**
 * Make a pasted widget ready to insert - its layers registered, unless the page defines them already, in which case
 * the extension asks whether to replace them, and its element written
 * @param {PTFPart[]} documentParts - The parts of its PTF document, perhaps wrapping it - see `fluid.ptf.componentParts`
 * @param {String} source - The source into which it is to be inserted, so that its `fluid-id` is unused there
 * @return {Object} `{markup, files}` - its element, and the files of its layers, as by `layerFiles`
 */
fluid.blockEditor.widgetFromParts = function (documentParts, source) {
    // A widget copied out of a tldraw arena arrives wrapped as the one component of its document
    const parts = fluid.ptf.componentParts(documentParts);
    const island = fluid.ptf.islandFromParts(parts);
    fluid.blockEditor.stripPlacement(island.potentia);
    const files = fluid.blockEditor.layerFiles(island.layerParts);
    fluid.ptf.registerLayerParts(parts);
    if (!fluid.blockEditor.widgets.some(widget => widget.layer === island.layers[0])) {
        fluid.blockEditor.widgets.push({layer: island.layers[0]});
    }
    return {
        markup: fluid.ptf.islandMarkup({layers: island.layers, potentia: island.potentia,
            id: fluid.blockEditor.allocateId(source, island.layers[0])}),
        files
    };
};

/**
 * Paste a widget, held on the clipboard as PTF, into a slot. Its layers are registered at once, so that it renders
 * before it is committed, and announced to the extension, which writes them to the site with the source
 * @param {Object} record - The container's record
 * @param {BlockSlot} slot - Where it is pasted
 * @param {String} text - The PTF document
 */
fluid.blockEditor.pasteWidget = function (record, slot, text) {
    const parts = fluid.ptf.decode(text);
    if (fluid.isUnavailable(parts)) {
        console.error("Edit in Infusion: the clipboard holds no PTF document which can be read", parts);
    } else {
        const {markup, files} = fluid.blockEditor.widgetFromParts(parts, record.source);
        document.dispatchEvent(new CustomEvent("fluid-block-edit-files", {detail: JSON.stringify({files})}));
        fluid.blockEditor.fillSlotWith(record, slot, markup);
    }
};

/**
 * Determine whether a drag carries files
 * @param {DataTransfer|null} transfer - The drag's data
 * @return {Boolean} `true` if it does
 */
fluid.blockEditor.carriesFiles = transfer => !!transfer && [...transfer.types].includes("Files");

// The type under which a widget dragged out of another page is carried as PTF - see demo/tldraw/js/tldraw-dragout.js
fluid.blockEditor.ptfDragType = "application/x-ptf";

/**
 * Determine whether a drag carries a widget as PTF, under its own type - only its type is known until it is dropped
 * @param {DataTransfer|null} transfer - The drag's data
 * @return {Boolean} `true` if it does
 */
fluid.blockEditor.carriesPTF = transfer => !!transfer && [...transfer.types].includes(fluid.blockEditor.ptfDragType);

// The slots awaiting what the extension makes of files dropped into them, by id
fluid.blockEditor.slots = new Map();
fluid.blockEditor.slotCount = 0;

/**
 * Encode bytes as base64
 * @param {ArrayBuffer} buffer - The bytes
 * @return {String} Their base64
 */
fluid.blockEditor.toBase64 = function (buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
};

/**
 * Hand files dropped into a slot to the extension, as the event "fluid-block-edit-drop", to fill it
 * @param {Object} record - The container's record
 * @param {BlockSlot} slot - Where they were dropped
 * @param {File[]} files - The files
 * @return {Promise} Resolves once announced
 */
fluid.blockEditor.dropFiles = async function (record, slot, files) {
    const id = String(++fluid.blockEditor.slotCount);
    fluid.blockEditor.slots.set(id, {record, slot, source: record.source});
    const read = await Promise.all(files.map(async file => ({name: file.name, type: file.type,
        content: fluid.blockEditor.toBase64(await file.arrayBuffer())})));
    document.dispatchEvent(new CustomEvent("fluid-block-edit-drop", {detail: JSON.stringify({slot: id, files: read})}));
};

/**
 * Fill the slot into which files were dropped with what the extension made of them - unless the source has changed
 * meanwhile, when it is filled after the block it was in
 * @param {String} id - The slot's id, as announced with the files
 * @param {String} markdown - What to fill it with, e.g. a widget's element, or an image
 * @return {Boolean} `true` if the slot was filled
 */
fluid.blockEditor.fillSlotById = function (id, markdown) {
    const held = fluid.blockEditor.slots.get(id);
    fluid.blockEditor.slots.delete(id);
    if (held && markdown) {
        const {record, slot} = held;
        const element = record.elements[slot.index];
        fluid.blockEditor.fillSlotWith(record, record.source === held.source || !element ? slot : fluid.blockEditor.slotAt(record, element), markdown);
    }
    return !!held;
};

// The floating toolbar, shown over the block in hand - one for the page, made on first use
fluid.blockEditor.toolbar = {
    element: null,
    record: null,
    block: null
};

/**
 * Make the toolbar
 * @return {Element} The toolbar's element
 */
fluid.blockEditor.toolbar.make = function () {
    const bar = document.createElement("div");
    bar.className = "fluid-block-toolbar";
    // The extension's own - see bridge.js
    bar.setAttribute("data-fluid-edit-ui", "");
    bar.setAttribute("role", "toolbar");
    bar.innerHTML = `
        <select class="fluid-block-kind" title="Kind of block" aria-label="Kind of block">
            <option value="p">Text</option><option value="h2">Heading</option><option value="h3">Subheading</option>
            <option value="h4">Minor heading</option><option value="blockquote">Quotation</option>
            <option value="ul">Bulleted list</option><option value="ol">Numbered list</option>
        </select>
        <button data-command="strong" title="Bold (Ctrl+B)" aria-label="Bold"><b>B</b></button>
        <button data-command="em" title="Italic (Ctrl+I)" aria-label="Italic"><i>I</i></button>
        <button data-command="code" title="Code (Ctrl+E)" aria-label="Code"><code>&lt;/&gt;</code></button>
        <button data-command="link" title="Link" aria-label="Link"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/></svg></button>
        <span class="fluid-block-link" hidden><input type="url" placeholder="https://..." aria-label="Link address"><button data-command="link-apply">Apply</button></span>
        <span class="fluid-block-widgets"><select class="fluid-block-widget" title="Widget to insert" aria-label="Widget to insert"></select><button data-command="widget-insert" title="Insert the widget after this block" aria-label="Insert widget">+</button></span>`;
    // The selection within the block is kept while the toolbar is used
    bar.addEventListener("mousedown", event => {
        if (!event.target.closest("select, input")) {
            event.preventDefault();
        }
    });
    let savedRange = null;
    bar.addEventListener("click", event => {
        const button = event.target.closest("button");
        const {record, block} = fluid.blockEditor.toolbar;
        if (button && record && block) {
            const command = button.dataset.command;
            const linkRow = bar.querySelector(".fluid-block-link");
            if (command === "link") {
                savedRange = document.getSelection().rangeCount > 0 ? document.getSelection().getRangeAt(0).cloneRange() : null;
                linkRow.hidden = !linkRow.hidden;
                linkRow.querySelector("input").focus();
            } else if (command === "widget-insert") {
                const layer = bar.querySelector(".fluid-block-widget").value;
                if (layer) {
                    fluid.blockEditor.insertWidget(record, block, [layer]);
                }
            } else if (command === "link-apply") {
                const href = linkRow.querySelector("input").value.trim();
                linkRow.hidden = true;
                if (savedRange && href) {
                    document.getSelection().removeAllRanges();
                    document.getSelection().addRange(savedRange);
                    fluid.blockEditor.toggleInline(record, block, "a", {href});
                }
            } else {
                fluid.blockEditor.toggleInline(record, block, command);
            }
        }
    });
    bar.querySelector(".fluid-block-kind").addEventListener("change", event => {
        const {record, block} = fluid.blockEditor.toolbar;
        if (record && block) {
            fluid.blockEditor.setKind(record, block, event.target.value);
        }
    });
    document.body.appendChild(bar);
    return bar;
};

/**
 * Show the toolbar over a block
 * @param {Object} record - The container's record
 * @param {Element} block - The block's element
 */
fluid.blockEditor.toolbar.show = function (record, block) {
    const toolbar = fluid.blockEditor.toolbar;
    toolbar.element = toolbar.element && toolbar.element.isConnected ? toolbar.element : toolbar.make();
    toolbar.record = record;
    toolbar.block = block;
    const tag = block.tagName.toLowerCase();
    toolbar.element.querySelector(".fluid-block-kind").value = ["h5", "h6"].includes(tag) ? "h4" : tag === "h1" ? "h2" : tag;
    // The widgets offered - the site's, and any pasted since
    const widgetSelect = toolbar.element.querySelector(".fluid-block-widget");
    const offered = fluid.blockEditor.widgets.map(widget => widget.layer);
    if ([...widgetSelect.options].map(option => option.value).join(" ") !== offered.join(" ")) {
        widgetSelect.innerHTML = "";
        offered.forEach(layer => {
            const option = widgetSelect.appendChild(document.createElement("option"));
            option.value = layer;
            option.textContent = layer.split(".").pop();
        });
    }
    toolbar.element.querySelector(".fluid-block-widgets").hidden = offered.length === 0;
    toolbar.element.hidden = false;
    // Placed relative to the toolbar's offset parent, which scrolls - e.g. the page's body, whilst a panel is docked
    // beside it - or else to the document
    const bounds = block.getBoundingClientRect();
    const parent = toolbar.element.offsetParent || document.documentElement;
    const origin = parent === document.body && getComputedStyle(parent).position === "static" && getComputedStyle(parent).contain === "none" ?
        {top: -window.scrollY, left: -window.scrollX, scrollTop: 0, scrollLeft: 0} :
        {top: parent.getBoundingClientRect().top, left: parent.getBoundingClientRect().left, scrollTop: parent.scrollTop, scrollLeft: parent.scrollLeft};
    toolbar.element.style.top = Math.max(0, bounds.top - origin.top + origin.scrollTop - 44) + "px";
    toolbar.element.style.left = Math.max(0, bounds.left - origin.left + origin.scrollLeft) + "px";
};

/**
 * Hide the toolbar
 */
fluid.blockEditor.toolbar.hide = function () {
    const toolbar = fluid.blockEditor.toolbar;
    if (toolbar.element && !toolbar.element.contains(document.activeElement)) {
        toolbar.element.hidden = true;
        toolbar.block = null;
    }
};

/**
 * Determine whether an element is within the toolbar
 * @param {Element|null} element - The element
 * @return {Boolean} `true` if it is
 */
fluid.blockEditor.toolbar.holds = element => !!(element && fluid.blockEditor.toolbar.element && fluid.blockEditor.toolbar.element.contains(element));
</script>

<style>
.fluid-block-editing [data-fluid-block="editable"] {
    border-radius: 3px;
    transition: background-color 0.15s, box-shadow 0.15s;
    cursor: text;
}

.fluid-block-editing [data-fluid-block="editable"]:hover {
    background-color: rgba(43, 108, 176, 0.05);
}

.fluid-block-editing [data-fluid-block="editable"]:focus {
    outline: none;
    background-color: rgba(43, 108, 176, 0.06);
    box-shadow: -4px 0 0 #2b6cb0;
}

.fluid-block-editing [data-fluid-block-current] {
    box-shadow: -4px 0 0 #c77800;
    background-color: rgba(199, 120, 0, 0.06);
}

.fluid-block-editing [data-fluid-block="source"],
.fluid-block-editing [data-fluid-block="island"] {
    box-shadow: -4px 0 0 #bbb;
}

.fluid-block-editing [data-fluid-block-selected] {
    outline: 2px solid #2b6cb0;
    outline-offset: 3px;
    border-radius: 2px;
}

.fluid-block-flash {
    position: absolute;
    z-index: 2147482001;
    transform: translate(-50%, -50%);
    padding: 6px 14px;
    border-radius: 999px;
    background: #1f2933;
    color: #f5f7fa;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
    font: 600 13px/1 system-ui, sans-serif;
    pointer-events: none;
    opacity: 1;
    transition: opacity 0.5s ease;
}

.fluid-block-flash.fluid-block-flash-fading {
    opacity: 0;
}

/* Where something dragged would land - see fluid.blockEditor.showDropCaret. It slides as the drag moves */
.fluid-block-drop-caret {
    position: absolute;
    z-index: 2147482001;
    pointer-events: none;
    box-sizing: border-box;
    transition: left 0.08s ease-out, top 0.08s ease-out, width 0.08s ease-out, height 0.08s ease-out;
}

.fluid-block-drop-caret[data-fluid-drop-kind="text"] {
    width: 2px;
    margin-left: -1px;
    background: #2b6cb0;
}

.fluid-block-drop-caret[data-fluid-drop-kind="block"] {
    height: 3px;
    border-radius: 2px;
    background: #2b6cb0;
}

.fluid-block-drop-caret[data-fluid-drop-kind="island"] {
    outline: 2px dashed #2b6cb0;
    outline-offset: 3px;
    border-radius: 2px;
    background: rgba(43, 108, 176, 0.08);
}

.fluid-block-toolbar {
    position: absolute;
    z-index: 2147482000;
    display: flex;
    gap: 2px;
    align-items: center;
    padding: 4px;
    border-radius: 8px;
    background: #1f2933;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
    font: 13px/1 system-ui, sans-serif;
}

.fluid-block-toolbar[hidden],
.fluid-block-toolbar [hidden] {
    display: none;
}

.fluid-block-widgets {
    display: flex;
    gap: 2px;
    margin-left: 6px;
    padding-left: 6px;
    border-left: 1px solid #3e4c59;
}

.fluid-block-toolbar button,
.fluid-block-toolbar select,
.fluid-block-toolbar input {
    min-width: 30px;
    height: 30px;
    padding: 0 8px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: #f5f7fa;
    font: inherit;
    cursor: pointer;
}

.fluid-block-toolbar select {
    background: #323f4b;
}

.fluid-block-toolbar option {
    color: #1f2933;
    background: #fff;
}

.fluid-block-toolbar input {
    width: 220px;
    background: #f5f7fa;
    color: #1f2933;
    cursor: text;
}

.fluid-block-toolbar button:hover,
.fluid-block-toolbar button:focus-visible {
    background: #3e4c59;
}

.fluid-block-toolbar code {
    font-size: 12px;
}
</style>
