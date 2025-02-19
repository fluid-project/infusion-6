(function () {
    "use strict";
    const exports = Object.create(null);
    Object.defineProperty(exports, "__esModule", {value: true});
    exports.untracked = exports.Signal = exports.effect = exports.batch = exports.computed = exports.signal = void 0;
    exports.useSignal = useSignal;
    exports.useComputed = useComputed;
    exports.useSignalEffect = useSignalEffect;
    var preact_1 = window.preact;
    var hooks_1 = window.preactHooks;
    var signals_core_1 = window.preactSignalsCore;
    Object.defineProperty(exports, "signal", {
        enumerable: true, get: function () {
            return signals_core_1.signal;
        }
    });
    Object.defineProperty(exports, "computed", {
        enumerable: true, get: function () {
            return signals_core_1.computed;
        }
    });
    Object.defineProperty(exports, "batch", {
        enumerable: true, get: function () {
            return signals_core_1.batch;
        }
    });
    Object.defineProperty(exports, "effect", {
        enumerable: true, get: function () {
            return signals_core_1.effect;
        }
    });
    Object.defineProperty(exports, "Signal", {
        enumerable: true, get: function () {
            return signals_core_1.Signal;
        }
    });
    Object.defineProperty(exports, "untracked", {
        enumerable: true, get: function () {
            return signals_core_1.untracked;
        }
    });
    var HAS_PENDING_UPDATE = 1 << 0;
    var HAS_HOOK_STATE = 1 << 1;
    var HAS_COMPUTEDS = 1 << 2;
    var oldNotify, effectsQueue = [], domQueue = [];
    // Capture the original `Effect.prototype._notify` method so that we can install
    // custom `._notify`s for each different use-case but still call the original
    // implementation in the end. Dispose the temporary effect immediately afterwards.
    (0, signals_core_1.effect)(function () {
        oldNotify = this._notify;
    })();

    // Install a Preact options hook
    function hook(hookName, hookFn) {
        // @ts-ignore-next-line private options hooks usage
        preact_1.options[hookName] = hookFn.bind(null, preact_1.options[hookName] || (function () {
        }));
    }

    var currentComponent;
    var finishUpdate;

    function setCurrentUpdater(updater) {
        // end tracking for the current update:
        if (finishUpdate)
            finishUpdate();
        // start tracking the new update:
        finishUpdate = updater && updater._start();
    }

    function createUpdater(update) {
        var updater;
        (0, signals_core_1.effect)(function () {
            updater = this;
        });
        updater._callback = update;
        return updater;
    }

    /** @todo This may be needed for complex prop value detection. */
    // function isSignalValue(value: any): value is Signal {
    // 	if (typeof value !== "object" || value == null) return false;
    // 	if (value instanceof Signal) return true;
    // 	// @TODO: uncomment this when we land Reactive (ideally behind a brand check)
    // 	// for (let i in value) if (value[i] instanceof Signal) return true;
    // 	return false;
    // }
    /**
     * A wrapper component that renders a Signal directly as a Text node.
     * @todo: in Preact 11, just decorate Signal with `type:null`
     */
    function SignalValue(_a) {
        // hasComputeds.add(this);
        var _this = this;
        var data = _a.data;
        // Store the props.data signal in another signal so that
        // passing a new signal reference re-runs the text computed:
        var currentSignal = useSignal(data);
        currentSignal.value = data;
        var _b = (0, hooks_1.useMemo)(function () {
            var self = _this;
            // mark the parent component as having computeds so it gets optimized
            var v = _this._vnode;
            while ((v = v._parent)) {
                if (v._component) {
                    v._component._updateFlags |= HAS_COMPUTEDS;
                    break;
                }
            }
            var wrappedSignal = (0, signals_core_1.computed)(function () {
                var s = currentSignal.value.value;
                return s === 0 ? 0 : s === true ? "" : s || "";
            });
            var isText = (0, signals_core_1.computed)(function () {
                return !(0, preact_1.isValidElement)(wrappedSignal.value);
            });
            // Update text nodes directly without rerendering when the new value
            // is also text.
            var dispose = (0, signals_core_1.effect)(function () {
                this._notify = notifyDomUpdates;
                // Subscribe to wrappedSignal updates only when its values are text...
                if (isText.value) {
                    // ...but regardless of `self.base`'s current value, as it can be
                    // undefined before mounting or a non-text node. In both of those cases
                    // the update gets handled by a full rerender.
                    var value = wrappedSignal.value;
                    if (self._vnode && self._vnode._dom && self._vnode._dom.nodeType === 3) {
                        self._vnode._dom.data = value;
                    }
                }
            });
            // Piggyback this._updater's disposal to ensure that the text updater effect
            // above also gets disposed on unmount.
            var oldDispose = _this._updater._dispose;
            _this._updater._dispose = function () {
                dispose();
                oldDispose.call(this);
            };
            return [isText, wrappedSignal];
        }, []), isText = _b[0], s = _b[1];
        // Rerender the component whenever `data.value` changes from a VNode
        // to another VNode, from text to a VNode, or from a VNode to text.
        // That is, everything else except text-to-text updates.
        //
        // This also ensures that the backing DOM node types gets updated to
        // text nodes and back when needed.
        //
        // For text-to-text updates, `.peek()` is used to skip full rerenders,
        // leaving them to the optimized path above.
        return isText.value ? s.peek() : s.value;
    }

    SignalValue.displayName = "_st";
    Object.defineProperties(signals_core_1.Signal.prototype, {
        constructor: {configurable: true, value: undefined},
        type: {configurable: true, value: SignalValue},
        props: {
            configurable: true,
            get: function () {
                return {data: this};
            },
        },
        // Setting a VNode's _depth to 1 forces Preact to clone it before modifying:
        // https://github.com/preactjs/preact/blob/d7a433ee8463a7dc23a05111bb47de9ec729ad4d/src/diff/children.js#L77
        // @todo remove this for Preact 11
        __b: {configurable: true, value: 1},
    });
    /** Inject low-level property/attribute bindings for Signals into Preact's diff */
    hook("_diff" /* OptionsTypes.DIFF */, function (old, vnode) {
        if (typeof vnode.type === "string") {
            var signalProps = void 0;
            var props = vnode.props;
            for (var i in props) {
                if (i === "children")
                    continue;
                var value = props[i];
                if (value instanceof signals_core_1.Signal) {
                    if (!signalProps)
                        vnode.__np = signalProps = {};
                    signalProps[i] = value;
                    props[i] = value.peek();
                }
            }
        }
        old(vnode);
    });
    /** Set up Updater before rendering a component */
    hook("_render" /* OptionsTypes.RENDER */, function (old, vnode) {
        setCurrentUpdater();
        var updater;
        var component = vnode._component;
        if (component) {
            component._updateFlags &= ~HAS_PENDING_UPDATE;
            updater = component._updater;
            if (updater === undefined) {
                component._updater = updater = createUpdater(function () {
                    component._updateFlags |= HAS_PENDING_UPDATE;
                    component.setState({});
                });
            }
        }
        currentComponent = component;
        setCurrentUpdater(updater);
        old(vnode);
    });
    /** Finish current updater if a component errors */
    hook("_catchError" /* OptionsTypes.CATCH_ERROR */, function (old, error, vnode, oldVNode) {
        setCurrentUpdater();
        currentComponent = undefined;
        old(error, vnode, oldVNode);
    });
    /** Finish current updater after rendering any VNode */
    hook("diffed" /* OptionsTypes.DIFFED */, function (old, vnode) {
        setCurrentUpdater();
        currentComponent = undefined;
        var dom;
        // vnode._dom is undefined during string rendering,
        // so we use this to skip prop subscriptions during SSR.
        if (typeof vnode.type === "string" && (dom = vnode.__e)) {
            var props = vnode.__np;
            var renderedProps = vnode.props;
            if (props) {
                var updaters = dom._updaters;
                if (updaters) {
                    for (var prop in updaters) {
                        var updater = updaters[prop];
                        if (updater !== undefined && !(prop in props)) {
                            updater._dispose();
                            // @todo we could just always invoke _dispose() here
                            updaters[prop] = undefined;
                        }
                    }
                } else {
                    updaters = {};
                    dom._updaters = updaters;
                }
                for (var prop in props) {
                    var updater = updaters[prop];
                    var signal_1 = props[prop];
                    if (updater === undefined) {
                        updater = createPropUpdater(dom, prop, signal_1, renderedProps);
                        updaters[prop] = updater;
                    } else {
                        updater._update(signal_1, renderedProps);
                    }
                }
            }
        }
        old(vnode);
    });

    function createPropUpdater(dom, prop, propSignal, props) {
        var setAsProperty = prop in dom &&
            // SVG elements need to go through `setAttribute` because they
            // expect things like SVGAnimatedTransformList instead of strings.
            // @ts-ignore
            dom.ownerSVGElement === undefined;
        var changeSignal = (0, signals_core_1.signal)(propSignal);
        return {
            _update: function (newSignal, newProps) {
                changeSignal.value = newSignal;
                props = newProps;
            },
            _dispose: (0, signals_core_1.effect)(function () {
                this._notify = notifyDomUpdates;
                var value = changeSignal.value.value;
                // If Preact just rendered this value, don't render it again:
                if (props[prop] === value)
                    return;
                props[prop] = value;
                if (setAsProperty) {
                    // @ts-ignore-next-line silly
                    dom[prop] = value;
                } else if (value) {
                    dom.setAttribute(prop, value);
                } else {
                    dom.removeAttribute(prop);
                }
            }),
        };
    }

    /** Unsubscribe from Signals when unmounting components/vnodes */
    hook("unmount" /* OptionsTypes.UNMOUNT */, function (old, vnode) {
        if (typeof vnode.type === "string") {
            var dom = vnode.__e;
            // vnode._dom is undefined during string rendering
            if (dom) {
                var updaters = dom._updaters;
                if (updaters) {
                    dom._updaters = undefined;
                    for (var prop in updaters) {
                        var updater = updaters[prop];
                        if (updater)
                            updater._dispose();
                    }
                }
            }
        } else {
            var component = vnode.__c;
            if (component) {
                var updater = component._updater;
                if (updater) {
                    component._updater = undefined;
                    updater._dispose();
                }
            }
        }
        old(vnode);
    });
    /** Mark components that use hook state so we can skip sCU optimization. */
    hook("__h" /* OptionsTypes.HOOK */, function (old, component, index, type) {
        if (type < 3 || type === 9)
            component._updateFlags |= HAS_HOOK_STATE;
        old(component, index, type);
    });
    /**
     * Auto-memoize components that use Signals/Computeds.
     * Note: Does _not_ optimize components that use hook/class state.
     */
    preact_1.Component.prototype.shouldComponentUpdate = function (props, state) {
        // @todo: Once preactjs/preact#3671 lands, this could just use `currentUpdater`:
        var updater = this._updater;
        var hasSignals = updater && updater._sources !== undefined;
        // If this is a component using state, rerender
        // @ts-ignore
        for (var i in state)
            return true;
        if (this.__f || (typeof this.u == "boolean" && this.u === true)) {
            var hasHooksState = this._updateFlags & HAS_HOOK_STATE;
            // if this component used no signals or computeds and no hooks state, update:
            if (!hasSignals && !hasHooksState && !(this._updateFlags & HAS_COMPUTEDS))
                return true;
            // if there is a pending re-render triggered from Signals,
            // or if there is hooks state, update:
            if (this._updateFlags & HAS_PENDING_UPDATE)
                return true;
        } else {
            // if this component used no signals or computeds, update:
            if (!hasSignals && !(this._updateFlags & HAS_COMPUTEDS))
                return true;
            // if there is a pending re-render triggered from Signals,
            // or if there is hooks state, update:
            if (this._updateFlags & (HAS_PENDING_UPDATE | HAS_HOOK_STATE))
                return true;
        }
        // if any non-Signal props changed, update:
        for (var i in props) {
            if (i !== "__source" && props[i] !== this.props[i])
                return true;
        }
        for (var i in this.props)
            if (!(i in props))
                return true;
        // this is a purely Signal-driven component, don't update:
        return false;
    };

    function useSignal(value) {
        return (0, hooks_1.useMemo)(function () {
            return (0, signals_core_1.signal)(value);
        }, []);
    }

    function useComputed(compute) {
        var $compute = (0, hooks_1.useRef)(compute);
        $compute.current = compute;
        currentComponent._updateFlags |= HAS_COMPUTEDS;
        return (0, hooks_1.useMemo)(function () {
            return (0, signals_core_1.computed)(function () {
                return $compute.current();
            });
        }, []);
    }

    var deferEffects = typeof requestAnimationFrame === "undefined"
        ? setTimeout
        : requestAnimationFrame;
    var deferDomUpdates = function (cb) {
        queueMicrotask(function () {
            queueMicrotask(cb);
        });
    };

    function flushEffects() {
        (0, signals_core_1.batch)(function () {
            var inst;
            while ((inst = effectsQueue.shift())) {
                oldNotify.call(inst);
            }
        });
    }

    function notifyEffects() {
        if (effectsQueue.push(this) === 1) {
            (preact_1.options.requestAnimationFrame || deferEffects)(flushEffects);
        }
    }

    function flushDomUpdates() {
        (0, signals_core_1.batch)(function () {
            var inst;
            while ((inst = domQueue.shift())) {
                oldNotify.call(inst);
            }
        });
    }

    function notifyDomUpdates() {
        if (domQueue.push(this) === 1) {
            (preact_1.options.requestAnimationFrame || deferDomUpdates)(flushDomUpdates);
        }
    }

    function useSignalEffect(cb) {
        var callback = (0, hooks_1.useRef)(cb);
        callback.current = cb;
        (0, hooks_1.useEffect)(function () {
            return (0, signals_core_1.effect)(function () {
                this._notify = notifyEffects;
                return callback.current();
            });
        }, []);
    }
    window.preactSignals = exports;
})();
