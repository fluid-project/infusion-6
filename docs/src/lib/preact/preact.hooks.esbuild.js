(function () {
    const _options = preact.options;

    let currentIndex;
    let currentComponent;
    let previousComponent;
    let currentHook = 0;
    let afterPaintEffects = [];
    const options = (
        /** @type {import('./internal').Options} */
        _options
    );
    let oldBeforeDiff = options._diff;
    let oldBeforeRender = options._render;
    let oldAfterDiff = options.diffed;
    let oldCommit = options._commit;
    let oldBeforeUnmount = options.unmount;
    let oldRoot = options._root;
    const RAF_TIMEOUT = 100;
    let prevRaf;
    options._diff = (vnode) => {
        currentComponent = null;
        if (oldBeforeDiff) oldBeforeDiff(vnode);
    };
    options._root = (vnode, parentDom) => {
        if (vnode && parentDom._children && parentDom._children._mask) {
            vnode._mask = parentDom._children._mask;
        }
        if (oldRoot) oldRoot(vnode, parentDom);
    };
    options._render = (vnode) => {
        if (oldBeforeRender) oldBeforeRender(vnode);
        currentComponent = vnode._component;
        currentIndex = 0;
        const hooks = currentComponent.__hooks;
        if (hooks) {
            if (previousComponent === currentComponent) {
                hooks._pendingEffects = [];
                currentComponent._renderCallbacks = [];
                hooks._list.forEach((hookItem) => {
                    if (hookItem._nextValue) {
                        hookItem._value = hookItem._nextValue;
                    }
                    hookItem._pendingArgs = hookItem._nextValue = void 0;
                });
            } else {
                hooks._pendingEffects.forEach(invokeCleanup);
                hooks._pendingEffects.forEach(invokeEffect);
                hooks._pendingEffects = [];
                currentIndex = 0;
            }
        }
        previousComponent = currentComponent;
    };
    options.diffed = (vnode) => {
        if (oldAfterDiff) oldAfterDiff(vnode);
        const c = vnode._component;
        if (c && c.__hooks) {
            if (c.__hooks._pendingEffects.length) afterPaint(afterPaintEffects.push(c));
            c.__hooks._list.forEach((hookItem) => {
                if (hookItem._pendingArgs) {
                    hookItem._args = hookItem._pendingArgs;
                }
                hookItem._pendingArgs = void 0;
            });
        }
        previousComponent = currentComponent = null;
    };
    options._commit = (vnode, commitQueue) => {
        commitQueue.some((component) => {
            try {
                component._renderCallbacks.forEach(invokeCleanup);
                component._renderCallbacks = component._renderCallbacks.filter(
                    (cb) => cb._value ? invokeEffect(cb) : true
                );
            } catch (e) {
                commitQueue.some((c) => {
                    if (c._renderCallbacks) c._renderCallbacks = [];
                });
                commitQueue = [];
                options._catchError(e, component._vnode);
            }
        });
        if (oldCommit) oldCommit(vnode, commitQueue);
    };
    options.unmount = (vnode) => {
        if (oldBeforeUnmount) oldBeforeUnmount(vnode);
        const c = vnode._component;
        if (c && c.__hooks) {
            let hasErrored;
            c.__hooks._list.forEach((s) => {
                try {
                    invokeCleanup(s);
                } catch (e) {
                    hasErrored = e;
                }
            });
            c.__hooks = void 0;
            if (hasErrored) options._catchError(hasErrored, c._vnode);
        }
    };

    function getHookState(index, type) {
        if (options._hook) {
            options._hook(currentComponent, index, currentHook || type);
        }
        currentHook = 0;
        const hooks = currentComponent.__hooks || (currentComponent.__hooks = {
            _list: [],
            _pendingEffects: []
        });
        if (index >= hooks._list.length) {
            hooks._list.push({});
        }
        return hooks._list[index];
    }

    function useState(initialState) {
        currentHook = 1;
        return useReducer(invokeOrReturn, initialState);
    }

    function useReducer(reducer, initialState, init) {
        const hookState = getHookState(currentIndex++, 2);
        hookState._reducer = reducer;
        if (!hookState._component) {
            hookState._value = [
                !init ? invokeOrReturn(void 0, initialState) : init(initialState),
                (action) => {
                    const currentValue = hookState._nextValue ? hookState._nextValue[0] : hookState._value[0];
                    const nextValue = hookState._reducer(currentValue, action);
                    if (currentValue !== nextValue) {
                        hookState._nextValue = [nextValue, hookState._value[1]];
                        hookState._component.setState({});
                    }
                }
            ];
            hookState._component = currentComponent;
            if (!currentComponent._hasScuFromHooks) {
                let updateHookState = function (p, s, c) {
                    if (!hookState._component.__hooks) return true;
                    const isStateHook = (x) => !!x._component;
                    const stateHooks = hookState._component.__hooks._list.filter(isStateHook);
                    const allHooksEmpty = stateHooks.every((x) => !x._nextValue);
                    if (allHooksEmpty) {
                        return prevScu ? prevScu.call(this, p, s, c) : true;
                    }
                    let shouldUpdate = hookState._component.props !== p;
                    stateHooks.forEach((hookItem) => {
                        if (hookItem._nextValue) {
                            const currentValue = hookItem._value[0];
                            hookItem._value = hookItem._nextValue;
                            hookItem._nextValue = void 0;
                            if (currentValue !== hookItem._value[0]) shouldUpdate = true;
                        }
                    });
                    return prevScu ? prevScu.call(this, p, s, c) || shouldUpdate : shouldUpdate;
                };
                currentComponent._hasScuFromHooks = true;
                let prevScu = currentComponent.shouldComponentUpdate;
                const prevCWU = currentComponent.componentWillUpdate;
                currentComponent.componentWillUpdate = function (p, s, c) {
                    if (this._force) {
                        let tmp = prevScu;
                        prevScu = void 0;
                        updateHookState(p, s, c);
                        prevScu = tmp;
                    }
                    if (prevCWU) prevCWU.call(this, p, s, c);
                };
                currentComponent.shouldComponentUpdate = updateHookState;
            }
        }
        return hookState._nextValue || hookState._value;
    }

    function useEffect(callback, args) {
        const state = getHookState(currentIndex++, 3);
        if (!options._skipEffects && argsChanged(state._args, args)) {
            state._value = callback;
            state._pendingArgs = args;
            currentComponent.__hooks._pendingEffects.push(state);
        }
    }

    function useLayoutEffect(callback, args) {
        const state = getHookState(currentIndex++, 4);
        if (!options._skipEffects && argsChanged(state._args, args)) {
            state._value = callback;
            state._pendingArgs = args;
            currentComponent._renderCallbacks.push(state);
        }
    }

    function useRef(initialValue) {
        currentHook = 5;
        return useMemo(() => ({current: initialValue}), []);
    }

    function useImperativeHandle(ref, createHandle, args) {
        currentHook = 6;
        useLayoutEffect(
            () => {
                if (typeof ref == "function") {
                    const result = ref(createHandle());
                    return () => {
                        ref(null);
                        if (result && typeof result == "function") result();
                    };
                } else if (ref) {
                    ref.current = createHandle();
                    return () => ref.current = null;
                }
            },
            args == null ? args : args.concat(ref)
        );
    }

    function useMemo(factory, args) {
        const state = getHookState(currentIndex++, 7);
        if (argsChanged(state._args, args)) {
            state._value = factory();
            state._args = args;
            state._factory = factory;
        }
        return state._value;
    }

    function useCallback(callback, args) {
        currentHook = 8;
        return useMemo(() => callback, args);
    }

    function useContext(context) {
        const provider = currentComponent.context[context._id];
        const state = getHookState(currentIndex++, 9);
        state._context = context;
        if (!provider) return context._defaultValue;
        if (state._value == null) {
            state._value = true;
            provider.sub(currentComponent);
        }
        return provider.props.value;
    }

    function useDebugValue(value, formatter) {
        if (options.useDebugValue) {
            options.useDebugValue(
                formatter ? formatter(value) : (
                    /** @type {any}*/
                    value
                )
            );
        }
    }

    function useErrorBoundary(cb) {
        const state = getHookState(currentIndex++, 10);
        const errState = useState();
        state._value = cb;
        if (!currentComponent.componentDidCatch) {
            currentComponent.componentDidCatch = (err, errorInfo) => {
                if (state._value) state._value(err, errorInfo);
                errState[1](err);
            };
        }
        return [
            errState[0],
            () => {
                errState[1](void 0);
            }
        ];
    }

    function useId() {
        const state = getHookState(currentIndex++, 11);
        if (!state._value) {
            let root = currentComponent._vnode;
            while (root !== null && !root._mask && root._parent !== null) {
                root = root._parent;
            }
            let mask = root._mask || (root._mask = [0, 0]);
            state._value = "P" + mask[0] + "-" + mask[1]++;
        }
        return state._value;
    }

    function flushAfterPaintEffects() {
        let component;
        while (component = afterPaintEffects.shift()) {
            if (!component._parentDom || !component.__hooks) continue;
            try {
                component.__hooks._pendingEffects.forEach(invokeCleanup);
                component.__hooks._pendingEffects.forEach(invokeEffect);
                component.__hooks._pendingEffects = [];
            } catch (e) {
                component.__hooks._pendingEffects = [];
                options._catchError(e, component._vnode);
            }
        }
    }

    let HAS_RAF = typeof requestAnimationFrame == "function";

    function afterNextFrame(callback) {
        const done = () => {
            clearTimeout(timeout);
            if (HAS_RAF) cancelAnimationFrame(raf);
            setTimeout(callback);
        };
        const timeout = setTimeout(done, RAF_TIMEOUT);
        let raf;
        if (HAS_RAF) {
            raf = requestAnimationFrame(done);
        }
    }

    function afterPaint(newQueueLength) {
        if (newQueueLength === 1 || prevRaf !== options.requestAnimationFrame) {
            prevRaf = options.requestAnimationFrame;
            (prevRaf || afterNextFrame)(flushAfterPaintEffects);
        }
    }

    function invokeCleanup(hook) {
        const comp = currentComponent;
        let cleanup = hook._cleanup;
        if (typeof cleanup == "function") {
            hook._cleanup = void 0;
            cleanup();
        }
        currentComponent = comp;
    }

    function invokeEffect(hook) {
        const comp = currentComponent;
        hook._cleanup = hook._value();
        currentComponent = comp;
    }

    function argsChanged(oldArgs, newArgs) {
        return !oldArgs || oldArgs.length !== newArgs.length || newArgs.some((arg, index) => arg !== oldArgs[index]);
    }

    function invokeOrReturn(arg, f) {
        return typeof f == "function" ? f(arg) : f;
    }
    window.preactHooks = {
        useCallback,
        useContext,
        useDebugValue,
        useEffect,
        useErrorBoundary,
        useId,
        useImperativeHandle,
        useLayoutEffect,
        useMemo,
        useReducer,
        useRef,
        useState
    };
})();
