/* global QUnit, cytoscape */

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

fluid.initCytoscapeViz = function (testName) {
    const id = "cyto-id-" + testName.replace(/\W/g, "_");
    const existing = document.getElementById(id);
    if (existing) {
        return existing.cy;
    } else {
        const element = document.createElement("div");
        element.id = id;
        element.setAttribute("class", "cyto-signal-viz");
        document.body.appendChild(element);
        const cy = cytoscape({
            container: element,
            style: [
                {
                    selector: "node",
                    style: {
                        "label": "data(label)",
                        "text-valign": "center",
                        "text-halign": "center",
                        "background-color": "data(color)",
                        "width": 80,
                        "height": 80,
                        "border-width": 3,
                        "border-color": "#333",
                        "font-size": 14,
                        "font-weight": "bold"
                    }
                },
                {
                    selector: "edge",
                    style: {
                        "width": 3,
                        "line-color": "#666",
                        "target-arrow-color": "#666",
                        "target-arrow-shape": "triangle",
                        "curve-style": "bezier"
                    }
                }
            ],
            layout: {
                name: "dagre",
                rankDir: "TB",
                nodeSep: 50,
                rankSep: 100
            }
        });
        element.cy = cy;
        return element.cy;
    }
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

fluid.toCytoData = function (cells) {
    const nodes = new Map();
    const edges = [];
    cells.forEach(cell => {
        const id = cell.name || `cell_${nodes.size}`;
        nodes.set(cell, id);

        if (cell._sources) {
            for (const source of cell._sources) {
                const sourceId = nodes.get(source);
                edges.push({ source: sourceId, target: id });
            }
        }
    });

    return { nodes, edges };
};

fluid.updateCytoViz = function (cy, cytoData) {
    const { nodes, edges } = cytoData;

    const elements = [];

    // Add nodes
    for (const [cell, id] of nodes.entries()) {
        const value = cell._value !== undefined ? cell._value : "<u>";
        // const stateName = fluid.cellStateInfo[cell._state].name;
        elements.push({
            data: {
                id: id,
                label: value,
                color: fluid.cellStateInfo[cell._state].colour
            }
        });
    }

    // Add edges
    for (const edge of edges) {
        elements.push({
            data: {
                source: edge.source,
                target: edge.target
            }
        });
    }

    cy.elements().remove();
    cy.add(elements);
    cy.layout({
        name: "dagre",
        rankDir: "TB",
        nodeSep: 50,
        rankSep: 100
    }).run();
};


fluid.plotCells = function (testName, cells) {
    const cytoData = fluid.toCytoData(cells);
    const cy = fluid.initCytoscapeViz(testName);
    fluid.updateCytoViz(cy, cytoData);
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
