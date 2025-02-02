/* global preactSignalsCore */

"use strict";

const fluidILScope = function (fluid) {

    // noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
    var {signal, computed, effect} = preactSignalsCore;

    const $m = fluid.metadataSymbol;
    const $t = fluid.proxySymbol;

    // A function to tag the types of all Fluid components
    fluid.componentConstructor = function () {
    };

    // Define the `name` property to be `"fluid.componentConstructor"` as a means to inspect if an Object is actually
    // an Infusion component instance; while being agnostic of the Infusion codebase being present. For example this
    // technique is used in the jquery.keyboard-a11y plugin for `fluid.thatistBridge`.
    Object.defineProperty(fluid.componentConstructor, "name", {
        value: "fluid.componentConstructor"
    });

    fluid.isComponent = function (obj) {
        return obj && obj.constructor === fluid.componentConstructor;
    };

    fluid.freshComponent = function (props) {
        const instance = Object.create(fluid.componentConstructor.prototype);
        fluid.each(props, (value, key) => {
            instance[key] = signal(value);
        });
        if (!instance.$id) {
            const id = fluid.allocateGuid();
            instance.$id = id;
        }

        const shadow = {type: "component", that: instance};
        instance[$m] = shadow;
        return instance;
    };

    // Listed in dependence order
    fluid.frameworkLayers = ["fluid.component", "fluid.viewComponent", "fluid.rendererComponent"];

    fluid.filterBuiltinLayers = function (layerNames) {
        return fluid.remove_if(fluid.makeArray(layerNames), function (layerName) {
            return fluid.frameworkLayers.indexOf(layerName) !== -1;
        });
    };

    fluid.dumpLayerNames = function (that) {
        return " layerNames: " + JSON.stringify(fluid.filterBuiltinLayers(that.layers));
    };

    fluid.dumpThat = function (that) {
        return "{ typeName: \"" + that.typeName + " id: " + that.$id + "\"" + fluid.dumpGradeNames(that) + "}";
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
     * @param {fluid.component} that - The parent component whose children are to be visited.
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
    fluid.visitComponentChildren = function (that, visitor, options, segs) {
        segs = segs || [];
        const shadow = that[$m];
        for (const name in shadow.childComponents) {
            const component = shadow.childComponents[name];
            if (options.visited && options.visited[component.$id]) {
                continue;
            }
            segs.push(name);
            if (options.visited) { // recall that this is here because we may run into a component that has been cross-injected which might otherwise cause cyclicity
                options.visited[component.$id] = true;
            }
            if (visitor(component, name, segs, segs.length - 1)) {
                return true;
            }
            if (!options.flat) {
                fluid.visitComponentChildren(component, visitor, options, segs);
            }
            segs.pop();
        }
    };


    // Bitmapped constants holding reason for context name to be in scope within contextHash and childrenScope
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

    fluid.applyToScope = function (scope, key, value, disposition) {
        const existing = scope[key];
        if (!existing || (disposition & fluid.memberName)) {
            scope[key] = value;
        }
    };

    fluid.cacheLayerScopes = function (parentShadow, that, shadow) {
        return computed( () => {
            const layers = shadow.computer.value.$layers;
            const contextHash = fluid.layerNamesToHash(layers);
            const childrenScope = parentShadow ? Object.create(parentShadow.scopes.value.ownScope) : {};
            const ownScope = Object.create(childrenScope);
            // This is filtered out again in recordComponent
            fluid.applyToContexts(contextHash, shadow.memberName, fluid.memberName);
            fluid.each(contextHash, function (disposition, context) {
                ownScope[context] = that;
                if (shadow.parentShadow && shadow.parentShadow.that !== fluid.rootComponent) {
                    // Note that childrenScope and ownScope should properly be signals too
                    fluid.applyToScope(shadow.parentShadow.scopes.value.childrenScope, context, that, disposition);
                }
            });


            return {contextHash, childrenScope, ownScope};
        });
    };

    fluid.clearChildrenScope = function (parentShadow, child, childShadow, memberName) {
        // TODO: note that peek actually causes computation!!
        if (childShadow.scopes.peek()) {
            const keys = Object.keys(childShadow.scopes.value.contextHash);
            keys.push(memberName); // Add local name in case we are clearing an injected component - FLUID-6444
            keys.forEach(function (context) {
                if (parentShadow.scopes.value.childrenScope[context] === child) {
                    delete parentShadow.scopes.value.childrenScope[context]; // TODO: ambiguous resolution
                }
            });
        }
    };

    /**
     * @typedef {Object} Shadow
     * @property {String} path - The principal allocated path (point of construction) of the component in the component tree.
     * @property {String} memberName - The name of the component within its parent.
     * @property {Shadow} [parentShadow] - The shadow record associated with the parent component.
     * @property {Object<String, fluid.component>} childComponents - A record of child components keyed by their member names.
     * @property {Object} scopes - Cached layer scopes for the component.
     * @property {Object} [injectedPaths] - A record of paths where this component has been injected, keyed by path.
     */

    /**
     * @typedef {Object} DestroyRec
     * @property {fluid.component} child - The child component being cleared.
     * @property {Object} childShadow - The shadow record associated with the child component.
     * @property {String} name - The name of the child component within its parent.
     * @property {fluid.component} component - The parent component from which the child is being cleared.
     * @property {Shadow} shadow - The shadow record associated with the parent component.
     * @property {String} childPath - The fully qualified path to the child component in the component tree.
     */

    /** Clear indexes held of the location of an injected or concrete component.
     * @param {fluid.instantiator} instantiator - The instantiator holding records to be cleared
     * @param {DestroyRec} destroyRec - A "destroy record" as allocated within instantiator.clearComponent
     */
    fluid.clearComponentIndexes = function (instantiator, destroyRec) {
        const shadow = destroyRec.shadow;
        fluid.clearChildrenScope(shadow, destroyRec.child, destroyRec.childShadow, destroyRec.name);
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
            const otherParent = instantiator.pathToComponent[parentPath];
            instantiator.clearComponent(otherParent, fluid.peek(segs), that);
        });
        fluid.clearComponentIndexes(instantiator, destroyRec);
        // fluid.clearDistributions(shadow);

        shadow.lifecycleStatus = "destroyed"; // This will cause proxies to be nulled

        fluid.fireEvent(destroyRec.child, "afterDestroy", [destroyRec.child, destroyRec.name, destroyRec.component]);
    };

    // About the SHADOW
    // This holds a record of IL information for each instantiated component.
    // It is allocated at: instantiator's "recordComponent"
    // It is destroyed at: instantiator's "clearConcreteComponent"
    // Contents:
    //     path {String} Principal allocated path (point of construction) in tree
    //     (value)) {Component} The component itself
    //     contextHash {String to Boolean} Map of context names which this component matches
    //     ownScope: A hash of names to components which are in scope from this component - populated in cacheShadowGrades
    //     childrenScope: A hash of names to components which are in scope because they are children of this component (BELOW own ownScope in resolution order)
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
            pathToComponent: {},
            events: {
                onComponentAttach: fluid.makeEventFirer({name: "instantiator's onComponentAttach event"}),
                onComponentClear: fluid.makeEventFirer({name: "instantiator's onComponentClear event"})
            }
        };

        /**
         * Records the metadata of a component in the component tree and updates its shadow record.
         *
         * @param {fluid.component} parent - The parent component of the component being recorded. Can be `null` for root components.
         * @param {fluid.component} component - The component to record.
         * @param {String} name - The name of the component within its parent.
         * @param {Boolean} created - Whether the component was freshly created (`true`) or injected (`false`).
         */
        function recordComponent(parent, component, name, created) {
            // This is allocated initially in fluid.freshComponent
            const shadow = component[$m];
            shadow.instantiator = that;
            const parentShadow = parent?.[$m];
            const path = parentShadow ? fluid.composeSegment(parentShadow.path, name) : name;
            if (created) {
                shadow.path = path;
                shadow.memberName = name;
                shadow.parentShadow = parentShadow;
                shadow.childComponents = {};
                shadow.scopes = fluid.cacheLayerScopes(parentShadow, component, shadow);
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
                    if (!parentShadow.childrenScope.hasOwnProperty(context)) { // FLUID-6444
                        parentShadow.childrenScope[context] = component;
                    }
                });
            }
            if (that.pathToComponent[path]) {
                fluid.fail("Error during instantiation - path " + path + " which has just created component " + fluid.dumpThat(component) +
                    " has already been used for component " + fluid.dumpThat(that.pathToComponent[path]) + " - this is a circular instantiation or other oversight." +
                    " Please clear the component using instantiator.clearComponent() before reusing the path.");
            }
            that.pathToComponent[path] = component;
        }

        that.recordKnownComponent = function (parent, component, name, created) {
            const parentShadow = parent[$m];
            const existing = parentShadow.childComponents[name];
            if (existing) {
                if (existing !== component) {
                    fluid.fail("Attempt to register component at path ", existing[$m].path, " which has already been used for component ", existing);
                }
            } else {
                parent[name] = component;
                parentShadow.childComponents[name] = component;
                recordComponent(parent, component, name, created);
                that.events.onComponentAttach.fire(component, that, created);
            }
        };

        that.allocateSimpleComponent = function (parent, name, props) {
            const fresh = fluid.freshComponent(props);
            if (parent === null) { // It's the component root
                recordComponent(null, fresh, "", true);
            } else {
                that.recordKnownComponent(parent, fresh, name, true);
            }
            return fresh;
        };


        that.clearComponent = function (component, name, child, options, nested, path) {
            // options are visitor options for recursive driving
            const shadow = component[$m];
            // use flat recursion since we want to use our own recursion rather than rely on "visited" records
            options = options || {flat: true, destroyRecs: []};
            child = child || component[name];
            path = path || shadow.path;
            if (path === undefined) {
                fluid.fail("Cannot clear component " + name + " from component ", component,
                    " which was not created by this instantiator");
            }

            const childPath = fluid.composePath(path, name);
            const childShadow = child[$m];
            const created = childShadow.path === childPath;
            that.events.onComponentClear.fire(child, childPath, component, created);
            const destroyRec = {
                child: child,
                childShadow: childShadow,
                name: name,
                component: component,
                shadow: shadow,
                childPath: childPath
            };

            // only recurse on components which were created in place - if the id record disagrees with the
            // recurse path, it must have been injected
            if (created) {
                if (fluid.isDestroyed(child)) {
                    fluid.fail("Cannot destroy component which is already in status \"" + childShadow.lifecycleStatus + "\"");
                }
                childShadow.lifecycleStatus = "destroying";
                fluid.visitComponentChildren(child, function (gchild, gchildname, segs, i) {
                    const parentPath = fluid.composeSegments(segs.slice(0, i));
                    that.clearComponent(child, gchildname, null, options, true, parentPath);
                }, options, fluid.parsePath(childPath));
                fluid.fireEvent(child, "onDestroy", [child, name || "", component]);
                // fluid.fireDestroy(child, name, component);
                options.destroyRecs.push(destroyRec);
            } else {
                fluid.remove_if(childShadow.injectedPaths, function (troo, path) {
                    return path === childPath;
                });
                fluid.clearComponentIndexes(that, destroyRec);
            }
            if (!nested) {
                delete component[name]; // there may be no entry - if creation is not concluded
                // Do actual destruction for the whole tree here, including "afterDestroy" and deleting shadows
                options.destroyRecs.forEach(function (destroyRec) {
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

        // The component which for convenience holds injected instances of all components with fluid.resolveRoot grade
        instantiator.resolveRootComponent = instantiator.allocateSimpleComponent(instantiator.rootComponent,
            "resolveRootComponent", {$layers: ["fluid.resolveRootComponent"]});

        // obliterate resolveRoot's scope objects and replace by the real root scope - which is unused by its own children
        const rootShadow = instantiator.rootComponent[$m];
        rootShadow.scopes = signal({contextHash: {}, childrenScope: {}, ownScope: {}});
        const resolveRootShadow = instantiator.resolveRootComponent[$m];
        resolveRootShadow.scopes = rootShadow.scopes;

        instantiator.recordKnownComponent(instantiator.resolveRootComponent, instantiator, "instantiator", true); // needs to have a shadow so it can be injected
        resolveRootShadow.scopes.value.childrenScope.instantiator = instantiator; // needs to be mounted since it never passes through cacheShadowGrades
    };

    /* Compute a "nickname" given a fully qualified layer name, by returning the last path
     * segment.
     */
    fluid.computeNickName = function (layerName) {
        const segs = fluid.parsePath(layerName);
        return fluid.peek(segs);
    };

    /** Returns <code>true</code> if the supplied reference holds a component which has been destroyed or for which destruction has started
     * @param {fluid.component} that - A reference to a component
     * @param {Boolean} [strict] - If `true`, the test will only check whether the component has been fully destroyed
     * @return {Boolean} `true` if the reference is to a component which has been destroyed
     **/
    fluid.isDestroyed = function (that, strict) {
        const target = that[$t] ? that[$t] : that;
        return target[$m].lifecycleStatus === "destroyed" || (!strict && target[$m].lifecycleStatus === "destroying");
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
        } /*if (type === "expander") {
            fluid.fail("Badly-formed compact expander record without parentheses: " + string);
        }*/
        return string;
    };

    /*
    fluid.expandCompactString = function (string, active) {
        let rec = string;
        if (string.indexOf(fluid.expandPrefix) === 0) {
            const rem = string.substring(fluid.expandPrefix.length);
            rec = {
                expander: fluid.compactStringToRec(rem, "expander")
            };
        }
        else if (active) {
            rec = fluid.compactStringToRec(string, active);
        }
        return rec;
    };

    */

    /**
     * @typedef {Object} ParsedContext
     * @property {String} context - The context portion of the reference
     * @property {String} path - The path portion of the reference
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
     * @param {fluid.component} self - The component site from which resolution starts.
     * @param {Function} [resolver] - A function dynamically resolving a context name to a local context
     * @return {Signal<fluid.component|undefined>} The resolved component or scope. Returns:
     *   - The target component if `context` is `"self"`.
     *   - The root component if `context` is `"/"`.
     *   - The component or scope corresponding to `context` in the target component's scope chain, if found.
     *   - `undefined` if the context cannot be resolved.
     */
    fluid.resolveContext = function (context, self, resolver) {
        return computed( () => {
            if (context === "self") {
                return self;
            } else if (context === "/") {
                return self[$m].instantiator.rootComponent;
            } else {
                const local = resolver ? resolver(context) : fluid.NoValue;
                if (local === fluid.NoValue) {
                    const component = self[$m].scopes.value.ownScope[context];
                    return component || fluid.unavailable({
                        message: "Cannot resolve context " + context + " from component at path " + self[$m].path,
                        site: self
                    });
                } else {
                    return local;
                }
            }
        });
    };

    fluid.getForComponent = function (component, path) {
        const segs = fluid.pathToSegs(path);
        const flatMerged = component[$m].flatMerged;
        return Object.assign(fluid.getThroughSignals(component, segs, flatMerged), {component, segs, $variety: "$ref"});
    };

    fluid.setForComponent = function (component, path, value) {
        const segs = fluid.pathToSegs(path),
            shadow = component[$m];
        const existing = fluid.get(shadow.liveLayer, segs);
        if (existing) {
            existing.value = value;
        } else {
            fluid.set(shadow.liveLayer, segs, signal(value));
            // Remerge to take account that this top-level prop is now drawn from signal layer -
            // Could be much more efficient
            shadow.potentia.value = Object.assign({}, shadow.potentia.value);
        }
    };

    fluid.fetchContextReference = function (ref, that, resolver) {
        const parsed = fluid.parseContextReference(ref);
        return computed( () => {
            const target = fluid.resolveContext(parsed.context, that, resolver).value;
            return fluid.isUnavailable(target) ? fluid.mergeUnavailable(fluid.unavailable({
                message: "Cannot fetch path " + parsed.path + " of context " + parsed.context + " which didn't resolve",
                path: that[$m].path
            }), target) : fluid.isComponent(target) ? fluid.getForComponent(target, parsed.path) : fluid.get(target, parsed.path);
        });
    };

    fluid.expectLiveAccess = function (shadow, prop) {
        if (shadow.lifecycleStatus === "destroyed") {
            throw Error(`Cannot access member ${prop} of component which has been destroyed`);
        }
    };

    fluid.proxyMat = function (target, shadow, segs) {
        const rec = fluid.getRecInsist(shadow.shadowMap, [...segs, $m]);
        const existing = rec.proxy;
        if (existing) {
            return existing;
        } else {
            const getHandler = function (target, prop) {
                if (prop === $t) {
                    return target.$instance;
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
                    const upSignals = fluid.get(shadow.shadowMap, nextSegs)?.[$m]?.hasSignal;
                    if (upSignals || fluid.isSignal(next)) {
                        const upcoming = fluid.deSignal(next);
                        // Problem here if material goes away or changes - proxies bound to old material will still be out there,
                        // although we do reevaluate our signal target
                        // We need to arrange that any signal at a particular path stays there, which implies we need
                        // rebindable computables
                        // If it is unavailable, we need to ensure that user does not try to dereference into it by next property access
                        return (fluid.isPrimitive(upcoming) || !upSignals) && !fluid.isUnavailable(upcoming) ? upcoming : fluid.proxyMat(next, shadow, nextSegs);
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

    fluid.possiblyProxyComponent = function (value) {
        return fluid.isComponent(value) && value.lifecycleStatus !== "treeConstructed" ? fluid.proxyComponent(value) : value;
    };

    // TODO: patch this into the "resolveMethodArgs" methods
    fluid.proxyComponentArgs = function (args) {
        args.forEach(function (arg, i) {
            args[i] = fluid.possiblyProxyComponent(arg);
        });
    };

    fluid.resolveFuncRecord = function (rec, that) {
        return rec.funcName ? fluid.getGlobalValue(rec.funcName) :
            fluid.isILReference(rec.func) ? fluid.fetchContextReference(rec.func, that) : rec.func;
    };

    // eslint-disable-next-line jsdoc/require-returns-check
    /**
     * Resolve material intended for compute and method arguments - this only expands {} references, possibly into a
     * a local context
     * @param {any} material - The material to be expanded
     * @param {fluid.component} that - Component from whose point of view the material is to be expanded
     * @param {Function} [resolver] - A function dynamically resolving a context name to a local context
     * @return {any} The expanded material, with signals in place of any references discovered
     */
    fluid.resolveArgMaterial = function (material, that, resolver) {
        if (fluid.isPrimitive(material)) {
            return fluid.isILReference(material) ? fluid.fetchContextReference(material, that, resolver) : material;
        } else if (Array.isArray(material)) {
            return material.map(member => fluid.resolveArgMaterial(member, that, resolver));
        } else if (fluid.isPlainObject(material, true)) {
            return fluid.transform(material, member => fluid.resolveArgMaterial(member, that, resolver));
        }
    };

    fluid.resolveComputeArgs = function (argRecs, that, resolver) {
        return fluid.resolveArgMaterial(argRecs, that, resolver);
    };

    fluid.makeArgResolver = function () {
        const that = {
            backing: [],
            resolve: function (context) {
                const argNum = +context;
                return Number.isInteger(+argNum) ? (argNum in that.backing ? that.backing[argNum] :
                    fluid.unavailable({message: "No argument at position " + context + " was not supplied to this method call"})) : fluid.NoValue;
            }
        };
        return that;
    };

    fluid.expandMethodRecord = function (record, that) {
        // Old fluid.makeInvoker used to have:
        // func = func || (invokerec.funcName ? fluid.getGlobalValueNonComponent(invokerec.funcName, "an invoker") : fluid.expandImmediate(invokerec.func, that));
        const func = fluid.resolveFuncRecord(record, that);
        let togo;
        if (record.args) {
            const resolver = fluid.makeArgResolver();
            const argRecs = fluid.makeArray(record.args);
            const argResolver = fluid.resolveComputeArgs(argRecs, that, resolver.resolve);
            togo = function applyMethod(...args) {
                resolver.backing = args;
                // TODO: Only flatten knowably signalised things
                const resolvedArgs = argResolver.map(fluid.flattenSignals);
                const resolvedFunc = fluid.deSignal(func);
                return resolvedFunc.apply(that, resolvedArgs);
            };
        } else { // Fast path just directly dispatches args
            togo = function applyDirectMethod(...args) {
                const resolvedFunc = fluid.deSignal(func);
                return resolvedFunc.apply(that, [that, ...args]);
            };
        }
        return togo;
    };

    fluid.expandComputeRecord = function (record, that) {
        const func = fluid.resolveFuncRecord(record, that);
        const args = fluid.makeArray(record.args);
        const resolvedArgs = fluid.resolveComputeArgs(args, that);
        // TODO: Only flatten knowably signalised things - this implies using the "shadowMap" in the shadow
        const togo = fluid.computed(func, resolvedArgs, {flattenArg: fluid.flattenSignals});
        togo.$variety = "$compute";
        return togo;
    };

    fluid.expandEffectRecord = function () {
        return fluid.effectMarker;
    };

    fluid.expandEffectRecordImpl = function (record, that) {
        const func = fluid.resolveFuncRecord(record, that);
        const args = fluid.makeArray(record.args);
        const resolvedArgs = fluid.resolveComputeArgs(args, that);
        // TODO: Only flatten knowably signalised things - this implies using the "shadowMap" in the shadow
        const togo = fluid.effect(func, resolvedArgs, {flattenArg: fluid.flattenSignals});
        togo.$variety = "$effect";
        return togo;
    };

    fluid.expandComponentRecord = function (record, that, key) {
        const expanded = fluid.readerExpandLayer(record);

        const subLayerRecord = {
            layerType: "subcomponent",
            layer: expanded
        };
        const potentia = {
            layerNames: expanded.$layers,
            mergeRecords: [subLayerRecord]
        };
        // TODO: detect injected reference and take direct path to instantiator

        const computer = fluid.computeInstance(potentia, that, key);
        return computer;
    };

    fluid.effectMarker = fluid.makeMarker("effect");

    fluid.mountSignalRecord = function (handler, record, shadow, segs) {
        const allSegs = [...segs, $m];
        const oldRec = fluid.get(shadow.oldShadowMap, allSegs);
        const rec = fluid.getRecInsist(shadow.shadowMap, allSegs);
        rec.signalRecord = record;
        if (oldRec && oldRec.signalRecord === record) {
            return rec.signalProduct = oldRec.signalProduct;
        } else {
            const product = handler(record, shadow.that, fluid.peek(segs));
            rec.signalProduct = product;
            return product;
        }
    };

    fluid.expandElement = function (that, element, segs) {
        const shadow = that[$m];
        if (fluid.isPlainObject(element, true)) {
            const record = fluid.recordTypes.find(record => element[record.key]);
            if (record) {
                return fluid.mountSignalRecord(record.handler, element[record.key], shadow, segs);
            } else {
                return element;
            }
        } else if (fluid.isILReference(element)) {
            return fluid.fetchContextReference(element, that);
        } else {
            return element;
        }
    };

    fluid.recordTypes = Object.entries({
        "$method": fluid.expandMethodRecord,
        "$compute": fluid.expandComputeRecord,
        "$effect": fluid.expandEffectRecord,
        "$component": fluid.expandComponentRecord
    }).map(([key, handler]) => ({key, handler}));

    fluid.expandCompactElement = function (element) {
        if (typeof(element) === "string") {
            const c = element.charAt(0);
            if (c === "$") {
                const colpos = element.indexOf(":");
                if (colpos === -1) {
                    fluid.fail("Badly-formed compact record ", element, " without colon");
                } else {
                    const type = element.substring(0, colpos);
                    if (!fluid.recordTypes.find(record => record.key === type)) {
                        // TODO: Tests for this branch
                        fluid.fail("Unrecognised compact record type ", type);
                    }
                    const body = element.substring(colpos + 1);
                    const rec = fluid.compactStringToRec(body, type);
                    return {[type]: rec};
                }
            }
        }
    };

    fluid.markSignalised = function (shadowMap, segs) {
        for (let i = 0; i < segs.length; ++i) {
            const seg = segs[i];
            const rec = fluid.getRecInsist(shadowMap, [seg, $m]);
            rec.hasSignal = true;
            shadowMap = shadowMap[seg];
        }
    };

    fluid.expandLayer = function (target, flatMerged, that, shadow, segs) {
        fluid.each(flatMerged, function expandOneLayer(value, key) {
            segs.push(key);
            const uncompact = fluid.expandCompactElement(value);
            const expanded = fluid.expandElement(that, uncompact || value, segs);
            if (fluid.isPlainObject(expanded, true)) {
                const expandedInner = {}; // TODO: Make these lazy and only construct a fresh object if there is an expansion
                fluid.expandLayer(expandedInner, value, that, shadow, segs);
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
        return computed(() => {
            shadow.shadowMap = Object.create(null);

            const {layerNames, mergeRecords} = shadow.potentia.value;
            const memberName = shadow.memberName;

            const resolver = fluid.hierarchyResolver();
            let instanceLayerName;
            if (layerNames.length > 1) {
                // TODO: These layer names should be economised on when they coincide, perhaps could just be guids/hashes of their constituents
                instanceLayerName = parent[$m].path + "-" + memberName;
                // Create fictitious "nonce type" if user has supplied direct parents - remember we need to clean this up after the instance is gone
                fluid.rawLayer(instanceLayerName, {$layers: layerNames});
            } else {
                instanceLayerName = layerNames[0];
            }

            resolver.storeLayer(instanceLayerName);
            const resolved = resolver.resolve(instanceLayerName).value; // <= EXTRA DEPENDENCE ON LAYER REGISTRY COMES HERE
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

                const flatMerged = fluid.makeLayer("flatMerged", shadow.that);
                // Note that we ignore the return value which includes layerMap
                fluid.mergeLayerRecords(flatMerged, layers);
                return flatMerged;
            }
        });
    };

    fluid.scheduleEffects = function (shadow) {
        const expandEffect = newRecord => newRecord.effect = fluid.expandEffectRecordImpl(newRecord.signalRecord, shadow.that);
        fluid.forEachDeep(shadow.oldShadowMap, (oldRecord, segs) => {
            const newRecord = fluid.get(shadow.shadowMap, segs)?.[$m];
            const effectChanged = oldRecord.effect && (!newRecord || newRecord.signalRecord !== oldRecord.signalRecord);
            if (effectChanged) {
                oldRecord.effect(); // dispose old effect
            }
            if (newRecord) {
                if (effectChanged && newRecord.signalProduct === fluid.effectMarker) {
                    expandEffect(newRecord);
                }

                newRecord.proxy = oldRecord.proxy;
            }
        });
        // Instantiate any fresh effects
        fluid.forEachDeep(shadow.shadowMap, (newRecord, segs) => {
            if (newRecord.signalProduct === fluid.effectMarker) {
                const oldRecord = fluid.get(shadow.oldShadowMap, segs)?.[$m];
                if (!oldRecord) {
                    expandEffect(newRecord);
                }
            }
        });
        delete shadow.oldShadowMap;
    };

    fluid.computeInstance = function (potentia, parent, memberName) {
        const parentShadow = parent[$m];
        const instantiator = parentShadow.instantiator;
        const existing = parentShadow.childComponents[memberName];
        if (existing) {
            const shadow = existing[$m];
            shadow.potentia.value = potentia;
            return shadow.computer;
        } else {
            const instance = fluid.freshComponent(potentia.props);

            const shadow = instance[$m];
            shadow.potentia = signal(potentia);
            shadow.liveLayer = Object.create(null);

            shadow.flatMerged = fluid.flatMergedComputer(shadow);

            const computer = fluid.computed((flatMerged) => {
                shadow.oldShadowMap = shadow.shadowMap;
                shadow.shadowMap = Object.create(null);

                fluid.expandLayer(instance, flatMerged, instance, shadow, []);

                return instance;

            }, [shadow.flatMerged]);
            computer.$variety = "$component";
            computer.$instance = instance;

            shadow.computer = computer;

            // At this point there will be fluid.cacheLayerScopes which will start to demand shadow.computer.value.$layers
            instantiator.recordKnownComponent(parent, instance, memberName, true);

            shadow.effectScheduler = effect( () => fluid.scheduleEffects(shadow, computer.value));

            return computer;
        }
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

        const computer = fluid.computeInstance(potentia, instantiator.rootComponent, instanceName);

        const proxy = fluid.proxyMat(computer, computer.$instance[$m], []);
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
        const parentPath = fluid.composeSegments(segs.slice(0, -1));
        const child = instantiator.pathToComponent[path];
        const parent = instantiator.pathToComponent[parentPath];
        instantiator.clearComponent(parent, fluid.peek(segs), child);
    };

    fluid.destroyMethod = function (self) {
        fluid.destroy(self[$m].path);
    };

    fluid.def("fluid.component", {
        events: { // Three standard lifecycle points common to all components
            onCreate: 0,
            onDestroy: 0,
            afterDestroy: 0
        },
        destroy: "$method:fluid.destroyMethod"
    });


    // The grade supplied to components which will be resolvable from all parts of the component tree
    fluid.def("fluid.resolveRoot", {$layers: "fluid.component"});
    // In addition to being resolvable at the root, "resolveRootSingle" component will have just a single instance available. Fresh
    // instances will displace older ones.
    fluid.def("fluid.resolveRootSingle", {$layers: "fluid.resolveRoot"});

    fluid.constructRootComponents(fluid.globalInstantiator); // currently a singleton - in future, alternative instantiators might come back

};

if (typeof(fluid) !== "undefined") {
    fluidILScope(fluid);
}
