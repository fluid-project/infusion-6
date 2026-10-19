

"use strict"; // import fluid from "./FluidCore.js" const $fluidSignalsScope = function (fluid) { /** * Compares two values for equality, with special handling for numbers and NaN. * - For non-number types, uses strict equality (===). * - For numbers, considers them eq

pasted

Consider the article on fully deferred stabilization at https://ponder.org.uk/post/2026-06-28-fully-deferred-stabilization/, my implementation  and that of alien-signals at https://github.com/stackblitz/alien-signals/blob/master/src/index.ts - by virtue of having eliminated recursion within the notification workflow, alien-signals seems closer to being able to implement this concept than other libraries - that of being able to pull computed updates one at a time, just as we pull effects, and having unified them into a single structure, likely a priority queue. Is there something we can take from alien-signals that might give a clue how to flatten our algorithm - does this data structure need to be explicitised, and what goes into it?

I’ll read the article and the alien-signals source, then compare against your implementation.


Read 2 pages
Read 2 pages
The short answer is that alien-signals hints at the solution but does not provide it. What it externalises is a continuation, not a task. To get fully deferred stabilization, the entries in your structure have to stop being “where I was in a traversal” and become “a unit of work that is ready to run”. Once you do that, the priority queue does exist explicitly, and it is essentially Kahn’s algorithm over edges.

What alien-signals actually externalises
Its system.ts has two traversals, and they are not symmetric:

propagate is the push/mark phase. It walks downward through subs. Each stack entry is a Link meaning “the next sibling I still have to visit”. Marking order does not matter, because marking is idempotent: a node goes from None to Pending and stays there. So this stack could just as well be a plain worklist.
checkDirty is the pull phase. It walks upward through deps with an explicit stack and a checkDepth, but it is still depth-first. It still calls update(dep) inline. And it carries the dirty boolean back across pops: on unwinding it runs update(sub) and then shallowPropagate. That dirty bit is exactly the return value your recursive updateIfNecessary would have passed back through the call stack. alien-signals has kept the call stack’s semantics and only moved it to the heap.
So the iteration does not by itself get you to a queue. A stack frame in checkDirty only makes sense in relation to the frame below it (“resume my parent’s dep list, and tell it whether I changed”). You cannot reorder such entries, interleave several effects’ demands, or pause between them. The article describes swapping the stack for a queue or priority queue as the policy choice. In practice that only works if each entry is independent of the others.

The useful clue: shallowPropagate is the enqueue point
The step in alien-signals that does transfer is the pair update(dep) followed by shallowPropagate(subs). When a node actually changes value, its direct subscribers are promoted from Pending to Dirty, and that is all. This is the unit of work in a fully deferred scheme:

Pop a ready item.
Recompute it.
If the value changed, promote its direct observers.
Any observer whose inputs are now all resolved becomes ready and is pushed.
If something else guarantees the order in which items are popped, checkDirty has nothing left to do. That order is what Jane Street’s Incremental gets from its height-ordered recompute heap. It is also the design your article traces back to Incremental.

What goes into the structure
Heights won’t work directly for you. Incremental keys its heap on topological height. Your graph is bidirectional, with multiple _inEdges per cell and each fit cutting cycles through _consumedSources. So the orientation of the graph is only known per fit, at propagation time, and a static height is not well defined.

Readiness counts per edge do work. You already have the readiness test. findDirtyEdge’s scoring asks whether an edge can fire, meaning all its sources are clean, or the source is the one we were dirtied from. Make that test incremental:

Unit of work: the edge, not the cell. Use (target, inEdge). This is where a multi-edge model differs from alien-signals and Reactively: which edge fires is part of the work.
Per-edge state: an unresolved-source count. During marking, increment it on every edge whose source has just become Check or Dirty, skipping any source in _consumedSources for this fit. When a source resolves, whether changed or confirmed unchanged, decrement it. At zero, the edge is ready.
Per-edge flag: “some source actually changed”. This replaces both the dirty bit that alien-signals carries on its stack and your _dirtyFrom score. When the count reaches zero:
If no source changed, the target resolves as clean without running, and its own observers’ counts are decremented. Early cutoff falls out of this naturally.
If a source did change, the edge goes into the ready queue.
Priority among ready items is pure policy. This is where the Principle of Least Commitment and the “hierarchy of good functions” (information-destroying relations go last) can live. Readiness already guarantees correctness, so priority only affects which correct order you choose. A breadth-first tie-break gives you the breadth-first behaviour the article argues for.
Effects sit in the same queue at the lowest priority. The contextually informed analysis pause point is then simply the state in which the queue contains nothing but effect entries. Every computed is current, no effect has fired, and findCause / _dirtyFrom chains are complete for every queued effect.
alien-signals also needs per-link state for this, which is why its Link is a first-class doubly-linked object carrying dep, sub and version. You will want the same thing: your Edge already exists as an object, and the count and changed flag belong on it. Moving “consumed” from _consumedSources.includes (O(n) on each check) onto a per-link flag would also remove the quadratic markedSources.includes pattern in markStale.

Dynamic dependencies
This is the hard part, and alien-signals does not solve it because it does not need to: an unexpected read inside update just recurses into checkDirty. In a queue model, a computation can get() a newly demanded source that is still Check or Dirty, which means its count was never incremented. Incremental handles this case by raising heights and re-enqueueing.

You already have better machinery for it. Make an unresolved source return an unavailable of a new variety, for example "deferred", carrying its staleValue exactly as "pending" does. Then:

mapSignalArgs makes the consuming edge yield deferred rather than running fn. If the read happens deep inside fn, catch it.
updateDynamicDependencies records the new source anyway, so the edge’s count is incremented and it is re-enqueued when that source resolves.
Your early-cutoff path through _prePendingState and staleValue already handles the case where the value was unchanged after all.
The cost is a wasted partial evaluation each time the dependency set grows. That is the same trade-off Incremental makes. As the article notes, this will be common at startup, when the graph instantiates itself during notification. You could keep a bounded synchronous pull as a fallback for that phase specifically.

Concretely, against your file
markStale: flatten it into a plain worklist. As in alien-signals’ propagate, order is irrelevant. It also becomes the place where edge counts are incremented. The toPending and earlyCutoff branches need care. The early-cutoff branch, which eagerly rewrites _value to staleValue up the graph, is effectively the “resolved unchanged, decrement observers” path above. It can probably be absorbed into that path rather than kept as a separate walk.
commitValue: this becomes shallowPropagate. For each observer, decrement the edge count, set its changed flag, and enqueue it if the count is now zero.
updateIfNecessary and the visited recursion: delete them for the stabilization path. get() on a cell that is not yet resolved returns deferred, or, outside stabilization, drains the queue until that cell resolves. That is a bounded, interruptible version of today’s pull.
findDirtyEdge: its scoring becomes the readiness predicate at enqueue time rather than a search at pull time.
stabilize(): becomes “pop until only effects remain, optionally pause for analysis, then pop the effects”.
Fits: the queue could be global, with the fit as a component of the priority key. Two fits that touch the same cell already merge in enlistInFit, so their entries would simply interleave.
The main thing to establish before committing is whether every orientation decision for a bidirectional edge is fixed by the time it is enqueued. Readiness counting assumes each edge’s source set is known when marking finishes. If the choice of which leg of an arc fires can still change after a sibling edge has run, you would need to recompute counts at that point rather than only decrementing them.

Sources:

Bridging the gap between static and dynamic analysis through fully deferred stabilization
alien-signals src/system.ts
Can you sketch out to me what pattern will appear on alien-signals stack as it runs the update workflow? How actually does what appears on a Reactively-like recursive updateIfNecessary/update stack end up flattened in its implementation? It seems that it doesn't store any separate data structure but relies on extra flags for tagging nodes in progress?

You’re partly right. checkDirty does keep an explicit stack, a singly linked Stack<Link>. But it is very lean because each entry stores only one Link, and most of what a Reactively frame holds is recovered from that link or from a single register. The flags you noticed (RecursedCheck, Recursed) have a different job, covered at the end.

What a Reactively frame holds
A recursive updateIfNecessary(node) frame implicitly carries four things:

The node: which cell this frame is checking.
The iterator: how far through node.sources it has got.
The return value: did the child change, so do I need to recompute?
The return address: which parent’s loop to resume.
How alien-signals packs them
When checkDirty descends from sub into dep, it pushes the Link it descended through:

stack = { value: link, prev: stack };  link = dep.deps;  sub = dep;  ++checkDepth;
That one Link encodes all four items:

Frame item	Where it lives in alien-signals
Node (the parent being resumed)	link.sub
Iterator position	link.nextDep (the dep list is itself a linked list of Links)
Return address	the prev pointer of the stack entry
Return value	one shared dirty boolean, not one per frame
checkDepth is just a counter so the inner unwinding loop knows when it is back at the root.

The single dirty register is the subtle part. It works because the moment any dep is found dirty, the search stops scanning siblings and unwinds immediately. So there is never more than one “did this change?” answer waiting to be used, and it is consumed by the next pop.

Trace of the stack
Graph: signal s → a → b → c ← x ← signal y (unchanged), and effect e reads c. s.set() runs propagate, which marks s Dirty and a, b, c, e Pending (Pending is your Check). Then the effect is pulled with checkDirty(e.deps, e):

step  current link   dep flags         action                         stack (top first)          depth
1     e←c            c: Pending        descend, sub=c, link=c←b       [e←c]                      1
2     c←b            b: Pending        descend, sub=b, link=b←a       [c←b, e←c]                 2
3     b←a            a: Pending        descend, sub=a, link=a←s       [b←a, c←b, e←c]            3
4     a←s            s: Mutable|Dirty  update(s) → changed; dirty=true  (no push)                  3
-- unwind loop --
5     pop b←a                          update(a) → changed; sub=b     [c←b, e←c]                 2
6     pop c←b                          update(b) → changed; sub=c     [e←c]                      1
7     pop e←c                          update(c) → changed; sub=e     []                         0
8     return dirty → caller runs effect e
At its deepest, the stack is exactly the DFS path from the effect down to the changed source, one Link per level. Your recursive version would have one frame per level along the same path.

If b turns out unchanged at step 6, the run takes a different branch:

6'    pop c←b                          update(b) → same; dirty=false; sub=c
link.nextDep = c←x exists        continue top (resume c's sibling scan)
7'    c←x            x: Pending        descend, sub=x, link=x←y       [c←x, e←c]                 2
8'    x←y            y: clean          no nextDep → unwind
9'    pop c←x                          not dirty: clear x Pending; sub=c; c has no nextDep
10'   pop e←c                          clear c Pending; sub=e → return false
This is the iterator half of the frame at work: after an unchanged child, the scan resumes from link.nextDep of the popped entry.

Two things the trace hides
Remaining siblings after a dirty dep are not checked by checkDirty. In the first trace, x is never visited. update(c) just runs c’s function, which calls x’s getter, which runs its own checkDirty, and that is ordinary JavaScript recursion. Recursion is removed within one check pass, but it comes back each time user code reads another computed.

It stays shallow in the common case because each pass brings a node’s previously recorded deps up to date in order, before its function runs. Most reads inside the function then land on nodes that are already clean. Deep nested recursion happens mainly when the function demands a dependency it did not have last time. This is the same dynamic-dependency problem from my previous answer.

shallowPropagate after a changed update. When a node with more than one subscriber changes, all its direct subscribers go from Pending to Dirty. Siblings that are not on the current path then skip their own upward search later. This replaces Reactively’s “mark observers dirty” inside update, and it is the hook a queue-based design would use for enqueueing.

What the Recursed flags are actually for
RecursedCheck is set on a node while its own function is executing and tracking dependencies. Recursed marks a node that was reached by propagate during that time, for example when an effect writes to a signal it depends on. Together with isValidLink, they let propagate decide whether a write that happens mid-execution should re-dirty the running node. The check is: has this link already been re-tracked in the current run? So these flags mark a node as being in progress as a computation, not as being on the checkDirty stack. Nodes on the checkDirty stack carry no special flag; their state is held entirely by the Link entries.

The propagate stack follows the same pattern pointed the other way. Each entry is the next sibling subscriber Link still to visit, and a push happens only when a node has more than one subscriber, so a single-subscriber chain is walked with no stack at all.

For your flattening
Your updateIfNecessary could be ported to this shape almost directly:

Push the (cell, edge, sourceIndex) you descended through.
Keep one changed register.
Stop scanning siblings on the first dirty source.
One part needs adapting: your loop over multiple _inEdges, with findDirtyEdge choosing which to fire. That makes the iterator two-level (edge index, then source index) and turns the return value into an edge choice. Storing an Edge plus an index per entry covers both.

That port still gives you a depth-first stack, not a queue. It is the right first step, though, because it makes visible every piece of state a queue entry would have to carry independently.


"use strict"; const $fluidILScope = function (fluid) { const $m = fluid.metadataSymbol; const $t = fluid.proxySymbol; const $u = fluid.unavailableSymbol; // A function to tag the types of all Fluid components fluid.componentConstructor = function () {}; fluid.s

pasted

In using fluid.cell to implement the substrate in I am starting to wonder whether this notion of cyclicity, as seen for example in the self-dependence of layers recruited in upgradeDynamicLayers might not really be a kind of pun. Certainly I'm starting to feel that the traditional representation of reactive nodes as separately embodied objects with a standard structure - sources, observers, and edges, is prohibitive for this kind of machinery. The use of shorthands such as "tick counts" for scopes whose interdependence seems too tangled and expensive to represent as a materialised graph structure seems to hint that it might be a lot better to make a lot of this dependence structure "moral" rather than literal-mindedly laid out as a reactive graph, for a lot of the substrate's book-keeping. A fully deferred stabilization algorithm also seems consonant with this - the notion that on finding a node invalidated by a morally cyclic dependency such as a self-reaction which accumulates a further layer on itself, one simply cranks the handle on a linear list of activities, possibly with reordered priorities, rather than getting lost in updates and allocations in a rather expensive graph representation. I had used to think that because representing dataflow amongst the user's own data required such a reactive system, and that there seemed to be a family resemblance between this and the requirements of operating the substrate, that one should use a common representation and mechanism for both, but after getting some distance into the implementation I am not liking what I see in the furious interdependencies and expensive book-keeping in the substrate's reactive graph. It's unclear whether I should soldier on, hoping that flattening out the reactive algorithm and further loosening its requirements will make it more suitable to represent the substrate, and hoping to find massive economies in the subscriptions which are really required in the graph, or else try to increasingly recognise that the substrate's needs represent a kind of "reactive stovepipe" with lots of techniques required which achieve an "as if" reactivity without actually implementing it. For example, there are lots of places where the reactive dependence structure can simply be read off the topology and naming within the substrate rather than needing to be represented explicitly within a reactive graph. I used to think that the "magic sauce" achieved by operating a formal reactive library was glitch avoidance, but with fully deferred stabilization in the picture, where one can always forestall premature notification of effects by simply deferring them, this seems less of a pearl. However, taking advantage of this does seem to require *some* ability to cast the substrate's geometry in some representable reactive terms. The way ahead seems somewhat murky, and I wonder what hints you can see. Have I missed some substantial simplification/unification of these various considerations?

I don’t think you’ve missed a unification that makes the problem go away. But I think you’re putting it in the wrong place. Expecting the user’s data and the substrate to share a node representation is what’s hurting. What they can share is the clock, the scheduler and the unavailable value algebra. A few established bodies of work say this fairly directly.

1. The cyclicity really is a pun, and there’s a formal name for it
   Take upgradeDynamicLayers and dynamicLayerEffect. flatMerged reads the layer names, which yields further dynamic layer references, which resolve to more layers, which feed back into dynamicMergeRecord, which re-triggers flatMerged. That is not a dataflow edge from a node to itself. It says “iteration k+1 of the merge depends on iteration k”. The graph squashes the iteration coordinate flat, and that is where the cycle comes from.

Differential dataflow (McSherry and colleagues) formalises exactly this. Its timestamps are products such as (epoch, iteration). A loop is a nested scope whose inner coordinate counts rounds, and the graph is acyclic in the full timestamp space. Your self-reaction becomes “re-enqueue the same key at the next iteration coordinate”. In a worklist that is trivial. In a materialised graph it needs the hacks you already have: equality cutoff, set called from inside a computed, and _value assigned quietly to suppress notification. Your fully deferred queue is the place where that extra coordinate can live, as part of the priority key.

2. Glitch avoidance is replaced by monotonicity, not just by deferral
   You’re right that deferring effects takes away most of the value of glitch-freedom. But it doesn’t take away all of it, and the remainder is worth naming.

Much of the substrate is monotone over a lattice: layers accumulate, scope entries are registered, unavailable becomes available, query results grow. For monotone computations an intermediate state is an under-approximation: incomplete, never wrong. Order of evaluation then affects only how much work is wasted, not what the answer is. This is the CALM result (Hellerstein): consistency is achievable without coordination exactly when the computation is monotone. It is what licenses you to reorder priorities freely.

The parts that are not monotone are where ordering actually matters:

retraction, such as an empty potentia or a layer being removed;
destruction;
anything that allocates irreversibly.
computeInstance is in that last group. It is an effect disguised as a computed: it allocates a fresh that, increments instanceId and disposes effects. A glitch there is not a wasted recomputation; it is a component built from a half-resolved layer set and then thrown away.

So the requirement narrows to this: run monotone fixpoints to quiescence before any non-monotone or allocating step. That is stratified negation from Datalog. It is also your “hierarchy of good functions”: computations that destroy information go last. Your own principle turns out to be the scheduling rule, and the queue’s priority key could be roughly (stratum, iteration, policy).

3. “Moral” dependencies already have a proven shape: keyed, pull-only, revision-validated memos
   The other strand is Salsa, the query engine underneath rust-analyzer, and the analysis in Mokhov, Mitchell and Peyton Jones, Build Systems à la Carte. In Salsa:

Nodes are memo entries keyed by (query, key). They are not objects with observer lists. A dependency is recorded as a key that was read.
There are no subscriptions at all. A write bumps a global revision counter. On a later read, a memo checks its recorded keys’ changed_at against its own verified_at. This “red-green” walk is your checkDirty, but with nothing pushed.
“Durability” classes let whole regions that rarely change, such as library code, skip validation unless their own coarser revision has moved.
Your scopeTick and ownScopeTick are a hand-made durability revision. They work because reading one tick stands in for a dependency on an entire tangled scope region you would never want to materialise.

The key part of this design that you already have is sites as keys. {shadow, segs}, renderSite, layer names and context names are all stable, addressable names. A substrate dependency can be stored as “I read scope name X as seen from path P” or “I read layer L”. Invalidation then becomes “bump the revision for path prefix P” or “bump layer L”. That is your observation that dependence can be read off the topology and naming, turned into a mechanism: the address is the edge.

What this costs you: validating by pull is proportional to the dependencies of what you demand, not to what changed. That is a good fit for the substrate’s coarse, bursty changes. It is a poor fit for fine-grained user data streaming in. That difference is a reason to keep two node representations rather than force one.

4. The layering I’d suggest
   Tier	Representation	Why
   User dataflow ($compute, $reactiveRoot, live layer)	Real fine-grained cells with edges, as you have now	Changes are frequent and small; push-marking pays for itself; bidirectional relations need explicit edges
   Substrate book-keeping (merge, scope, context resolution, queries)	Keyed memos, revision-validated, dependencies recorded as site/name keys, coarse revisions by path prefix	Dependencies are implied by naming, tangled and churny; materialising them costs more than revalidating them
   Scheduling	One queue shared by both tiers, keyed by (stratum, iteration, policy)	This is where unification pays: one clock, one place where effects wait, one pause point for analysis
   The places where the tiers meet already exist in your code: fetchContextReference, getForComponent and $sitedRef. A user cell reads a substrate memo through a site key, and a substrate memo hands back a user cell as its product.

5. Signs in the current code that “as if” reactivity is already what you’re doing
   updateUnavailableLayers writes _value directly so that “derived signals do not update”. The graph is being fought.
   flatMergedComputer calls dynamicLayerNames.set(...) inside a computed, and scopeEffect calls .set on ticks from inside an effect. These are really task emissions. Under a queue the rule could be simple: any write made during a computation is enqueued for a later iteration coordinate and never propagated immediately. That would make these patterns legitimate instead of hazardous.
   allocateEffectScheduler wraps scheduleEffects in untracked with the comment “God knows what scheduleEffects touches”. That is an honest admission that this is a stratum boundary, not dataflow.
   resolveContext and fetchContextReference allocate fresh cells per call, and inside computeds, which causes graph churn. As memo lookups keyed by (contextName, path) they would cost nothing to allocate.
6. How to find out without committing either way
   Choose one substrate subsystem and convert it as an experiment. Scope resolution is the obvious candidate, because ticks already approximate it:

Replace the resolveContext cell with a memo keyed by (path, context).
Have the memo record dependency keys: the scope revision for each path prefix it walked through on the variableScope prototype chain.
Replace ownScopeTick.set with revision bumps.
Leave the user-facing contract unchanged: a reader still gets a cell, but that cell is backed by the memo.
Then measure allocations and subscriptions against the current version, and check whether the bookkeeping you dislike disappears or simply moves somewhere else. If scope works out, the merge pipeline is the next candidate. Its layer-accumulation fixpoint is where the (stratum, iteration) keying from sections 1 and 2 would get its real test.

To answer your direct question: I’d stop expecting the substrate to be represented reactively, while still requiring it to be scheduled reactively. The common substrate between the user’s data and the framework is the queue, the revision clock, the site address and the unavailable algebra. The real gain from a formal library is not glitch avoidance. It is having one place where all pending change is visible before anything reaches the world. That still holds with this split, and it fits better.

Could there even be some route to doing without "public zebras", that is, nested structures which alternate levels of signals with values? Ever since I saw this pattern in https://github.com/preactjs/signals/discussions/318 it seemed a powerful solution to this kind of issue, but in practice is rather obstructive in reading and processing the structures, as well as a dependency/construction hazard. Given I have so much metadata sitting in the shadowMap etc. could it be conceivable to run all the "as if" reactivity from data structures off to the side like this and stop polluting the actual data representation with them? Could there be a route to this without operating fully immutable updates that would require me to constantly do "clone to root" of the structures during an update?

Yes, I think so, and your code already contains most of the pieces. The general shape is: plain mutable data, a path-keyed side table of revisions, and one write gateway. Reactivity then lives entirely in the shadowMap and its siblings, and the data stays ordinary.

How it would work
1. One write gateway. Every mutation goes through a single function, which you largely have already in setForComponent, the proxy setHandler and the mutating-array wrapper. It does two things:

mutates in place at path P;
bumps revisions in the side table at P’s record in shadowMap.
2. Two revisions per path record.

own: bumped when the value at exactly P is replaced.
subtree: bumped on P and on every ancestor of P whenever anything at or below P changes.
A write therefore costs O(depth) counter increments. This is the same walk that clone-to-root does, but it increments counters instead of allocating copies.

3. Readers record (path, revision kind, revision) as their dependencies. A leaf reader depends on own at its path. A reader that consumes an entire structure, such as flattenSignals, a merge, or anything that iterates, depends on subtree at the root of what it consumed. Validation is the Salsa-style comparison from before, so no subscription objects are needed. If you do want push marking for user-tier cells, the side-table record is where an observer list would go.

4. Computed products are written into the data as plain values. Where a $compute sits today, the data holds its current value, and the side-table record holds the computation and its dependencies. The stabilizer writes results through the same gateway. The instance object becomes a materialised view that you can read, serialise and diff with ordinary code. Signals never appear in it, which removes the zebra.

Why you don’t need clone-to-root
Immutability in reactive systems mostly serves two purposes. Revisions cover one, and the deferred queue covers the other.

Change detection by reference identity. “Did this subtree change?” becomes a comparison of subtree revisions rather than !==. You no longer need a fresh object to signal that something changed.
Consistent snapshots for readers. In-place mutation brings glitches back: a computation could see half of an update. Fully deferred stabilization solves this. Writes issued during stabilization are not applied immediately. They are logged and applied at stratum or iteration boundaries, the same rule I suggested last time for set calls inside computeds. Within a stratum, every reader sees one consistent state of the structure, and you get that without copying anything.
What remains is history. pushHistory needs oldValue, but only for the overwritten piece at P, not a copy of the whole path. A log of (path, oldLeaf, newLeaf) is enough for undo. If you ever need a full snapshot for persistence or comparison, take it at a fit boundary, when the structure is quiescent.

Prior art
Solid’s stores are the closest existing design. The data is plain objects, and the per-property signals live in a hidden side map attached under a symbol, created lazily on first tracked read. Mutation happens in place through setters or produce, with no cloning. That is “no public zebras” in practice.

The difference is that Solid keys its side table by object identity. You would key it by path or site, which suits you better: your addressing, renderSite, layer maps and history are all path-based. Path keying also survives a subtree being replaced wholesale, such as a layer being re-merged, where identity keys would leave orphaned signals behind.

Hazards to design around
Escaping references. If anything holds a raw subobject and mutates it directly, the revisions miss the change. Your proxies already handle this for writes, because every write through proxyMat goes to the gateway. In development builds you could also freeze objects handed out to untracked readers, so that a direct mutation fails loudly instead of slipping past silently.

Reads become cheap, but tracking still needs a hook. Untracked reads, such as serialisation or user code outside a computation, can read the raw object directly with no proxy at all. Only tracked reads need to record dependencies. The proxy get handler can do that recording when CurrentReaction is set, and otherwise behave as a thin pass-through.

Arrays and path instability. A splice renumbers paths, so path-keyed revisions move to the wrong elements. You can treat an array either:

as a single leaf: any change bumps the array’s own, and readers of elements depend on the array; or
as keyed by stable ids, which $for/componentList already gives you via subKey.
Most substrate arrays seem to be the first kind. Component lists are the second kind and already have keys.

Granularity of subtree. Large structures where readers usually want one deep path will see spurious invalidation if those readers depend on an ancestor’s subtree. The fix is to read at the finest path you actually need. It is worth arranging flattenSignals’s replacement so that it records the paths it actually traversed, not just the root.

Where it lands relative to the previous design
This is the same split as before, now with a concrete data model:

The data is plain and mutable, owned by the substrate, and readable by ordinary code.
The shadowMap holds everything reactive: revisions, computations, recorded dependencies, products and proxies.
The queue guarantees that no reader sees a mutation while a stratum is in progress, which is what immutability used to provide.
One prediction worth checking: the $sitedRef / deSignalToSite / deSignalToUltimate machinery, which you flagged as broken in a TODO, exists largely because signals and values alternate in the structure. If the data contains only values, a sited reference reduces to a path plus a revision lookup, and most of that machinery should no longer be needed. That would be a good first indicator of whether the approach pays for itself.

Well I am finding that path keying has its own issues and that I already need something a little closer to "object identity". This is the same issue you've just described as "path instabilility", I think. Right now I have an issue in an app driven off a filtered list as so:
filteredTodos: {
$compute: {
func: (filters, todos) => {
console.log("Got filters ", filters);
return todos.filter(todo => filters.every(filter => filter.accept(todo)));
},
args: ["{filters fluid.demos.filter}", "{self}.todos"]
}
},
and I'm getting ridiculous updates based on effects like these attached to the items:
selectEffect: {
$effect: {
func: (selection, itemIndex, assignItem) => assignItem(itemIndex, selection === "<none>" ? null : selection),
args: ["{self}.selection", "{itemIndex}", "{todoList}.assignItem"]
}
}
What happens it that the context reference to {self} dereferences to a sited ref to the path of the item, which as the array shuffles up unreasonably ends up referring to a different one and corrupting it. This code itself is an epicycle of other faults in the system - we should be able to project a write on any derived data back to the source data, but all the same such a ridiculous thing should not happen. But this implies being able to make path names derived from identity rather than accidental siting. I had been inspired in this by Boxer's naive realism but Boxer has no reactivity and also makes no substantial use of path expressions to constitute identity. So it feels like we need to go somewhat towards Solid's notion of keying things from object identity - how is this done, via Maps or so? I guess it gives rise to no publicly expressible addresses or paths through the structure.
Path keying works well within a component, where names achieve semantic alignment between merging layers, and less well between components especially in array-like structures and we need a better solution for that.
But the key thing transferred from Boxer is the notion of scopes, which is what enables cooperating clusters of components to be rebased to other locations without their symbolic inter-references (expressed via strings/scope references) losing their meaning. And it's interesting that the machinery of operating these scopes was the least amenable to traditional reactivity.

The bug you describe is the distinction Solid draws between its two list primitives, and that distinction points to the fix. Your diagnosis is right: positional siting has leaked into identity.

How Solid keys by identity
Solid stores attach their machinery to the raw objects themselves, using symbol-keyed properties. The proxy for an object is cached on that object, and the per-property signal nodes live in a hidden record, also on the object, created lazily on the first tracked read. Where an object can’t take properties, a WeakMap from object to record does the same job. So the address of a reactive node is effectively “this object, this property name”. There is no path from any root, so you’re right that nothing like a public address exists.

The more useful lesson is in its list rendering. Solid has two primitives:

<For> keys each child by item reference. The item is fixed for the child’s lifetime, and the index is a signal that changes as the list shuffles.
<Index> keys each child by position. The index is fixed, and the item is a signal that changes underneath it.
Your componentList is <Index>. pushSubcomponentPotentia(listShadow, subKey, ...) uses the array index as the member name, so the child’s shadow, its path and every sited ref beneath it belong to position 3, not to this todo. When the filter removes an earlier item, position 3 receives a different todo. The selectEffect that was bound there then writes its selection into whatever itemIndex now refers to, which is the corruption you’re seeing. The todo-list app needs <For> semantics: the child is the todo, and itemIndex is a derived value.

The general principle: root addresses at the nearest stable identity
You don’t have to choose between paths and identity. An address can be an identity anchor plus a relative path:

Within a component, paths do what you said they do well: names give semantic alignment across merged layers.
Between components, and in collections, the segment that crosses from one to the next should be a key, not a position.
This is your scope insight applied to collections. A scope reference like {todoList} already resolves relative to an anchor rather than from the global root, which is what makes clusters rebasable. {self} is meant to work the same way. It only breaks because the item’s shadow, which acts as its anchor, was minted by position.

Concretely for $for
Allocate list children under a stable key, not the array index:
by default, the item’s object identity, mapped through a WeakMap to a minted id the first time the object is seen;
optionally, a declared key, such as a keyBy: "id" member on the $for record, when items carry a domain id.
The member name under listShadow then becomes that key.
Make the index a value supplied by the scope, not part of the address. Bind {itemIndex} in variableScope to something that updates when the list reorders, rather than baking it into the child’s identity. The effect keeps working; it just stops being the thing that determines identity.
Reconcile by key. On each re-run of componentList:
keys still present keep their shadow, with an updated value/index scope;
new keys get pushSubcomponentPotentia;
keys that have gone get the empty potentia.
Your goneKeys logic already has this shape; it just compares positional keys.
Addresses stay expressible, because the minted or declared key is a string. Something like {todoList}.list#t42.selection names the same todo whatever the filter does.

Why identity survives your filter, and where it won’t
todos.filter(...) returns the same object references, so identity keying survives filtering, sorting and re-filtering with no extra work. That is the property you need.

It fails as soon as a derivation creates fresh objects, for example a map that builds view records. Then identity has to be carried explicitly, through a declared key or by the derived record pointing back to its source object.

That link back to the source is also the hook for your write projection. If a derived element carries its source identity, a write to filteredTodos[k].selection can be routed to the source todo by identity rather than by position. The assignItem(itemIndex, …) epicycle then becomes a plain write on the item, which the gateway routes back to the source. So the identity key and the provenance link are one mechanism.

This also ties back to the previous design. In-place mutation preserves identity, whereas immutable updates create a new object on every write and destroy it. That is a second reason the path-and-revision side-table design (where identity-keyed records would now live alongside path-keyed ones) is better off without clone-to-root.

On scopes being the least amenable part
I think that is a real finding, not an implementation accident. Resolving a scope name depends on the absence of any closer binding: adding a name nearer in the chain silently changes what a distant reference means. That is shadowing, and it is non-monotone, so it sits in exactly the stratum where ordering matters. Fine-grained subscriptions can’t express it cheaply, because the dependency is “nothing appeared between here and there”. Ticks and revisions can, by coarsening it to “this region of the chain changed”.

So the substrate’s addressing ends up with three components, each with its own invalidation regime:

Component	Example	Invalidated by
Scope name → anchor	{todoList}	Scope-region revisions (non-monotone, coarse)
Key within a collection	#t42	Key reconciliation
Path within a component	.selection	Per-path own/subtree revisions (fine)
Boxer gives you the first component, Solid’s <For> the second, and your layer-merging paths the third.

Can you point to this store construction in Solid with two flags per node? It seems that this naturally coexists with the standard "node with flags and sources/observers" representation in Solid's reactivity, what is the relationship between the two? It seems that Solid just has regular deferred stabilisation rather than FDS, would the alignment be improved by anything like this? Write projection seems to hinge on recognising todos.filter(...) as a kind of "generic algorithm" whose inputs and outputs can be associated, regardless of the object identity in their contents, which is actually something we can do given we have already proxied all array methods. There's a clear analogy between Solid's <For> and my $for - how does Solid deal with object identity in the case where filter returns fresh objects?

I’ll check Solid’s store and list-mapping source rather than describe them from memory.


Read 3 pages
Read 3 pages
First, a correction: the two flags were my proposal, not Solid’s
The own/subtree pair was my design from two answers ago. Solid’s store has nothing that propagates up to ancestors. What it actually hangs on each raw object, under symbol-keyed properties defined with Object.defineProperty, is this:

$NODE: a lazily created map from property name to signal, one per property that has been read under tracking. getNode creates each with createSignal using equals: false and internal: true, and attaches the setter as .$.
$NODE[$SELF]: one extra signal per object for structural change. ownKeys calls trackSelf, and setProperty fires the $SELF node at the end of every write. Anything that iterates the object depends on this signal.
$HAS: a second map of per-property signals for in checks. The has trap tracks it, and setProperty fires it only when a property appears or disappears.
$PROXY: the cached proxy for the object, created by wrap and stored on the raw object itself.
So a store write notifies the property’s own node, its $HAS node on add or delete, and the object’s $SELF, and nothing above that. A deep reader gets a “subtree” dependency only because reading a.b.c through the proxies tracked a.b and b.c at each level on the way down. Something that reads a whole structure, such as JSON.stringify on the store, subscribes to every node it touches. That is Solid’s trade-off: no ancestor bookkeeping on write, potentially many subscriptions on read. My subtree revision does the reverse: O(depth) work per write, and a single dependency for a whole-structure reader.

How the store relates to the core node representation
The relationship is very simple: the store is a side table of ordinary signals. Each DataNode is a standard Solid signal with the usual sources, observers and flags. The store contributes three things:

Lazy allocation, only under tracking. In the get trap, a node is created only when getListener() is non-null; otherwise the raw value is returned directly. Untracked reads cost almost nothing, and no graph exists for data nobody observes.
Addressing by object identity. The node table lives on the raw object, so identity is the address. There are no paths.
One write gateway. The proxy’s set trap refuses writes with a dev warning; writes go through setStore → updatePath/updateArray → setProperty, inside batch. setProperty mutates the raw object in place and then fires the relevant nodes. produce provides Immer-style mutation by giving you a second proxy whose set trap calls setProperty.
That is the “reactivity off to the side, no public zebras” design, done with identity keys rather than paths. The reactive core is untouched; the store is purely an allocation and addressing policy layered over it.

Would fully deferred stabilization improve the alignment?
What I fetched is Solid 1.x on main, which batches writes and then runs effects. Solid 2.0’s stores are a substantially different design, and I haven’t checked their source, so I won’t characterise them.

For the 1.x design, FDS would change little in the store itself. setProperty firing a node becomes “mark and enqueue”, like any other signal.

The gain is at mapArray, the helper behind <For>. Each run of mapArray is a reconciliation that creates and disposes reactive roots: allocating, non-monotone work. If the list it reads passes through intermediate states during one update, for example todos changes and then filters changes, each state can cause roots to be created and then thrown away. Under FDS with strata, you would run the list’s upstream derivation to quiescence first and reconcile once. That is the same churn you are seeing with computeInstance, and componentList would get the same benefit, since it is your mapArray.

How Solid handles fresh objects
It doesn’t, at the <For> level. mapArray builds a Map from item to new index and looks up each old item in it; an old item with no match has its disposer called, and an unmatched new item gets a fresh root via createRoot(mapper). Matching is by ===, so a list of freshly constructed objects destroys and recreates every row on every update. The index is passed to the row as a signal, created in mapper and updated when a row moves.

Solid restores identity upstream, at the point where data enters the store, with reconcile. Its key option defaults to "id", and applyState matches previous and incoming array elements by that key as well as by reference, using the same prefix, suffix and index-map algorithm as mapArray. When a key matches, it keeps the previous object at that position and recurses into it with applyState, so the fields of the fresh object are written into the existing one. Downstream, <For> then sees the same references as before.

So Solid’s division of labour is:

Stage	Solid mechanism	Identity rule
Ingress of fresh data	reconcile({key})	Domain key; previous objects are kept and patched in place
Derivation (filter, etc.)	Plain JavaScript	Selections preserve references for free
List rendering	mapArray / <For>	=== on whatever arrives
Identity is established once, at the boundary, and everything downstream assumes it.

Write projection as generic algorithms
I think this is a stronger idea than identity keying, and it fits how your array access is already intercepted. The relevant literature is bidirectional transformations, specifically relational lenses (Bohannon, Pierce and Vaughan). In that work, select (which is filter) is a lens with a well-behaved put: a write to an element of the view goes back to the corresponding row of the source. The useful step is to classify array operations by what their output is relative to their input:

Class	Operations	Output elements	Write projection
Selection / permutation	filter, slice, find, sort and reverse on copies, toSorted	Aliases of input elements	Trivial: the provenance is an index map from output position to source position
Combination	concat, spread	Aliases from several sources	An index map to (source, index) pairs
Transformation	map, reduce	New values	Needs a declared inverse or a key; otherwise read-only
For the first two classes, the provenance map is the identity. filteredTodos[k] is todos[provenance[k]], so the item component can be keyed by its source address, something like {self}.todos#7, rather than by its position in the filtered list or by a minted WeakMap id. Two things follow:

The $for reconciliation and write projection become one mechanism. The child anchored at source address todos#7 stays put however the filter reshuffles, and a write to its selection goes to todos#7 by construction. assignItem(itemIndex, …) is no longer needed.
You still need minted ids only for the transformation class. That matches Solid’s position that only truly fresh data needs reconcile with a key.
There is one obstacle in your current code. expandComputeRecord passes mapArg: fluid.flattenSignals, so the todos that reaches the user’s filter is probably a plain flattened array, or a proxy only if isMatForming holds at that path. For provenance capture to work, the arguments to a $compute need to arrive as proxies whose array methods are intercepted. In particular, filter should return a result tagged with its index map, for example in the shadowMap record of the output site, rather than a plain array. Sorting that out at the flattenSignals boundary is probably the first practical step.

Sources:

solid/store/src/store.ts
solid/src/reactive/array.ts
solid/store/src/modifiers.ts
Investigate the source tree of the current Solid 2.0 RC at https://github.com/solidjs/solid/tree/%40solidjs/web%402.0.0-rc.14 and see if some incarnation of this store concept can be found, and track any issues related to this discussion

I’ll look through the 2.0 RC source for its store implementation.


Ran 8 commands, read a page
Ran 8 commands, read a page
GitHub’s issue search isn’t reachable from here, so I’ll trace issues through the numbers the source itself cites.


Ran 4 commands
Ran 4 commands
The Solid 2.0 RC has a substantially rebuilt store with a written design document, and its core scheduler is now a height-ordered heap. Both bear directly on this conversation. The store package is packages/signals/src/store/, with store.ts, target.ts, projection.ts, reconcile.ts and optimistic.ts; list mapping is packages/signals/src/map.ts; and the design rules are in packages/signals/docs/INTERNALS-STORE-STATE.md.

I couldn’t search Solid’s issue tracker from this session (GitHub search is blocked here). So the issue tracking below follows the issue numbers that the source and test filenames cite, which turned out to cover the relevant ground.

The 2.0 store: a side table that no longer touches your objects
Stamping user objects is explicitly rejected. The design document says the 2.0 store never mutates the user’s objects. It calls the 1.x $PROXY symbol stamp, which I described last time, part of the original complaint, because stamping is itself a visible mutation and fails on frozen objects. Instead:

A StoreTarget record is allocated per object. The proxy wraps the target, not the raw object, and a WeakMap (storeLookup) maps raw object to target.
The target holds the backing (v, the committed raw) and lazily created nodes:
n: per-property value nodes;
h: per-key presence nodes, for in;
k: one container node per object, for iteration, length and $TRACK. It also stores the committed and pending backings, so the core scheduler owns staging, commit and revert;
dk: a deep witness, one node per record that deep() subscribes to instead of one node per path. It is kept separate from k so that list mapping doesn’t re-run on changes to leaf values.
It also has u and pk, a parent pointer and the key within the parent, which is used for copying the path to the root on commit.
So the 2.0 answer to “deep subscribers vs per-leaf subscriptions” is a single per-record witness node, read at each level a deep reader walks. It is close to my subtree revision, but it is not propagated to ancestors on write: the reader still walks down and subscribes to the witness at every level.

The relationship to the core graph
As in 1.x, every store node is a real core signal created through slotSignal. The store adds no reactive machinery of its own. The design document says so directly: a node carries subscriptions and pending values for transitions and optimistic updates through the same core machinery as any signal, and the store keeps no override maps, backup snapshots or separate transaction system of its own. The store is purely a policy for allocating and addressing ordinary nodes, now with identity bound to the target rather than to the raw object. That is the shape I suggested for your shadowMap.

Clone-to-root: 2.0 does it, but at most once per object
Your worry about constant clone-to-root is answered in the design document’s “privatization” rule:

On ingest, the store shares user objects with zero copies.
The first write to an object makes a shallow clone into store ownership, and to do so it first privatizes the chain of ancestors (path copying).
Every later write to that object goes directly in place.
So the lifetime cost is one clone per object ever written, the worst single write is O(depth) shallow clones, and once an object is privatized its writes cost no clones at all. Privatization is deliberately not a reactive event: the proxy’s identity never changes, only the internal backing pointer. For your design, that is a third option between always cloning to root and mutating the user’s data in place.

The issues cited on this path:

#3044: cloning was O(size of the container) per flush. The fix was a pending backing that is a prototype-chain overlay (Object.create(v)), making a flush cost O(keys written).
#3360: weak-collection registration was the dominant cost of a one-key write. It was replaced by an $OWNER symbol stamped only on store-allocated clones, never on user objects. The comment explains that V8’s identity-hash and ephemeron costs were the bottleneck.
Both are useful evidence about the real performance limits of an identity-keyed side table.

The core scheduler is now an Incremental-style height heap
This is the most relevant change for fully deferred stabilization. core/heap.ts keeps a dirty heap bucketed by _height. runHeap pops from the lowest height upward, and adjustHeight re-levels a node whose dependencies have grown taller, then re-enqueues its subscribers. That is Jane Street Incremental’s design, the queue-not-stack structure from the first answer.

Effects ride the same heap. A comment in heap.ts describes the heap visit as their (empty) compute phase, with the callback handed to the user queue only after the pass has committed (#3291). That is very close to the fully deferred pause point: everything is computed, nothing has reached the world yet.

Two things still differ from what you want:

Marking is still recursive. markNode recurses over subscribers.
Priority is purely height. The heap has no slot for policy, stratum, or an iteration coordinate. And Solid’s graph is a DAG with no multi-edge cells, so heights are well defined there; for your bidirectional graph they are not, which is why I suggested readiness counts instead.
Transactions and lanes (held derivations and optimistic layers, for example #3612 and #3733, “under the transaction and revealed with it”) are Solid’s way of withholding a set of changes from the world until they’re committed. It is a different mechanism from fully deferred stabilization, but it targets the same thing you want to analyse: the set of pending effects before any of them fire.

Identity across fresh objects and derivations
mapArray now has three modes: keyed: true (by identity, the default), keyed: false (by index, the old <Index>), and keyed: item => key, a key function. Your $for would want the key-function mode.
reconcile and projections match rows by key (a string or function, "id" by default). Rows that survive keep their proxy identity, and unkeyed rows fall back to matching by position. The identity rules section of the design document says reconcile and projection preserve logical identity, meaning the same proxy, for branches matched by key.
#2903: a mapArray pass can throw part-way through (an async read raises NotReadyError). Every pass therefore builds new rows in temporary arrays and defers removals, committing only once every mapper has succeeded. You need the same discipline in componentList, since pushSubcomponentPotentia allocates part-way through a pass.
On write projection
createProjection is the closest thing to your filtered list: a computed store whose derive writes through a draft. But writes made through a projection land in the projection’s own family, never in the source. A child wraps into the projection’s own map, so one raw object can be wrapped once per family. Solid has chosen against projecting writes back to the source; a projection is a writable derived copy instead.

The chained-backing feature (#3323, and #3767/#3859 on aliasing projection drafts) lets one store’s backing be another store’s proxy, and reads pass through to it. That is a read-side form of provenance, but there is no notion of a filter-style selection whose writes go back to the source. So the relational-lens approach would be original ground rather than a copy of Solid.

Summary against your questions
Your question	Solid 2.0 RC
Reactivity in a side table, no zebras	Yes: a target record per object, keyed by WeakMap; user objects never stamped
Avoiding constant clone-to-root	Path copying at most once per object, then in-place writes; overlay pending backings (#3044)
Deep or subtree dependency	One deep-witness node per record (dk), separate from the structural container node
Queue-based stabilization	Height-bucketed dirty heap; effects deferred until the pass commits (#3291); no policy priority
Identity for fresh objects	Key functions in mapArray, reconcile and projections
Write projection through derivations	Deliberately not done: projection writes stay in the projection
The design document’s section 8b, “Suite-mined rules … rulings needed”, records open design questions their test suites raised. If you want to follow the store’s design debates further, that section and the decision log in section 9 are where they are written down.

So here is a some relevant history - on observing in https://ponder.org.uk/post/2026-02-20-reactivity-for-malleability/ that bidirectionality in user-land was desirable, and that cyclic relationships seemed inevitable in supporting the substrate, I considered that these should be treated by a common mechanism in the reactive implementation. However, the result of this has been hugely wasteful - I now have thousands of reactive nodes with an "inEdges" array with one entry, and I think maybe not even a single one that validly has more. But all the same the original requirement remains, and on the other hand it seems that we largely want to support the substrate's lack of DAG-ness by other means. This suggests the need for a kind of "radical polymorphism" where we intend to morally treat a variety of structures as if they were valid reactive nodes - to start with, traditional node-edges with a single updater, and the rare examples of genuinely bidirectional nodes to support those occasional cases of user-configured cyclicity. And so on the other hand - FluidIL.js filled with examples of what I called "cod reactivity" - that is, effects and computed which manually bashed on "set" to update some other piece of state because I started from preact-signals which didn't support other graph topologies in the first place. But now having implemented fluid.cell supporting free topologies it seems that I don't really want to use it - for the kinds of reasons sketched above, as we see for example in cases like "scope ticks" that there are always going to be kinds of graph structures beyond its effective reach.
What FDS seems to promise is that we can start to comprise cod reactivity as a more officially blessed kind of reactivity, in line with your remark above that what is shared amongst the varieties of reactivity is the scheduler and update/staleness idiom rather than actual reactive node representation per se.
There are many kinds of reactive relationships that one is going to want to honour by means of independent record-keeping - e.g. the fact that update of a layer is going to hit all components which are derived from that layer, rather than being forced to push this record-keeping into the structures of the reactive algorithm. And also it seems to be emerging that there are many kinds of reactive nodes whose identity is completely settled simply by their "address", to the extent that one might not even need to allocate them as objects at all in the first place if they are unreferenced - seeming to emerge from the many kinds of "reactive caches" that the substrate is accumulating that are keyed by some kind of local site path.
The risk of "cod reactivity" was "broken graphs" - that is, graph topology that couldn't be overseen by the reactive engine and so was at risk of glitching. But FDS and a priority-based scheduling system seems to promises us resistance to the harmful consequences of this glitching, and even a somewhat principled route to late-scheduling glitches themselves.
Is there anything supporting this that we can learn from Solid or any other art that is out there, and what other observations/risks are on the horizon?


Ran 2 commands
Ran 2 commands
I think your conclusion is sound, and there is good prior art for each part of it. The most useful lesson is from Solid 2.0. It has also concluded that writes made from inside computations, your “cod reactivity”, need to be allowed. But it allows them only through sanctioned channels whose rules the scheduler understands. That is the shape I’d aim for: a blessed form of cod reactivity, not unlimited cod reactivity.

What Solid 2.0 does about cod reactivity
From the RC source:

The default is a diagnostic error. setSignal in core/core.ts reports REACTIVE_WRITE_IN_OWNED_SCOPE when a write happens inside a computation. The message tells you to move the write outside, or to set ownedWrite if it is intentional. So a write from a computation needs an explicit declaration on the target.
Projections are a firewall that makes such writes safe. The header of store/projection.ts explains that the firewall exists so that writes from inside a computation are safe, because the derive owns its leaves. The cost is an ordering obligation: before any value is served through the projection, the derive is brought up to date without the reader subscribing to it. The writes are staged in a draft and adopted when the flush commits.
A latch for missed wakes. REACTIVE_MISSED_WAKE (#3037) records the case where a pass writes to a link that the same pass had already validated, so the node is rerun at the end instead of the wake being silently lost. That is the classic failure of cod reactivity, recognised and handled by the scheduler.
The principle behind all three is ownership: a computation may write only to state it owns, or to state that has declared it accepts such writes. That limits where cycles can arise, and it gives the scheduler a place to stage the writes. Your substrate already has a natural owner for everything, the component shadow at a site. A rule like “a cod write may target only state owned by the writer’s site, or a declared channel” would bring most of FluidIL.js into scope. Writes like dynamicLayerNames.set inside flatMergedComputer, or ownScopeTick.set inside scopeEffect, would become declared, staged writes, rather than pokes into some other part of the graph.

Other art that matches the pieces of your plan
Nodes whose identity is settled by their address: Nominal Adapton. Hammer and colleagues (2015) gave memoised nodes first-class names, so that a node in one run is matched to the same node in the next run by its name, not by when it happened to be allocated. Salsa’s interned and tracked structs do the same: an entity created inside a query is identified by its creating query plus its own key, and it is recreated with the same identity on the next run. Both are your observation that a site-keyed reactive cache doesn’t need an object until something refers to it. The address is the node; an object is just a cache of it.

Running down a linear list with reordering: Excel’s calculation chain. Excel recalculates by walking an ordered list of cells. When a formula reaches a cell that hasn’t been calculated yet, it moves the dependent cell later in the chain and continues. The order is learned and saved for the next run. That is “crank the handle on a list, with reordered priorities”, and it has been in production for decades. Build Systems à la Carte calls this a restarting scheduler. Its counterpart is a suspending scheduler, which is what pulling recursively gives you. The restarting kind is the one suited to dependencies that aren’t known in advance, which is the substrate’s normal case.

Bookkeeping kept outside the graph. Your example of “updating a layer affects every component that uses it” is an index in Datalog’s sense: a relation uses(component, layer) that you maintain yourself and query on change, rather than an edge per pair. Semi-naive evaluation is the method for recomputing only what a change touches: each round processes only the facts that were new in the previous round. That is the formal version of a scope tick, or a layer revision, per region.

Glitches pushed to the end, not banned. I covered CALM and stratification earlier. The specific point here is that a glitch in a monotone stratum is harmless if nothing in a later stratum has consumed it yet. Fully deferred stabilization with stratified priority provides exactly that guarantee. So the scheduler doesn’t eliminate glitches; it makes sure they are never observed across a stratum boundary.

A minimal contract for “radical polymorphism”
If many structures are to count morally as reactive nodes, each needs to answer only a few questions. I’d frame this as a protocol, not a shared class:

Question	Classic cell	Bidirectional cell	Address-keyed cache (scope, layer, query)
What is your key?	Object identity	Object identity	Site or name string
Are you current as of revision r?	_state	_state plus fit	Compare recorded revisions
Recompute or validate	Single updater	Choose an edge	Cache function
Who must be woken when you change?	Observer list	Observer list	Readers of the address (log or revalidation)
What did you read? (provenance)	Sources	Sources	Recorded keys
Two observations follow from the table:

The bidirectional cell becomes its own rare node kind. _inEdges arrays, edge choice, fits and _consumedSources move onto that kind only. Ordinary cells go back to a single updater, which addresses the waste you described: thousands of one-element _inEdges arrays.
The bottom two rows are not optional for moral nodes. This is the main risk below.
Risks to plan for
1. Missed wakes are still the core hazard. Fully deferred stabilization protects effects from glitches, but it doesn’t make a stale read safe. Suppose a cod write lands on an address that a computation in the same pass has already read. That computation’s result is now wrong, and nothing will rerun it unless the scheduler knows who read that address. Solid needed REACTIVE_MISSED_WAKE for this even with a full graph. For moral nodes, the minimum requirement is that reads of an address be recorded at least coarsely, as a revision per region, so that writes during a pass can be checked against them. “As if” reactivity that doesn’t record reads gets you back to broken graphs.

2. Contextually informed analysis needs provenance, so moral nodes must record what they read. The analysis your article proposes, explaining every pending effect by its chain back to source data, works only if moral nodes keep provenance as well. allocateEffectScheduler currently runs scheduleEffects inside untracked, and that is exactly where the chain would break: the pause point would exist, but it couldn’t explain why an effect is pending. Recording keys in the side table, even without subscribing, keeps the explanation intact at very low cost.

3. Termination needs a stated guarantee. Cycles made by cod writes are invisible to a graph engine, but a queue can still notice them. Give each iteration coordinate a budget and treat exceeding it as an error. Report the non-converging keys together with their provenance, much as Excel reports a circular reference. Cycles that are monotone, such as layer accumulation, converge by construction. The ones to watch are writes that can retract what was written before: an empty potentia, clearScope, goneShadows.

4. Priority inversion and starvation. Once policy priorities are allowed, a low-stratum task that keeps re-enqueueing, such as a self-accumulating layer that never settles, can starve everything above it. Bound the work per stratum per stabilization, and make “yield to the next stratum” an explicit decision the scheduler records, so it can be seen in analysis.

5. Garbage collection of address-keyed caches. Address-keyed nodes that are never allocated still leave entries behind: memos and recorded dependencies in sitedRefMap, queryILMap and the shadowMap. Salsa needed revision-based eviction for this. Your disposeLayerEffects diffing old and new shadow maps is the natural place to sweep stale entries, since a site that disappears from the new map has been dropped by definition.

6. Interaction with pending values. "pending" and staleValue cross fit boundaries today. Once iteration coordinates exist, a pending value should be stamped with the coordinate it was produced at. Otherwise a value that resolves asynchronously can land in a later iteration and look like a fresh change rather than the completion of an old one. Solid’s lane and transaction machinery, with held stagings and promoted writes, is largely about this problem. It suggests the problem will take real design effort.

A suggested order of work
Write down the protocol (the table above) and make the existing cell one implementation of it. Move multi-edge support into a separate node kind.
Add a declared channel for cod writes. It stages writes for the next iteration coordinate, and in development builds it diagnoses undeclared writes made inside a computation, as Solid does.
Convert scope resolution to address-keyed memos that record what they read, as a test of the protocol’s bottom two rows.
Then move to the queue-based stabilizer. By this point every participant can answer “who read me?” and “what did I read?”, which is all the queue needs.
This order leaves the user-facing dataflow on ordinary cells throughout. The substrate moves over one subsystem at a time, and at each step you can measure whether the bookkeeping has disappeared or just moved somewhere else.

This is the read-only copy that you shared of your chat.
