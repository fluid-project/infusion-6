/* global LezerJS */

"use strict";

// import fluid from "./FluidCore.js"

const sfcParserScope = function (fluid) {

    const stopTokens = new Set(["ArrowFunction", "AssignmentExpression"]);

    fluid.pushLezerChildren = function (parent, cursor, text, state) {
        // console.log(`Node ${cursor.name} from ${cursor.from} to ${cursor.to}`);
        const token = {
            name: cursor.name,
            from: cursor.from,
            to: cursor.to,
            text: text.substring(cursor.from, cursor.to),
            children: [],
            parent
        };
        if (cursor.firstChild()) {
            do {
                if (!stopTokens.has(token.name)) {
                    const newToken = fluid.pushLezerChildren(token, cursor, text, state);
                    token.children.push(newToken);
                }
            } while (cursor.nextSibling());
            cursor.parent();
        }
        return token;
    };

    const expectToken = function (token, name) {
        if (token.name !== name) {
            throw ("Unexpected token with name ", token.name, ", expected ", name);
        };
        return token;
    };

    const expectTokens = function (token, names) {
        if (!names.includes(token.name)) {
            throw ("Unexpected token with name ", token.name, ", expected ", names.join(", "));
        };
        return token;
    };

    const $m = fluid.metadataSymbol;


    /**
     * A source location range within the parsed text.
     * @typedef {Object} SourceRange
     * @property {Integer} from - Start offset (inclusive) in the source text.
     * @property {Integer} to - End offset (exclusive) in the source text.
     */

    /**
     * A node in a DefMap tree. This can either be a `SourceRange` object (at a `$m` key)
     * or another nested map of keys to `DefMapNode`s.
     *
     * @typedef {Object.<string, DefMapNode|SourceRange>} DefMapNode
     */

    /**
     * A DefMap is a nested object structure representing the path of properties parsed from a definition.
     * Each leaf node at a property path contains a `$m` key whose value is a `SourceRange`.
     *
     * Example structure:
     * {
     *   myComponent: {
     *     someKey: {
     *       subKey: {
     *         $m: { from: 123, to: 156 }
     *       }
     *     },
     *     anotherKey: {
     *       $m: { from: 200, to: 230 }
     *     },
     *     $m: { from: 50, to: 500 } // marks full range of the object
     *   }
     * }
     *
     * @typedef {Object.<String, DefMapNode>} DefMap
     */

    /**
     * State object used during defMap construction from a parse tree.
     * @typedef {Object} DefMapParseState
     * @property {Integer} tokens - Count of visited tokens.
     * @property {Integer} offset - Offset to apply to token positions (e.g., if parsing a fragment).
     * @property {DefMap} defMap - Output structure capturing positional metadata for parsed definitions.
     * @property {String[]} segs - Stack of property segments used to build nested paths.
     * @property {String|null} currentDef - Name of the definition currently being parsed.
     */

    /**
     * Recursively traverses a token tree representing parsed source and builds a `defMap`
     * structure capturing the character ranges of property definitions within calls to `fluid.def`.
     *
     * This function is meant to walk a parse tree produced by a parser that generates token
     * nodes for JavaScript-like structures, specifically looking for:
     * - `fluid.def("name", { ... })` calls to initiate definitions
     * - nested `Property` nodes to capture key paths and associate them with text ranges
     *
     * The resulting `state.defMap` can then be used to track and manipulate ranges of the original source text.
     *
     * @param {Object} token - A node in the token tree (must contain `name`, `text`, `children`, and optionally `from`, `to`).
     * @param {DefMapParseState} state - Mutable state object carrying tracking information and output structure.
     */
    fluid.defMapsFromTree = function (token, state) {
        let parsedDef = false,
            pushedSeg = false;
        if (token.name === "CallExpression" && token.children[0].name === "MemberExpression" && token.children[0].text === "fluid.def") {
            const argList = expectToken(token.children[1], "ArgList");
            const defName = expectToken(argList.children[1], "String"); // Should be type String - *(* *name* *,* *ObjectExpression* *)*
            state.currentDef = defName.text.slice(1, -1); // slice off quotes
            state.segs = [];
            parsedDef = true;
        } else if (state.currentDef && token.name === "ObjectExpression" && state.segs.length === 0) {
            fluid.set(state, ["defMap", state.currentDef, ...state.segs, $m], {from: token.from + state.offset, to: token.to + state.offset});
        } else if (state.currentDef && token.name === "Property") {
            const propDef = expectTokens(token.children[0], ["PropertyDefinition", "String"]); // Could be unquoted or quoted
            const value = token.children[2]; // Could be ObjectExpression, String, or any other RH
            state.segs.push(propDef.text);
            pushedSeg = true;
            fluid.set(state, ["defMap", state.currentDef, ...state.segs, $m], {from: value.from + state.offset, to: value.to + state.offset});
        }
        ++state.tokens;
        token.children.forEach(child => fluid.defMapsFromTree(child, state));
        if (parsedDef) {
            state.currentDef = null;
        }
        if (pushedSeg) {
            state.segs.pop();
        }
    };

    /**
     * Fetch a JSON proper definition from a mapped DefMap
     * @param {String} text - The original textual form of the structure to patch.
     * @param {DefMap} defMap - A defMap mapping (recursive) property names to their source ranges.
     * @param {String} layerName - Required layerName within the defMap
     * @param {String} key - The property key to add or update in the structure.
     * @return {Object|undefined} - The parsed JSON value
     */
    fluid.defFromMap = function (text, defMap, layerName, key) {
        const entry = fluid.get(defMap, [layerName, key, $m]);
        return entry && JSON.parse(text.slice(entry.from, entry.to));
    };

    /**
     * Patches a textual representation of a JSON-like structure using a defMap.
     * If the given `key` is already present in the `defMap`, its textual range is removed.
     *
     * @param {String} text - The original textual form of the structure to patch.
     * @param {DefMap} defMap - A flat defMap mapping top-level property names to their source ranges.
     *                          Must include a root range at defMap.$m.
     * @param {String} key - The property key to add or update in the structure.
     * @param {Object} value - The new value to assign to the property key.
     * @param {String} disposition - "first" or "last"
     * @return {String} - The updated textual representation with the key and value patched in.
     */
    fluid.patchDefMap = function (text, defMap, key, value, disposition) {
        const keyPath = [key, $m];
        const entry = fluid.get(defMap, keyPath);

        let resultText = text;

        if (entry) {
            // Replace the old key-value range with spaces
            const from = entry.from;
            const to = entry.to;
            resultText = resultText.slice(0, from) + resultText.slice(to);
        }
        const tom = defMap[$m].to - 1;
        const fromp = defMap[$m].from + 1;
        const empty = Object.keys(defMap).length === 1;

        const insertPos = disposition === "first" ? (resultText[fromp] === "\n" ? fromp + 1 : fromp) : (resultText[tom - 1] === "\n" ? tom - 1 : tom);

        const insertion = (disposition === "last" ? ",\n" : "") +
            `    ${key}: ${JSON.stringify(value)}` +
            (disposition === "first" && !empty ? ",\n" : "");
        resultText = resultText.slice(0, insertPos) + insertion + resultText.slice(insertPos);

        return resultText;
    };

    /**
     * Parses a source string containing one or more `fluid.def` calls and produces a `defMap`
     * structure that maps each definition and its properties to their character ranges in the source.
     *
     * @param {String} text - The source text to parse (must contain valid JavaScript including `fluid.def` declarations).
     * @param {Integer} offset - An character offset to apply to all recorded ranges.
     * @return {DefMap} - A structured map of definitions to property paths and their associated source ranges.
     */
    fluid.parseDefMaps = function (text, offset) {
        const lezerTree = LezerJS.parser.parse(text);

        const state = {
            tokens: 0,
            offset,
            defMap: {},
            segs: [],
            currentDef: null
        };

        const cursor = lezerTree.cursor();

        const tree = fluid.pushLezerChildren(null, cursor, text);
        fluid.defMapsFromTree(tree, state);
        console.log("Parsed defMaps ", state.defMap);
        return state.defMap;
    };

};

if (typeof(fluid) !== "undefined") {
    sfcParserScope(fluid);
}
