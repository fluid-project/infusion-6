/* global QUnit, d3, dagreD3, CodeMirror */

"use strict";

// ============================================================================
// Reactive Wrapper for Timeline Tracking
// ============================================================================

// Create fluid.vizReactive namespace for instrumented reactive methods
fluid.vizReactive = {
    currentTimeline: null
};

fluid.vizReactive.colours = {
    statement: "#4a90e2", // "#008eda", //"#3333ff", //"#4a90e2"
    computed: "#bb44ff", // "#ff33ff" //"#e24a4a"
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

fluid.vizReactive.TestTimeline = function (testName, statements, funcText, transformedFunc, assert, stubAssert) {
    const timeline = {
        testName,
        statements,
        funcText,
        transformedFunc,
        assert,
        stubAssert,
        sequencePoints: [],
        statementSequencePoints: [],
        computeSequencePoints: [],
        currentIndex: 0,
        cells: [],
        initialRun: true,
        edgeInvocations: {}
    };

    return timeline;
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
    return edge.target.name + "-" + edge.key.name;
};

// Wrapper for asyncComputed that creates red sequence points
fluid.cellPrototype.vizReactiveAsyncComputed = function (fn, staticSources, props) {

    // Create wrapper that injects red sequence points
    const wrappedFn = async function (...args) {
        const timeline = fluid.vizReactive.currentTimeline;
        const edge = fluid.CurrentReaction;
        const edgeTargetName = edge.target.name;
        const edgeKey = fluid.vizReactive.edgeToKey(edge);
        const computeIndex = timeline.computeSequencePoints.length;
        const sequenceIndex = timeline.sequencePoints.length;
        if (timeline.initialRun) {
            // Log original compute sequence point when computation executes
            const cause = fluid.cell.findCause();
            const causeNames = cause.map(cell => cell.name);
            const sequencePoint = fluid.vizReactive.SequencePoint({
                type: "computed",
                text: `→ Computing cell ${edgeTargetName} from sources ${edge.sources.map(source => source.name).join(", ")}`,
                edge,
                edgeKey, computeIndex, sequenceIndex, causeNames}
            );
            timeline.sequencePoints.push(sequencePoint);
            timeline.computeSequencePoints.push(sequencePoint);
            fluid.pushArray(timeline.edgeInvocations, edgeKey, {sequenceIndex, causeNames});
        }
        const result = await fn.apply(this, args);

        if (!timeline.initialRun) {
            const invocations = timeline.edgeInvocations[edgeKey];
            const sequencePoint = timeline.sequencePoints[invocations[0].sequenceIndex];
            await sequencePoint.wait;
            invocations.shift();
        }

        return result;
    };

    // Call the original asyncComputed with the wrapped function
    return fluid.cellPrototype.asyncComputed.call(this, wrappedFn, staticSources, props);
};

fluid.vizReactive.stepForward = function (timeline) {
    if (timeline.currentIndex < timeline.sequencePoints.length - 1) {
        const point = timeline.sequencePoints[timeline.currentIndex];
        ++timeline.currentIndex;
        point.resolve();
        setTimeout(() => fluid.vizReactive.updateTimelineUI(timeline), 0);
    }
};

fluid.vizReactive.stepBackward = function (timeline) {
    if (timeline.currentIndex > 0) {
        // noinspection JSIgnoredPromiseFromCall
        fluid.vizReactive.resetTimeline(timeline, timeline.currentIndex - 1);

        setTimeout(() => fluid.vizReactive.updateTimelineUI(timeline), 0);
    }
};

fluid.vizReactive.resetTimeline = async function (timeline, newIndex) {
    timeline.currentIndex = newIndex;

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
        point.wait.then(() => point.executed = true, () => {
            console.log("Rejected");
        });
    });

    try {
        await timeline.transformedFunc(timeline.initialRun ? timeline.assert : timeline.stubAssert);
    } catch (e) {
        console.log("Aborted");
    }
};

// ============================================================================
// Timeline UI
// ============================================================================

fluid.vizReactive.createTimelineUI = function (targetContainer, timeline) {
    const testId = timeline.testName.replace(/\W/g, "_");
    const containerId = "timeline-" + testId;

    let container = document.getElementById(containerId);
    if (!container) {
        container = document.createElement("div");
        container.id = containerId;
        container.className = "timeline-container";
        targetContainer.appendChild(container);
    }

    container.innerHTML = `
        <div class="timeline-header">
            <h3>${timeline.testName}</h3>
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
    const textarea = container.querySelector(".codemirror-holder");
    timeline.codeMirror = CodeMirror.fromTextArea(textarea, {
        lineNumbers: true,
        matchBrackets: true,
        lineWrapping: true,
        mode: "javascript"});

    return container;
};

fluid.vizReactive.updateCodeHighlight = function (timeline, token) {
    if (timeline.codeMark) {
        timeline.codeMark.clear();
    }
    if (token) {
        const cm = timeline.codeMirror;
        timeline.codeMark = cm.markText(cm.posFromIndex(token.from),
            cm.posFromIndex(token.to), {className: "statement-highlight"});
    } else {
        timeline.codeMark = null;
    }
};

fluid.vizReactive.updateTimelineUI = function (timeline) {
    const currentStatement = timeline.sequencePoints.findLast((point, index) => point.type === "statement" && index < timeline.currentIndex);
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
        const title = point.type === "statement" ? idx === 0 ? "" : timeline.statements[point.statementIndex - 1].text : "";

        html += `
            <div class="sequence-point ${point.type} ${executed} ${active}"
                 style="background-color: ${color}"
                 title="${title.replace(/"/g, "&quot;")}...">
                <span class="point-label">${label}</span>
                <span class="point-index">${idx}</span>
            </div>
        `;
    });

    html += "</div>";

    // Add arrow indicator
    if (timeline.currentIndex >= 0) {
        const pointWidth = 40; // Width + gap
        html += "<div class=\"sequence-arrow\" style=\"left: " +
            (timeline.currentIndex * pointWidth + 10) + "px\">▲</div>";
    }

    sequenceDiv.innerHTML = html;
    let currentPoint;

    // Show current statement or computation
    if (timeline.currentIndex > 0) {
        currentPoint = timeline.sequencePoints[timeline.currentIndex];
        const typeLabel = currentPoint.type === "statement" ? "Statement" : "Computation";
        const typeColor = fluid.vizReactive.colours[currentPoint.type];

        let content = `
            <div class="current-statement">
                <div class="statement-header">
                    <strong style="color: ${typeColor}">Step ${timeline.currentIndex}: ${typeLabel}</strong>
                </div>
                <pre>${currentStatementToken.text}</pre>
                <div>${currentPoint.text}</div>
        `;

        content += "</div>";
        statementDiv.innerHTML = content;
    } else {
        statementDiv.innerHTML = `
            <div class="current-statement">
                <div class="statement-header">
                    <strong>Not started</strong>
                </div>
                <p>Click "Next" to begin executing the test</p>
            </div>
        `;
    }

    fluid.vizReactive.updateCodeHighlight(timeline, currentStatementToken);

    fluid.vizReactive.plotCells(container, currentPoint);
};

fluid.vizReactive.cell = function (initialValue, props) {
    const cell = fluid.cell(initialValue, props);
    fluid.vizReactive.madeCells.push(cell);
    return cell;
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

// Mermaid generation
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
    const useState = unavailable ? 2 : cell._state;
    const colour = fluid.vizReactive.cellStateInfo[useState].colour;
    return {label, colour};
};

fluid.vizReactive.updateD3Viz = function (element, renderData, currentPoint) {
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
            rankdir: "TB",
            align: "UL",
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

        const updating = edgeKey === currentPoint.edgeKey;

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
                const offset = 20; // Curve offset

                // Perpendicular vector (normalized)
                const perpX = -dy / len * offset;
                const perpY = dx / len * offset;

                // Determine which direction to curve based on edge direction
                const direction = 1; // edgeId.v < edgeId.w ? 1 : -1;

                const midX = (start.x + end.x) / 2 + perpX * direction;
                const midY = (start.y + end.y) / 2 + perpY * direction;

                // Create quadratic bezier curve
                const pathData = `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`;
                path.attr("d", pathData);
            }
        }
    });

    // Center the graph
    const graphWidth = Math.max(g.graph().width, 0);
    const graphHeight = Math.max(g.graph().height, 0);
    const svgWidth = element.clientWidth;
    const svgHeight = element.clientHeight;

    const xCenterOffset = (svgWidth - graphWidth) / 2;
    const yCenterOffset = (svgHeight - graphHeight) / 2;

    svgGroup.attr("transform", `translate(${xCenterOffset}, ${yCenterOffset})`);
};


fluid.vizReactive.plotCells = function (container, currentPoint) {
    const cells = fluid.vizReactive.madeCells;
    const renderData = fluid.vizReactive.toRenderData(cells.filter(cell => !cell._isEffect));
    const vizNode = container.querySelector(".signal-viz");
    fluid.vizReactive.updateD3Viz(vizNode, renderData, currentPoint);
};

// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncFunction/AsyncFunction
const AsyncFunction = async function () {}.constructor;

fluid.vizReactive.stubAssert = {
    ok() {},
    notOk() {},

    equal() {},
    notEqual() {},
    strictEqual() {},
    notStrictEqual() {},
    deepEqual() {},
    notDeepEqual() {},
    propEqual() {},
    notPropEqual() {},

    throws() {},
    rejects() {},
    doesNotThrow() {},

    step() {},
    verifySteps() {},

    pushResult() {},

    expect() {},
    timeout() {},

    async() {
        return function done() {};
    }
};

fluid.vizReactive.vizReactiveUI = async function (targetContainer, testName, funcText, assert) {
    const {statements, transformed} = fluid.lezer.parseTestFunction(funcText);

    const transformedFunc = new AsyncFunction("assert", transformed);

    // Create timeline
    const timeline = fluid.vizReactive.TestTimeline(testName, statements, funcText, transformedFunc, assert, fluid.vizReactive.stubAssert);
    fluid.vizReactive.currentTimeline = timeline;
    // Reset and schedule dry run to collect sequence points
    await fluid.vizReactive.resetTimeline(timeline, 0);

    timeline.initialRun = false;

    // Fill in promises in the freshly created sequence points
    // noinspection ES6MissingAwait
    fluid.vizReactive.resetTimeline(timeline, 0);

    // Create UI
    const container = fluid.vizReactive.createTimelineUI(targetContainer, timeline);

    timeline.codeMirror.setValue(timeline.funcText);
    timeline.container = container;

    // Initial render
    fluid.vizReactive.updateTimelineUI(timeline);

    // Clean up
    timeline.cleanup = function () {
        fluid.vizReactive.currentTimeline = null;
    };

};

if (typeof(QUnit) !== "undefined") {

    fluid.oldQunitTest = QUnit.test;

    // Enhanced QUnit.test wrapper
    QUnit.test = function (testName, testFunc) {
        fluid.oldQunitTest(testName, async function (assert) {
            const funcText = testFunc.toString();

            await fluid.vizReactive.vizReactiveUI(document.body, testName, funcText, assert);

        });
    };
}


fluid.vizReactive.bootVizReactiveUI = function () {
    const roots = [...document.querySelectorAll(".vizreactive-target")];
    roots.forEach(root => {
        const textSource = root.querySelector(".vizreactive-source");
        const funcText = textSource.innerText;
        const testNameSource = root.querySelector(".vizreactive-testname");
        const testName = testNameSource.innerText;
        // noinspection JSIgnoredPromiseFromCall
        fluid.vizReactive.vizReactiveUI(root, testName, funcText, fluid.vizReactive.stubAssert);
    });
}
