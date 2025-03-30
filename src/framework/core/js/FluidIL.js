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


    // Bitmapped constants holding reason for context name to be in scope within contextHash and scope
    fluid.contextName = 1;
    fluid.memberName = 2;

    /**
     * Converts an array of layer names into a hash object where each name and its nickname are mapped to a context type.
     *
     * @param {String[]} layerNames - An array of layer names to be processed.
     * @return {Object<String, Number>} A hash object where:
     *   - Each full layer name is a key, mapped to the number `fluid.contextName`.
     *   - Each nickname of a valid layer name (computed using `fluid.computeNickName`) is also a key, mapped to the number `fluid.contextName`.
     *   - Names that are references or expanders are ignored.
     */
    fluid.layerNamesToHash = function (layerNames) {
        const contextHash = {};
        fluid.each(layerNames, function (layerName) {
            if (!fluid.isReferenceOrExpander(layerName)) {
                contextHash[layerName] = fluid.contextName;
                contextHash[fluid.computeNickName(layerName)] = fluid.contextName;
            }
        });
        return contextHash;
    };

    fluid.applyToContexts = function (hash, key, disposition) {
        const existing = hash[key];
        hash[key] = (existing || 0) | disposition; // Resolve part of FLUID-6433
    };

    fluid.applyToScope = function (scope, key, shadow, disposition) {
        const existing = scope[key];
        if (!existing || (disposition & fluid.memberName)) {
            scope[key] = shadow;
        }
    };

    fluid.cacheLayerScopes = function (parentShadow, shadow) {
        return effect(function scopeEffect() {
            shadow.scope = Object.create(parentShadow ? Object.create(parentShadow.scope) : {});
            const layers = shadow.computer?.value?.$layers || [];
            const contextHash = shadow.contextHash = fluid.layerNamesToHash(layers);

            // This is filtered out again in recordComponent
            fluid.applyToContexts(contextHash, shadow.memberName, fluid.memberName);
            fluid.each(contextHash, function (disposition, context) {
                if (shadow.parentShadow && shadow.parentShadow.that !== fluid.rootComponent) {
                    fluid.applyToScope(shadow.parentShadow.scope, context, shadow, disposition);
                }
            });
        });
    };

    fluid.clearScope = function (parentShadow, child, childShadow, memberName) {
        const keys = Object.keys(childShadow.contextHash);
        keys.push(memberName); // Add local name in case we are clearing an injected component - FLUID-6444
        keys.forEach(function (context) {
            if (parentShadow.scope[context] === child) {
                delete parentShadow.scope[context]; // TODO: ambiguous resolution
            }
        });
    };

    /**
     * @typedef {Object} Shadow
     * @property {String} path - The principal allocated path (point of construction) of the component in the component tree.
     * @property {String} memberName - The name of the component within its parent.
     * @property {Shadow|null} [parentShadow] - The shadow record associated with the parent component.
     * @property {Object<String, Shadow>} childComponents - A record of child components keyed by their member names.
     * @property {Object} scopes - Cached layer scopes for the component.
     * @property {Object} [injectedPaths] - A record of paths where this component has been injected, keyed by path.
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
    //     (value)) {Component} The component itself
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
                shadow.scopeEffect = fluid.cacheLayerScopes(parentShadow, shadow);
            } else {
                shadow.injectedPaths = shadow.injectedPaths || {}; // a hash since we will modify whilst iterating
                shadow.injectedPaths[path] = true;
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

            const childPath = fluid.composePath(path, name);
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
                childShadow.lifecycleStatus = "destroying";
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

        rootShadow.scope = {};
        rootShadow.contextHash = {};
        const resolveRootShadow = instantiator.resolveRootComponent[$m];
        resolveRootShadow.scopes = rootShadow.scopes;

        instantiator.recordKnownComponent(resolveRootShadow, instantiator, "instantiator", true); // needs to have a shadow so it can be injected
        resolveRootShadow.scope.instantiator = instantiator; // needs to be mounted since it never passes through cacheShadowGrades
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
            togo.args = fluid.NO_ARGUMENTS;
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
            fluid.fail("Unrecognised compact record with type ", type);
        }
        return string;
    };

    /**
     * @typedef {Object} ParsedContext
     * @property {String} context - The context portion of the reference
     * @property {String} path - The path portion of the reference
     * @property {String} [name] - An optional colon-delimited name parsed from the reference
     */

    /**
     * Parse the string form of a contextualised IL reference into an object.
     *
     * @param {String} reference - The reference to be parsed.
     * @param {Number} [index] - Optional, index within the string to start parsing
     * @return {ParsedContext} A structure holding the parsed structure
     */
    fluid.parseContextReference = function (reference, index) {
        index = index || 0;
        const endcpos = reference.indexOf("}", index + 1);
        const context = reference.substring(index + 1, endcpos);
        const colpos = reference.indexOf(":");
        let name;
        if (colpos !== -1) {
            name = reference.substring(colpos + 1);
            reference = reference.substring(0, colpos);
        }
        let path = reference.substring(endcpos + 1, reference.length);
        if (path.charAt(0) === ".") {
            path = path.substring(1);
        }
        return {context, path, name};
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
     * @return {signal<Component>} Signal for the resolved component or scope. Returns:
     *   - The target component if `context` is `"self"`.
     *   - The root component if `context` is `"/"`.
     *   - The component or scope corresponding to `context` in the target component's scope chain, if found.
     *   - An unavailable value if the context cannot be resolved.
     */
    fluid.resolveContext = function (context, shadow, resolver) {
        return computed( () => {
            if (context === "self") {
                // TODO: We have to return instance so that it doesn't seem to change when component changes
                return shadow.that;
            } else if (context === "/") {
                return shadow.instantiator.rootComponent;
            } else {
                const local = resolver ? resolver(context) : fluid.NoValue;
                if (local === fluid.NoValue) {
                    const resolvedShadow = shadow.scope[context];
                    return resolvedShadow?.computer.value || fluid.unavailable({
                        message: "Cannot resolve context " + context + " from component at path " + shadow.path,
                        site: shadow
                    });
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
        const oldValue = fluid.getForComponent(component, path).value;
        const valueSignal = signal(oldValue);
        fluid.set(shadow.liveLayer, segs, valueSignal);
        // Remerge to take account that this top-level prop is now drawn from signal layer -
        // Could be much more efficient
        console.log("Upgrading path ", path, " to live");
        shadow.potentia.value = Object.assign({}, shadow.potentia.value);
        return valueSignal;
    };

    fluid.setForComponent = function (component, path, value) {
        const segs = fluid.pathToSegs(path),
            shadow = component[$m];
        let existing = fluid.get(shadow.liveLayer, segs);
        if (existing) {
            existing.value = value;
        } else {
            existing = fluid.pathToLive(component, segs);
            existing.value = value;
        }
        return existing;
    };

    fluid.fetchContextReference = function (ref, shadow, resolver) {
        const parsed = fluid.isPrimitive(ref) ? fluid.parseContextReference(ref) : ref;
        const refComputer = computed( function fetchContextReference() {
            console.log("Rerunning $contextRef for ", ref);
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
     * @param {Array<string|{key: string}>} tokens - An array of tokens, where each token is either a string
     *        or an object with a `key` property indicating a path in the source.
     * @param {ComponentComputer} self - Site of the references to be interpolated
     * @return {String|Signal<string>} A computed signal representing the resolved string.
     */
    fluid.renderStringTemplate = function (tokens, self) {
        if (tokens.length === 1 && typeof(tokens[0]) === "string") {
            return tokens[0];
        } else {
            const liveTokens = tokens.map(token => fluid.isPrimitive(token) ? token : fluid.fetchContextReference(token.parsed, self.shadow));
            const togo = fluid.computed(function (...tokens) {
                return tokens.join("");
            }, liveTokens);
            togo.$tokens = liveTokens;
            return togo;
        }
    };

    fluid.resolveFuncRecord = function (rec, shadow) {
        return rec.funcName ? fluid.getGlobalValue(rec.funcName) :
            fluid.isILReference(rec.func) ? fluid.fetchContextReference(rec.func, shadow) : rec.func;
    };

    /**
     * Resolve a value from a `Signal`, or return the value as-is if it is not a `Signal`.
     *
     * @param {any} ref - The value to resolve. May be a `Signal` or a plain value.
     * @param {Object} [shadowRec] - Section of a shadow map we are traversing - when we run off the end of this, we must stop flattening
     * @return {any} The resolved value if `ref` is a `Signal`, or the original value if it is not.
     */
    fluid.deSignalToSite = function (ref, shadowRec) {
        while (fluid.isSignal(ref)) {
            // It's a $ref return from fluid.getForComponent - use it to locate a shadow map around the referenced site
            if (ref.$variety === "$ref") {
                const shadowMap = ref.site.shadowMap;
                shadowRec = fluid.get(shadowMap, ref.segs);
            } else if (ref.$variety === "$component") {
                shadowRec = ref.shadow.shadowMap;
                // TODO: Don't dereference any further for now, consumers of {self} are expecting a signal which should be immutable
                // but in future they may want the proxy or so
                break;
            } else { // We've just resolved some other kind of signal and any previous shadowMap is invalid
                shadowRec = null;
            }
            ref = ref.value;
        }
        return {value: ref, shadowRec};
    };

    // eslint-disable-next-line jsdoc/require-returns-check
    /**
     * Recursively traverse a data structure, resolving any `Signal` values to their underlying values.
     * @param {any|Signal<any>} root - The root data structure to process.
     * @param {String} strategy - Strategy to be used
     * @param {Object} [shadowRecIn] - Section of a shadow map we are traversing - when we run off the end of this, we must stop flattening
     * @return {any} The processed data structure with all `Signal` values resolved and flattened into primitive values where applicable.
     */
    fluid.flattenSignals = function (root, strategy, shadowRecIn) {
        const {value, shadowRec} = fluid.deSignalToSite(root, shadowRecIn);
        if (fluid.isUnavailable(value)) {
            return strategy === "methodStrategy" ? undefined : value;
        } else if (fluid.isSignal(value)) {
            if (value.$variety === "$component") {
                return strategy === "methodStrategy" || strategy === "effectStrategy" ? fluid.proxyMat(value, value.shadow, []) : value;
            }
            else {
                fluid.fail("Unexpected unresolved signal value from fluid.deSignalToSite", value); // Framework logic failure
            }
        } else if (fluid.isPrimitive(value) || !fluid.isPlainObject(value)) {
            return value;
        }
        // We have handled all non-plain structural values by here - now determine whether we should recurse if we are in signal portion of mat
        const mapper = (member, key) => {
            const togo = fluid.flattenSignals(member, strategy, shadowRec?.[key]);
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
    };

    // eslint-disable-next-line jsdoc/require-returns-check
    /**
     * Resolve material intended for compute and method arguments - this only expands {} references, possibly into a
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
        }
    };

    fluid.resolveComputeArgs = function (argRecs, shadow, resolver) {
        return fluid.resolveArgMaterial(argRecs, shadow, resolver);
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

    fluid.expandMethodRecord = function (record, shadow) {
        // Old fluid.makeInvoker used to have:
        // func = func || (invokerec.funcName ? fluid.getGlobalValueNonComponent(invokerec.funcName, "an invoker") : fluid.expandImmediate(invokerec.func, that));
        const func = fluid.resolveFuncRecord(record, shadow);
        let togo;
        if (record.args) {
            const resolver = fluid.makeArgResolver();
            const argRecs = fluid.makeArray(record.args);
            const argResolver = fluid.resolveComputeArgs(argRecs, shadow, resolver.resolve);
            togo = function applyMethod(...args) {
                resolver.backing = args;
                const resolvedArgs = argResolver.map(methodFlattener);
                const resolvedFunc = fluid.deSignal(func);
                return resolvedFunc.apply(shadow, resolvedArgs);
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

    fluid.expandComputeRecord = function (record, shadow) {
        const func = fluid.resolveFuncRecord(record, shadow);
        const args = fluid.makeArray(record.args);
        const resolvedArgs = fluid.resolveComputeArgs(args, shadow);
        const togo = fluid.computed(func, resolvedArgs, {flattenArg: fluid.flattenSignals});
        togo.$variety = "$compute";
        return togo;
    };

    fluid.expandEffectRecord = function (record, shadow) {
        const func = fluid.resolveFuncRecord(record, shadow);
        const args = fluid.makeArray(record.args);
        const resolvedArgs = fluid.resolveComputeArgs(args, shadow);
        const togo = fluid.effect(func, resolvedArgs, {flattenArg: effectFlattener});
        togo.$variety = "$effect";
        return togo;
    };

    fluid.expandComponentRecord = function (record, shadow, key) {
        const expanded = fluid.readerExpandLayer(record);

        const subLayerRecord = {
            layerType: "subcomponent",
            // TODO: Eventually will allow nesting deeper on path
            layerName: `subcomponent:${key}`,
            layer: expanded
        };
        // TODO: detect injected reference and take direct path to instantiator
        return fluid.pushPotentia(shadow, key, [subLayerRecord], expanded.$layers);
    };

    fluid.elementExpanderRecord = function () {};

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
        key: "$component",
        handler: fluid.expandComponentRecord
        // TODO: Need to turn this record into an effect so that effect (potentia) can be withdrawn
    }].map(rec => Object.assign(Object.create(fluid.elementExpanderRecord.prototype), rec));

    /**
     * Apply a site address to a signalised product in the form of members site, segs
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
            const product = rec.signalProduct = handlerRecord.handler(record, shadow, fluid.peek(segs));
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

    fluid.markSignalised = function (shadowMap, segs) {
        for (let i = 0; i < segs.length; ++i) {
            const seg = segs[i];
            const rec = fluid.getRecInsist(shadowMap, [seg, $m]);
            if (i < segs.length - 1) {
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
                    fluid.markSignalised(shadow.shadowMap, segs);
                }
            }
            segs.pop();
        });
    };

    fluid.flatMergedComputer = function (shadow) {
        return computed(function flatMergedComputer() {
            const {layerNames, mergeRecords} = shadow.potentia.value;
            const memberName = shadow.memberName;

            const resolver = fluid.hierarchyResolver();
            let instanceLayerName;
            if (layerNames.length > 1) {
                // TODO: These layer names should be economised on when they coincide, perhaps could just be guids/hashes of their constituents
                instanceLayerName = parent[$m].path + "-" + memberName;
                // Create fictitious "nonce type" if user has supplied direct parents - remember we need to clean this up after the instance is gone
                fluid.rawLayer(instanceLayerName, {$layers: layerNames});
            } else if (layerNames.length === 1) {
                instanceLayerName = layerNames[0];
            }
            let resolved;
            if (instanceLayerName) {
                resolver.storeLayer(instanceLayerName);
                resolved = resolver.resolve(instanceLayerName).value; // <= EXTRA DEPENDENCE ON LAYER REGISTRY COMES HERE
            } else {
                resolved = fluid.unavailable({message: "Component has been destroyed"});
            }

            if (fluid.isUnavailable(resolved)) {
                return resolved;
            } else {

                // layers themselves need to be stored somewhere - recall the return should be a signal not a component
                // the merged result is actual a signal with respect to the supplied layers - fresh layers can arise or old ones can be removed
                // OK - so how will we REMOVE properties in the case we need to unmerge? This is what implies that the entire top level
                // of properties needs to be signalised? Or does the "instance" become a factory and we just construct a completely fresh
                // component instance if there is a change in top-level properties?
                // If we signalise the whole top layer then at least we don't need to ever discard the root reference.
                // And also - if anyone wants a "flattened" component, this naturally can't agree with the old root reference.
                // Does this commit us to "public zebras"?
                const layers = resolved.mergeRecords.concat(mergeRecords).concat({layerType: "live", layer: shadow.liveLayer});

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
                if (!oldRecord || newRecord.signalRecord !== oldRecord.signalRecord) {
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

    fluid.disposeEffects = function (shadow) {
        fluid.forEachDeep(shadow.oldShadowMap, (oldRecord, segs) => {
            const newRecord = fluid.get(shadow.shadowMap, segs)?.[$m];
            if (oldRecord?.handlerRecord?.isEffect && (!newRecord || newRecord.signalRecord !== oldRecord.signalRecord)) {
                oldRecord.signalProduct(); // dispose old effects that are not configured after adaptation
            }
        });
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
     * @param {string} memberName - The name of the component within its parent.
     * @param {MergeRecord[]} mergeRecords - An array of merge records representing the component's configuration.
     * @param {String[]} [layerNames] - An array of direct layer names applied to the component
     * @return {ComponentComputer} The updated or newly computed component.
     */
    fluid.pushPotentia = function (parentShadow, memberName, mergeRecords, layerNames = []) {
        const existing = parentShadow.childComponents[memberName];
        if (existing) {
            const shadow = existing;
            const oldPotentia = shadow.potentia.peek(); // Avoid creating a read dependency
            const writtenLayers = new Set(mergeRecords.map(mergeRecord => mergeRecord.layerType));
            const filteredRecords = oldPotentia.mergeRecords.filter(mergeRecord => !writtenLayers.has(mergeRecord.layerType));
            const newMergeRecords = filteredRecords.concat(mergeRecords.filter(mergeRecord => mergeRecord.layer));
            const newLayerNames = oldPotentia.layerNames || layerNames;

            const potentia = {mergeRecords: newMergeRecords, layerNames: newLayerNames};
            shadow.potentia.value = potentia;
            return shadow.computer;
        } else {
            return fluid.computeInstance({mergeRecords, layerNames}, parentShadow, memberName);
        }
    };

    /**
     * Computes an instance for a given potentia and returns the associated component computer signal.
     * @param {Potentia} potentia - The potentia (potential component configuration).
     * @param {Shadow} parentShadow - The shadow record associated with the parent component.
     * @param {String} memberName - The name of the member for this component in the parent.
     * @return {ComponentComputer} - The computed instance as a signal with shadow and $variety properties.
     */
    fluid.computeInstance = function (potentia, parentShadow, memberName) {
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
            const flatMerged = shadow.flatMerged.value;

            let instance;
            if (fluid.isUnavailable(flatMerged)) {
                instance = flatMerged;
            } else {
                // These props may just be the id for a free component
                instance = fluid.freshComponent(potentia.props, shadow);
                instance.instanceId = shadow.instanceId++;
                console.log("Allocated instanceId " + shadow.instanceId + " at site " + shadow.path);
                fluid.expandLayer(instance, flatMerged, shadow, []);
            }
            fluid.disposeEffects(shadow);
            // Here Lies the Gap of the Queen of Sheba
            return instance;
        });

        computer.$variety = "$component";
        shadow.computer = computer;
        computer.shadow = shadow;

        // At this point there will be fluid.cacheLayerScopes which will start to demand shadow.computer.value.$layers
        instantiator.recordKnownComponent(parentShadow, shadow, memberName, true);

        shadow.effectScheduler = effect( () => fluid.scheduleEffects(shadow, computer.value));
        shadow.effectScheduler.$variety = "effectScheduler";

        return computer;
    };

    fluid.expectLiveAccess = function (shadow, prop) {
        if (shadow.lifecycleStatus === "destroyed") {
            throw Error(`Cannot access member ${prop} of component which has been destroyed`);
        }
    };

    /**
     * Construct a proxy wrapper for a supplied component from its computer - reads will be designalised, and writes
     * will be upgraded into a live layer, allocating a fresh property in the layer if required.
     *
     * @param {ComponentComputer} target - The component computer to be proxied
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
                    // Special case to allow fluid.isUnavailable of an entire component
                    const next = fluid.isUnavailable(deTarget) && segs.length > 0 ? undefined : deTarget[prop];
                    const nextSegs = [...segs, prop];
                    const upSignals = fluid.get(shadow.shadowMap, nextSegs)?.[$m]?.hasSignalChild;
                    if (upSignals || fluid.isSignal(next)) {
                        const upcoming = fluid.deSignal(next);
                        // Problem here if material goes away or changes - proxies bound to old material will still be out there,
                        // although we do reevaluate our signal target
                        // We need to arrange that any signal at a particular path stays there, which implies we need
                        // rebindable computables
                        // If it is unavailable, we need to ensure that user does not try to dereference into it by next property access
                        // If it is another component, hand off to fresh lineage of proxy
                        return next.$variety === "$component" ? fluid.proxyMat(next, next.shadow, []) :
                            (fluid.isPrimitive(upcoming) || !upSignals) && !fluid.isUnavailable(upcoming) ? upcoming :
                                fluid.proxyMat(next, shadow, nextSegs);
                    } else {
                        return next;
                    }
                }
            };
            const setHandler = function (target, prop, value) {
                fluid.expectLiveAccess(shadow, prop);
                const nextSegs = [...segs, prop];
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
            layerType: "user",
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
        proxy[$t].shadow.potentia.value = {layerNames: [], mergeRecords: []};
    };

    fluid.def("fluid.component", {
        events: { // Three standard lifecycle points common to all components
            onCreate: 0,
            onDestroy: 0,
            afterDestroy: 0
        },
        destroy: "$method:fluid.destroyComponent({self})"
    });


    // The grade supplied to components which will be resolvable from all parts of the component tree
    fluid.def("fluid.resolveRoot", {$layers: "fluid.component"});
    // In addition to being resolvable at the root, "resolveRootSingle" component will have just a single instance available. Fresh
    // instances will displace older ones.
    fluid.def("fluid.resolveRootSingle", {$layers: "fluid.resolveRoot"});

    fluid.constructRootComponents(fluid.globalInstantiator); // currently a singleton - in future, alternative instantiators might come back

    // Utilities for working with requests, components and signals

    /**
     * Fetches JSON data from a given URL and stores the result in a signal.
     * Whilst the fetch is pending, the signal is set to an "unavailable" state.
     * If the fetch fails, the signal is set to an "unavailable" state with an error message.
     *
     * @param {String} url - The URL to fetch JSON data from.
     * @param {RequestInit} [options] - Optional fetch configuration options.
     * @return {signal<any>} A signal containing the fetched JSON data or an "unavailable" state.
     */
    fluid.fetchJSON = function (url, options) {
        const togo = signal(fluid.unavailable({message: `Pending I/O for URL ${url}`}));
        fetch(url, options)
            .then(response => response.json())
            .then(json => togo.value = json)
            .catch(err => togo.value = fluid.unavailable({message: `I/O failure for URL ${url} - ${err}`}));
        return togo;
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
            fluid.effect(function (pathValue) {
                resolve(pathValue);
                this.d(); // Dispose ourselves after triggering - see https://github.com/preactjs/signals/issues/395
            }, [pathSignal]);
        });
    };

};

if (typeof(fluid) !== "undefined") {
    fluidILScope(fluid);
}
