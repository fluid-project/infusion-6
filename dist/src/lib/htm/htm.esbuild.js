(function () {
// src/constants.mjs
    var MINI = false;

// src/build.mjs
    var MODE_SLASH = 0;
    var MODE_TEXT = 1;
    var MODE_WHITESPACE = 2;
    var MODE_TAGNAME = 3;
    var MODE_COMMENT = 4;
    var MODE_PROP_SET = 5;
    var MODE_PROP_APPEND = 6;
    var CHILD_APPEND = 0;
    var CHILD_RECURSE = 2;
    var TAG_SET = 3;
    var PROPS_ASSIGN = 4;
    var PROP_SET = MODE_PROP_SET;
    var PROP_APPEND = MODE_PROP_APPEND;
    var treeify = (built, fields) => {
        const _treeify = (built2) => {
            let tag = "";
            let currentProps = null;
            const props = [];
            const children2 = [];
            for (let i = 1; i < built2.length; i++) {
                const type = built2[i++];
                const value = built2[i] ? fields[built2[i++] - 1] : built2[++i];
                if (type === TAG_SET) {
                    tag = value;
                } else if (type === PROPS_ASSIGN) {
                    props.push(value);
                    currentProps = null;
                } else if (type === PROP_SET) {
                    if (!currentProps) {
                        currentProps = /* @__PURE__ */ Object.create(null);
                        props.push(currentProps);
                    }
                    currentProps[built2[++i]] = [value];
                } else if (type === PROP_APPEND) {
                    currentProps[built2[++i]].push(value);
                } else if (type === CHILD_RECURSE) {
                    children2.push(_treeify(value));
                } else if (type === CHILD_APPEND) {
                    children2.push(value);
                }
            }
            return {tag, props, children: children2};
        };
        const {children} = _treeify(built);
        return children.length > 1 ? children : children[0];
    };
    var evaluate = (h, built, fields, args) => {
        let tmp;
        built[0] = 0;
        for (let i = 1; i < built.length; i++) {
            const type = built[i++];
            const value = built[i] ? (built[0] |= type ? 1 : 2, fields[built[i++]]) : built[++i];
            if (type === TAG_SET) {
                args[0] = value;
            } else if (type === PROPS_ASSIGN) {
                args[1] = Object.assign(args[1] || {}, value);
            } else if (type === PROP_SET) {
                (args[1] = args[1] || {})[built[++i]] = value;
            } else if (type === PROP_APPEND) {
                args[1][built[++i]] += value + "";
            } else if (type) {
                tmp = h.apply(value, evaluate(h, value, fields, ["", null]));
                args.push(tmp);
                if (value[0]) {
                    built[0] |= 2;
                } else {
                    built[i - 2] = CHILD_APPEND;
                    built[i] = tmp;
                }
            } else {
                args.push(value);
            }
        }
        return args;
    };
    var build = function (statics) {
        const fields = arguments;
        const h = this;
        let mode = MODE_TEXT;
        let buffer = "";
        let quote = "";
        let current = [0];
        let char, propName;
        const commit = (field) => {
            if (mode === MODE_TEXT && (field || (buffer = buffer.replace(/^\s*\n\s*|\s*\n\s*$/g, "")))) {
                if (MINI) {
                    current.push(field ? fields[field] : buffer);
                } else {
                    current.push(CHILD_APPEND, field, buffer);
                }
            } else if (mode === MODE_TAGNAME && (field || buffer)) {
                if (MINI) {
                    current[1] = field ? fields[field] : buffer;
                } else {
                    current.push(TAG_SET, field, buffer);
                }
                mode = MODE_WHITESPACE;
            } else if (mode === MODE_WHITESPACE && buffer === "..." && field) {
                if (MINI) {
                    current[2] = Object.assign(current[2] || {}, fields[field]);
                } else {
                    current.push(PROPS_ASSIGN, field, 0);
                }
            } else if (mode === MODE_WHITESPACE && buffer && !field) {
                if (MINI) {
                    (current[2] = current[2] || {})[buffer] = true;
                } else {
                    current.push(PROP_SET, 0, true, buffer);
                }
            } else if (mode >= MODE_PROP_SET) {
                if (MINI) {
                    if (mode === MODE_PROP_SET) {
                        (current[2] = current[2] || {})[propName] = field ? buffer ? buffer + fields[field] : fields[field] : buffer;
                        mode = MODE_PROP_APPEND;
                    } else if (field || buffer) {
                        current[2][propName] += field ? buffer + fields[field] : buffer;
                    }
                } else {
                    if (buffer || !field && mode === MODE_PROP_SET) {
                        current.push(mode, 0, buffer, propName);
                        mode = MODE_PROP_APPEND;
                    }
                    if (field) {
                        current.push(mode, field, 0, propName);
                        mode = MODE_PROP_APPEND;
                    }
                }
            }
            buffer = "";
        };
        for (let i = 0; i < statics.length; i++) {
            if (i) {
                if (mode === MODE_TEXT) {
                    commit();
                }
                commit(i);
            }
            for (let j = 0; j < statics[i].length; j++) {
                char = statics[i][j];
                if (mode === MODE_TEXT) {
                    if (char === "<") {
                        commit();
                        if (MINI) {
                            current = [current, "", null];
                        } else {
                            current = [current];
                        }
                        mode = MODE_TAGNAME;
                    } else {
                        buffer += char;
                    }
                } else if (mode === MODE_COMMENT) {
                    if (buffer === "--" && char === ">") {
                        mode = MODE_TEXT;
                        buffer = "";
                    } else {
                        buffer = char + buffer[0];
                    }
                } else if (quote) {
                    if (char === quote) {
                        quote = "";
                    } else {
                        buffer += char;
                    }
                } else if (char === '"' || char === "'") {
                    quote = char;
                } else if (char === ">") {
                    commit();
                    mode = MODE_TEXT;
                } else if (!mode) {
                } else if (char === "=") {
                    mode = MODE_PROP_SET;
                    propName = buffer;
                    buffer = "";
                } else if (char === "/" && (mode < MODE_PROP_SET || statics[i][j + 1] === ">")) {
                    commit();
                    if (mode === MODE_TAGNAME) {
                        current = current[0];
                    }
                    mode = current;
                    if (MINI) {
                        (current = current[0]).push(h.apply(null, mode.slice(1)));
                    } else {
                        (current = current[0]).push(CHILD_RECURSE, 0, mode);
                    }
                    mode = MODE_SLASH;
                } else if (char === " " || char === "	" || char === "\n" || char === "\r") {
                    commit();
                    mode = MODE_WHITESPACE;
                } else {
                    buffer += char;
                }
                if (mode === MODE_TAGNAME && buffer === "!--") {
                    mode = MODE_COMMENT;
                    current = current[0];
                }
            }
        }
        commit();
        if (MINI) {
            return current.length > 2 ? current.slice(1) : current[1];
        }
        return current;
    };

    // src/index.mjs
    var CACHES = /* @__PURE__ */ new Map();
    var regular = function(statics) {
        let tmp = CACHES.get(this);
        if (!tmp) {
            tmp = /* @__PURE__ */ new Map();
            CACHES.set(this, tmp);
        }
        tmp = evaluate(this, tmp.get(statics) || (tmp.set(statics, tmp = build(statics)), tmp), arguments, []);
        return tmp.length > 1 ? tmp : tmp[0];
    };
    var index_default = MINI ? build : regular;

    window.htm = index_default;
})();

