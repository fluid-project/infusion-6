/* global QUnit, StubQUnit, d3, dagreD3, CodeMirror */

"use strict";

// ============================================================================
// Reactive Wrapper for Timeline Tracking
// ============================================================================

// Create fluid.vizReactive namespace for instrumented reactive methods
fluid.vizReactive = {};

/** @type {TestTimeline|null} */
fluid.vizReactive.currentTimeline = null;

fluid.vizReactive.annotations = [];

fluid.vizReactive.colours = {
    statement: "#4a90e2", // "#008eda", //"#3333ff", //"#4a90e2"
    computed: "#bb44ff" // "#ff33ff" //"#e24a4a"
};

// Cell state visualization
fluid.vizReactive.cellStateInfo = [{ // 0: CacheClean
    name: "Clean",
    colour: "#ECECFF"
}, {
    name: "Check",
    colour: "#afa"
}, {
    name: "Dirty",
    colour: "#f99"
}];

// ============================================================================
// Sequence Point Management
// ============================================================================

/**
 * @typedef {Object} SequencePoint
 * @property {Boolean} executed - Indicates whether this sequence point has been executed.
 * @property {Number} [statementIndex] - Index of the statement associated with this point (if applicable).
 * @property {Number} [computeIndex] - Index of the computation associated with this point (if applicable).
 * @property {Number} [sequenceIndex] - Index of this point in the overall sequence.
 * @property {String} [type] - Type of the sequence point ("statement" or "computed").
 * @property {String} [text] - Description or label for the sequence point.
 * @property {Edge} [edge] - Associated edge object (for computations).
 * @property {String} [edgeKey] - Key identifying the edge (for computations).
 * @property {String[]} [causeNames] - Names of cause cells (for computations).
 * @property {Promise} [wait] - Promise used for sequencing execution.
 * @property {Function} [resolve] - Function to resolve the wait promise.
 * @property {Function} [reject] - Function to reject the wait promise.
 * @property {Error} [error] - Error encountered during execution.
 */


/**
 * Creates a SequencePoint object representing a step in the test timeline.
 *
 * @param {Object} props - Properties to assign to the sequence point.
 * @return {SequencePoint} The created sequence point object.
 */
fluid.vizReactive.SequencePoint = function (props) {
    return {
        executed: false,
        ...props
    };
};

/**
 * @typedef {Object} TestTimeline
 * @property {String} testName - Name of the test.
 * @property {Array<Object>} statements - Array of statement token objects for the test.
 * @property {String} funcText - Source code of the test function.
 * @property {AsyncFunction} transformedFunc - Async function representing the transformed test.
 * @property {Object} [annotations] - Optional annotation data for the test.
 * @property {Object} assert - QUnit assert object for test assertions.
 * @property {Object} stubAssert - Stub assert object for dry runs.
 * @property {Array<SequencePoint>} sequencePoints - All sequence points (statements and computations) in order.
 * @property {Array<SequencePoint>} statementSequencePoints - Sequence points for statements.
 * @property {Array<SequencePoint>} computeSequencePoints - Sequence points for computations.
 * @property {Object<String, Array<{sequenceIndex: Number, causeNames: Array<String>}>>} edgeInvocations - Map from edgeKey to array of invocation info.
 * @property {Number} currentIndex - Current index in the sequencePoints array.
 * @property {Array<Object>} cells - Array of cell objects involved in the test.
 * @property {Boolean} initialRun - True if this is the initial dry run to collect sequence points.
 * @property {Object<String, Number>} edgeInvocationIndices - Map from edgeKey to current invocation index.
 * @property {Object} [codeMirror] - CodeMirror editor instance for code display.
 * @property {HTMLElement} [container] - DOM container for the timeline UI.
 * @property {Function} [cleanup] - Cleanup function to reset state after test.
 */

/**
 * Construct a TestTimeline object given partial contents
 * @param {Object} options - Partial contents for the timeline
 * @return {TestTimeline} - The instantiated timeline object
 */
fluid.vizReactive.TestTimeline = function (options) {
    const timeline = {
        ...options,
        // Ephemeral properties reset for each run
        currentIndex: 0,
        cells: [],
        edgeInvocationIndices: {}
    };

    return timeline;
};

fluid.vizReactive.initTimeline = function () {
    return {
        sequencePoints: [],
        statementSequencePoints: [],
        computeSequencePoints: [],
        edgeInvocations: {},
        // Updated in forward step
        steppingForward: false,
        // Updated in updateCodeHighlight
        currentStatementPosition: null,
        initialRun: true,
        assertMarkers: []
    };
};

fluid.vizReactive.getStatementSequenceWait = function (statementIndex) {
    const timeline = fluid.vizReactive.currentTimeline;
    const sequenceIndex = timeline.sequencePoints.length;

    if (timeline.initialRun) {
        const sequencePoint = fluid.vizReactive.SequencePoint(
            {
                type: "statement",
                text: `→ Executing statement ${statementIndex}`,
                statementIndex, sequenceIndex
            }
        );
        timeline.sequencePoints.push(sequencePoint);
        timeline.statementSequencePoints.push(sequencePoint);
    }
    const point = timeline.statementSequencePoints[statementIndex];
    return point.wait;
};

fluid.vizReactive.edgeToKey = function (edge) {
    return edge.target.name + "-" + (edge.key ? edge.key.name : "null");
};

// Wrapper for asyncComputed that creates red sequence points
fluid.cellPrototype.vizReactiveAsyncComputed = function (arcId, fn, staticSources, props) {

    // Create wrapper that injects red sequence points
    const wrappedFn = async function (...args) {
        const timeline = fluid.vizReactive.currentTimeline;
        const edge = fluid.trackingVars.CurrentReaction;
        const edgeTargetName = edge.target.name;
        const edgeKey = fluid.vizReactive.edgeToKey(edge);
        const computeIndex = timeline.computeSequencePoints.length;
        const sequenceIndex = timeline.sequencePoints.length;
        if (timeline.initialRun) {
            // Log original compute sequence point when computation executes
            const cause = fluid.cell.findAllCauses();
            const causeNames = cause.map(cell => cell.name);
            const nameSources = edge => edge.sources ? edge.sources.map(source => source.name).join(", ") : "null";
            const sequencePoint = fluid.vizReactive.SequencePoint({
                type: "computed",
                text: `→ Computing cell ${edgeTargetName} from sources ${nameSources(edge)}`,
                edge,
                edgeKey, computeIndex, sequenceIndex, causeNames}
            );
            timeline.sequencePoints.push(sequencePoint);
            timeline.computeSequencePoints.push(sequencePoint);
            fluid.pushArray(timeline.edgeInvocations, edgeKey, {sequenceIndex, causeNames, arcId});
        }
        const result = fn.apply(this, args);

        if (!timeline.initialRun) {
            const invocations = timeline.edgeInvocations[edgeKey];
            const invocationIndex = timeline.edgeInvocationIndices[edgeKey];
            const sequencePoint = timeline.sequencePoints[invocations[invocationIndex].sequenceIndex];
            await sequencePoint.wait;
            ++timeline.edgeInvocationIndices[edgeKey];
        }

        return result;
    };

    // Call the original asyncComputed with the wrapped function
    return fluid.cellPrototype.asyncComputed.call(this, fn && wrappedFn, staticSources, props);
};

fluid.vizReactive.cell = function (initialValue, props) {
    const cell = fluid.cell(initialValue, props);
    fluid.vizReactive.madeCells.push(cell);
    return cell;
};

fluid.vizReactive.stepForward = function (timeline) {
    if (timeline.currentIndex < timeline.sequencePoints.length) {
        const point = timeline.sequencePoints[timeline.currentIndex];
        ++timeline.currentIndex;
        timeline.steppingForward = true;
        point.resolve();
        setTimeout(() => {
            fluid.vizReactive.updateTimelineUI(timeline);
            timeline.steppingForward = false;
        }, 0);
    }
};

fluid.vizReactive.stepBackward = function (timeline) {
    if (timeline.currentIndex > 0) {
        // noinspection JSIgnoredPromiseFromCall
        fluid.vizReactive.resetTimeline(timeline, timeline.currentIndex - 1);

        setTimeout(() => fluid.vizReactive.updateTimelineUI(timeline), 0);
    }
};

fluid.vizReactive.trimAssertMarks = function (timeline) {
    const currentLine = timeline.currentStatementPosition?.line || 0;
    timeline.assertMarkers = timeline.assertMarkers.filter(markerLine => {
        if (markerLine >= currentLine - 1) {
            timeline.codeMirror.setGutterMarker(markerLine, "vizreactive-assert-markers", null);
            return false;
        } else {
            return true;
        }
    });
};

fluid.vizReactive.resetTimeline = async function (timeline, newIndex) {
    timeline.currentIndex = newIndex;
    timeline.edgeInvocationIndices = fluid.transform(timeline.edgeInvocations, () => 0);

    // Clear cells
    fluid.vizReactive.madeCells = [];

    let aborted = false;
    timeline.sequencePoints.forEach((point, index) => {
        if (!point.executed && point.wait && !aborted) {
            point.reject(new Error("Abort sequence"));
            aborted = true;
        }

        point.executed = false;
        point.error = null;

        point.wait = new Promise((resolve, reject) => {
            point.resolve = resolve;
            point.reject = reject;
        });
        if (index < timeline.currentIndex) {
            point.resolve();
        }
        point.wait.then(() => {
            point.executed = true;
            if (index === newIndex - 1) { // We have reached the present
                fluid.vizReactive.trimAssertMarks(timeline);
            }
        }, () => {
            console.log("Rejected");
        });
    });

    try {
        await timeline.transformedFunc(timeline.stubAssert);
    } catch (e) {
        console.log("Aborted");
    }
};

fluid.vizReactive.renderSelect = function (allTests, currentTest) {
    return "<select class='timeline-select'>" +
        allTests.map(test =>
            `<option value="${test.testName}"${test.testName === currentTest ? " selected" : ""}>${test.testName}</option>`
        ).join("") +
        "</select>";
};

fluid.vizReactive.normaliseTestName = function (testName) {
    return encodeURIComponent(testName.trim().toLowerCase().replace(/\s+/g, "_"));
};

fluid.vizReactive.getSelectedTest = function (allTests) {
    const params = new URLSearchParams(window.location.search);
    const selectedTestParam = params.get("selectedTest");
    let selectedTest = allTests[0];
    if (selectedTestParam) {
        const found = allTests.find(test => fluid.vizReactive.normaliseTestName(test.testName) === selectedTestParam);
        if (found) {
            selectedTest = found;
        }
    }
    return selectedTest;
};

fluid.vizReactive.pushSelectedTest = function (testName) {
    // Update the URL with the normalised test name
    const normalised = fluid.vizReactive.normaliseTestName(testName);
    const url = new URL(window.location);
    url.searchParams.set("selectedTest", normalised);
    history.pushState({}, "", url);
};

// ============================================================================
// Timeline UI
// ============================================================================

fluid.vizReactive.createTimelineUI = function (targetContainer, timeline, allTests) {
    const containerId = "vizreactive-timeline";

    let container = document.getElementById(containerId);
    if (!container) {
        container = document.createElement("div");
        container.id = containerId;
        container.className = "timeline-container";
        targetContainer.appendChild(container);
        fluid.vizReactive.applyTooltips(container);
    }
    const selectedTest = fluid.vizReactive.getSelectedTest(allTests);

    const selectText = fluid.vizReactive.renderSelect(allTests, selectedTest.testName);

    container.innerHTML = `
        <div class="timeline-header">
            ${selectText}
        </div>
        <div class="timeline-body">
            <div class="signal-viz"></div>
            <div class="signal-code-holder">
                <input type="textarea" class="codemirror-holder" />
            </div>
        </div>
        <div class="timeline-controls">
            <button class="btn-prev timeline-btn">◀ Previous</button>
            <button class="btn-next timeline-btn">Next ▶</button>
            <button class="btn-reset timeline-btn">Reset</button>
        </div>
        <div class="timeline-sequence"></div>
        <div class="timeline-statement"></div>
    `;

    // Add event listeners
    container.querySelector(".btn-prev").onclick = () => fluid.vizReactive.stepBackward(timeline);
    container.querySelector(".btn-next").onclick = () => fluid.vizReactive.stepForward(timeline);
    container.querySelector(".btn-reset").onclick = () => {
        // noinspection JSIgnoredPromiseFromCall
        fluid.vizReactive.resetTimeline(timeline, 0);
        fluid.vizReactive.updateTimelineUI(timeline);
    };
    container.querySelector(".timeline-select").onchange = (e) => {
        const testName = e.target.value;
        const testText = allTests.find(test => test.testName === testName).testText;
        // noinspection JSIgnoredPromiseFromCall
        fluid.vizReactive.updateTestText(timeline, testName, testText, false);
        fluid.vizReactive.pushSelectedTest(testName);
    };

    const pushAnnotations = function (annotations) {
        const hasError = annotations.some(annotation => annotation.severity === "error");
        if (!hasError && timeline.codeMirror) {
            const newText = timeline.codeMirror.getValue();
            if (newText !== timeline.funcText) {
                // noinspection JSIgnoredPromiseFromCall
                fluid.vizReactive.updateTestText(timeline, timeline.testName, newText, true);
            }
        }
    };

    const textarea = container.querySelector(".codemirror-holder");
    timeline.codeMirror = CodeMirror.fromTextArea(textarea, {
        mode: "javascript",
        lineNumbers: true,
        matchBrackets: true,
        lineWrapping: true,
        gutters: ["CodeMirror-lint-markers", "vizreactive-assert-markers"],
        lint: {
            esversion: 2021,
            onUpdateLinting: annotations => pushAnnotations(annotations),
            tooltips: true
        }
    });

    // noinspection JSIgnoredPromiseFromCall
    fluid.vizReactive.updateTestText(timeline, selectedTest.testName, selectedTest.testText, false);

    return container;
};

fluid.vizReactive.updateCodeHighlight = function (timeline, token, type) {
    const member = type + "Mark";
    const clazz = type + "-highlight";
    if (timeline[member]) {
        timeline[member].clear();
    }
    if (token) {
        const cm = timeline.codeMirror;
        const startPos = cm.posFromIndex(token.from);
        if (type === "statement") {
            timeline.currentStatementPosition = startPos;
        }
        timeline[member] = cm.markText(startPos, cm.posFromIndex(token.to), {className: clazz});
        cm.scrollIntoView(startPos, 20);
    } else {
        timeline[member] = null;
    }
};

/**
 * Updates the timeline UI to reflect the current state of the test timeline.
 * @param {TestTimeline} timeline - The timeline object containing sequence points, statements, and UI state.
 */
fluid.vizReactive.updateTimelineUI = function (timeline) {
    const finished = timeline.currentIndex === timeline.sequencePoints.length;
    const currentStatement = finished ? null : timeline.sequencePoints.findLast((point, index) => point.type === "statement" && index <= timeline.currentIndex);
    const currentStatementToken = currentStatement && timeline.statements[currentStatement.statementIndex];

    const container = timeline.container;
    const sequenceDiv = container.querySelector(".timeline-sequence");
    const statementDiv = container.querySelector(".timeline-statement");

    // Render sequence points
    let html = "<div class=\"sequence-points\">";

    timeline.sequencePoints.forEach((point, idx) => {
        const isActive = idx === timeline.currentIndex;
        const color = fluid.vizReactive.colours[point.type];
        const executed = point.executed || isActive ? "executed" : "";
        const active = isActive ? "active" : "";
        const label = point.type === "statement" ? "S" : "C"; // S=Statement, C=Computation
        const title = point.type === "statement" ? timeline.statements[point.statementIndex].text : "";

        html += `
            <div class="sequence-point ${point.type} ${executed} ${active}"
                 style="background-color: ${color}"
                 title="${title.replace(/"/g, "&quot;")}...">
                <span class="point-label">${label}</span>
                <span class="point-index">${idx + 1}</span>
            </div>
        `;
    });

    html += "</div>";

    // Add arrow indicator
    const pointWidth = 40; // Width + gap
    html += "<div class=\"sequence-arrow\" style=\"left: " +
        (timeline.currentIndex * pointWidth + 10) + "px\">▲</div>";

    sequenceDiv.innerHTML = html;

    const currentPoint = finished ? null : timeline.sequencePoints[timeline.currentIndex];

    let content;

    if (finished) {
        content = `
            <div class="current-statement">
                <div class="statement-header">
                    <strong>Test run finished</strong>
                </div>
            </div>`;
    } else {
        const typeLabel = currentPoint.type === "statement" ? "Statement" : "Computation";
        const typeColor = fluid.vizReactive.colours[currentPoint.type];
        content = `
            <div class="current-statement">
                <div class="statement-header">
                    <strong style="color: ${typeColor}">Step ${timeline.currentIndex}: ${typeLabel}</strong>
                </div>
                <pre>${currentStatementToken.text}</pre>
                <div>${currentPoint.text}</div>
             </div>
        `;
    }

    statementDiv.innerHTML = content;

    // After rendering the UI, update button states
    const prevBtn = container.querySelector(".btn-prev");
    const nextBtn = container.querySelector(".btn-next");

    prevBtn.disabled = timeline.currentIndex <= 0;
    nextBtn.disabled = timeline.currentIndex >= timeline.sequencePoints.length;

    fluid.vizReactive.updateCodeHighlight(timeline, currentStatementToken, "statement");

    if (currentPoint?.type === "computed") {
        const edgeKey = currentPoint.edgeKey;
        const arcId = timeline.edgeInvocations[edgeKey][timeline.edgeInvocationIndices[edgeKey]].arcId;
        const arcToken = timeline.arcTokens[arcId];
        fluid.vizReactive.updateCodeHighlight(timeline, arcToken, "computed");
    } else {
        fluid.vizReactive.updateCodeHighlight(timeline, null, "computed");
    }

    const annotations = timeline.annotations?.notesSequence.find(notes => notes.sequencePoint === timeline.currentIndex + 1);

    fluid.vizReactive.plotCells(container, currentPoint, annotations?.cellNotes, timeline.annotations);
};

fluid.vizReactive.detectBidirectionalEdges = function (edges) {
    const edgeMap = new Map();
    const bidirectional = new Set();

    edges.forEach((edge, idx) => {
        const key = `${edge.source}-${edge.target}`;
        const reverseKey = `${edge.target}-${edge.source}`;

        if (edgeMap.has(reverseKey)) {
            bidirectional.add(key);
            bidirectional.add(reverseKey);
        }
        edgeMap.set(key, idx);
    });

    return bidirectional;
};

/**
 * @typedef {Object} RenderData
 * @property {Map<Object, String>} nodes - Map from cell objects to their unique node IDs for the graph.
 * @property {Array<{source: String, target: String, edge: Object}>} edges - Array of edge objects, each with:
 *   - source: Node ID of the source cell.
 *   - target: Node ID of the target cell.
 *   - edge: The original edge object representing the connection.
 * @property {Set<String>} bidirectional - Set of edge keys (formatted as "source-target") representing bidirectional edges.
 */

/**
 * Generates D3/Dagre render data for the cell graph in the timeline UI.
 *
 * @param {Object[]} cells - Array of cell objects to visualize.
 * @return {RenderData} Render data containing nodes, edges, and bidirectional edge keys for visualization.
 */
fluid.vizReactive.toRenderData = function (cells) {
    // Map of node to its id
    const nodes = new Map();
    const edges = [];

    cells.forEach(cell => {
        const id = cell.name || `cell_${nodes.size}`;
        nodes.set(cell, id);
    });

    cells.forEach(cell => {
        const targetId = nodes.get(cell);
        if (cell._inEdges && cell._inEdges.length > 0) {
            for (const edge of cell._inEdges) {
                if (edge.sources) {
                    for (const source of edge.sources) {
                        const sourceId = nodes.get(source);
                        if (sourceId) {
                            edges.push({ source: sourceId, target: targetId, edge });
                        }
                    }
                }
            }
        }
    });

    const bidirectional = fluid.vizReactive.detectBidirectionalEdges(edges);

    return { nodes, edges, bidirectional };
};

fluid.vizReactive.labelForCell = function (cell) {
    const unavailable = fluid.isUnavailable(cell._value);
    const innerValue = unavailable ? cell._value.staleValue : cell._value;
    // TODO: Prevent hoisting an old unavailable value into a staleValue
    const ultInner = fluid.isUnavailable(innerValue) ? undefined : innerValue;
    const renderedInner = JSON.stringify(ultInner);
    const label = `<div class="node-label"><div class="node-name">${cell.name}</div><div class="node-value">${renderedInner}</div></div>`;
    const useState = unavailable ? (cell._prePendingState || 2) : cell._state;
    const colour = fluid.vizReactive.cellStateInfo[useState].colour;
    return {label, colour};
};

fluid.vizReactive.renderNoteBubble = function (wrap, nodePos, text) {

    // Ensure wrap has position:relative
    wrap.style.position = "relative";

    const nodeDOMRect = nodePos.elem.getBoundingClientRect();
    const wrapDOMRect = wrap.getBoundingClientRect();

    const origin = {
        x: nodeDOMRect.right  - wrapDOMRect.left,
        y: nodeDOMRect.top + nodeDOMRect.height / 2 - wrapDOMRect.top
    };
    const offsetX = 8;
    const leftEdge = origin.x + offsetX;
    const nodeScreenY = origin.y;
    const bubbleW = Math.min(480, wrap.offsetWidth - leftEdge - 48);

    // Build bubble element
    const bubble = document.createElement("div");
    bubble.className = "cell-bubble";
    Object.assign(bubble.style, {
        position:    "absolute",
        left:        leftEdge + "px",
        top:         "0",             // corrected after height known
        width:       bubbleW + "px",
        background:  "#fffbe6",
        border:      "1.5px solid #e2c96f",
        borderRadius:"8px",
        padding:     "10px 12px",
        fontSize:    "13px",
        lineHeight:  "1.5",
        color:       "#3d3d3a",
        boxSizing:   "border-box",
        wordWrap:    "break-word",
        zIndex:      "10"
    });

    // Multi-paragraph text
    bubble.innerHTML = text
        .split(/\n\n+/)
        .map(p => `<p style="margin:0 0 6px 0">${p.replace(/\n/g, "<br>")}</p>`)
        .join("");
    const last = bubble.querySelector("p:last-child");
    if (last) {
        last.style.marginBottom = "0";
    }
    const links = [...bubble.querySelectorAll("a")];
    links.forEach(link => link.target = "_blank");

    // Outer triangle (border colour)
    const t1 = document.createElement("div");
    Object.assign(t1.style, {
        position:     "absolute",
        left:         "-9px",
        width:        "0", height: "0",
        borderTop:    "8px solid transparent",
        borderBottom: "8px solid transparent",
        borderRight:  "9px solid #e2c96f"
    });
    // Inner triangle (fill colour — covers border)
    const t2 = document.createElement("div");
    Object.assign(t2.style, {
        position:     "absolute",
        left:         "-7px",
        width:        "0", height: "0",
        borderTop:    "7px solid transparent",
        borderBottom: "7px solid transparent",
        borderRight:  "8px solid #fffbe6"
    });

    bubble.appendChild(t1);
    bubble.appendChild(t2);
    wrap.appendChild(bubble);

    // After paint: center bubble on nodePos.y and position the detent
    requestAnimationFrame(() => {
        const bh = bubble.offsetHeight;
        const top = Math.max(4, nodeScreenY - bh / 2);
        bubble.style.top = top + "px";
        const detentY = Math.min(Math.max(nodeScreenY - top, 16), bh - 16);
        [t1, t2].forEach(t => {
            t.style.top       = detentY + "px";
            t.style.transform = "translateY(-50%)";
        });
    });
};

/**
 * Updates the D3/Dagre visualization of the cell graph in the timeline UI.
 *
 * @param {HTMLElement} element - The DOM element to render the SVG visualization into.
 * @param {RenderData} renderData - The data for rendering, containing nodes, edges, and bidirectional edge keys.
 * @param {SequencePoint} currentPoint - The current sequence point, used to highlight active nodes/edges.
 * @param {Object<String, String>} [cellNotes] - Any notes to be rendered next to cells.
 * @param {Boolean} [annotations] - Does this test have any annotations
 */
fluid.vizReactive.updateD3Viz = function (element, renderData, currentPoint, cellNotes, annotations) {
    const { nodes, edges, bidirectional } = renderData;

    // Clear previous content
    element.innerHTML = "";

    // Create SVG
    const svg = d3.select(element)
        .append("svg")
        .attr("width", "100%")
        .attr("height", "100%");

    const svgGroup = svg.append("g");

    // Create a new directed graph
    const g = new dagreD3.graphlib.Graph()
        .setGraph({
            rankdir: "TB", // "LR"
            // align: "UL",
            nodesep: 30,
            ranksep: 50,
            marginx: 20,
            marginy: 20
        })
        .setDefaultEdgeLabel(function () { return {}; });

    // Add nodes to graph
    for (const [cell, id] of nodes.entries()) {
        const {label, colour} = fluid.vizReactive.labelForCell(cell);
        const isCause = currentPoint?.causeNames?.includes(cell.name);
        const clazz = isCause ? "node-cause" : "";
        const stroke = isCause ? "#e11" : "#333";
        const width = isCause ? "3px" : "1px";

        g.setNode(id, {
            label: label,
            labelType: "html",
            style: `fill: ${colour}; stroke: ${stroke}; stroke-width: ${width}`,
            class: clazz,
            rx: 1,
            ry: 1
        });
    }

    // Add edges to graph
    edges.forEach(edge => {
        const edgeKey = fluid.vizReactive.edgeToKey(edge.edge);
        const isBidirectional = bidirectional.has(edgeKey);

        const updating = edgeKey === currentPoint?.edgeKey;

        const edgeColour = updating ? "#e11" : "#666";
        const width = updating ? "3px" : "1.5px";

        g.setEdge(edge.source, edge.target, {
            style: `stroke: ${edgeColour}; stroke-width: ${width}; fill: none`,
            arrowheadStyle: `fill: ${edgeColour}; stroke: ${edgeColour}; stroke-width: 0px`,

            curve: d3.curveBasis,
            bidirectional: isBidirectional
        });
    });

    // Create the renderer
    const render = new dagreD3.render();
    // Run the renderer
    render(svgGroup, g);

    // Apply custom edge paths for bidirectional edges
    svgGroup.selectAll("g.edgePath").each(function (edgeId) {
        const edge = g.edge(edgeId);
        if (edge && edge.bidirectional) {
            const path = d3.select(this).select("path");
            const points = edge.points;

            if (points && points.length >= 2) {
                // Create a curved path for bidirectional edges
                const start = points[0];
                const end = points[points.length - 1];

                // Calculate control point offset perpendicular to the line
                const dx = end.x - start.x;
                const dy = end.y - start.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                const midOffset = 20; // Curve offset

                // Perpendicular vector (normalized)
                const perpX = -dy / len * midOffset;
                const perpY = dx / len * midOffset;

                // Determine which direction to curve based on edge direction
                const direction = dx > 0 ? 1 : -1; // 1

                const midX = (start.x + end.x) / 2 + perpX;
                const midY = (start.y + end.y) / 2 + perpY;

                const sideOffset = 8;
                const startX = start.x + perpX / midOffset * sideOffset;
                const startY = start.y + perpY / midOffset * sideOffset;
                const endX = end.x + perpX / midOffset * sideOffset;
                const endY = end.y + perpY / midOffset * sideOffset;

                // Create quadratic bezier curve
                const pathData = `M ${startX} ${startY} Q ${midX} ${midY} ${endX} ${endY}`;
                path.attr("d", pathData);
            }
        }
    });

    // Center the graph
    const graphWidth = Math.max(g.graph().width, 0);
    const graphHeight = Math.max(g.graph().height, 0);
    const svgWidth = element.clientWidth;
    const svgHeight = element.clientHeight;

    const xCenterOffset = (svgWidth - graphWidth) / (annotations ? 4 : 2);
    const yCenterOffset = (svgHeight - graphHeight) / 2;

    svgGroup.attr("transform", `translate(${xCenterOffset}, ${yCenterOffset})`);
    const wrap  = svg.node().parentElement;          // positioned container
    // Remove any existing bubble
    const bubbles = [...wrap.querySelectorAll(".cell-bubble")];
    bubbles.forEach(bubble => bubble.remove());

    if (cellNotes) {
        for (const [id, text] of Object.entries(cellNotes)) {
            const nodePos = g.node(id);
            fluid.vizReactive.renderNoteBubble(wrap, nodePos, text, xCenterOffset, yCenterOffset);
        }
    }
};

/**
 * Renders the cell graph visualization for the current timeline step.
 *
 * @param {HTMLElement} container - The container element for the timeline UI.
 * @param {SequencePoint} currentPoint - The current sequence point, used to highlight nodes/edges.
 * @param {Object<String, String>} [cellNotes] - Optional notes to display as SVG bubbles next to cells.
 * @param {Boolean} [annotations] - Whether there are any annotations for this timeline
 */
fluid.vizReactive.plotCells = function (container, currentPoint, cellNotes, annotations) {
    const cells = fluid.vizReactive.madeCells;
    const renderData = fluid.vizReactive.toRenderData(cells.filter(cell => !cell._isEffect));
    const vizNode = container.querySelector(".signal-viz");
    fluid.vizReactive.updateD3Viz(vizNode, renderData, currentPoint, cellNotes, annotations);
};

// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncFunction/AsyncFunction
const AsyncFunction = async function () {}.constructor;

fluid.vizReactive.stubAssert = StubQUnit.makeAssert((pass, actual, expected, message) => {
    if (!pass) {
        console.log("*** FAIL: ", message, "actual", actual, "expected", expected);
    }
    const timeline = fluid.vizReactive.currentTimeline;
    const line = timeline.currentStatementPosition?.line;
    if (line && timeline.steppingForward) {
        const marker = document.createElement("div");
        marker.className = "vizreactive-testmarker vizreactive-basic-tooltip " + (pass ? "test-pass " : "test-fail ") + " line-" + line;
        marker.title = pass ? "Assertion passed" : ("Assertion failed: actual value " + JSON.stringify(actual));
        timeline.codeMirror.setGutterMarker(line, "vizreactive-assert-markers", marker);
        timeline.assertMarkers.push(line);
    }
});

fluid.vizReactive.vizReactiveUI = async function (targetContainer, allTests) {
    // Create timeline
    const timeline = fluid.vizReactive.TestTimeline({
        stubAssert: fluid.vizReactive.stubAssert
    });
    fluid.vizReactive.currentTimeline = timeline;

    // Create UI
    const container = fluid.vizReactive.createTimelineUI(targetContainer, timeline, allTests);

    timeline.container = container;

    window.addEventListener("resize", () => {
        fluid.vizReactive.updateTimelineUI(timeline);
    });

};

fluid.vizReactive.updateTestText = async function (timeline, testName, funcText, textModified) {
    const annotations = textModified ? null : fluid.vizReactive.annotations.find(annotation => annotation.testName === testName);
    const {statements, transformed, arcTokens} = fluid.lezer.parseTestFunction(funcText);

    const transformedFunc = new AsyncFunction("assert", transformed);

    Object.assign(timeline, {testName, statements, arcTokens, funcText, transformedFunc, annotations}, fluid.vizReactive.initTimeline());

    if (!textModified) {
        timeline.codeMirror.setValue(timeline.funcText);
        timeline.assertMarkers = [];
    }

    // Reset and schedule dry run to collect sequence points
    await fluid.vizReactive.resetTimeline(timeline, 0);

    timeline.initialRun = false;

    // Fill in promises in the freshly created sequence points
    // noinspection ES6MissingAwait
    fluid.vizReactive.resetTimeline(timeline, 0);

    // Initial render
    fluid.vizReactive.updateTimelineUI(timeline);
};

fluid.vizReactive.applyTooltips = function () {

    const tooltip = document.createElement("div");
    tooltip.id = "vizreactive-tooltip";

    document.body.appendChild(tooltip);

    document.addEventListener("mouseover", e => {
        const el = e.target.closest(".vizreactive-basic-tooltip");
        if (el && el.title) {
            el._vrTitle = el.title;
            el.removeAttribute("title");        // suppress browser tooltip
            tooltip.textContent = el._vrTitle;
            tooltip.style.display = "block";
        }
    });

    document.addEventListener("mousemove", e => {
        tooltip.style.left = (e.clientX + 14) + "px";
        tooltip.style.top = (e.clientY + 14) + "px";
    });

    document.addEventListener("mouseout", e => {
        const el = e.target.closest(".vizreactive-basic-tooltip");
        if (el) {
            if (el._vrTitle) { // restore
                el.setAttribute("title", el._vrTitle);
            }
            tooltip.style.display = "none";
        }
    });
};

document.addEventListener("DOMContentLoaded", fluid.vizReactive.applyTooltips);

/* QUnit hosted boot */

if (typeof(QUnit) !== "undefined" && QUnit.version) {
    // Give enough time for tests to be queued
    window.setTimeout(() => {
        // noinspection JSIgnoredPromiseFromCall
        fluid.vizReactive.vizReactiveUI(document.body, StubQUnit.allTests);
    }, 100);
}

/* Self-hosted boot */

fluid.vizReactive.bootVizReactiveUI = function (selector) {
    const root = document.querySelector(selector);
    // noinspection JSIgnoredPromiseFromCall
    fluid.vizReactive.vizReactiveUI(root, StubQUnit.allTests);
};
