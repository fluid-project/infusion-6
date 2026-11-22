# Reconciling build systems and reactive algorithms

## User

Consider Mokhov et al's "Build Systems a la Carte" - https://www.microsoft.com/en-us/research/wp-content/uploads/2018/03/build-systems.pdf - and in particular the triage in its section 4.2 between those build systems that use simply a dirty bit, and those which use various kinds of traces. Key to this paper's argument is that there is a clear isomorphism between build systems and reactive systems, of which Excel is the only paradigm example considered in the paper. This paper omits comparison with the wide literature on reactive algorithms, of which Milo Mighdoll's survey at https://milomg.dev/2022-12-01/reactivity is a good example. Milo points out an apparently orthogonal direction for extending simple dirty-bit tracking based on push-pull traversal and various other kinds of extra state to create performant systems which satisfy the quality guarantees of a reactive system (minimality and cutoff).
Can you reconcile these two treatments - in particular, can you exhibit a concrete example of a "verifying trace" for a simple reactive graph, and contrast the algorithms which produce and manipulates it with the class of algorithm treated by Milo.
Mokhov et al clearly deal with systems which exhibit dynamic dependency modifications but how resistant are their systems to arbitrary modifications of the topology of the reactive graph between builds?

## Claude

These two treatments fit together more tightly than either side acknowledges, and the cleanest way to see it is that **Milo's fine-grained reactive algorithms are verifying traces, implemented in-memory, plus an incremental "push" phase that build systems can't have because their store is external.** Let me build that up, then take on the topology question.

## A verifying trace for a reactive graph

Take the exact example Milo uses for the equality-check problem:

```
A = signal(3)        -- input
B = A * 0            -- always 0
C = B + 1
```

The paper defines a verifying trace store via two operations, recordVT :: k -> Hash v -> [(k, Hash v)] -> VT k v -> VT k v and verifyVT, where rather than storing large values, the trace stores only hashes. After an initial build of `C` with `A = 3`, the trace store contains:

```
Trace { key = B, depends = [(A, h(3))], result = h(0) }
Trace { key = C, depends = [(B, h(0))], result = h(1) }
```

Now set `A := 4` and demand `C` under Shake's architecture, i.e. the suspending scheduler composed with the vtRebuilder:

1. `fetch C` → `verifyVT C h(1) …`. To check C's recorded dependency `(B, h(0))`, the verifier's fetch callback must first bring `B` up to date (this recursion is the suspension).
2. `fetch B` → `verifyVT B h(0) …` checks `(A, h(3))`; A is an input whose current hash is `h(4)` ≠ `h(3)`, so verification fails. B's task reruns: `4 * 0 = 0`. `recordVT B h(0) [(A, h(4))]` overwrites the trace.
3. Control returns to C's verification: B's *current* hash is `h(0)`, matching the recorded `(B, h(0))`; C's own stored hash matches. `verifyVT` returns True — **C is not recomputed**. That's early cutoff, exactly the guarantee Milo demands ("C should only ever be run once").

Now put this beside Preact Signals. Preact stores a version number on each node and on each edge of the reactive dependency graph, checks whether the parents of any signal need to be updated before updating that signal, and when A updates, B reruns but does not change its version because it still returns 0, so C does not update. An edge in Preact carrying "the version of B that C last observed" *is* the pair `(B, h(v_B))` in C's trace, with monotone version numbers standing in for content hashes (sound because the runtime is the only writer, so version equality implies value equality — build systems can't assume this, hence hashing). Reactively's coloring is the same trace with even less state: its updateIfNecessary walks up from a "check" (green) node, updates any parent that is actually dirty, and only recomputes if a parent's update actually marked it dirty; if no red node is found, nothing changed and the visited nodes are set uncolored — that up-walk is literally `verifyVT` with the per-dependency hash comparison replaced by "did the parent's update() push a dirty notification to me", i.e. the hash comparison is performed at the producer (value equality check after recompute) instead of at the consumer. Same information flow, transposed.

## So what's actually different?

The paper's two-axis decomposition (scheduler × rebuilder) classifies Milo's zoo rather neatly:

- **MobX's count-based two-pass algorithm** is an eager topological scheduler over the dirty region (the counts are an incrementally-maintained topological sort, like Incremental's height-based priority queue), with the "did any parent change value" flag as the cutoff bit.
- **Preact / Reactively / Solid** are suspending schedulers (lazy, demand-driven, recursing into parents) with a verifying-trace rebuilder. They sit in the same cell of the paper's Table 2 as Shake.

The genuine delta — the thing Milo is right to call an extension — is not the trace, it's the **push phase**, and it exists because of a difference in the environment, not the algorithm. A build system's store is the file system: inputs mutate out-of-band, with no notification, so *every* build must re-verify the entire demanded closure from scratch — `verifyVT` runs O(demanded subgraph) trace checks even when nothing changed. A reactive runtime mediates every write, so it can amortize verification: on write, do an O(affected region) down-pass marking direct children dirty and transitive descendants merely "check"; then a clean node answers a read in O(1) with no verification at all, and a "check" node verifies only along the path to an actual change. The tricolor state is a *memoized verification status* — persistent state recording "this trace was verified as of the last write wavefront." Build systems reinvent exactly this the moment they get change notifications: Tup is the paper's own example, functioning much like Make but with a refined dirty-bit implementation that watches the file system for changes and can thus avoid rechecking the entire graph. Watch-mode Shake and Bazel's file watcher are the same move. So "dirty bit vs. traces" (the paper's axis) and "how the dirty wavefront propagates" (Milo's axis) really are orthogonal — but the second axis is about incrementalizing the *query* over persistent build information, not a rival to it.

Two of Milo's quality criteria also translate with a twist. His "efficiency" (never over-execute) is the conjunction of the paper's minimality and early cutoff. His glitch-freedom, though, has no counterpart in the paper at all: a batch build has no observer that can witness an intermediate store, so glitch-freedom is trivially discharged by the scheduler's ordering obligation. It only becomes a distinct property when effects can fire mid-propagation — which is also why eager systems need the diamond-problem machinery (MobX's counts) that batch builds get for free from topsort.

One more mapping worth naming: reactive libraries keep only the current value per node — they are verifying-trace systems. None of them are *constructive*-trace systems (keeping many `(deps-hashes → value)` entries per key for cross-session or cross-user reuse). The systems that do carry that idea into the reactive/incremental world are Salsa (rust-analyzer's red-green algorithm is verifying traces with revision numbers, essentially Shake-in-memory) and Adapton/Incremental, which the paper itself gestures at via self-adjusting computation in §7.2.

## Resistance to topology modification between builds

Here you have to split "topology change" into three cases, because the trace machinery treats them completely differently.

**Value-induced rewiring** (monadic dynamic dependencies) is handled robustly, and this is the whole point of the design: a trace records the dependencies *actually fetched last run*. If `B1 = IF(C1=1, B2, A2)` and `C1` flips, verification of B1's old trace fails *because C1's hash changed* — C1 is itself in the trace — forcing a rerun, and `track` records the new edge set. The key invariant making this sound is that a task is a pure function of its fetches: the dependency set can only change if some fetched value changed, and every fetched value is in the trace. So arbitrary rewiring between builds is fine *provided the rewiring is a function of tracked values*. Note traces are per-key and self-contained (`key, [(dep, hash)], result-hash`), so there's no global graph representation to corrupt; stale traces for deleted keys just rot harmlessly (a space leak, not a soundness bug). Even the restarting scheduler's calc chain is just an optimisation — the build always succeeds regardless of the initial calc chain, so a wildly stale ordering costs aborts, never correctness.

**Task-induced rewiring** — you edit the formula/rule itself — is where verifying traces are silently unsound, because nothing in `[(k, Hash v)]` mentions the task's code. Edit `C = B + 1` to `C = B + 2` without touching any input and `verifyVT` cheerfully returns True on stale output. The paper knows this and quarantines it as self-tracking (§6.5): the pattern is captured by making the rule for B1 also depend on a key B1-formula — fetch the formula, then interpret it — reifying the task description as an ordinary input so the trace mechanism covers it. Excel does this natively (formula edit sets the dirty bit); Ninja/Bazel hash command lines into the dependency set; and systems using a full programming language, like Shake, face the challenge of implementing equality on arbitrary task functions and fall back on the pessimistic assumption that any change to the build system potentially changes any task — the makefile-depends-on-itself sledgehammer. Reactive libraries dodge this entirely, but structurally rather than cleverly: a node's "task" is a closure whose identity is fixed at creation; "editing a formula" can only mean constructing a new node (dirty by construction) and re-running it, which re-collects its source edges from scratch via the tracking stack. The runtime is *inherently* self-tracking because task mutation and graph mutation are the same operation and both pass through the API. Notice Milo's code even handles the intra-run version of dependency churn explicitly — the loop breaks on the first dirty parent so as not to update a source used last time but not used now — the same last-run-graph-as-hypothesis discipline as a verifying trace.

**Structural pathologies**: cycles introduced by an edit kill the topological scheduler statically (topSort errors) and hang the suspending one unless it carries a dynamic cycle detector (real Shake does; the paper's model assumes acyclicity). And the one rebuilder that is genuinely *not* resistant to topology change is the deep constructive trace: by verifying only against terminal inputs, it bakes in an assumption about the input-to-output path, which is how you get the Frankenbuild — a nondeterministic intermediate rewired out from under a cached result, yielding a store that's incorrect under every definition the paper offers. It's telling that this is also the one trace flavor with no reactive-library analog: deep traces trade away exactly the local, edge-by-edge verification that the push-pull algorithms are built on.

So the reconciled picture: the paper's rebuilder axis tells you *what evidence* you keep that a node is up to date (nothing but a bit, per-edge hashes, or full values); Milo's axis tells you *when you pay* to check that evidence (all-at-once at build time, or amortized across a push wavefront and lazy pulls). Preact's versioned edges, Reactively's colors, and Shake's `.shake.database` are the same evidence at three points on the second axis — and the fragility to out-of-band task mutation is the tax any of them pays the moment part of the system (formulas, files, rules) lives outside the runtime that maintains the evidence.

