/* global QUnit, mermaid */

"use strict";

// ============================================================================
// Reactive Wrapper for Timeline Tracking
// ============================================================================

// Create fluid.vizReactive namespace for instrumented reactive methods
fluid.vizReactive = {
    currentTimeline: null
};

fluid.vizReactive.colours = {
    statement: "#4a90e2",
    computed: "#e24a4a"
};

// ============================================================================
// Sequence Point Management
// ============================================================================

fluid.vizReactive.SequencePoint = function (props) {
    return {
        executed: false,
        ...props
    };
};

fluid.vizReactive.TestTimeline = function (testName, statements, testFunc, assert) {
    const timeline = {
        testName,
        statements,
        testFunc,
        assert,
        sequencePoints: [],
        statementSequencePoints: [],
        computeSequencePoints: [],
        currentIndex: -1,
        cells: [],
        initialRun: true
    };

    return timeline;
};

fluid.vizReactive.getStatementSequenceWait = function (statementIndex) {
    const timeline = fluid.vizReactive.currentTimeline;
    const sequenceIndex = timeline.sequencePoints.length;

    if (timeline.initialRun) {
        const sequencePoint = fluid.vizReactive.SequencePoint(
            {
                type: "compute",
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

// Wrapper for asyncComputed that creates red sequence points
fluid.cellPrototype.vizReactiveAsyncComputed = function (fn, staticSources, props) {
    const cellName = props?.name || "unnamed";

    // Create wrapper that injects red sequence points
    const wrappedFn = async function (...args) {
        const timeline = fluid.vizReactive.currentTimeline;
        const computeIndex = timeline.computeSequencePoints.length;
        const sequenceIndex = timeline.sequencePoints.length;
        if (timeline && timeline.initialRun) {
            // Create red/compute sequence point when computation executes
            const sequencePoint = fluid.vizReactive.SequencePoint({
                type: "compute",
                text: `→ Computing ${cellName}`,
                cellName, computeIndex, sequenceIndex}
            );
            timeline.sequencePoints.push(sequencePoint);
            timeline.computeSequencePoints.push(sequencePoint);
        }

        const result = await fn.apply(this, args);

        if (timeline && !timeline.initialRun) {
            await timeline.sequencePoints[sequenceIndex].wait;
        }

        return result;
    };

    // Call the original asyncComputed with the wrapped function
    return fluid.cellPrototype.asyncComputed.call(this, wrappedFn, staticSources, props);
};

fluid.vizReactive.stepForward = function (timeline) {
    timeline.sequencePoints[timeline.currentIndex++].resolve();

    fluid.vizReactive.updateTimelineUI(timeline);
    fluid.vizReactive.plotCells(timeline.testName, fluid.vizReactive.madeCells);
};

fluid.vizReactive.stepBackward = function (timeline) {

    if (timeline.currentIndex <= 0) {
        return; // Already at start
    } else {
        fluid.vizReactive.resetTimeline(timeline, timeline.currentIndex - 1);
        fluid.vizReactive.updateTimelineUI(timeline);
        fluid.vizReactive.plotCells(timeline.testName, []);
    }
};

fluid.vizReactive.resetTimeline = function (timeline, newIndex) {
    const currentPoint = timeline.sequencePoints[timeline.currentIndex];
    if (currentPoint) {
        currentPoint.reject(new Error("Abort sequence"));
        // TODO: Probably want to reject all following as well
    }
    timeline.sequencePoints.forEach((p, index) => {
        p.executed = false;
        p.error = null;

        p.wait = new Promise((resolve, reject) => {
            p.resolve = resolve;
            p.reject = reject;
        });
        if (index <= timeline.currentIndex) {
            p.resolve();
        }
    });
    timeline.currentIndex = newIndex;

    // Clear cells
    timeline.cells.length = 0;
};

// ============================================================================
// Timeline UI
// ============================================================================

fluid.vizReactive.createTimelineUI = function (timeline) {
    const testId = timeline.testName.replace(/\W/g, "_");
    const containerId = "timeline-" + testId;

    let container = document.getElementById(containerId);
    if (!container) {
        container = document.createElement("div");
        container.id = containerId;
        container.className = "timeline-container";

        // Insert before mermaid diagram
        const mermaidDiv = document.getElementById("mermaid-id-" + testId);
        if (mermaidDiv) {
            mermaidDiv.parentNode.insertBefore(container, mermaidDiv);
        } else {
            document.body.appendChild(container);
        }
    }

    container.innerHTML = `
        <div class="timeline-header">
            <h3>${timeline.testName}</h3>
        </div>
        <div class="timeline-controls">
            <button id="btn-prev-${testId}" class="timeline-btn">◀ Previous</button>
            <button id="btn-next-${testId}" class="timeline-btn">Next ▶</button>
            <button id="btn-reset-${testId}" class="timeline-btn">Reset</button>
        </div>
        <div class="timeline-sequence" id="sequence-${testId}"></div>
        <div class="timeline-statement" id="statement-${testId}"></div>
    `;

    // Add event listeners
    document.getElementById(`btn-prev-${testId}`).onclick = () => fluid.vizReactive.stepBackward(timeline);
    document.getElementById(`btn-next-${testId}`).onclick = () => fluid.vizReactive.stepForward(timeline);
    document.getElementById(`btn-reset-${testId}`).onclick = () => {
        fluid.vizReactive.resetTimeline(timeline, -1);
        fluid.vizReactive.updateTimelineUI(timeline);
        fluid.vizReactive.plotCells(timeline.testName, fluid.vizReactive.madeCells);
    };

    return container;
};

fluid.vizReactive.updateTimelineUI = function (timeline, statements) {
    const testId = timeline.testName.replace(/\W/g, "_");
    const sequenceDiv = document.getElementById(`sequence-${testId}`);
    const statementDiv = document.getElementById(`statement-${testId}`);


    // Render sequence points
    let html = "<div class=\"sequence-points\">";

    timeline.sequencePoints.forEach((point, idx) => {
        const isActive = idx === timeline.currentIndex;
        const color = fluid.vizReactive.colours[point.type];
        const executed = point.executed ? "executed" : "";
        const active = isActive ? "active" : "";
        const label = point.type === "statement" ? "S" : "C"; // S=Statement, C=Computation
        const title = point.type === "statement" ? statements[point.statementIndex].text : "";

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
            (timeline.currentIndex * pointWidth + 15) + "px\">▲</div>";
    }

    sequenceDiv.innerHTML = html;

    // Show current statement or computation
    if (timeline.currentIndex >= 0) {
        const currentPoint = timeline.sequencePoints[timeline.currentIndex];
        const typeLabel = currentPoint.type === "statement" ? "Statement" : "Computation";
        const typeColor = fluid.vizReactive.colours[currentPoint.type];

        let content = `
            <div class="current-statement">
                <div class="statement-header">
                    <strong style="color: ${typeColor}">Step ${timeline.currentIndex}: ${typeLabel}</strong>
                    ${currentPoint.executed ? "<span class=\"status-badge executed\">✓ Executed</span>" : "<span class=\"status-badge pending\">⋯ Pending</span>"}
                </div>
                <pre>${currentPoint.statement}</pre>
        `;

        if (currentPoint.computeInfo) {
            content += `
                <div class="compute-info">
                    <strong>Cell:</strong> ${currentPoint.computeInfo.cellName}<br>
                    ${currentPoint.computeInfo.sources ? `<strong>Sources:</strong> ${currentPoint.computeInfo.sources.join(", ")}` : ""}
                </div>
            `;
        }

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
};

// ============================================================================
// Enhanced QUnit Integration
// ============================================================================

fluid.oldQunitTest = QUnit.test;
fluid.oldFluidCell = fluid.cell;

fluid.trapFluidCell = function () {
    fluid.cell = function (initialValue, props) {
        const cell = fluid.oldFluidCell(initialValue, props);
        fluid.vizReactive.madeCells.push(cell);
        return cell;
    };
    Object.assign(fluid.cell, fluid.oldFluidCell);
};

fluid.untrapFluidCell = function () {
    fluid.cell = fluid.oldFluidCell;
};

// Cell state visualization
fluid.vizReactive.cellStateInfo = {
    "Clean": {colour: "#ECECFF" },
    "Check": {colour: "#afa" },
    "Dirty": {colour: "#f99"}
};

// Mermaid generation
fluid.vizReactive.toMermaidData = function (cells) {
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
                            edges.push({ source: sourceId, target: targetId });
                        }
                    }
                }
            }
        }
    });

    return { nodes, edges };
};

fluid.sanitizeIdForMermaid = function (id) {
    return id.replace(/[^a-zA-Z0-9_]/g, "_");
};

fluid.sanitizeTextForMermaid = function (text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
};

fluid.vizReactive.generateMermaidMarkdown = function (mermaidData) {
    const { nodes, edges } = mermaidData;
    let markdown = "graph LR\n";

    for (const [cell, id] of nodes.entries()) {
        const value = cell._value !== undefined ? cell._value : "undefined";
        const colour = fluid.vizReactive.cellStateInfo[cell._state].colour;
        const sanitizedId = fluid.sanitizeIdForMermaid(id);
        const sanitizedValue = fluid.sanitizeTextForMermaid(value);
        const sanitizedName = fluid.sanitizeTextForMermaid(id);

        const label = `<b style="font-size:16px">${sanitizedValue}</b><br/><small>${sanitizedName}</small>`;

        markdown += `    ${sanitizedId}["${label}"]\n`;
        markdown += `    style ${sanitizedId} fill:${colour},stroke:#333,stroke-width:3px\n`;
    }

    for (const edge of edges) {
        const sanitizedSource = fluid.sanitizeIdForMermaid(edge.source);
        const sanitizedTarget = fluid.sanitizeIdForMermaid(edge.target);
        markdown += `    ${sanitizedSource} --> ${sanitizedTarget}\n`;
    }

    return markdown;
};

fluid.vizReactive.initMermaidViz = function (testName) {
    const id = "mermaid-id-" + testName.replace(/\W/g, "_");
    let existing = document.getElementById(id);
    if (!existing) {
        existing = document.createElement("div");
        existing.id = id;
        existing.setAttribute("class", "mermaid-signal-viz");
        document.body.appendChild(existing);
    }
    return existing;
};

fluid.vizReactive.updateMermaidViz = function (element, mermaidData) {
    const markdown = fluid.vizReactive.generateMermaidMarkdown(mermaidData);
    element.innerHTML = markdown;
    element.removeAttribute("data-processed");
    if (typeof mermaid !== "undefined") {
        mermaid.init(undefined, element);
    }
};

fluid.vizReactive.plotCells = function (testName, cells) {
    const mermaidData = fluid.vizReactive.toMermaidData(cells.filter(cell => !cell._isEffect));
    const element = fluid.vizReactive.initMermaidViz(testName);
    fluid.vizReactive.updateMermaidViz(element, mermaidData);
};

// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncFunction/AsyncFunction
const AsyncFunction = async function () {}.constructor;

// Enhanced QUnit.test wrapper
QUnit.test = function (testName, testFunc) {
    fluid.oldQunitTest(testName, async function (assert) {
        fluid.vizReactive.madeCells = [];
        fluid.trapFluidCell();

        // Parse test function into statements using Lezer
        const {statements, transformed} = fluid.lezer.parseTestFunction(testFunc);

        const transformedFunc = new AsyncFunction("assert", transformed);

        // Create timeline
        const timeline = fluid.vizReactive.TestTimeline(testName, statements, transformedFunc, assert);
        fluid.vizReactive.currentTimeline = timeline;
        fluid.vizReactive.resetTimeline(timeline, -1);

        // Schedule dry run of testFunc to collect sequence points
        await transformedFunc(assert);

        // Create UI
        fluid.vizReactive.createTimelineUI(timeline);

        // Initial render
        fluid.vizReactive.updateTimelineUI(timeline);
        fluid.vizReactive.plotCells(testName, []);

        // Clean up
        timeline.cleanup = function () {
            fluid.vizReactive.currentTimeline = null;
            fluid.untrapFluidCell();
        };


    });
};
