/* global LezerJS */

"use strict";

fluid.registerNamespace("fluid.lezer");

// ============================================================================
// Lezer Tree Query and Manipulation Utilities
// ============================================================================

/**
 * @typedef {Object} LezerNode
 * @property {String} [name] - The node type name (e.g., "MemberExpression", "VariableDefinition").
 * @property {String} text - The text content of the node.
 * @property {number} [from] - The start offset of the node in the source text.
 * @property {number} [to] - The end offset of the node in the source text.
 * @property {LezerNode[]} [children] - The child nodes of this node.
 * @property {LezerNode|null} [parent] - The parent node, or null if this is the root.
 * @property {boolean} [isStale] - Whether the node is marked as stale and needs regeneration.
 */

/**
 * Query a Lezer token tree to find nodes matching a type and optional text content
 * @param {LezerNode} node - The root token node to search from
 * @param {String} name - The node name to match (e.g., "MemberExpression", "VariableDefinition")
 * @param {String} [text] - Optional text content to match
 * @return {Array<Object>} Array of matching nodes
 */
fluid.lezer.queryNode = function (node, name, text) {
    const matches = [];

    const search = (currentNode) => {
        if (currentNode.name === name) {
            if (text === undefined || currentNode.text === text) {
                matches.push(currentNode);
            }
        }

        if (currentNode.children) {
            currentNode.children.forEach(child => search(child));
        }
    };

    search(node);
    return matches;
};

/**
 * Navigate up the tree from a node to find an ancestor of a given type
 * @param {LezerNode} node - The starting node
 * @param {String} ancestorType - The type of ancestor to find
 * @return {LezerNode|null} The ancestor node or null if not found
 */
fluid.lezer.findAncestor = function (node, ancestorType) {
    let current = node.parent;
    while (current) {
        if (current.name === ancestorType) {
            return current;
        }
        current = current.parent;
    }
    return null;
};

/**
 * Mark a node and all its ancestors as stale (requiring text regeneration)
 * @param {LezerNode} node - The node to mark as stale
 */
fluid.lezer.markStale = function (node) {
    let current = node;
    while (current) {
        current.isStale = true;
        current = current.parent;
    }
};

/**
 * Extract variable name from a VariableDefinition or VariableDeclaration node
 * @param {LezerNode} node - The variable definition node
 * @return {String|null} The variable name or null if not found
 */
fluid.extractLezerVarName = function (node) {
    // Look for VariableDefinition -> VariableName
    const varDef = node.name === "VariableDefinition"
        ? node
        : fluid.findChild(node, "VariableDefinition");

    if (!varDef) {
        return null;
    }

    const varName = fluid.findChild(varDef, "VariableName");
    return varName ? varName.text : null;
};

/**
 * Regenerate text for a node from its children
 * @param {LezerNode} node - The node to regenerate text for
 */
fluid.lezer.regenerateNodeText = function (node) {
    if (!node.children || node.children.length === 0) {
        // Leaf node - text is already set
        return;
    }

    // Recursively regenerate children first
    node.children.forEach(child => {
        if (child.isStale) {
            fluid.lezer.regenerateNodeText(child);
        }
    });

    // Concatenate children's text
    node.text = node.children.map(child => child.text).join("");
    node.isStale = false;
};

/**
 * Serialize the entire tree back to text
 * @param {LezerNode} rootNode - The root node of the tree
 * @return {String} The serialized text
 */
fluid.lezer.serializeTree = function (rootNode) {
    // First, regenerate all stale nodes
    const regenerateStaleNodes = (node) => {
        if (node.isStale) {
            fluid.lezer.regenerateNodeText(node);
        }
        if (node.children) {
            node.children.forEach(child => regenerateStaleNodes(child));
        }
    };

    regenerateStaleNodes(rootNode);

    return rootNode.text;
};


/**
 * Insert or update text node into an ArgList
 * @param {LezerNode} argList - The ArgList node
 * @param {String} newText - The text of the node to insert
 * @param {Number} position - Argument position to insert at
 */
fluid.lezer.insertIntoArgList = function (argList, newText, position) {
    // ( a , b ) //
    // 0 1 2 3 4

    const expectedPos = position * 2 + 1;
    // 2 -> 0, 3 -> 1, 5 -> 2, 7 -> 3
    const nodes = argList.children;
    const cNodes = nodes.length;
    const existingArgs = cNodes === 2 ? 0 : (cNodes - 1) / 2;

    const shortfall = (existingArgs === 0 ? 0 : 1) + position - existingArgs;

    if (existingArgs === 0) { // Special case: supply "undefined" in case cell is not initialised
        nodes.splice(1, 0, {text: "undefined"});
    }

    for (let i = 0; i < shortfall; ++i) {
        // Insert before closing (
        nodes.splice(argList.children.length - 1, 0, {text: ", "}, {text: "undefined"});
    }
    // If there's an existing name don't obliterate it
    if (nodes[expectedPos].text === "undefined") {
        nodes[expectedPos].text = newText;
    }

    fluid.lezer.markStale(argList);
};


// ============================================================================
// Main Statement Transformation Function
// ============================================================================

/**
 * Transform a statement to replace fluid.cell().computed() with fluid.vizReactive.asyncComputed()
 * and inject {name: "varName"} into the fluid.cell() call
 * @param {LezerNode} token - Statement object with token tree
 */
fluid.lezer.transformStatement = function (token) {

    const fluidCellCall = fluid.lezer.queryNode(token, "MemberExpression", "fluid.cell")[0];
    // Skip other contexts such as fluid.cell.effect
    if (fluidCellCall && fluidCellCall.parent.name !== "MemberExpression") {
        const varDecl = fluid.lezer.findAncestor(fluidCellCall, "VariableDeclaration");
        if (varDecl) {
            const def = fluid.lezer.queryNode(varDecl, "VariableDefinition")[0];
            const nodeText = `{name: "${def.text}"}`;
            const argList = fluid.lezer.queryNode(fluidCellCall.parent, "ArgList")[0];
            fluid.lezer.insertIntoArgList(argList, nodeText, 1);
        }
        fluidCellCall.text = "fluid.vizReactive.cell";
        delete fluidCellCall.children;
        fluid.lezer.markStale(fluidCellCall);
    }

    // Not very exact - will hit any member of anything that is "computed", perhaps we want a time-boxed
    // interception of the prototype but that in itself would be tough without AsyncContext
    const computedCall = fluid.lezer.queryNode(token, "PropertyName", "computed")[0];
    if (computedCall) {
        computedCall.text = "vizReactiveAsyncComputed";
        fluid.lezer.markStale(computedCall);
    }

    const getCall = fluid.lezer.queryNode(token, "PropertyName", "get")[0];
    if (getCall) {
        const awaitFront = {text: "await fluid.cell.signalToPromise("};
        const awaitBack = {text: ")"};
        const getParent = getCall.parent;
        const variableNode = {text: getParent.children[0].text};
        getParent.parent.children = [awaitFront, variableNode, awaitBack];
        fluid.lezer.markStale(getCall);
    }
};

// ============================================================================
// Lezer Integration and Test Parsing
// ============================================================================

/**
 * Recursively builds a tree of LezerNode objects from a Lezer syntax tree cursor.
 * For each node, creates a token object with its name, text, range, children, and parent.
 * Skips nodes whose names are in the stopTokens set.
 *
 * @param {LezerNode|null} parent - The parent node, or null if this is the root.
 * @param {LezerJS.TreeCursor} cursor - The Lezer tree cursor positioned at the current node.
 * @param {String} text - The full source text being parsed.
 * @param {Object} state - Additional state for parsing (unused here).
 * @return {LezerNode} The constructed node with its children.
 */
fluid.lezer.pushChildren = function (parent, cursor, text, state) {
    const makeToken = function (name, from, to, parent) {
        return {
            name,
            from,
            to,
            text: text.substring(from, to),
            children: [],
            parent
        };
    };

    const token = makeToken(cursor.name, cursor.from, cursor.to, parent);

    if (cursor.firstChild()) {
        let pos = token.from;

        do {
            // Gap before this child → synthesize Skip
            if (cursor.from > pos) {
                token.children.push(
                    makeToken("Skip", pos, cursor.from, token)
                );
            }

            const child = fluid.lezer.pushChildren(token, cursor, text, state);
            token.children.push(child);

            pos = cursor.to;
        } while (cursor.nextSibling());

        // Terminal gap after last child
        if (pos < token.to) {
            token.children.push(
                makeToken("Skip", pos, token.to, token)
            );
        }

        cursor.parent();
    }

    return token;
};

/**
 * Parses the statements within a function body block node and returns an array of statement objects.
 * Searches for top-level "ExpressionStatement" and "VariableDeclaration" nodes within the given body token,
 * and collects their token, text, and source range.
 * Skips nested blocks such as "ArrowFunction" and "FunctionExpression" to avoid descending into inner functions.
 *
 * @param {LezerNode} bodyToken - The "Block" node representing the function body.
 * @return {LezerNode[]} Array of statement nodes
 */
fluid.lezer.parseStatements = function (bodyToken) {
    const statements = [];

    const findStatements = (token) => {
        // Look for ExpressionStatement and VariableDeclaration at the top level
        if (token.name === "ExpressionStatement" ||
            token.name === "VariableDeclaration") {
            statements.push(token);
        }

        // Recursively process children, but stop at nested blocks
        if (token.children && token.name !== "ArrowFunction" && token.name !== "FunctionExpression") {
            token.children.forEach(child => findStatements(child));
        }
    };

    findStatements(bodyToken);
    return statements;
};

/**
 * Parses a test function using the Lezer parser, transforms its statements, and injects await statements.
 * Converts the function to a string, parses it into a Lezer syntax tree, and builds a LezerNode token tree.
 * Finds the function body block, extracts and transforms statements containing `.computed` or `fluid.cell`,
 * and inserts an await statement after each transformed statement.
 * Regenerates the root node text to reflect changes and returns the root token and statements.
 *
 * @param {String} funcText - The test function to parse and transform.
 * @return {{rootToken: LezerNode, statements: LezerNode[]}} An object containing the root token and the array of statement objects.
 */
fluid.lezer.parseTestFunction = function (funcText) {

    const lezerTree = LezerJS.parser.parse(funcText);

    // Build token tree
    const cursor = lezerTree.cursor();
    const rootToken = fluid.lezer.pushChildren(null, cursor, funcText, {});

    const blockNode = fluid.lezer.queryNode(rootToken, "Block")[0];

    // Parse statements from body
    const statements = fluid.lezer.parseStatements(blockNode);
    const clonedStatements = statements.map(token => ({...token}));

    // Transform statements that contain .computed or fluid.cell
    statements.forEach(token => fluid.lezer.transformStatement(token));

    const makeWaitNode = index => ({
        text: `\n    await fluid.vizReactive.getStatementSequenceWait(${index});` + (index === 0 ? "\n    " : ""),
        name: "WaitNode"}
    );

    let firstStatementIndex = -1;

    statements.forEach((token, index) => {
        const waitNode = makeWaitNode(index + 1);
        const children = token.parent.children;
        const childIndex = children.findIndex(child => child === token);
        if (firstStatementIndex === -1) {
            firstStatementIndex = childIndex;
        }
        children.splice(childIndex + 1, 0, waitNode);
    });

    blockNode.children.splice(firstStatementIndex, 0, makeWaitNode(0));

    fluid.lezer.regenerateNodeText(blockNode);
    console.log("Transformed function to:\n" + blockNode.text);
    return {
        blockNode, statements: clonedStatements, funcText, transformed: blockNode.text
    };
};
