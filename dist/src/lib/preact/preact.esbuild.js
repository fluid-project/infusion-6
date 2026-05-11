(function () {
// src/constants.js
    var MODE_HYDRATE = 1 << 5;
    var MODE_SUSPENDED = 1 << 7;
    var INSERT_VNODE = 1 << 2;
    var MATCHED = 1 << 1;
    var RESET_MODE = ~(MODE_HYDRATE | MODE_SUSPENDED);
    var SVG_NAMESPACE = "http://www.w3.org/2000/svg";
    var XHTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
    var MATH_NAMESPACE = "http://www.w3.org/1998/Math/MathML";
    var NULL = null;
    var UNDEFINED = void 0;
    var EMPTY_OBJ = (
        /** @type {any} */
        {}
    );
    var EMPTY_ARR = [];
    var IS_NON_DIMENSIONAL = /acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i;

// src/util.js
    var isArray = Array.isArray;

    function assign(obj, props) {
        for (let i2 in props) obj[i2] = props[i2];
        return (
            /** @type {O & P} */
            obj
        );
    }

    function removeNode(node) {
        if (node && node.parentNode) node.parentNode.removeChild(node);
    }

    var slice = EMPTY_ARR.slice;

// src/diff/catch-error.js
    function _catchError(error, vnode, oldVNode, errorInfo) {
        let component, ctor, handled;
        for (; vnode = vnode._parent;) {
            if ((component = vnode._component) && !component._processingException) {
                try {
                    ctor = component.constructor;
                    if (ctor && ctor.getDerivedStateFromError != NULL) {
                        component.setState(ctor.getDerivedStateFromError(error));
                        handled = component._dirty;
                    }
                    if (component.componentDidCatch != NULL) {
                        component.componentDidCatch(error, errorInfo || {});
                        handled = component._dirty;
                    }
                    if (handled) {
                        return component._pendingError = component;
                    }
                } catch (e) {
                    error = e;
                }
            }
        }
        throw error;
    }

// src/options.js
    var options = {
        _catchError
    };
    var options_default = options;

// src/create-element.js
    var vnodeId = 0;

    function createElement(type, props, children) {
        let normalizedProps = {}, key, ref, i2;
        for (i2 in props) {
            if (i2 == "key") key = props[i2];
            else if (i2 == "ref") ref = props[i2];
            else normalizedProps[i2] = props[i2];
        }
        if (arguments.length > 2) {
            normalizedProps.children = arguments.length > 3 ? slice.call(arguments, 2) : children;
        }
        if (typeof type == "function" && type.defaultProps != NULL) {
            for (i2 in type.defaultProps) {
                if (normalizedProps[i2] === UNDEFINED) {
                    normalizedProps[i2] = type.defaultProps[i2];
                }
            }
        }
        return createVNode(type, normalizedProps, key, ref, NULL);
    }

    function createVNode(type, props, key, ref, original) {
        const vnode = {
            type,
            props,
            key,
            ref,
            _children: NULL,
            _parent: NULL,
            _depth: 0,
            _dom: NULL,
            _component: NULL,
            constructor: UNDEFINED,
            _original: original == NULL ? ++vnodeId : original,
            _index: -1,
            _flags: 0
        };
        if (original == NULL && options_default.vnode != NULL) options_default.vnode(vnode);
        return vnode;
    }

    function createRef() {
        return {current: NULL};
    }

    function Fragment(props) {
        return props.children;
    }

    var isValidElement = (vnode) => vnode != NULL && vnode.constructor == UNDEFINED;

// src/component.js
    function BaseComponent(props, context) {
        this.props = props;
        this.context = context;
    }

    BaseComponent.prototype.setState = function (update, callback) {
        let s;
        if (this._nextState != NULL && this._nextState !== this.state) {
            s = this._nextState;
        } else {
            s = this._nextState = assign({}, this.state);
        }
        if (typeof update == "function") {
            update = update(assign({}, s), this.props);
        }
        if (update) {
            assign(s, update);
        }
        if (update == NULL) return;
        if (this._vnode) {
            if (callback) {
                this._stateCallbacks.push(callback);
            }
            enqueueRender(this);
        }
    };
    BaseComponent.prototype.forceUpdate = function (callback) {
        if (this._vnode) {
            this._force = true;
            if (callback) this._renderCallbacks.push(callback);
            enqueueRender(this);
        }
    };
    BaseComponent.prototype.render = Fragment;

    function getDomSibling(vnode, childIndex) {
        if (childIndex == NULL) {
            return vnode._parent ? getDomSibling(vnode._parent, vnode._index + 1) : NULL;
        }
        let sibling;
        for (; childIndex < vnode._children.length; childIndex++) {
            sibling = vnode._children[childIndex];
            if (sibling != NULL && sibling._dom != NULL) {
                return sibling._dom;
            }
        }
        return typeof vnode.type == "function" ? getDomSibling(vnode) : NULL;
    }

    function renderComponent(component) {
        let oldVNode = component._vnode, oldDom = oldVNode._dom, commitQueue = [], refQueue = [];
        if (component._parentDom) {
            const newVNode = assign({}, oldVNode);
            newVNode._original = oldVNode._original + 1;
            if (options_default.vnode) options_default.vnode(newVNode);
            diff(
                component._parentDom,
                newVNode,
                oldVNode,
                component._globalContext,
                component._parentDom.namespaceURI,
                oldVNode._flags & MODE_HYDRATE ? [oldDom] : NULL,
                commitQueue,
                oldDom == NULL ? getDomSibling(oldVNode) : oldDom,
                !!(oldVNode._flags & MODE_HYDRATE),
                refQueue
            );
            newVNode._original = oldVNode._original;
            newVNode._parent._children[newVNode._index] = newVNode;
            commitRoot(commitQueue, newVNode, refQueue);
            if (newVNode._dom != oldDom) {
                updateParentDomPointers(newVNode);
            }
        }
    }

    function updateParentDomPointers(vnode) {
        if ((vnode = vnode._parent) != NULL && vnode._component != NULL) {
            vnode._dom = vnode._component.base = NULL;
            for (let i2 = 0; i2 < vnode._children.length; i2++) {
                let child = vnode._children[i2];
                if (child != NULL && child._dom != NULL) {
                    vnode._dom = vnode._component.base = child._dom;
                    break;
                }
            }
            return updateParentDomPointers(vnode);
        }
    }

    var rerenderQueue = [];
    var prevDebounce;
    var defer = typeof Promise == "function" ? Promise.prototype.then.bind(Promise.resolve()) : setTimeout;

    function enqueueRender(c) {
        if (!c._dirty && (c._dirty = true) && rerenderQueue.push(c) && !process._rerenderCount++ || prevDebounce !== options_default.debounceRendering) {
            prevDebounce = options_default.debounceRendering;
            (prevDebounce || defer)(process);
        }
    }

    var depthSort = (a, b) => a._vnode._depth - b._vnode._depth;

    function process() {
        let c, l = 1;
        while (rerenderQueue.length) {
            if (rerenderQueue.length > l) {
                rerenderQueue.sort(depthSort);
            }
            c = rerenderQueue.shift();
            l = rerenderQueue.length;
            if (c._dirty) {
                renderComponent(c);
            }
        }
        process._rerenderCount = 0;
    }

    process._rerenderCount = 0;

// src/diff/children.js
    function diffChildren(parentDom, renderResult, newParentVNode, oldParentVNode, globalContext, namespace, excessDomChildren, commitQueue, oldDom, isHydrating, refQueue) {
        let i2, oldVNode, childVNode, newDom, firstChildDom;
        let oldChildren = oldParentVNode && oldParentVNode._children || EMPTY_ARR;
        let newChildrenLength = renderResult.length;
        oldDom = constructNewChildrenArray(
            newParentVNode,
            renderResult,
            oldChildren,
            oldDom,
            newChildrenLength
        );
        for (i2 = 0; i2 < newChildrenLength; i2++) {
            childVNode = newParentVNode._children[i2];
            if (childVNode == NULL) continue;
            if (childVNode._index === -1) {
                oldVNode = EMPTY_OBJ;
            } else {
                oldVNode = oldChildren[childVNode._index] || EMPTY_OBJ;
            }
            childVNode._index = i2;
            let result = diff(
                parentDom,
                childVNode,
                oldVNode,
                globalContext,
                namespace,
                excessDomChildren,
                commitQueue,
                oldDom,
                isHydrating,
                refQueue
            );
            newDom = childVNode._dom;
            if (childVNode.ref && oldVNode.ref != childVNode.ref) {
                if (oldVNode.ref) {
                    applyRef(oldVNode.ref, NULL, childVNode);
                }
                refQueue.push(
                    childVNode.ref,
                    childVNode._component || newDom,
                    childVNode
                );
            }
            if (firstChildDom == NULL && newDom != NULL) {
                firstChildDom = newDom;
            }
            if (childVNode._flags & INSERT_VNODE || oldVNode._children === childVNode._children) {
                oldDom = insert(childVNode, oldDom, parentDom);
            } else if (typeof childVNode.type == "function" && result !== UNDEFINED) {
                oldDom = result;
            } else if (newDom) {
                oldDom = newDom.nextSibling;
            }
            childVNode._flags &= ~(INSERT_VNODE | MATCHED);
        }
        newParentVNode._dom = firstChildDom;
        return oldDom;
    }

    function constructNewChildrenArray(newParentVNode, renderResult, oldChildren, oldDom, newChildrenLength) {
        let i2;
        let childVNode;
        let oldVNode;
        let oldChildrenLength = oldChildren.length, remainingOldChildren = oldChildrenLength;
        let skew = 0;
        newParentVNode._children = new Array(newChildrenLength);
        for (i2 = 0; i2 < newChildrenLength; i2++) {
            childVNode = renderResult[i2];
            if (childVNode == NULL || typeof childVNode == "boolean" || typeof childVNode == "function") {
                newParentVNode._children[i2] = NULL;
                continue;
            } else if (typeof childVNode == "string" || typeof childVNode == "number" || // eslint-disable-next-line valid-typeof
                typeof childVNode == "bigint" || childVNode.constructor == String) {
                childVNode = newParentVNode._children[i2] = createVNode(
                    NULL,
                    childVNode,
                    NULL,
                    NULL,
                    NULL
                );
            } else if (isArray(childVNode)) {
                childVNode = newParentVNode._children[i2] = createVNode(
                    Fragment,
                    {children: childVNode},
                    NULL,
                    NULL,
                    NULL
                );
            } else if (childVNode.constructor === UNDEFINED && childVNode._depth > 0) {
                childVNode = newParentVNode._children[i2] = createVNode(
                    childVNode.type,
                    childVNode.props,
                    childVNode.key,
                    childVNode.ref ? childVNode.ref : NULL,
                    childVNode._original
                );
            } else {
                childVNode = newParentVNode._children[i2] = childVNode;
            }
            const skewedIndex = i2 + skew;
            childVNode._parent = newParentVNode;
            childVNode._depth = newParentVNode._depth + 1;
            const matchingIndex = childVNode._index = findMatchingIndex(
                childVNode,
                oldChildren,
                skewedIndex,
                remainingOldChildren
            );
            oldVNode = NULL;
            if (matchingIndex !== -1) {
                oldVNode = oldChildren[matchingIndex];
                remainingOldChildren--;
                if (oldVNode) {
                    oldVNode._flags |= MATCHED;
                }
            }
            const isMounting = oldVNode == NULL || oldVNode._original === NULL;
            if (isMounting) {
                if (matchingIndex == -1) {
                    skew--;
                }
                if (typeof childVNode.type != "function") {
                    childVNode._flags |= INSERT_VNODE;
                }
            } else if (matchingIndex != skewedIndex) {
                if (matchingIndex == skewedIndex - 1) {
                    skew--;
                } else if (matchingIndex == skewedIndex + 1) {
                    skew++;
                } else {
                    if (matchingIndex > skewedIndex) {
                        skew--;
                    } else {
                        skew++;
                    }
                    childVNode._flags |= INSERT_VNODE;
                }
            }
        }
        if (remainingOldChildren) {
            for (i2 = 0; i2 < oldChildrenLength; i2++) {
                oldVNode = oldChildren[i2];
                if (oldVNode != NULL && (oldVNode._flags & MATCHED) == 0) {
                    if (oldVNode._dom == oldDom) {
                        oldDom = getDomSibling(oldVNode);
                    }
                    unmount(oldVNode, oldVNode);
                }
            }
        }
        return oldDom;
    }

    function insert(parentVNode, oldDom, parentDom) {
        if (typeof parentVNode.type == "function") {
            let children = parentVNode._children;
            for (let i2 = 0; children && i2 < children.length; i2++) {
                if (children[i2]) {
                    children[i2]._parent = parentVNode;
                    oldDom = insert(children[i2], oldDom, parentDom);
                }
            }
            return oldDom;
        } else if (parentVNode._dom != oldDom) {
            if (oldDom && parentVNode.type && !parentDom.contains(oldDom)) {
                oldDom = getDomSibling(parentVNode);
            }
            parentDom.insertBefore(parentVNode._dom, oldDom || NULL);
            oldDom = parentVNode._dom;
        }
        do {
            oldDom = oldDom && oldDom.nextSibling;
        } while (oldDom != NULL && oldDom.nodeType == 8);
        return oldDom;
    }

    function toChildArray(children, out) {
        out = out || [];
        if (children == NULL || typeof children == "boolean") {
        } else if (isArray(children)) {
            children.some((child) => {
                toChildArray(child, out);
            });
        } else {
            out.push(children);
        }
        return out;
    }

    function findMatchingIndex(childVNode, oldChildren, skewedIndex, remainingOldChildren) {
        const key = childVNode.key;
        const type = childVNode.type;
        let oldVNode = oldChildren[skewedIndex];
        let shouldSearch = (
            // (typeof type != 'function' || type === Fragment || key) &&
            remainingOldChildren > (oldVNode != NULL && (oldVNode._flags & MATCHED) == 0 ? 1 : 0)
        );
        if (oldVNode === NULL || oldVNode && key == oldVNode.key && type === oldVNode.type && (oldVNode._flags & MATCHED) == 0) {
            return skewedIndex;
        } else if (shouldSearch) {
            let x = skewedIndex - 1;
            let y = skewedIndex + 1;
            while (x >= 0 || y < oldChildren.length) {
                if (x >= 0) {
                    oldVNode = oldChildren[x];
                    if (oldVNode && (oldVNode._flags & MATCHED) == 0 && key == oldVNode.key && type === oldVNode.type) {
                        return x;
                    }
                    x--;
                }
                if (y < oldChildren.length) {
                    oldVNode = oldChildren[y];
                    if (oldVNode && (oldVNode._flags & MATCHED) == 0 && key == oldVNode.key && type === oldVNode.type) {
                        return y;
                    }
                    y++;
                }
            }
        }
        return -1;
    }

// src/diff/props.js
    function setStyle(style, key, value) {
        if (key[0] == "-") {
            style.setProperty(key, value == NULL ? "" : value);
        } else if (value == NULL) {
            style[key] = "";
        } else if (typeof value != "number" || IS_NON_DIMENSIONAL.test(key)) {
            style[key] = value;
        } else {
            style[key] = value + "px";
        }
    }

    var CAPTURE_REGEX = /(PointerCapture)$|Capture$/i;
    var eventClock = 0;

    function setProperty(dom, name, value, oldValue, namespace) {
        let useCapture;
        o: if (name == "style") {
            if (typeof value == "string") {
                dom.style.cssText = value;
            } else {
                if (typeof oldValue == "string") {
                    dom.style.cssText = oldValue = "";
                }
                if (oldValue) {
                    for (name in oldValue) {
                        if (!(value && name in value)) {
                            setStyle(dom.style, name, "");
                        }
                    }
                }
                if (value) {
                    for (name in value) {
                        if (!oldValue || value[name] !== oldValue[name]) {
                            setStyle(dom.style, name, value[name]);
                        }
                    }
                }
            }
        } else if (name[0] == "o" && name[1] == "n") {
            useCapture = name != (name = name.replace(CAPTURE_REGEX, "$1"));
            if (name.toLowerCase() in dom || name == "onFocusOut" || name == "onFocusIn")
                name = name.toLowerCase().slice(2);
            else name = name.slice(2);
            if (!dom._listeners) dom._listeners = {};
            dom._listeners[name + useCapture] = value;
            if (value) {
                if (!oldValue) {
                    value._attached = eventClock;
                    dom.addEventListener(
                        name,
                        useCapture ? eventProxyCapture : eventProxy,
                        useCapture
                    );
                } else {
                    value._attached = oldValue._attached;
                }
            } else {
                dom.removeEventListener(
                    name,
                    useCapture ? eventProxyCapture : eventProxy,
                    useCapture
                );
            }
        } else {
            if (namespace == SVG_NAMESPACE) {
                name = name.replace(/xlink(H|:h)/, "h").replace(/sName$/, "s");
            } else if (name != "width" && name != "height" && name != "href" && name != "list" && name != "form" && // Default value in browsers is `-1` and an empty string is
                // cast to `0` instead
                name != "tabIndex" && name != "download" && name != "rowSpan" && name != "colSpan" && name != "role" && name != "popover" && name in dom) {
                try {
                    dom[name] = value == NULL ? "" : value;
                    break o;
                } catch (e) {
                }
            }
            if (typeof value == "function") {
            } else if (value != NULL && (value !== false || name[4] == "-")) {
                dom.setAttribute(name, name == "popover" && value == true ? "" : value);
            } else {
                dom.removeAttribute(name);
            }
        }
    }

    function createEventProxy(useCapture) {
        return function (e) {
            if (this._listeners) {
                const eventHandler = this._listeners[e.type + useCapture];
                if (e._dispatched == NULL) {
                    e._dispatched = eventClock++;
                } else if (e._dispatched < eventHandler._attached) {
                    return;
                }
                return eventHandler(options_default.event ? options_default.event(e) : e);
            }
        };
    }

    var eventProxy = createEventProxy(false);
    var eventProxyCapture = createEventProxy(true);

// src/diff/index.js
    function diff(parentDom, newVNode, oldVNode, globalContext, namespace, excessDomChildren, commitQueue, oldDom, isHydrating, refQueue) {
        let tmp, newType = newVNode.type;
        if (newVNode.constructor !== UNDEFINED) return NULL;
        if (oldVNode._flags & MODE_SUSPENDED) {
            isHydrating = !!(oldVNode._flags & MODE_HYDRATE);
            oldDom = newVNode._dom = oldVNode._dom;
            excessDomChildren = [oldDom];
        }
        if (tmp = options_default._diff) tmp(newVNode);
        outer: if (typeof newType == "function") {
            try {
                let c, isNew, oldProps, oldState, snapshot, clearProcessingException;
                let newProps = newVNode.props;
                const isClassComponent = "prototype" in newType && newType.prototype.render;
                tmp = newType.contextType;
                let provider = tmp && globalContext[tmp._id];
                let componentContext = tmp ? provider ? provider.props.value : tmp._defaultValue : globalContext;
                if (oldVNode._component) {
                    c = newVNode._component = oldVNode._component;
                    clearProcessingException = c._processingException = c._pendingError;
                } else {
                    if (isClassComponent) {
                        newVNode._component = c = new newType(newProps, componentContext);
                    } else {
                        newVNode._component = c = new BaseComponent(
                            newProps,
                            componentContext
                        );
                        c.constructor = newType;
                        c.render = doRender;
                    }
                    if (provider) provider.sub(c);
                    c.props = newProps;
                    if (!c.state) c.state = {};
                    c.context = componentContext;
                    c._globalContext = globalContext;
                    isNew = c._dirty = true;
                    c._renderCallbacks = [];
                    c._stateCallbacks = [];
                }
                if (isClassComponent && c._nextState == NULL) {
                    c._nextState = c.state;
                }
                if (isClassComponent && newType.getDerivedStateFromProps != NULL) {
                    if (c._nextState == c.state) {
                        c._nextState = assign({}, c._nextState);
                    }
                    assign(
                        c._nextState,
                        newType.getDerivedStateFromProps(newProps, c._nextState)
                    );
                }
                oldProps = c.props;
                oldState = c.state;
                c._vnode = newVNode;
                if (isNew) {
                    if (isClassComponent && newType.getDerivedStateFromProps == NULL && c.componentWillMount != NULL) {
                        c.componentWillMount();
                    }
                    if (isClassComponent && c.componentDidMount != NULL) {
                        c._renderCallbacks.push(c.componentDidMount);
                    }
                } else {
                    if (isClassComponent && newType.getDerivedStateFromProps == NULL && newProps !== oldProps && c.componentWillReceiveProps != NULL) {
                        c.componentWillReceiveProps(newProps, componentContext);
                    }
                    if (!c._force && (c.shouldComponentUpdate != NULL && c.shouldComponentUpdate(
                        newProps,
                        c._nextState,
                        componentContext
                    ) === false || newVNode._original == oldVNode._original)) {
                        if (newVNode._original != oldVNode._original) {
                            c.props = newProps;
                            c.state = c._nextState;
                            c._dirty = false;
                        }
                        newVNode._dom = oldVNode._dom;
                        newVNode._children = oldVNode._children;
                        newVNode._children.some((vnode) => {
                            if (vnode) vnode._parent = newVNode;
                        });
                        for (let i2 = 0; i2 < c._stateCallbacks.length; i2++) {
                            c._renderCallbacks.push(c._stateCallbacks[i2]);
                        }
                        c._stateCallbacks = [];
                        if (c._renderCallbacks.length) {
                            commitQueue.push(c);
                        }
                        break outer;
                    }
                    if (c.componentWillUpdate != NULL) {
                        c.componentWillUpdate(newProps, c._nextState, componentContext);
                    }
                    if (isClassComponent && c.componentDidUpdate != NULL) {
                        c._renderCallbacks.push(() => {
                            c.componentDidUpdate(oldProps, oldState, snapshot);
                        });
                    }
                }
                c.context = componentContext;
                c.props = newProps;
                c._parentDom = parentDom;
                c._force = false;
                let renderHook = options_default._render, count = 0;
                if (isClassComponent) {
                    c.state = c._nextState;
                    c._dirty = false;
                    if (renderHook) renderHook(newVNode);
                    tmp = c.render(c.props, c.state, c.context);
                    for (let i2 = 0; i2 < c._stateCallbacks.length; i2++) {
                        c._renderCallbacks.push(c._stateCallbacks[i2]);
                    }
                    c._stateCallbacks = [];
                } else {
                    do {
                        c._dirty = false;
                        if (renderHook) renderHook(newVNode);
                        tmp = c.render(c.props, c.state, c.context);
                        c.state = c._nextState;
                    } while (c._dirty && ++count < 25);
                }
                c.state = c._nextState;
                if (c.getChildContext != NULL) {
                    globalContext = assign(assign({}, globalContext), c.getChildContext());
                }
                if (isClassComponent && !isNew && c.getSnapshotBeforeUpdate != NULL) {
                    snapshot = c.getSnapshotBeforeUpdate(oldProps, oldState);
                }
                let isTopLevelFragment = tmp != NULL && tmp.type === Fragment && tmp.key == NULL;
                let renderResult = isTopLevelFragment ? tmp.props.children : tmp;
                if (isTopLevelFragment) {
                    tmp.props.children = NULL;
                }
                oldDom = diffChildren(
                    parentDom,
                    isArray(renderResult) ? renderResult : [renderResult],
                    newVNode,
                    oldVNode,
                    globalContext,
                    namespace,
                    excessDomChildren,
                    commitQueue,
                    oldDom,
                    isHydrating,
                    refQueue
                );
                c.base = newVNode._dom;
                newVNode._flags &= RESET_MODE;
                if (c._renderCallbacks.length) {
                    commitQueue.push(c);
                }
                if (clearProcessingException) {
                    c._pendingError = c._processingException = NULL;
                }
            } catch (e) {
                newVNode._original = NULL;
                if (isHydrating || excessDomChildren != NULL) {
                    if (e.then) {
                        newVNode._flags |= isHydrating ? MODE_HYDRATE | MODE_SUSPENDED : MODE_SUSPENDED;
                        while (oldDom && oldDom.nodeType == 8 && oldDom.nextSibling) {
                            oldDom = oldDom.nextSibling;
                        }
                        excessDomChildren[excessDomChildren.indexOf(oldDom)] = NULL;
                        newVNode._dom = oldDom;
                    } else {
                        for (let i2 = excessDomChildren.length; i2--;) {
                            removeNode(excessDomChildren[i2]);
                        }
                    }
                } else {
                    newVNode._dom = oldVNode._dom;
                    newVNode._children = oldVNode._children;
                }
                options_default._catchError(e, newVNode, oldVNode);
            }
        } else if (excessDomChildren == NULL && newVNode._original == oldVNode._original) {
            newVNode._children = oldVNode._children;
            newVNode._dom = oldVNode._dom;
        } else {
            oldDom = newVNode._dom = diffElementNodes(
                oldVNode._dom,
                newVNode,
                oldVNode,
                globalContext,
                namespace,
                excessDomChildren,
                commitQueue,
                isHydrating,
                refQueue
            );
        }
        if (tmp = options_default.diffed) tmp(newVNode);
        return newVNode._flags & MODE_SUSPENDED ? void 0 : oldDom;
    }

    function commitRoot(commitQueue, root, refQueue) {
        for (let i2 = 0; i2 < refQueue.length; i2++) {
            applyRef(refQueue[i2], refQueue[++i2], refQueue[++i2]);
        }
        if (options_default._commit) options_default._commit(root, commitQueue);
        commitQueue.some((c) => {
            try {
                commitQueue = c._renderCallbacks;
                c._renderCallbacks = [];
                commitQueue.some((cb) => {
                    cb.call(c);
                });
            } catch (e) {
                options_default._catchError(e, c._vnode);
            }
        });
    }

    function diffElementNodes(dom, newVNode, oldVNode, globalContext, namespace, excessDomChildren, commitQueue, isHydrating, refQueue) {
        let oldProps = oldVNode.props;
        let newProps = newVNode.props;
        let nodeType = (
            /** @type {string} */
            newVNode.type
        );
        let i2;
        let newHtml;
        let oldHtml;
        let newChildren;
        let value;
        let inputValue;
        let checked;
        if (nodeType == "svg") namespace = SVG_NAMESPACE;
        else if (nodeType == "math") namespace = MATH_NAMESPACE;
        else if (!namespace) namespace = XHTML_NAMESPACE;
        if (excessDomChildren != NULL) {
            for (i2 = 0; i2 < excessDomChildren.length; i2++) {
                value = excessDomChildren[i2];
                if (value && "setAttribute" in value == !!nodeType && (nodeType ? value.localName == nodeType : value.nodeType == 3)) {
                    dom = value;
                    excessDomChildren[i2] = NULL;
                    break;
                }
            }
        }
        if (dom == NULL) {
            if (nodeType == NULL) {
                return document.createTextNode(newProps);
            }
            dom = document.createElementNS(
                namespace,
                nodeType,
                newProps.is && newProps
            );
            if (isHydrating) {
                if (options_default._hydrationMismatch)
                    options_default._hydrationMismatch(newVNode, excessDomChildren);
                isHydrating = false;
            }
            excessDomChildren = NULL;
        }
        if (nodeType === NULL) {
            if (oldProps !== newProps && (!isHydrating || dom.data !== newProps)) {
                dom.data = newProps;
            }
        } else {
            excessDomChildren = excessDomChildren && slice.call(dom.childNodes);
            oldProps = oldVNode.props || EMPTY_OBJ;
            if (!isHydrating && excessDomChildren != NULL) {
                oldProps = {};
                for (i2 = 0; i2 < dom.attributes.length; i2++) {
                    value = dom.attributes[i2];
                    oldProps[value.name] = value.value;
                }
            }
            for (i2 in oldProps) {
                value = oldProps[i2];
                if (i2 == "children") {
                } else if (i2 == "dangerouslySetInnerHTML") {
                    oldHtml = value;
                } else if (!(i2 in newProps)) {
                    if (i2 == "value" && "defaultValue" in newProps || i2 == "checked" && "defaultChecked" in newProps) {
                        continue;
                    }
                    setProperty(dom, i2, NULL, value, namespace);
                }
            }
            for (i2 in newProps) {
                value = newProps[i2];
                if (i2 == "children") {
                    newChildren = value;
                } else if (i2 == "dangerouslySetInnerHTML") {
                    newHtml = value;
                } else if (i2 == "value") {
                    inputValue = value;
                } else if (i2 == "checked") {
                    checked = value;
                } else if ((!isHydrating || typeof value == "function") && oldProps[i2] !== value) {
                    setProperty(dom, i2, value, oldProps[i2], namespace);
                }
            }
            if (newHtml) {
                if (!isHydrating && (!oldHtml || newHtml.__html !== oldHtml.__html && newHtml.__html !== dom.innerHTML)) {
                    dom.innerHTML = newHtml.__html;
                }
                newVNode._children = [];
            } else {
                if (oldHtml) dom.innerHTML = "";
                diffChildren(
                    // @ts-expect-error
                    newVNode.type === "template" ? dom.content : dom,
                    isArray(newChildren) ? newChildren : [newChildren],
                    newVNode,
                    oldVNode,
                    globalContext,
                    nodeType == "foreignObject" ? XHTML_NAMESPACE : namespace,
                    excessDomChildren,
                    commitQueue,
                    excessDomChildren ? excessDomChildren[0] : oldVNode._children && getDomSibling(oldVNode, 0),
                    isHydrating,
                    refQueue
                );
                if (excessDomChildren != NULL) {
                    for (i2 = excessDomChildren.length; i2--;) {
                        removeNode(excessDomChildren[i2]);
                    }
                }
            }
            if (!isHydrating) {
                i2 = "value";
                if (nodeType == "progress" && inputValue == NULL) {
                    dom.removeAttribute("value");
                } else if (inputValue !== UNDEFINED && // #2756 For the <progress>-element the initial value is 0,
                    // despite the attribute not being present. When the attribute
                    // is missing the progress bar is treated as indeterminate.
                    // To fix that we'll always update it when it is 0 for progress elements
                    (inputValue !== dom[i2] || nodeType == "progress" && !inputValue || // This is only for IE 11 to fix <select> value not being updated.
                        // To avoid a stale select value we need to set the option.value
                        // again, which triggers IE11 to re-evaluate the select value
                        nodeType == "option" && inputValue !== oldProps[i2])) {
                    setProperty(dom, i2, inputValue, oldProps[i2], namespace);
                }
                i2 = "checked";
                if (checked !== UNDEFINED && checked !== dom[i2]) {
                    setProperty(dom, i2, checked, oldProps[i2], namespace);
                }
            }
        }
        return dom;
    }

    function applyRef(ref, value, vnode) {
        try {
            if (typeof ref == "function") {
                let hasRefUnmount = typeof ref._unmount == "function";
                if (hasRefUnmount) {
                    ref._unmount();
                }
                if (!hasRefUnmount || value != NULL) {
                    ref._unmount = ref(value);
                }
            } else ref.current = value;
        } catch (e) {
            options_default._catchError(e, vnode);
        }
    }

    function unmount(vnode, parentVNode, skipRemove) {
        let r;
        if (options_default.unmount) options_default.unmount(vnode);
        if (r = vnode.ref) {
            if (!r.current || r.current === vnode._dom) {
                applyRef(r, NULL, parentVNode);
            }
        }
        if ((r = vnode._component) != NULL) {
            if (r.componentWillUnmount) {
                try {
                    r.componentWillUnmount();
                } catch (e) {
                    options_default._catchError(e, parentVNode);
                }
            }
            r.base = r._parentDom = NULL;
        }
        if (r = vnode._children) {
            for (let i2 = 0; i2 < r.length; i2++) {
                if (r[i2]) {
                    unmount(
                        r[i2],
                        parentVNode,
                        skipRemove || typeof vnode.type != "function"
                    );
                }
            }
        }
        if (!skipRemove) {
            removeNode(vnode._dom);
        }
        vnode._component = vnode._parent = vnode._dom = UNDEFINED;
    }

    function doRender(props, state, context) {
        return this.constructor(props, context);
    }

// src/render.js
    function render(vnode, parentDom, replaceNode) {
        if (parentDom == document) {
            parentDom = document.documentElement;
        }
        if (options_default._root) options_default._root(vnode, parentDom);
        let isHydrating = typeof replaceNode == "function";
        let oldVNode = isHydrating ? NULL : replaceNode && replaceNode._children || parentDom._children;
        vnode = (!isHydrating && replaceNode || parentDom)._children = createElement(Fragment, NULL, [vnode]);
        let commitQueue = [], refQueue = [];
        diff(
            parentDom,
            // Determine the new vnode tree and store it on the DOM element on
            // our custom `_children` property.
            vnode,
            oldVNode || EMPTY_OBJ,
            EMPTY_OBJ,
            parentDom.namespaceURI,
            !isHydrating && replaceNode ? [replaceNode] : oldVNode ? NULL : parentDom.firstChild ? slice.call(parentDom.childNodes) : NULL,
            commitQueue,
            !isHydrating && replaceNode ? replaceNode : oldVNode ? oldVNode._dom : parentDom.firstChild,
            isHydrating,
            refQueue
        );
        commitRoot(commitQueue, vnode, refQueue);
    }

    function hydrate(vnode, parentDom) {
        render(vnode, parentDom, hydrate);
    }

// src/clone-element.js
    function cloneElement(vnode, props, children) {
        let normalizedProps = assign({}, vnode.props), key, ref, i2;
        let defaultProps;
        if (vnode.type && vnode.type.defaultProps) {
            defaultProps = vnode.type.defaultProps;
        }
        for (i2 in props) {
            if (i2 == "key") key = props[i2];
            else if (i2 == "ref") ref = props[i2];
            else if (props[i2] === UNDEFINED && defaultProps !== UNDEFINED) {
                normalizedProps[i2] = defaultProps[i2];
            } else {
                normalizedProps[i2] = props[i2];
            }
        }
        if (arguments.length > 2) {
            normalizedProps.children = arguments.length > 3 ? slice.call(arguments, 2) : children;
        }
        return createVNode(
            vnode.type,
            normalizedProps,
            key || vnode.key,
            ref || vnode.ref,
            NULL
        );
    }

// src/create-context.js
    var i = 0;

    function createContext(defaultValue) {
        function Context(props) {
            if (!this.getChildContext) {
                let subs = /* @__PURE__ */ new Set();
                let ctx = {};
                ctx[Context._id] = this;
                this.getChildContext = () => ctx;
                this.componentWillUnmount = () => {
                    subs = NULL;
                };
                this.shouldComponentUpdate = function (_props) {
                    if (this.props.value !== _props.value) {
                        subs.forEach((c) => {
                            c._force = true;
                            enqueueRender(c);
                        });
                    }
                };
                this.sub = (c) => {
                    subs.add(c);
                    let old = c.componentWillUnmount;
                    c.componentWillUnmount = () => {
                        if (subs) {
                            subs.delete(c);
                        }
                        if (old) old.call(c);
                    };
                };
            }
            return props.children;
        }

        Context._id = "__cC" + i++;
        Context._defaultValue = defaultValue;
        Context.Consumer = (props, contextValue) => {
            return props.children(contextValue);
        };
        Context.Provider = Context._contextRef = Context.Consumer.contextType = Context;
        return Context;
    }

    window.preact = {
        Component: BaseComponent,
        Fragment,
        cloneElement,
        createContext,
        createElement,
        createRef,
        h: createElement,
        hydrate,
        isValidElement,
        options: options_default,
        render,
        toChildArray
    };
})();
