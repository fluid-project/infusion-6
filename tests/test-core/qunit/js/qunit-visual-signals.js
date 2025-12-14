/* global QUnit, mermaid */

"use strict";

fluid.oldQunitTest = QUnit.test;
fluid.oldFluidCell = fluid.cell;

fluid.madeCells = [];

fluid.trapFluidCell = function () {
    // Intercept calls to fluid.cell
    fluid.cell = function (initialValue, props) {
        const cell = fluid.oldFluidCell(initialValue, props);
        fluid.madeCells.push(cell);
        return cell;
    };
    Object.assign(fluid.cell, fluid.oldFluidCell);
};

fluid.untrapFluidCell = function () {
    fluid.cell = fluid.oldFluidCell;
};

fluid.initMermaidViz = function (testName) {
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

fluid.cellStateInfo = [{ // 0: CacheClean
    name: "Clean",
    colour: "#ECECFF"
}, {
    name: "Check",
    colour: "#afa"
}, {
    name: "Dirty",
    colour: "#f99"
}];

fluid.toMermaidData = function (cells) {
    const nodes = new Map();
    const edges = [];

    // First pass: create all nodes
    cells.forEach(cell => {
        const id = cell.name || `cell_${nodes.size}`;
        nodes.set(cell, id);
    });

    // Second pass: create edges from _inEdges
    cells.forEach(cell => {
        const targetId = nodes.get(cell);

        if (cell._inEdges && cell._inEdges.length > 0) {
            // Iterate through each edge
            for (const edge of cell._inEdges) {
                if (edge.sources) {
                    // Add an edge from each source to this cell
                    for (const source of edge.sources) {
                        const sourceId = nodes.get(source);
                        if (sourceId) {
                            edges.push({
                                source: sourceId,
                                target: targetId
                            });
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

fluid.generateMermaidMarkdown = function (mermaidData) {
    const { nodes, edges } = mermaidData;
    let markdown = "graph LR\n";

    // Add node definitions with labels and styling
    for (const [cell, id] of nodes.entries()) {
        const value = cell._value !== undefined ? cell._value : "undefined";
        const colour = fluid.cellStateInfo[cell._state].colour;
        const sanitizedId = fluid.sanitizeIdForMermaid(id);
        const sanitizedValue = fluid.sanitizeTextForMermaid(value);
        const sanitizedName = fluid.sanitizeTextForMermaid(id);

        // Show value prominently with name smaller below
        const label = `<b style='font-size:16px'>${sanitizedValue}</b><br/><small>${sanitizedName}</small>`;

        markdown += `    ${sanitizedId}["${label}"]\n`;
        markdown += `    style ${sanitizedId} fill:${colour},stroke:#333,stroke-width:3px\n`;
    }

    // Add edges
    const cellToSanitizedId = new Map();
    for (const [cell, id] of nodes.entries()) {
        cellToSanitizedId.set(cell, fluid.sanitizeIdForMermaid(id));
    }

    for (const edge of edges) {
        const sanitizedSource = fluid.sanitizeIdForMermaid(edge.source);
        const sanitizedTarget = fluid.sanitizeIdForMermaid(edge.target);
        markdown += `    ${sanitizedSource} --> ${sanitizedTarget}\n`;
    }

    return markdown;
};

fluid.updateMermaidViz = function (element, mermaidData, cells) {
    const markdown = fluid.generateMermaidMarkdown(mermaidData, cells);
    element.innerHTML = markdown;
    element.removeAttribute("data-processed");

    mermaid.init(undefined, element);
};

fluid.plotCells = function (testName, cells) {
    const mermaidData = fluid.toMermaidData(cells.filter(cell => !cell._isEffect));
    const element = fluid.initMermaidViz(testName);
    fluid.updateMermaidViz(element, mermaidData, cells);
};

QUnit.test = function (testName, testFunc) {
    fluid.oldQunitTest(testName, function (assert) {
        fluid.madeCells = [];
        fluid.trapFluidCell();
        testFunc(assert);
        fluid.untrapFluidCell();
        fluid.plotCells(testName, fluid.madeCells);
    });
};
