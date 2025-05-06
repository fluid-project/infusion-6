/* global preactSignalsCore */

"use strict";

const fluidILScope = function (fluid) {

    // noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
    var {signal, computed, effect} = preactSignalsCore;

    const $m = fluid.metadataSymbol;
    const $t = fluid.proxySymbol;

    // A function to tag the types of all Fluid components
    fluid.componentConstructor = function () {};

    fluid.shadow = function () {};

    // Define the `name` property to be `"fluid.componentConstructor"` as a means to inspect if an Object is actually
    // an Infusion component instance; while being agnostic of the Infusion codebase being present. For example this
    // technique is used in the jquery.keyboard-a11y plugin for `fluid.thatistBridge`.
    Object.defineProperty(fluid.componentConstructor, "name", {
        value: "fluid.componentConstructor"
    });

    fluid.isComponent = function (obj) {
        return obj && obj.constructor === fluid.componentConstructor;
    };

    fluid.isShadow = function (obj) {
        return obj && obj.constructor === fluid.shadow;
    };

    fluid.freshComponent = function (props, shadow) {
        const instance = Object.create(fluid.componentConstructor.prototype);
        fluid.each(props, (value, key) => {
            instance[key] = signal(value);
        });
        if (!instance.$id) {
            const id = fluid.allocateGuid();
            instance.$id = id;
        }

        shadow = shadow || Object.create(fluid.shadow.prototype);
        shadow.that = instance;
        instance[$m] = shadow;
        return instance;
    };

    fluid.dumpLayerNames = function (that) {
        return " layerNames: " + JSON.stringify(that.$layers);
    };

    fluid.dumpThat = function (shadow) {
        const that = shadow.that;
        return `{ id: ${that.$id} ${fluid.dumpLayerNames(that)}`;
    };

    fluid.dumpThatStack = function (thatStack) {
        const togo = fluid.transform(thatStack, function (that) {
            const path = that[$m].path;
            return fluid.dumpThat(that) + (path ? (" - path: " + path) : "");
        });
        return togo.join("\n");
    };

    fluid.dumpComponentPath = function (that) {
        const path = that[$m].path;
        return path ? fluid.pathUtil.composeSegments.apply(null, path) : "** no path registered for component **";
    };

    fluid.dumpComponentAndPath = function (that) {
        return "component " + fluid.dumpThat(that) + " at path " + fluid.dumpComponentPath(that);
    };

    // Currently disused - may reappear if we get distributions back
    /**
     * Visit the child components of a given component, applying a visitor function to each.
     * Allows for traversal of the component tree and supports options for controlling the traversal.
     *
     * @param {Shadow} shadow - The parent component whose children are to be visited.
     * @param {Function} visitor - A function to be called for each child component.
     *     The function is invoked with the following arguments:
     *     - `component` (Object): The current child component being visited.
     *     - `name` (String): The name of the current child component.
     *     - `segs` (String[]): The array of segment names leading to the current child.
     *     - `depth` (Number): The depth of the current child in the traversal.
     *     If the `visitor` function returns `true`, the traversal is terminated early.
     * @param {Object} options - Options to control the traversal:
     *     - `visited` (Object): A map of already visited component IDs to avoid cycles.
     *     - `flat` (Boolean): If `true`, prevents recursive traversal into child components.
     * @param {String[]} [segs=[]] - The path segments leading to the current component, used internally for recursion.
     * @return {Boolean|undefined} Returns `true` if the traversal was terminated early by the visitor function, otherwise `undefined`.
     */
    fluid.visitComponentChildren = function (shadow, visitor, options, segs) {
        segs = segs || [];
        for (const name in shadow.childComponents) {
            const childShadow = shadow.childComponents[name];
            if (options.visited && options.visited[childShadow.$id]) {
                continue;
            }
            segs.push(name);
            if (options.visited) { // recall that this is here because we may run into a component that has been cross-injected which might otherwise cause cyclicity
                options.visited[childShadow.$id] = true;
            }
            if (visitor(childShadow, name, segs, segs.length - 1)) {
                return true;
            }
            if (!options.flat) {
                fluid.visitComponentChildren(childShadow, visitor, options, segs);
            }
            segs.pop();
        }
    };

    // SCOPES

    // Priorities corresponding to reason for context name to be in scope within contextHash and scope
    fluid.contextName = 1;
    fluid.memberName = 2; // higher priority

    /**
     * @typedef {Object} ScopeRecord
     * A record mapping string keys to scope entries, each holding a Shadow value and its associated priority.
     * @property {Shadow} value - The component shadow associated with this key.
     * @property {Integer} priority - The priority bitmask indicating how the key was applied (e.g., contextName, memberName, variableName).
     */

    /**
     * Converts an array of layer names into a hash object where each name and its nickname are mapped to a context type.
     * @param {Object<String, ScopeRecord>} targetScope - The scope to be destructively updated from the supplied layer names and shadow
     * @param {String[]} layerNames - An array of layer names to be processed.
     * @param {Shadow} shadow - The shadow to be placed into scope
     * @return {Object<String, ScopeRecord>} The updated scope object where:
     *   - Each full layer name is a key, mapped to the number `fluid.contextName`.
     *   - Each nickname of a valid layer name (computed using `fluid.computeNickName`) is also a key, mapped to the number `fluid.contextName`.
     *   - Names that are references or expanders are ignored.
     */
    fluid.layerNamesToScope = function (targetScope, layerNames, shadow) {
        fluid.clear(targetScope);
        fluid.each(layerNames, function (layerName) {
            if (!fluid.isReferenceOrExpander(layerName)) {
                const rec = {value: shadow, priority: fluid.contextName};
                targetScope[layerName] = rec;
                targetScope[fluid.computeNickName(layerName)] = rec;
            }
        });
        return targetScope;
    };

    /**
     * Applies a shadow record to a scope under a given key, respecting the precedence of disposition flags.
     * The scope stores a record for each key with the shape `{value, priority}`.
     * A new value is assigned only if any existing priority is lower than the supplied one
     *
     * @param {Object<String, ScopeRecord>} scope - The scope to update.
     * @param {String} key - The name under which the shadow will be stored.
     * @param {Shadow} shadow - The shadow record to assign.
     * @param {Integer} priority - A bitmask indicating the strength of the claim (i.e. member > context).
     */
    fluid.applyToScope = function (scope, key, shadow, priority) {
        const existing = scope[key];
        if (!existing || (priority === fluid.memberName)) {
            // TODO: Actually chain a linked list here
            scope[key] = {value: shadow, priority};
        }
    };

    fluid.cacheLayerScopes = function (parentShadow, shadow) {
        shadow.childrenScope = Object.create(parentShadow ? parentShadow.variableScope : null);
        shadow.childrenScope[$m] = "childrenScope-" + shadow.path;
        shadow.ownScope = Object.create(shadow.childrenScope);
        shadow.ownScope[$m] = "ownScope-" + shadow.path;
        shadow.variableScope = Object.create(shadow.ownScope);
        shadow.variableScope[$m] = "variableScope-" + shadow.path;

        return effect(function scopeEffect() {
            const layers = shadow.computer?.value?.$layers || [];
            fluid.layerNamesToScope(shadow.ownScope, layers, shadow);

            // This is filtered out again in recordComponent
            fluid.applyToScope(shadow.ownScope, shadow.memberName, shadow, fluid.memberName);
            fluid.each(shadow.ownScope, function (rec, context) {
                if (shadow.parentShadow && shadow.parentShadow.that !== fluid.rootComponent) {
                    fluid.applyToScope(shadow.parentShadow.childrenScope, context, rec.value, rec.priority);
                }
            });
        });
    };

    fluid.clearScope = function (parentShadow, child, childShadow) {
        fluid.each(childShadow.ownScope, (rec, context) => {
            if (parentShadow.childrenScope[context].value === child) {
                delete parentShadow.childrenScope[context]; // TODO: ambiguous resolution, and should just clear flags resulting from context
            }
        });
    };

    /**
     * @typedef {Object} Shadow
     * @property {Object} that - The component for which this shadow is held
     * @property {String} path - The principal allocated path (point of construction) of the component in the component tree.
     * @property {String} memberName - The name of the component within its parent.
     * @property {Shadow|null} [parentShadow] - The shadow record associated with the parent component.
     * @property {Object<String, Shadow>} childComponents - A record of child components keyed by their member names.
     * @property {Object<String, ScopeRecord>} ownScope - Cached layer scopes for the component.
     * @property {Object<String, ScopeRecord>} childrenScope - Cached layer scopes for the component.
     * @property {Object} [injectedPaths] - A record of paths where this component has been injected, keyed by path.
     * @property {fluid.instantiator} instantiator - The instantiator which allocated this component/shadow
     * @property {Object} frameworkEffects - A possibly deep structure of effects allocated by the framework which
     * which need to be disposed when the component is destroyed. Any user effects are disposed as layers come and go.
     */

    /**
     * @typedef {Object} DestroyRec
     * @property {Shadow} childShadow - The shadow record associated with the component being cleared
     * @property {String} name - The name of the child component within its parent.
     * @property {Shadow} shadow - The shadow record associated with the parent component.
     * @property {String} childPath - The fully qualified path to the child component in the component tree.
     */

    /** Clear indexes held of the location of an injected or concrete component.
     * @param {fluid.instantiator} instantiator - The instantiator holding records to be cleared
     * @param {DestroyRec} destroyRec - A "destroy record" as allocated within instantiator.clearComponent
     */
    fluid.clearComponentIndexes = function (instantiator, destroyRec) {
        const shadow = destroyRec.shadow;
        fluid.clearScope(shadow, destroyRec.child, destroyRec.childShadow, destroyRec.name);
        // Note that "pathToComponent" will not be available during afterDestroy. This is so that we can synchronously recreate the component
        // in an afterDestroy listener (FLUID-5931). We don't clear up the shadow itself until after afterDestroy.
        delete instantiator.pathToComponent[destroyRec.childPath];
        delete shadow.childComponents[destroyRec.name];
    };

    /** Operate the process of destroying a concrete component, as encoded in a `DestroyRec` structure. This takes the
     * following sequence:
     *  - Other injected sites of this component are cleared
     *  - The path and scope records of the component are cleared
     *  - Listeners registered by this component's construction are removed
     *  - Events and appliers are destroyed
     *  - The `afterDestroy` event is fired on the component
     *  - We remove the lookup of this component's id in instantiator.idToShadow
     * @param {fluid.instantiator} instantiator - The instantiator holding records to be cleared
     * @param {DestroyRec} destroyRec - A "destroy record" as allocated within instantiator.clearComponent
     */
    fluid.doDestroy = function (instantiator, destroyRec) {
        const shadow = destroyRec.childShadow,
            that = destroyRec.child;
        // Clear injected instance of this component from all other paths - historically we didn't bother
        // to do this since injecting into a shorter scope is an error - but now we have resolveRoot area
        fluid.each(shadow.injectedPaths, function (troo, injectedPath) {
            const segs = fluid.parsePath(injectedPath);
            const parentPath = segs.slice(0, -1);
            const otherShadow = instantiator.pathToComponent[parentPath];
            instantiator.clearComponent(otherShadow, fluid.peek(segs), that);
        });
        fluid.clearComponentIndexes(instantiator, destroyRec);
        // fluid.clearDistributions(shadow);

        shadow.lifecycleStatus = "destroyed"; // This will cause proxies to be nulled
        const child = destroyRec.childShadow.that;

        fluid.fireEvent(child, "afterDestroy", [child, destroyRec.name, destroyRec.shadow.that]);
    };

    // About the SHADOW
    // This holds a record of IL information for each instantiated component.
    // It is allocated at: instantiator's "recordComponent"
    // It is destroyed at: instantiator's "clearConcreteComponent"
    // Contents:
    //     path {String} Principal allocated path (point of construction) in tree
    //     (value) {Component} The component itself
    //     contextHash {String to Boolean} Map of context names which this component matches
    //     scope: A hash of names to components which are in scope from this component - populated in cacheShadowGrades
    //     childComponents: Hash of key names to subcomponents - both injected and concrete

    // From old framework:

    //     mergePolicy, mergeOptions: Machinery for last phase of options merging
    //     localRecord: The "local record" of special contexts for local resolution, e.g. {arguments}, {source}, etc.
    //     invokerStrategy, eventStrategyBlock, memberStrategy, getConfig: Junk required to operate the accessor
    //     listeners: Listeners registered during this component's construction, to be cleared during clearListeners
    //     distributions, collectedClearer: Managing options distributions
    //     outDistributions: A list of distributions registered from this component, signalling from distributeOptions to clearDistributions

    //     potentia: The original potentia record as supplied to registerPotentia - populated in fluid.processComponentShell
    //     createdTransactionId: The tree transaction id in which this component was created - populated in fluid.processComponentShell

    //     lightMergeComponents, lightMergeDynamicComponents: signalling between fluid.processComponentShell and fluid.concludeComponentObservation
    //     modelSourcedDynamicComponents: signalling between fluid.processComponentShell and fluid.initModel
    // From the DataBinding side:
    //     modelRelayEstablished: anticorruption check in fluid.establishModelRelay
    //     modelComplete: self-guard in notifyInitModelWorkflow
    //     initTransactionId: signalling from fluid.operateInitialTransaction to fluid.enlistModelComponent
    //     materialisedPaths: self-guard in fluid.materialiseModelPath

    fluid.instantiator = function () {
        const that = {
            // Unnecessary but we like this for debugging
            pathToComponent: {}
        };

        /**
         * Records the metadata of a component in the component tree and updates its shadow record.
         *
         * @param {Shadow|null} parentShadow - The parent component of the component being recorded. Can be `null` for root components.
         * @param {Shadow} shadow - The component to record.
         * @param {String} name - The name of the component within its parent.
         * @param {Boolean} created - Whether the component was freshly created (`true`) or injected (`false`).
         */
        function recordComponent(parentShadow, shadow, name, created) {
            // This is allocated in fluid.freshComponent or fluid.computeInstance
            shadow.instantiator = that;
            const path = parentShadow ? fluid.composeSegment(parentShadow.path, name) : name;
            if (created) {
                shadow.path = path;
                shadow.memberName = name;
                shadow.parentShadow = parentShadow;
                shadow.childComponents = {};
                shadow.frameworkEffects = {};
                shadow.frameworkEffects.scopeEffect = fluid.cacheLayerScopes(parentShadow, shadow);
            } else {
                shadow.injectedPaths = shadow.injectedPaths || {}; // a hash since we will modify whilst iterating
                shadow.injectedPaths[path] = true;
                // TODO: Change injected logic to replace existing memberName from old site via ownScope with new one
                const contextHash = shadow.contextHash.value;
                const keys = fluid.keys(contextHash);
                fluid.remove_if(keys, function (key) {
                    return contextHash && (contextHash[key] === fluid.memberName);
                });

                keys.push(name); // add local name - FLUID-5696 and FLUID-5820
                keys.forEach(function (context) {
                    if (!parentShadow.scope.hasOwnProperty(context)) { // FLUID-6444
                        parentShadow.scope[context] = shadow;
                    }
                });
            }
            if (that.pathToComponent[path]) {
                fluid.fail("Error during instantiation - path " + path + " which has just created component " + fluid.dumpThat(shadow) +
                    " has already been used for component " + fluid.dumpThat(that.pathToComponent[path]) + " - this is a circular instantiation or other oversight." +
                    " Please clear the component using instantiator.clearComponent() before reusing the path.");
            }
            that.pathToComponent[path] = shadow;
        }

        that.recordKnownComponent = function (parentShadow, shadow, name, created) {
            const existing = parentShadow.childComponents[name];
            if (existing) {
                if (existing !== shadow) {
                    fluid.fail("Attempt to register component at path ", existing.path, " which has already been used for component ", existing);
                }
            } else {
                // We no longer assign in here - the reference to the component signal gets evaluated in expandComponentRecord
                // parent[name] = component;
                parentShadow.childComponents[name] = shadow;
                recordComponent(parentShadow, shadow, name, created);
            }
        };

        that.allocateSimpleComponent = function (parentShadow, name, props) {
            const fresh = fluid.freshComponent(props);
            if (parentShadow === null) { // It's the component root
                recordComponent(null, fresh[$m], "", true);
            } else {
                that.recordKnownComponent(parentShadow, fresh[$m], name, true);
            }
            return fresh;
        };


        that.clearComponent = function (shadow, name, childShadow, destroyRecs, nested, path) {
            // Fill in recursive args at top level
            destroyRecs = destroyRecs || [];
            path = path || shadow.path; // TODO could this ever disagree?

            const childPath = fluid.composeSegment(path, name);
            childShadow = childShadow || shadow.childComponents[name];
            const created = childShadow.path === childPath;
            const destroyRec = {
                childShadow: childShadow,
                name: name,
                shadow: shadow,
                childPath: childPath
            };

            // only recurse on components which were created in place - if the id record disagrees with the
            // recurse path, it must have been injected
            if (created) {
                if (fluid.isDestroyedShadow(childShadow)) {
                    fluid.fail("Cannot destroy component which is already in status \"" + childShadow.lifecycleStatus + "\"");
                }
                // All effects, proxies etc. nullified at this point
                childShadow.lifecycleStatus = "destroying";
                fluid.disposeEffects(childShadow.frameworkEffects);
                fluid.each(childShadow.childComponents, (gchildShadow, memberName) =>
                    that.clearComponent(childShadow, memberName, gchildShadow, destroyRecs, true)
                );
                //fluid.fireEvent(child, "onDestroy", [child, name || "", component]);
                // fluid.fireDestroy(child, name, component);
                destroyRecs.push(destroyRec);
            } else {
                fluid.remove_if(childShadow.injectedPaths, function (troo, path) {
                    return path === childPath;
                });
                fluid.clearComponentIndexes(that, destroyRec);
            }
            if (!nested) {
                // Do actual destruction for the whole tree here, including "afterDestroy" and deleting shadows
                destroyRecs.forEach(function (destroyRec) {
                    fluid.doDestroy(that, destroyRec);
                });
            }
        };
        return Object.assign(fluid.freshComponent(), that);
    };

    fluid.globalInstantiator = fluid.instantiator();

    fluid.constructRootComponents = function (instantiator) {
        // Instantiate the primordial components at the root of each context tree
        instantiator.rootComponent = instantiator.allocateSimpleComponent(null, "", {$layers: ["fluid.rootComponent"]});
        const rootShadow = instantiator.rootShadow = instantiator.rootComponent[$m];

        // The component which for convenience holds injected instances of all components with fluid.resolveRoot grade
        instantiator.resolveRootComponent = instantiator.allocateSimpleComponent(rootShadow,
            "resolveRootComponent", {$layers: ["fluid.resolveRootComponent"]});

        // obliterate resolveRoot's scope objects and replace by the real root scope - which is unused by its own children

        rootShadow.childrenScope = {};
        rootShadow.contextHash = {};
        const resolveRootShadow = instantiator.resolveRootComponent[$m];
        resolveRootShadow.childrenScope = rootShadow.childrenScope;

        instantiator.recordKnownComponent(resolveRootShadow, instantiator, "instantiator", true); // needs to have a shadow so it can be injected
        resolveRootShadow.childrenScope.instantiator = {value: instantiator, priority: fluid.memberName}; // needs to be mounted since it never passes through cacheShadowGrades
    };

    /* Compute a "nickname" given a fully qualified layer name, by returning the last path
     * segment.
     */
    fluid.computeNickName = function (layerName) {
        const segs = fluid.parsePath(layerName);
        return fluid.peek(segs);
    };

    fluid.isDestroyedShadow = function (shadow, strict) {
        return shadow.lifecycleStatus === "destroyed" || (!strict && shadow.lifecycleStatus === "destroying");
    };

    /** Returns <code>true</code> if the supplied reference holds a component which has been destroyed or for which destruction has started
     * @param {fluid.component|Shadow} that - A reference to a component or a proxy to one, or its shadow record
     * @param {Boolean} [strict] - If `true`, the test will only check whether the component has been fully destroyed
     * @return {Boolean} `true` if the reference is to a component which has been destroyed
     **/
    fluid.isDestroyed = function (that, strict) {
        const shadow = that?.[$t]?.shadow || that[$m];
        return fluid.isDestroyedShadow(shadow, strict);
    };

    // Computes a name for a component appearing at the global root which is globally unique, from its nickName and id
    fluid.computeGlobalMemberName = function (layerName, id) {
        const nickName = fluid.computeNickName(layerName);
        return nickName + "-" + id;
    };

    /**
     * Upgrades an element of an IL record which designates a function to prepare for a {func, args} representation.
     *
     * @param {any} rec - The record to be upgraded. If an object will be returned unchanged. Otherwise it may be a function
     * object or an IL reference to one.
     * @param {String} key - The key in the returned record to hold the function, this will default to `funcName` if `rec` is a `string` *not*
     * holding an IL reference, or `func` otherwise
     * @return {Object} The original `rec` if it was not of primitive type, else a record holding { key : rec } if it was of primitive type.
     */
    fluid.upgradePrimitiveFunc = function (rec, key) {
        if (rec && fluid.isPrimitive(rec)) {
            const togo = {};
            togo[key || (typeof(rec) === "string" && rec.charAt(0) !== "{" ? "funcName" : "func")] = rec;
            togo.args = fluid.NO_ARGUMENTS; // TODO currently undefined and unused
            return togo;
        } else {
            return rec;
        }
    };

    fluid.compactStringToRec = function (string, type) {
        const openPos = string.indexOf("(");
        const closePos = string.indexOf(")");
        if (openPos === -1 ^ closePos === -1 || openPos > closePos) {
            fluid.fail("Badly-formed compact " + type + " record without matching parentheses: " + string);
        }
        if (openPos !== -1 && closePos !== -1) {
            const trail = string.substring(closePos + 1);
            if (trail.trim() !== "") {
                fluid.fail("Badly-formed compact " + type + " record " + string + " - unexpected material following close parenthesis: " + trail);
            }
            const prefix = string.substring(0, openPos);
            const body = string.substring(openPos + 1, closePos).trim();
            const args = body === "" ? [] : body.split(",").map(str => str.trim()).map(fluid.coerceToPrimitive);
            const togo = fluid.upgradePrimitiveFunc(prefix, null);
            togo.args = args;
            return togo;
        } else if (type === "$method" || type === "$compute") {
            return {funcName: string};
        } else { // TODO: pass in cursor and produce unavailable value there
            fluid.fail("Unrecognised compact record " + string + " with no arguments with type ", type);
        }
        return string;
    };

    /**
     * Resolves a given context string to its corresponding component or scope within the component tree.
     *
     * @param {String} context - The context name to resolve. Special values:
     *   - `"self"` resolves to the current component
     *   - `"/"` resolves to the root component.
     *   - Other values resolve to named scopes in the target component's scope chain.
     * @param {Shadow} shadow - The component site from which resolution starts.
     * @param {Function} [resolver] - A function dynamically resolving a context name to a local context
     * @return {signal<Component|any>} Signal for the resolved component or scope. Returns:
     *   - The target component if `context` is `"self"`.
     *   - The root component if `context` is `"/"`.
     *   - The component or scope corresponding to `context` in the target component's scope chain, if found.
     *   - An unavailable value if the context cannot be resolved.
     */
    fluid.resolveContext = function (context, shadow, resolver) {
        const contextUnavailable = () => fluid.unavailable({
            message: "Cannot resolve context " + context + " from component at path " + shadow.path,
            site: shadow
        });
        return computed( () => {
            if (context === "self") {
                // TODO: We have to return instance so that it doesn't seem to change when component changes
                return shadow.that;
            } else if (context === "/") {
                return shadow.instantiator.rootComponent;
            } else if (context === "$oldValue") {
                return fluid.OldValue;
            } else {
                const local = resolver ? resolver(context) : fluid.NoValue;
                if (local === fluid.NoValue) {
                    const resolvedRec = shadow.variableScope[context];
                    if (resolvedRec) {
                        const resolved = resolvedRec.value;
                        return resolved instanceof fluid.shadow ? resolved.computer.value || contextUnavailable() : resolved;
                    } else {
                        return contextUnavailable();
                    }
                } else {
                    return local;
                }
            }
        });
    };

    fluid.getForComponent = function (component, path) {
        const segs = fluid.pathToSegs(path);
        const shadow = component[$m];
        if (segs.length === 0) {
            return shadow.computer;
        } else {
            // TODO: We should store these references in the signalMap since they are transparent - unless unavailable
            const getter = fluid.getThroughSignals(shadow.computer, segs);
            return Object.assign(getter, {site: shadow, segs, $variety: "$ref"});
        }
    };

    // TODO: Need some way to target another layer other than the liveLayer, e.g. for the renderer writing to "container" - this
    // state is not transportable
    fluid.pathToLive = function (component, path) {
        const segs = fluid.pathToSegs(path),
            shadow = component[$m];
        const oldValue = fluid.deSignal(fluid.getForComponent(component, path).value);
        const valueSignal = signal(oldValue);
        fluid.set(shadow.liveLayer, segs, valueSignal);
        // Remerge to take account that this top-level prop is now drawn from signal layer -
        // Could be much more efficient
        console.log("Upgrading path ", path, " to live");
        shadow.potentia.value = Object.assign({}, shadow.potentia.value);
        return valueSignal;
    };

    /**
     * Set a value for a component at a specified path, via immutable application if the path is nested below a reactive root.
     * @param {Object} component - The component holding the path to be modified
     * @param {String|Array<String>} path - The path at which to set the value, as a string or array of segments.
     * @param {any} value - The value to set at the specified path.
     * @return {signal<Object>} Signal for the value at the updated path, which will now have been raised into the live layer
     */
    fluid.setForComponent = function (component, path, value) {
        const segs = fluid.pathToSegs(path),
            shadow = component[$m];
        const reactiveSegs = fluid.findReactiveRoot(shadow.shadowMap, segs);

        let existing = fluid.get(shadow.liveLayer, reactiveSegs || segs);
        if (!existing) {
            existing = fluid.pathToLive(component, reactiveSegs || segs);
        }
        const surplusSegs = reactiveSegs && segs.slice(reactiveSegs.length, segs.length);
        const updated = reactiveSegs ? fluid.setImmutable(existing.value, surplusSegs, value) : value;
        existing.value = updated;
        return existing;
    };

    /**
     * Resolves a context reference into a signal that dynamically tracks the value located at a path within another component or context.
     *
     * @param {String|Object} ref - A context reference string or parsed reference object. If a String, it will be parsed via `fluid.parseContextReference`.
     * @param {Shadow} shadow - The shadow context of the component from which the reference is being resolved.
     * @param {Function} [resolver] - An optional custom resolver function used for resolving context names.
     * @return {Signal<any>} A signal representing the resolved reference value. It includes metadata: the parsed reference, the resolving site, and a `$variety` tag.
     */
    fluid.fetchContextReference = function (ref, shadow, resolver) {
        const parsed = fluid.isPrimitive(ref) ? fluid.parseContextReference(ref) : ref;
        const refComputer = computed( function fetchContextReference() {
            // TODO: Need to cache these per site
            const target = fluid.resolveContext(parsed.context, shadow, resolver).value;
            return fluid.isUnavailable(target) ? fluid.mergeUnavailable(fluid.unavailable({
                message: "Cannot fetch path " + parsed.path + " of context " + parsed.context + " which didn't resolve",
                path: shadow.path
            }), target) : fluid.isComponent(target) ? fluid.getForComponent(target, parsed.path) : fluid.get(target, parsed.path);
        });
        return Object.assign(refComputer, {parsed, site: shadow, $variety: "$contextRef"});
    };

    /**
     * Renders a parsed string template against the local component tree by replacing tokens with their corresponding values.
     * Tokens that are primitives remain unchanged, while signal tokens are resolved and then the resulting token
     * string concatenated.
     *
     * @param {Array<string|ParsedContext>} tokens - An array of tokens, where each token is either a string
     *        or an object with a `key` property indicating a path in the source.
     * @param {Shadow} shadow - The shadow record of the component where the reference is held
     * @return {String|Signal<string>} A computed signal representing the resolved string.
     */
    fluid.renderComputedStringTemplate = function (tokens, shadow) {
        if (tokens.length === 0) {
            return "";
        } else if (tokens.length === 1 && typeof(tokens[0]) === "string") {
            return tokens[0];
        } else {
            const liveTokens = tokens.map(token => fluid.isPrimitive(token) ? token : fluid.fetchContextReference(token.parsed, shadow));
            const togo = fluid.computed(function (...tokens) {
                return tokens.join("");
            }, liveTokens);
            togo.$tokens = liveTokens;
            return togo;
        }
    };

    /**
     * @typedef {Object} FuncRecord
     * @property {String} [funcName] - A global function name to be resolved via `fluid.getGlobalValue`. One of funcName or func should be set.
     * @property {String|any} [func] - A reference to a function, either as an Infusion context reference string or as a direct function value.
     * @property {Array<any>} [args] - Optional arguments to be passed to the function. These may include context references or values.
     */

    /**
     * Resolves a function reference from a `FuncRecord`, which may refer to a global function name, a context reference, or a direct function.
     *
     * @param {FuncRecord} rec - A function record containing one of `funcName` or `func` to resolve.
     * @param {Shadow} shadow - The shadow context used for resolving context references.
     * @return {Signal<Function>|Function} Signal or value for the resolved function.
     */
    fluid.resolveFuncRecord = function (rec, shadow) {
        return rec.funcName ? fluid.getGlobalValue(rec.funcName) :
            fluid.isILReference(rec.func) ? fluid.fetchContextReference(rec.func, shadow) : rec.func;
    };

    /**
     * @typedef {Object} ShadowCursor
     * @property {Shadow} [shadow] - The shadow record associated with the resolved site
     * @property {String[]} [segs] - The segments (path) within the shadow
     * @property {Object} [shadowRec] - The shadow map record at the resolved location
     * @property {any} [value] - The final resolved value
     */

    /**
     * Resolve a value from a `Signal`, or return the value as-is if it is not a `Signal`.
     *
     * @param {any} ref - The value to resolve. May be a `Signal` or a plain value.
     * @param {ShadowCursor} shadowCursor - Cursor into the shadow where original reference was found
     * @return {ShadowCursor} Including the resolved value if `ref` is a `Signal`, or the original value if it is not.
     */
    fluid.deSignalToSite = function (ref, shadowCursor) {
        while (fluid.isSignal(ref)) {
            // It's a $ref return from fluid.getForComponent - use it to locate a shadow map around the referenced site
            if (ref.$variety === "$ref") {
                const shadowMap = ref.site.shadowMap;
                shadowCursor = {
                    ref: ref,
                    shadow: ref.site,
                    segs: ref.segs,
                    shadowRec: fluid.get(shadowMap, ref.segs)
                };
            } else if (ref.$variety === "$component") {
                shadowCursor = {
                    shadow: ref.shadow,
                    segs: [],
                    shadowRec: ref.shadow.shadowMap
                };
                // TODO: Don't dereference any further for now, (computed) consumers of {self} are expecting a signal which should be immutable
                // but in future they may want the proxy or so
                break;
            } else { // We've just resolved some other kind of signal and any previous shadowMap is invalid
                shadowCursor = {};
            }
            ref = ref.value;
        }
        return {...shadowCursor, value: ref};
    };

    /**
     * Traverses a structured `shadowMap` along the provided path segments to detect if any point is marked as a reactive root.
     * At each segment, it checks if the special property `reactiveRoot` is present in the corresponding `$m` record.
     * If a `reactiveRoot` is found at any level, returns array of path segments to that point, else null.
     *
     * @param {Object} shadowMap - A structured map representing a component's shadow hierarchy.
     * @param {String[]} segs - An array of path segments to traverse within the `shadowMap`.
     * @return {String[]|null} Path to any reactive root found
     */
    fluid.findReactiveRoot = function (shadowMap, segs) {
        let current = shadowMap;
        for (let i = 0; i < segs.length; ++i) {
            const seg = segs[i];
            const shadowRec = current?.[seg];
            if (shadowRec?.[$m]?.reactiveRoot) {
                return segs.slice(0, i + 1);
            }
            current = shadowRec;
        }
        return null;
    };

    /**
     * Recursively transfer a shadow map structure based on a corresponding layer map.
     * @param {Object} shadowMap - The shadow map to be populated.
     * @param {Object} layerMap - The layer map providing the structure and reactive root indicators.
     */
    fluid.transferShadowMap = function (shadowMap, layerMap) {
        Object.entries(layerMap).forEach(([key, value]) => {
            if (key !== $m) {
                const rec = shadowMap[key] = {};
                fluid.transferShadowMap(rec, value);
            }
        });
        if (layerMap?.[$m]?.reactiveRoot) {
            const rec = fluid.getRecInsist(shadowMap, [$m]);
            rec.reactiveRoot = true;
        }
    };

    // eslint-disable-next-line jsdoc/require-returns-check
    /**
     * Recursively traverse a data structure, resolving any `Signal` values to their underlying values.
     * @param {any|Signal<any>} root - The root data structure to process.
     * @param {String} strategy - Strategy to be used
     * @param {Object} [shadowRecIn] - Section of a shadow map we are traversing - when we run off the end of this, we must stop flattening.
     * This argument arises through recursive calls if we flatten structured arguments
     * @return {any} The processed data structure with all `Signal` values resolved and flattened into primitive values where applicable.
     */
    fluid.flattenSignals = function (root, strategy, shadowRecIn) {
        const {value, shadowRec, segs, shadow, ref} = fluid.deSignalToSite(root, shadowRecIn);
        if (fluid.isUnavailable(value)) {
            return strategy === "methodStrategy" ? undefined : value;
        } else {
            if (fluid.isSignal(value)) {
                if (value.$variety === "$component") {
                    return strategy === "methodStrategy" || strategy === "effectStrategy" ? fluid.proxyMat(value, value.shadow, []) : value;
                }
                else {
                    fluid.fail("Unexpected unresolved signal value from fluid.deSignalToSite", value); // Framework logic failure
                }
            } else if (fluid.isPrimitive(value) || !fluid.isPlainObject(value)) {
                return value;
            }
        }
        const inReactiveRoot = shadow && fluid.findReactiveRoot(shadow.shadowMap, segs);
        if (inReactiveRoot && (strategy === "methodStrategy" || strategy === "effectStrategy")) {
            return fluid.proxyMat(ref, shadow, segs);
        } else {
            // We have handled all non-plain structural values by here - now determine whether we should recurse if we are in signal portion of config mat
            const mapper = (member, key) => {
                const togo = fluid.flattenSignals(member, strategy, {
                    shadow,
                    segs: segs.concat([key]),
                    shadowRec: shadowRec?.[key]
                });
                return togo;
            };
            if (shadowRec?.[$m]?.hasSignalChild) {
                if (fluid.isArrayable(value)) {
                    return value.map(mapper);
                } else {
                    return fluid.transform(value, mapper);
                }
            } else {
                return value;
            }
        }
    };

    /**
     * Resolve material intended for compute and method arguments - this only expands {} references, possibly into
     * a local context
     * @param {any} material - The material to be expanded
     * @param {Shadow} shadow - Component from whose point of view the material is to be expanded
     * @param {Function} [resolver] - A function dynamically resolving a context name to a local context
     * @return {any} The expanded material, with signals in place of any references discovered
     */
    fluid.resolveArgMaterial = function (material, shadow, resolver) {
        if (fluid.isPrimitive(material)) {
            return fluid.isILReference(material) ? fluid.fetchContextReference(material, shadow, resolver) : material;
        } else if (Array.isArray(material)) {
            return material.map(member => fluid.resolveArgMaterial(member, shadow, resolver));
        } else if (fluid.isPlainObject(material, true)) {
            return fluid.transform(material, member => fluid.resolveArgMaterial(member, shadow, resolver));
        } else {
            return material;
        }
    };

    fluid.makeArgResolver = function () {
        const that = {
            backing: [],
            resolve: function (context) {
                const argNum = +context;
                return Number.isInteger(+argNum) ? (argNum in that.backing ? that.backing[argNum] :
                    fluid.unavailable({message: "No argument at position " + context + " was supplied to this method call"})) : fluid.NoValue;
            }
        };
        return that;
    };

    const methodFlattener = root => fluid.flattenSignals(root, "methodStrategy");
    const effectFlattener = root => fluid.flattenSignals(root, "effectStrategy");

    /**
     * Expands a method record and returns a function that can be called with arguments. The function dispatches the invocation
     * of the resolved method (either directly or with computed arguments).
     *
     * If the method record contains arguments (`args`), it first resolves them and then returns a function that applies the
     * resolved arguments to the resolved function. If no arguments are provided, a direct method dispatch is returned.
     *
     * @param {FuncRecord} record - The method record to expand. It contains a `func` (the function to call) and optional `args`
     * that define the arguments to be resolved for the method.
     * @param {Shadow} shadow - The shadow context in which the method is being expanded, providing access to the component and its state.
     * @param {String} key - The member name at which the subcomponent will be instantiated.
     * @param {String[]} segs - The path where this method record appears in its component
     * @return {Function} A function that can be invoked with arguments, dispatching the resolved method with the provided arguments.
     */
    fluid.expandMethodRecord = function (record, shadow, key, segs) {
        // Old fluid.makeInvoker used to have:
        // func = func || (invokerec.funcName ? fluid.getGlobalValueNonComponent(invokerec.funcName, "an invoker") : fluid.expandImmediate(invokerec.func, that));
        const func = fluid.resolveFuncRecord(record, shadow);
        let togo;
        if (record.args) {
            const resolver = fluid.makeArgResolver();
            const argRecs = fluid.makeArray(record.args);
            togo = function applyMethod(...args) {
                resolver.backing = args;
                const resolvedArgs = fluid.resolveArgMaterial(argRecs, shadow, resolver.resolve);
                const flatArgs = resolvedArgs.map(methodFlattener);
                const resolvedFunc = fluid.deSignal(func);
                if (fluid.isUnavailable(resolvedFunc)) {
                    fluid.fail("Couldn't invoke method at path ", segs, " of component ", shadow, resolvedFunc.causes);
                }
                return resolvedFunc.apply(shadow, flatArgs);
            };
        } else { // Fast path just directly dispatches args
            togo = function applyDirectMethod(...args) {
                const resolvedFunc = fluid.deSignal(func);
                // TODO: Should it instead dispatch with shadow.shadowMap[$m].proxy?
                return resolvedFunc.apply(shadow.that, [shadow.that, ...args]);
            };
        }
        return togo;
    };

    /**
     * Expands a compute-style function record into a computed signal.
     * The function and its arguments are resolved from the record, and a signal is returned that tracks their computed value.
     *
     * @param {FuncRecord} record - The record describing the compute-style function. Must include either `func` or `funcName`, and optionally `args`.
     * @param {Shadow} shadow - The current component's shadow record used for resolving context references within the arguments.
     * @return {Signal<any>} A computed signal representing the result of invoking the resolved function with the resolved arguments.
     *     Includes a `$variety` property set to `"$compute"`.
     */
    fluid.expandComputeRecord = function (record, shadow) {
        const func = fluid.resolveFuncRecord(record, shadow);
        const args = fluid.makeArray(record.args);
        const resolvedArgs = fluid.resolveArgMaterial(args, shadow);
        const togo = fluid.computed(func, resolvedArgs, {flattenArg: fluid.flattenSignals});
        togo.$variety = "$compute";
        return togo;
    };

    /**
     * Expands an effect-style function record into a reactive effect.
     * The function and its arguments are resolved from the record, and an effect is created that runs in response to changes.
     *
     * @param {FuncRecord} record - The record describing the effect-style function. Must include either `func` or `funcName`, and optionally `args`.
     * @param {Shadow} shadow - The current component's shadow record used for resolving context references within the arguments.
     * @return {Function} A disposer function for the created effect. The function object includes a `$variety` property set to `"$effect"`.
     */
    fluid.expandEffectRecord = function (record, shadow) {
        console.log("ExpandEffectRecord for " + record.funcName + " at " + shadow.memberName);
        const func = fluid.resolveFuncRecord(record, shadow);
        const args = fluid.makeArray(record.args);
        const resolvedArgs = fluid.resolveArgMaterial(args, shadow);
        const togo = fluid.effect(func, resolvedArgs, {flattenArg: effectFlattener});
        togo.$variety = "$effect";
        return togo;
    };

    /**
     * Expands a reactive record into a part of the component tree marked as reactive data.
     * If `record` is a String, it is interpreted as a context reference.
     *
     * @param {any|String} record - The data to be made reactive, or a context reference String.
     * @param {Shadow} shadow - The component's shadow record
     * @return {Signal<any>} A computed signal representing the reactive data for the specified record.
     */
    fluid.expandReactiveRecord = function (record, shadow) {
        const togo = typeof(record) === "string" ?
            fluid.fetchContextReference(record, shadow) : signal(record);
        // This is otherwise a no-op since marking the shadowMap is done in fluid.transferShadowMap
        togo.$variety = "$reactiveRoot";
        return togo;
    };

    /**
     * Pushes the potentia (potential definition) for a subcomponent into the system by constructing
     * a `subcomponent` layer record and invoking `fluid.pushPotentia`. This supports instantiating
     * nested subcomponents from within a parent component's definition.
     *
     * @param {Shadow} shadow - The shadow record representing the parent component into which the subcomponent is being added.
     * @param {String} memberName - The member name of the subcomponent within the parent component.
     * @param {Object} expanded - The expanded component definition for the subcomponent, expected to contain a `$layers` field.
     * @param {ScopeRecord} [scope] - The scope record tracking references and their resolution priorities during expansion.
     * @return {ComponentComputer} The result of invoking `fluid.pushPotentia`, representing the effect or pending instantiation of the subcomponent.
     */
    fluid.pushSubcomponentPotentia = function (shadow, memberName, expanded, scope) {
        const subLayerRecord = {
            mergeRecordType: "subcomponent",
            // TODO: Eventually will allow nesting deeper on path
            mergeRecordName: `subcomponent:${memberName}`,
            layer: expanded
        };
        // TODO: detect injected reference and take direct path to instantiator
        return fluid.pushPotentia(shadow, memberName, [subLayerRecord], expanded.$layers, scope);
    };

    /**
     * Expands a subcomponent-style function record into a component instantiation.
     * Produces a `subcomponent`-type layer record and pushes it into the component tree at the given `key` under the `shadow`.
     *
     * @param {FuncRecord} record - The component-style function record to be expanded. Expected to contain `func`, `funcName`, and/or `args`, along with `$layers`.
     * @param {Shadow} shadow - The parent component's shadow record under which the subcomponent will be allocated.
     * @param {String} key - The member name at which the subcomponent will be instantiated.
     * @return {ComponentComputer} A reactive signal representing the component instance.
     */
    fluid.expandComponentRecord = function (record, shadow, key) {
        const expanded = fluid.readerExpandLayer(record);
        const sourceRecord = expanded.$for;
        if (sourceRecord) {
            const sourceSignal = fluid.fetchContextReference(sourceRecord.source, shadow);
            let listShadow;
            const componentList = fluid.computed(source => {
                const allKeys = [];

                const pushSubcomponentPotentia = function (value, subKey) {
                    allKeys.push("" + subKey);
                    const scope = {};
                    if (sourceRecord.value !== undefined) {
                        scope[sourceRecord.value] = {value: value, source: sourceSignal, sourcePath: subKey};
                    }
                    if (sourceRecord.key !== undefined) {
                        scope[sourceRecord.key] = {value: subKey, source: sourceSignal, sourcePath: subKey};
                    }
                    return fluid.pushSubcomponentPotentia(listShadow, subKey, expanded, scope);
                };

                let togo;
                if (fluid.isArrayable(source)) {
                    togo = source.map(pushSubcomponentPotentia);
                } else {
                    togo = Object.entries(source).map(([key, value]) => pushSubcomponentPotentia(value, key));
                }

                // Destroy components which no longer have matching entries
                const goneKeys = Object.keys(listShadow.childComponents).filter(k => !allKeys.includes(k));
                const goneShadows = goneKeys.map(k => listShadow.childComponents[k]);
                goneShadows.forEach(shadow => shadow.potentia.value = fluid.emptyPotentia);

                return togo;
            }, [sourceSignal]);
            componentList.$variety = "$componentList";
            const listLayer = {
                $layers: ["fluid.componentList"],
                list: componentList,
                length: fluid.getThroughSignals(componentList, ["length"])
            };
            const listComputer = fluid.pushSubcomponentPotentia(shadow, key, listLayer);
            // This gets pushed into the componentList computed scope above
            listShadow = listComputer.shadow;
            return listComputer;
        } else {
            return fluid.pushSubcomponentPotentia(shadow, key, expanded);
        }
    };

    /**
     * @typedef {Object} HandlerRecord
     * @property {String} key - The type of element being processed, such as "$method", "$compute", "$effect", "$component", etc.
     * @property {Function} handler - A function responsible for handling the record expansion, such as `fluid.expandMethodRecord`, `fluid.expandComputeRecord`, etc.
     * @property {Boolean} [isEffect=false] - A flag indicating whether the handler is related to an effect, typically used for $effect records.
     */

    fluid.elementExpanderRecord = function () {};

    /**
     * An array of handler records that define how different element types are expanded. Each record contains a key representing the type
     * of element (e.g., "$method", "$compute", "$effect", "$component") and a handler function that processes the record. The handler
     * function will expand or transform the record into a different form, such as a computed signal, effect, or component expansion.
     *
     * @type {HandlerRecord[]}
     */
    fluid.expandElementTypes = [{
        key: "$method",
        handler: fluid.expandMethodRecord
    }, {
        key: "$compute",
        handler: fluid.expandComputeRecord
    }, {
        key: "$effect",
        handler: fluid.expandEffectRecord,
        isEffect: true
    }, {
        key: "$reactiveRoot",
        handler: fluid.expandReactiveRecord
    }, {
        key: "$component",
        handler: fluid.expandComponentRecord
        // TODO: Need to turn this record into an effect so that effect (potentia) can be withdrawn
    }].map(rec => Object.assign(Object.create(fluid.elementExpanderRecord.prototype), rec));

    /**
     * Apply a site address to a signalised product in the form of members `site, segs`
     * @param {signal|computed|effect} signal - A signalised product to be assigned a site address
     * @param {Shadow} shadow - The shadow for the component where the signal is sited
     * @param {String[]} segs - The path segments where the signal is sited within its component
     * @return {signal|computed|effect} The now sited signal
     */
    fluid.siteSignal = function (signal, shadow, segs) {
        signal.site = shadow;
        signal.segs = [...segs];
        return signal;
    };

    /**
     * Mounts a signal-producing record into a component's shadow map at the specified path.
     * If an identical record already exists in the previous shadow map, it is reused to preserve reactivity.
     * Otherwise, the provided `handler` from the `handlerRecord` is invoked to produce the signal or effect.
     *
     * @param {HandlerRecord} handlerRecord - A handler metadata record containing a `handler` function and an `isEffect` flag.
     * @param {FuncRecord} record - The signal-producing record that will be mounted. Typically includes fields like `func`, `args`, etc.
     * @param {Shadow} shadow - The component shadow in which to mount the record.
     * @param {String[]} segs - The path segments at which to mount the signal within the shadow structure
     * @return {any|undefined} The signal or computed product that results from the mounting operation.
     */
    fluid.mountSignalRecord = function (handlerRecord, record, shadow, segs) {
        const allSegs = [...segs, $m];
        const oldRec = fluid.get(shadow.oldShadowMap, allSegs);
        const rec = fluid.getRecInsist(shadow.shadowMap, allSegs);
        rec.signalRecord = record;
        rec.handlerRecord = handlerRecord;
        if (oldRec) {
            rec.proxy = oldRec.proxy;
        }
        if (oldRec && oldRec.signalRecord === record) {
            return rec.signalProduct = oldRec.signalProduct;
        } else if (!handlerRecord.isEffect) {
            const product = rec.signalProduct = handlerRecord.handler(record, shadow, fluid.peek(segs), segs);
            fluid.siteSignal(product, shadow, segs);
            return product;
        }
    };


    fluid.expandElement = function (shadow, element, segs) {
        if (fluid.isPlainObject(element, true)) {
            const handlerRecord = fluid.expandElementTypes.find(record => element[record.key]);
            if (handlerRecord) {
                return fluid.mountSignalRecord(handlerRecord, element[handlerRecord.key], shadow, segs);
            } else {
                return element;
            }
        } else if (fluid.isILReference(element)) {
            const togo = fluid.fetchContextReference(element, shadow);
            fluid.siteSignal(togo, shadow, segs);
            return togo;
        } else {
            return element;
        }
    };



    // TODO: Hack immutability for expanded elements since effect adapter requires it -
    // This should properly be part of "reader expansion" for layers and stored with them
    fluid.expansionCache = Object.create(null);

    fluid.expandCompactElementImpl = function (element) {
        const c = element.charAt(0);
        if (c === "$") {
            const colpos = element.indexOf(":");
            if (colpos === -1) {
                fluid.fail("Badly-formed compact record ", element, " without colon");
            } else {
                const type = element.substring(0, colpos);
                if (!fluid.expandElementTypes.find(record => record.key === type)) {
                    // TODO: Tests for this branch
                    fluid.fail("Unrecognised compact record type ", type);
                }
                const body = element.substring(colpos + 1);
                const rec = fluid.compactStringToRec(body, type);
                return {[type]: rec};
            }
        }
    };

    fluid.expandCompactElement = function (element) {
        if (typeof(element) === "string") {
            const existing = fluid.expansionCache[element];
            if (existing) {
                return existing;
            } else {
                const expanded = fluid.expandCompactElementImpl(element);
                if (expanded) {
                    fluid.expansionCache[element] = expanded;
                    return expanded;
                }
            }
        }
    };

    /**
     * Marks a sequence of segments in the `shadowMap` as signalised, indicating to consumers such as
     * `flattenSignals` and the proxy that the corresponding paths should be cloned and expanded due to
     * the presence of signal-bearing content further down the path.
     * @param {Object} shadowMap - The root of the shadow map structure to annotate.
     * @param {String[]} segs - The sequence of path segments to follow and mark.
     * @param {Integer} [uncess=1] - The number of trailing segments to exclude from marking as signal-bearing parents.
     */
    fluid.markSignalised = function (shadowMap, segs, uncess = 1) {
        for (let i = 0; i < segs.length; ++i) {
            const seg = segs[i];
            const rec = fluid.getRecInsist(shadowMap, [seg, $m]);
            if (i < segs.length - uncess) {
                // This is a signal to flattenSignals and the proxy to indicate that it should clone and expand
                // since this path is in the interior of the mat
                rec.hasSignalChild = true;
            }
            shadowMap = shadowMap[seg];
        }
    };

    fluid.expandLayer = function (target, flatMerged, shadow, segs) {
        fluid.each(flatMerged, function expandOneLayer(value, key) {
            segs.push(key);
            const uncompact = fluid.expandCompactElement(value);
            const expanded = fluid.expandElement(shadow, uncompact || value, segs);
            if (fluid.isPlainObject(expanded, true)) {
                const expandedInner = {}; // TODO: Make these lazy and only construct a fresh object if there is an expansion
                fluid.expandLayer(expandedInner, value, shadow, segs);
                target[key] = expandedInner;
            } else {
                target[key] = expanded;
                if (fluid.isSignal(expanded)) {
                    // TODO: Currently don't have any plain $list in the system
                    const uncess = expanded.$variety === "$componentList" || expanded.$variety === "$list" ? 0 : 1;
                    fluid.markSignalised(shadow.shadowMap, segs, uncess);
                }
            }
            segs.pop();
        });
    };

    /**
     * Performs a flattened resolution of the merged hierarchy for a component, optionally constructing
     * a synthetic layer if multiple layer names are provided.
     *
     * @param {Shadow} shadow - The shadow record of the component which is merging.
     * @param {fluid.HierarchyResolver} resolver - The resolver used to store and resolve layered definitions.
     * @param {String[]} layerNames - An array of layer names to be merged and resolved.
     * @return {any} The resolved merged definition for the computed instance, or an "unavailable" marker if resolution fails.
     */
    fluid.flatMergedRound = function (shadow, resolver, layerNames) {
        if (layerNames.length > 0) {
            layerNames.forEach(layerName => resolver.storeLayer(layerName));
            return resolver.resolve(layerNames);
        } else {
            return fluid.unavailable({message: "Component has no layers", site: shadow});
        }
    };

    fluid.flatMergedComputer = function (shadow) {
        return computed(function flatMergedComputer() {
            const {layerNames, mergeRecords} = shadow.potentia.value;

            const mergeRecordLayerNames = mergeRecords.map(mergeRecord => fluid.makeArray(mergeRecord.layer.$layers)).flat();
            const allLayerNames = [...layerNames, ...mergeRecordLayerNames].reverse();

            const resolver = new fluid.HierarchyResolver();
            const resolved = fluid.flatMergedRound(shadow, resolver, allLayerNames); // <= WILL READ LAYER REGISTRY

            if (fluid.isUnavailable(resolved)) {
                return resolved;
            } else {
                const layers = resolved.mergeRecords.concat(mergeRecords).concat({
                    mergeRecordType: "live",
                    mergeRecordName: "live",
                    layer: shadow.liveLayer
                });

                const flatMerged = fluid.makeLayer("flatMerged", shadow);
                shadow.layerMap = fluid.mergeLayerRecords(flatMerged, layers);
                return flatMerged;
            }
        });
    };

    fluid.scheduleEffects = function (shadow) {
        const expandEffect = (newRecord, segs) => {
            newRecord.signalProduct = newRecord.handlerRecord.handler(newRecord.signalRecord, shadow);
            fluid.siteSignal(newRecord.signalProduct, shadow, segs);
        };
        // Instantiate any fresh effects
        fluid.forEachDeep(shadow.shadowMap, (newRecord, segs) => {
            if (newRecord?.handlerRecord?.isEffect) {
                const oldRecord = fluid.get(shadow.oldShadowMap, segs)?.[$m];
                // Last branch: Deal with funny race where we managed to update instance before we ever allocate effects - look in to how this happens
                if (!oldRecord || newRecord.signalRecord !== oldRecord.signalRecord || !oldRecord.signalProduct) {
                    expandEffect(newRecord, segs);
                }
            }
        });
        delete shadow.oldShadowMap;
        // TODO: entangled here - clearComponent is old-world, does stuff like deleting scopes - can be more reactive, and should
        // probably occur whenever instance becomes invalid.
        if (fluid.isEmptyPotentia(shadow.potentia.peek())) {
            shadow.instantiator.clearComponent(shadow.parentShadow, shadow.memberName, shadow);
        }
    };

    fluid.disposeLayerEffects = function (shadow) {
        fluid.forEachDeep(shadow.oldShadowMap, (oldRecord, segs) => {
            const newRecord = fluid.get(shadow.shadowMap, segs)?.[$m];
            if (oldRecord?.handlerRecord?.isEffect && (!newRecord || newRecord.signalRecord !== oldRecord.signalRecord)) {
                oldRecord.signalProduct._dispose(); // dispose old effects that are not configured after adaptation
            }
        });
    };

    /**
     * Replaces all entries in the target scope with those from the new scope.
     * This performs a shallow overwrite, first clearing the existing properties on the target.
     *
     * @param {Object} target - The target scope object to be updated.
     * @param {Object} newScope - The new scope whose properties will replace those in the target.
     */
    fluid.applyScope = function (target, newScope) {
        fluid.clear(target);
        Object.assign(target, newScope);
    };

    /**
     * @typedef {signal<fluid.component>} ComponentComputer
     * @property {fluid.component} value - The component value associated with the signal.
     * @property {Shadow} shadow - The shadow record associated with the component.
     * @property {"$component"} $variety - A string indicating the type of the signal, which should be "$component".
     */

    /**
     * Represents the potential state of a component, defining its layer-based configuration and merge records.
     *
     * @typedef {Object} Potentia
     * @property {String[]} layerNames - An array of direct layer names applied to the component
     * @property {MergeRecord[]} mergeRecords - An array of merge records representing the component's configuration.
     * @property {Object} [props] - Optional component properties, typically including an `$id` field.
     */

    /**
     * Updates or initializes a component's potentia by merging new records and layer names.
     * If a potentia already exists, it filters out old merge records that belong to layers being updated.
     * Otherwise, it computes a new instance.
     *
     * @param {Shadow} parentShadow - The shadow record of the parent component.
     * @param {String} memberName - The name of the component within its parent.
     * @param {MergeRecord[]} mergeRecords - An array of merge records representing the component's configuration.
     * @param {String[]} [layerNames] - An array of direct layer names applied to the component
     * @param {Object} [variableScope] - A record of scope values to be applied as a result of structural iteration
     * @return {ComponentComputer} The updated or newly computed component.
     */
    fluid.pushPotentia = function (parentShadow, memberName, mergeRecords, layerNames = [], variableScope) {
        const existing = parentShadow.childComponents[memberName];
        if (existing) {
            const shadow = existing;
            const oldPotentia = shadow.potentia.peek(); // Avoid creating a read dependency
            const writtenLayers = new Set(mergeRecords.map(mergeRecord => mergeRecord.mergeRecordType));
            const filteredRecords = oldPotentia.mergeRecords.filter(mergeRecord => !writtenLayers.has(mergeRecord.mergeRecordType));
            const newMergeRecords = filteredRecords.concat(mergeRecords.filter(mergeRecord => mergeRecord.layer));
            const newLayerNames = oldPotentia.layerNames || layerNames;

            const potentia = {mergeRecords: newMergeRecords, layerNames: newLayerNames};
            shadow.potentia.value = potentia;
            fluid.applyScope(shadow.variableScope, variableScope);
            return shadow.computer;
        } else {
            return fluid.computeInstance({mergeRecords, layerNames}, parentShadow, memberName, variableScope);
        }
    };

    fluid.effectGuardDepth = 0;
    fluid.scheduleEffectsQueue = [];

    fluid.queueScheduleEffects = function (shadow) {
        fluid.scheduleEffectsQueue.push(shadow);
        if (fluid.effectGuardDepth === 0) {
            const active = fluid.scheduleEffectsQueue.reverse();
            fluid.scheduleEffectsQueue = [];
            active.forEach(shadow => {
                shadow.effectScheduler = effect( () => fluid.scheduleEffects(shadow, shadow.computer.value));
                shadow.effectScheduler.$variety = "effectScheduler";
            });
        }
    };

    /**
     * Computes an instance for a given potentia and returns the associated component computer signal.
     * @param {Potentia} potentia - The potentia (potential component configuration).
     * @param {Shadow} parentShadow - The shadow record associated with the parent component.
     * @param {String} memberName - The name of the member for this component in the parent.
     * @param {Object} [variableScope] - Local scope values to be applied, perhaps through iteration
     * @return {ComponentComputer} - The computed instance as a signal with shadow and $variety properties.
     */
    fluid.computeInstance = function (potentia, parentShadow, memberName, variableScope) {
        const instantiator = parentShadow.instantiator;

        const shadow = Object.create(fluid.shadow.prototype);

        shadow.potentia = signal(potentia);
        shadow.liveLayer = Object.create(null);
        shadow.shadowMap = Object.create(null);

        shadow.instanceId = 0;
        shadow.flatMerged = fluid.flatMergedComputer(shadow);

        const computer = computed(function computeInstance() {
            shadow.oldShadowMap = shadow.shadowMap;
            shadow.shadowMap = Object.create(null);
            const flatMerged = shadow.flatMerged.value; // <-- EVALUATE HERE - various side-effects

            let instance;
            if (fluid.isUnavailable(flatMerged)) {
                instance = flatMerged;
            } else {
                fluid.transferShadowMap(shadow.shadowMap, shadow.layerMap);
                // These props may just be the id for a free component
                instance = fluid.freshComponent(potentia.props, shadow);
                instance.instanceId = shadow.instanceId++;
                console.log("Allocated instanceId " + shadow.instanceId + " at site " + shadow.path);
                fluid.expandLayer(instance, flatMerged, shadow, []);
            }
            fluid.disposeLayerEffects(shadow);
            // Here Lies the Gap of the Queen of Sheba
            return instance;
        });

        computer.$variety = "$component";
        shadow.computer = computer;
        computer.shadow = shadow;

        try {
            ++fluid.effectGuardDepth;

            // At this point there will be fluid.cacheLayerScopes which will start to demand shadow.computer.value.$layers
            instantiator.recordKnownComponent(parentShadow, shadow, memberName, true);
            fluid.applyScope(shadow.variableScope, variableScope);
        } finally {
            --fluid.effectGuardDepth;
        }

        fluid.queueScheduleEffects(shadow);

        return computer;
    };

    fluid.expectLiveAccess = function (shadow, prop) {
        if (shadow.lifecycleStatus === "destroyed") {
            throw Error(`Cannot access member ${prop} of component which has been destroyed`);
        }
    };

    fluid.getPenThroughSignals = function (target, segs) {
        let it = fluid.deSignal(target);
        for (let i = 0; i < segs.length - 1; ++i) {
            const move = it[segs[i]];
            it = fluid.deSignal(move);
        }
        return it;
    };

    fluid.mutatingArrayMethods = Object.fromEntries(["copyWithin", "fill", "pop", "push",
        "reverse", "shift", "sort", "splice", "unshift"].map(key => [key, true]));

    /**
     * Construct a proxy wrapper for a supplied component from its computer - reads will be designalised, and writes
     * will be upgraded into a live layer, allocating a fresh property in the layer if required.
     *
     * @param {any} target - The target value to be proxied
     * @param {Shadow} shadow - The shadow record of the target component.
     * @param {Array<string>} segs - The path segments representing the location within the component structure.
     * @return {Proxy<fluid.component>} The retrieved or newly created metadata record.
     */
    fluid.proxyMat = function (target, shadow, segs) {
        const rec = fluid.getRecInsist(shadow.shadowMap, [...segs, $m]);
        const existing = rec.proxy;
        if (existing) {
            return existing;
        } else {
            const getHandler = function (target, prop) {
                if (prop === $t) {
                    return target;
                }
                fluid.expectLiveAccess(shadow, prop);
                // Use "Symbol.toStringTag" to make sure that tricks like fluid.isArrayable work on the target
                const deTarget = fluid.deSignal(target);
                if (prop === Symbol.toStringTag) {
                    return Object.prototype.toString.call(deTarget);
                } else {
                    const nextSegs = [...segs, prop];
                    const upSignals = fluid.get(shadow.shadowMap, nextSegs)?.[$m]?.hasSignalChild;
                    const inReactive = fluid.findReactiveRoot(shadow.shadowMap, nextSegs);
                    // Special case to allow fluid.isUnavailable of an entire component
                    const next = fluid.isUnavailable(deTarget) && segs.length > 0 ? undefined : inReactive ?
                        fluid.getForComponent(shadow.that, nextSegs) : deTarget[prop]; // TODO: These two should be the same but perhaps latter is optimisation when in config
                    const proxyNext = upSignals || inReactive;
                    if (Array.isArray(deTarget) && typeof(deTarget[prop]) === "function") {
                        if (fluid.mutatingArrayMethods[prop]) {
                            const liveSignal = fluid.pathToLive(shadow.that, segs);
                            // For any mutating array methods, assemble a shallow copy of the current live layer value,
                            // apply the mutation to that, and after it is done, write it back into the live layer
                            const forked = [...liveSignal.value];
                            return function () {
                                const togo = Array.prototype[prop].apply(forked, arguments);
                                liveSignal.value = forked;
                                return togo;
                            };
                        } else {
                            const unwrapped = deTarget.map((element, key) => getHandler(target, key));
                            return Array.prototype[prop].bind(unwrapped);
                        }
                    } else if (proxyNext || fluid.isSignal(next)) {
                        const upcoming = fluid.deSignal(next);
                        // Problem here if material goes away or changes - proxies bound to old material will still be out there,
                        // although we do reevaluate our signal target
                        // If it is unavailable, we need to ensure that user does not try to dereference into it by next property access
                        // If it is another component, hand off to fresh lineage of proxy
                        return fluid.isUnavailable(upcoming) ? fluid.unavailableProxy(upcoming) :
                            next.$variety === "$component" ? fluid.proxyMat(next, next.shadow, []) :
                                fluid.isPrimitive(upcoming) || !proxyNext ? upcoming :
                                    fluid.proxyMat(next, shadow, nextSegs);
                    } else {
                        return next;
                    }
                }
            };
            const setHandler = function (target, prop, value) {
                fluid.expectLiveAccess(shadow, prop);
                const nextSegs = [...segs, prop];
                if (fluid.isSignal(target) && target.$variety === "$contextRef") {
                    const resolvedRec = shadow.variableScope[target.parsed.context];
                    let innerContext = target.parsed.context,
                        innerPath = target.parsed.path;
                    if (resolvedRec.source) {
                        const innerRef = resolvedRec.source;
                        innerContext = innerRef.parsed.context;
                        innerPath = fluid.composePath(innerRef.parsed.path, resolvedRec.sourcePath);
                    }
                    const resolved = fluid.resolveContext(shadow, innerContext);
                    const innerNext = fluid.getPenThroughSignals(resolved, innerPath);
                }
                fluid.setForComponent(shadow.that, nextSegs, value);
                return true;
            };

            const proxy = new Proxy(target, {
                get: getHandler,
                set: setHandler,
                // Pattern described at https://stackoverflow.com/a/50139861/1381443
                ownKeys: () => {
                    return Reflect.ownKeys(fluid.deSignal(target));
                },
                getOwnPropertyDescriptor: function (target, key) {
                    return {value: this.get(target, key), enumerable: true, configurable: true};
                },
                getPrototypeOf: () => Object.getPrototypeOf(fluid.deSignal(target))
            });
            return rec.proxy = proxy;
        }
    };

    // Get the underlying value hosted by a proxy - probably only of real value in test cases
    fluid.unwrapProxy = function (maybeProxy) {
        const target = maybeProxy?.[$t];
        return target ? fluid.deSignal(target) : maybeProxy;
    };

    fluid.initFreeComponent = function (componentName, initArgs) {
        const instantiator = fluid.globalInstantiator;
        // TODO: Perhaps one day we will support a directive which allows the user to select a current component
        // root for free components other than the global root

        const id = fluid.allocateGuid();
        const instanceName = fluid.computeGlobalMemberName(componentName, id);

        const argLayer = initArgs[0] || {};
        const ourLayerNames = [componentName].concat(fluid.makeArray(argLayer.$layers));

        const userLayerRecord = {
            mergeRecordType: "user",
            layer: {
                ...argLayer
            }
        };
        const potentia = {
            props: {$id: id},
            layerNames: ourLayerNames,
            mergeRecords: [userLayerRecord]
        };

        const computer = fluid.computeInstance(potentia, instantiator.rootComponent[$m], instanceName);

        const proxy = fluid.proxyMat(computer, computer.shadow, []);
        return proxy;
    };

    /** Destroys a component held at the specified path. The parent path must represent a component, although the component itself may be nonexistent
     * @param {String|String[]} path - Path where the new component is to be destroyed, represented as a string or array of string segments
     * @param {fluid.instantiator} [instantiator] - [optional] The instantiator holding the component to be destroyed - if blank, the global instantiator will be used.
     */
    fluid.destroy = function (path, instantiator) {
        instantiator = instantiator || fluid.globalInstantiator;
        const segs = fluid.parsePath(path);
        if (segs.length === 0) {
            fluid.fail("Cannot destroy the root component");
        }
        const that = instantiator.pathToComponent[path];
        fluid.destroyComponent(that);
    };

    fluid.emptyPotentia = Object.freeze({layerNames: [], mergeRecords: []});

    /**
     * Determines whether a given Potentia object is empty, meaning it has no associated layers or merge records.
     * @param {Potentia} potentia - The Potentia object to check.
     * @return {Boolean} `true` if the Potentia object is empty; otherwise, `false`.
     */
    fluid.isEmptyPotentia = function (potentia) {
        return potentia.layerNames.length === 0 && potentia.mergeRecords.length === 0;
    };

    // TODO: Special syntax to just access signal
    /**
     * Destroys a component by resetting its Potentia, removing all layer names and merge records.
     * @param {ComponentComputer} proxy - The component to be destroyed.
     */
    fluid.destroyComponent = function (proxy) {
        proxy[$t].shadow.potentia.value = fluid.emptyPotentia;
    };

    fluid.def("fluid.component", {
        events: { // Three standard lifecycle points common to all components
            onCreate: 0,
            onDestroy: 0,
            afterDestroy: 0
        },
        destroy: "$method:fluid.destroyComponent({self})"
    });

    fluid.def("fluid.componentList", {
        $layers: "fluid.component"
    });

    // The grade supplied to components which will be resolvable from all parts of the component tree
    fluid.def("fluid.resolveRoot", {$layers: "fluid.component"});
    // In addition to being resolvable at the root, "resolveRootSingle" component will have just a single instance available. Fresh
    // instances will displace older ones.
    fluid.def("fluid.resolveRootSingle", {$layers: "fluid.resolveRoot"});

    fluid.constructRootComponents(fluid.globalInstantiator); // currently a singleton - in future, alternative instantiators might come back

    /**
     * Fetches data from a given URL and processes the response using a provided strategy function.
     * Whilst the fetch is pending, the signal is set to an "unavailable" state.
     * If the fetch fails, the signal is set to an "unavailable" state with an error message.
     *
     * @param {String} url - The URL to fetch data from.
     * @param {RequestInit} [options] - Optional fetch configuration options.
     * @param {Function} strategy - An async function to process the response.
     * @return {signal<any>} A signal containing the processed data or an "unavailable" state.
     */
    fluid.fetch = function (url, options, strategy) {
        const togo = signal(fluid.unavailable({message: `Pending I/O for URL ${url}`, variety: "I/O"}));
        fetch(url, options)
            .then(response => strategy(response))
            .then(data => togo.value = data)
            .catch(err => togo.value = fluid.unavailable({message: `I/O failure for URL ${url} - ${err}`, variety: "error"}));
        return togo;
    };

    /**
     * Fetches text data from a given URL and stores the result in a signal.
     * Whilst the fetch is pending, the signal is set to an "unavailable" state.
     * If the fetch fails, the signal is set to an "unavailable" state with an error message.
     *
     * @param {String} url - The URL to fetch text data from.
     * @param {RequestInit} [options] - Optional fetch configuration options.
     * @return {signal<String>} A signal containing the fetched text data or an "unavailable" state.
     */
    fluid.fetchText = function (url, options) {
        return fluid.fetch(url, options, async response => response.text());
    };

    /**
     * Fetches JSON data from a given URL and stores the result in a signal.
     * Whilst the fetch is pending, the signal is set to an "unavailable" state.
     * If the fetch fails, the signal is set to an "unavailable" state with an error message.
     *
     * @param {String} url - The URL to fetch JSON data from.
     * @param {RequestInit} [options] - Optional fetch configuration options.
     * @return {signal<Object>} A signal containing the fetched JSON data or an "unavailable" state.
     */
    fluid.fetchJSON = function (url, options) {
        return fluid.fetch(url, options, async response => response.json());
    };

    /**
     * Converts a signal at a given path within a component into a Promise that resolves when the signal's value to an
     * available value.
     *
     * @param {Component} component - The component containing the signal.
     * @param {String|String[]} path - The path within the component where the signal is located.
     * @return {Promise<any>} A Promise that resolves with the value of the signal when it updates.
     */
    fluid.toPromise = function (component, path) {
        const pathSignal = fluid.getForComponent(component, path);
        return new Promise( (resolve) => {
            const effect = fluid.effect(function (pathValue) {
                resolve(pathValue);
                effect._dispose();
            }, [pathSignal]);
        });
    };

    fluid.importMap = {};
};

if (typeof(fluid) !== "undefined") {
    fluidILScope(fluid);
}
