"use strict";

/* global LezerJS */


fluid.getFirstScript = function (text) {
    const startTag = "<script>";
    const endTag = "</script>";
    const startIndex = text.indexOf(startTag);
    const endIndex = text.indexOf(endTag, startIndex + startTag.length);

    if (startIndex !== -1 && endIndex !== -1) {
        return text.slice(startIndex + startTag.length, endIndex).trim();
    }
    return null;
};

const stopTokens = new Set(["ArrowFunction", "AssignmentExpression"]);

const pushChildren = function (parent, cursor, text, state) {
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
                const newToken = pushChildren(token, cursor, text, state);
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

const $m = fluid.metadataSymbol;

const parseMaps = function (token, state) {
    let parsedDef = false,
        pushedSeg = false;
    if (token.name === "CallExpression" && token.children[0].name === "MemberExpression" && token.children[0].text === "fluid.def") {
        const argList = expectToken(token.children[1], "ArgList");
        const defName = expectToken(argList.children[1], "String"); // Should be type String - *(* *name* *,* *ObjectExpression* *)*
        state.currentDef = defName.text.slice(1, -1); // slice off quotes
        state.segs = [];
        parsedDef = true;
    }
    if (state.currentDef && token.name === "Property") {
        const propDef = expectToken(token.children[0], "PropertyDefinition");
        const value = token.children[2]; // Could be ObjectExpression, String, or any other RH
        state.segs.push(propDef.text);
        pushedSeg = true;
        fluid.set(state, ["defMap", state.currentDef, ...state.segs, $m], {from: value.from, to: value.to});
    }
    ++state.tokens;
    token.children.forEach(child => parseMaps(child, state));
    if (parsedDef) {
        state.currentDef = null;
    }
    if (pushedSeg) {
        state.segs.pop();
    }
};

const dumpTokens = function (tree, indent = 0) {
    console.log(Array(indent).join(" ") + `${indent / 2}: ${tree.name} (${tree.children.length}):     ${tree.text.substring(0, 40)}`);
    tree.children.forEach(child => dumpTokens(child, indent + 2));
};


const parseTokens = function (textSignal) {

    const parsedSignal = fluid.computed(rawText => {
        const text = fluid.getFirstScript(rawText);
        const lezerTree = LezerJS.parser.parse(text);

        const state = {
            tokens: 0,
            defMap: {},
            segs: [],
            currentDef: null
        };

        const cursor = lezerTree.cursor();

        const tree = pushChildren(null, cursor, text);
        dumpTokens(tree);
        parseMaps(tree, state);

        return state;
    }, textSignal);

    fluid.catch(parsedSignal, error => console.log("Error fetching text: ", error.causes));

    fluid.effect(parsed => {
        console.log(parsed.tokens + " tokens: ", parsed.defMap);
    }, parsedSignal);
};

//const appSignal = fluid.fetchText("../../../../demo/todo-list-sfc/sfc/todo-app.vue");
//parseTokens(appSignal);

const listSignal = fluid.fetchText("../../../../demo/todo-list-sfc/sfc/todo-list.vue");
parseTokens(listSignal);
