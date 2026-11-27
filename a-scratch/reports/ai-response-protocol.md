# A taxonomy of AI responses: design notes

Status as of 2026-11-27: a discussion and survey, with no code changed. It starts with the answer given in conversation
to the question of whether PTF's multipart framing should be extended to carry kinds of action other than layers. It
then surveys the protocol as it stands, and answers the follow-up question of what "native tool calls" would mean for
us.

## 1. The proposal, and how other harnesses do it (the answer as given)

Yes, it's reasonable. It's close to what working harnesses do, with one big difference that changes how I'd design it.

### How Claude Code's harness works, as far as Claude can see it

- **Actions aren't parsed out of the model's text.** A turn is made of free-text blocks plus any number of tool calls.
  Each tool call is a separate structured object: a tool name and JSON arguments checked against a schema the harness
  declared up front. The harness runs each call and sends back a result: success, an error, or file contents. Only
  then does the model continue. So several actions per turn is native, and every action gets an explicit result.
- **Edits aren't diffs.** The edit tool is exact string replacement: `old_string`, `new_string`, and a `replace_all`
  flag. It's rejected unless `old_string` occurs exactly once in the file, and it's refused unless the file has been
  read in this session. There's also a whole-file write.
- **The misapplications you have seen are the model's, not the harness's.** The tool did exactly what it was asked.
  The `new_string` repeated text just outside the `old_string`, or the anchor was chosen wrongly. Because results come
  back, the model can re-read the file and notice. The loop catches it, not the format.
- **Other harnesses:**
  - Aider has the model write SEARCH/REPLACE blocks in plain text and parses them, which is closest to the proposal
    here.
  - OpenAI's Codex uses an `apply_patch` format: a diff anchored on context lines rather than line numbers.
  - Cursor-style tools let the model sketch an edit loosely and have a second "apply" model merge it.

  What they share:
  - **Anchors are content, not line numbers.** Models are bad at counting.
  - **Each action gets a validated result** the model sees.
  - **An action that doesn't match is rejected**, never applied fuzzily.

### The proposal

Using multipart PTF with `Content-Description` as the type of each part is effectively in-band tool calling. That's
legitimate, and it's what Aider does. It also suits Infusion: layers already travel this way, models produce MIME-like
framing reliably, and one stream can carry several typed actions. Grandfathering `layer` as one value among several is
clean. Things to build in from the start:

1. **A small, closed set of part types, each with declared headers:**
   - `text`: echoed to the user;
   - `layer`: goes to the registry;
   - `replace`: a target plus a body;
   - `patch`: search/replace pairs against a named file;
   - `question`: needs the user's answer before going on.

   Reject unknown types, and say so to the model rather than guessing.
2. **Name targets; don't make the model reproduce them.** The harness already knows the selection, so it can tell the
   model the selection exists, e.g. `<fluid-text-selection id="sel1">…</fluid-text-selection>` in the prompt. Then the
   response is just a part with `Content-Description: replace` and `Target: selection:sel1`, whose body is the
   converted markdown. There's no search string, so it can't be misapplied. The harness should check that the
   selection hasn't changed since it was sent; if it has, refuse the edit. Search/replace is kept for edits elsewhere,
   with the exactly-one-match rule.
3. **Results go back to the model.** Report each part's outcome, applied or rejected and why, so the model can correct
   itself next turn.
4. **Decide atomicity per turn.** Either all of a turn's parts apply or none do, or each applies independently with its
   own result. For editor actions, apply all or none, so one undo reverts the turn.
5. **Don't let the framing be faked.** If a part boundary can appear in quoted content, a markdown file holding a
   sample response could be taken as actions. Use a unique per-request boundary, as MIME does.
6. **Plan for native tool calling.** Each part type maps one-to-one onto a tool schema. Define the taxonomy once,
   abstractly, and render it either as PTF part types or as tool definitions. See section 3, which corrects the
   original remark that native tool calls give "schema validation and result handling for free".

## 2. The protocol as it stands

### Transport

`fluid.ai.callEndpoint` (`src/components/askAnything/fluid-ai.js`) POSTs to an OpenAI-compatible
`/v1/chat/completions` endpoint with `{model, messages, stream: false, max_tokens}`, and reads back only
`choices[0].message.content`, plus any `reasoning`, `usage` and `impact`. No `tools` are sent, and no `tool_calls` are
read. There are three services:

- the IFM proxy (`IFM/K2-Horizon-375B-A23B`);
- the Inference Co-op relay, which "accepts only these models":
  - `greenpt/glm-5.3-flash`;
  - `greenpt/deepseek-v4.1-flash`;
  - `regolo/gemma4-31b`;
  - `regolo/mistral-small-4-119b`;
- a local CAVI service, whose models are listed at run time and which defaults to `natai/glm`.

### The exchange loop

`fluid.ai.converse` sends the system prompt, which is rebuilt for every request, together with recent history and the
direction. It hands the reply's text to the assistant's `interpret`. That returns entries for the user, plus problems.
Problems are sent back as a user message, up to `fluid.ai.maxRepairs` (2) times. Changes already applied are kept, and
the AI is told to "send only what is still required". This loop is already the "results go back to the model" of point
3 above, though only failures are reported back, not successes.

### The form of a response

`fluid.ai.arena.responseRules` requires a response to take **exactly one of two forms, never mixed**: text for the
user, or a single PTF document and nothing else. `fluid.ai.arena.parseResponse` tells them apart by the first line
matching `^\s*MIME-Version:`. Anything outside the document is discarded.

### Kinds of part

A part's kind is already its `Content-Description`, as `fluid.ptf.decode` reads it:

| Kind | Where | Effect |
|---|---|---|
| `layer` | top level, or within a `component` | Registers the layer, after compilation, syntax and template checks |
| `component` | top level, a nested multipart | Creates, updates in place, or replaces a widget, according to its nested `potentia` and `live` parts |
| `potentia`, `live` | within a `component` | A widget's configuration, and its live state by path |
| `problems` | sent to the AI only | Diagnostics of a widget. Rejected if the AI sends it |
| `delete` | top level | Removes a widget |
| `selection` | top level, from the editor host only | Replaces the user's selected text with the body |
| `canvas` | top level, from the tldraw host only | Planned by the tldraw demo (`demo/tldraw/js/ai-protocol.js`) |
| `markdown`, `source` | sent to the AI only | The page's source, marked with the cursor or selection. Rejected if the AI sends it |

A host adds kinds through `ArenaHost.planWorkspacePart`, an ordinary function that claims parts it recognises. So the
taxonomy already exists, and is extensible, but implicitly: it's scattered between `planChanges`, each host's function,
and prose in the prompt.

### So the example already has a protocol

`fluid.staticEditing.ai.selectionRules` already tells the model to answer "convert selected HTML markup to its
equivalent in markdown" with a single `selection` part. The selection is sent marked with
`<fluid-infusion-selection>…</fluid-infusion-selection>`. `fluid.staticEditing.ai.replaceSelection` applies the part
to the selection as it stands, as an undoable edit. The AI scenario tests this with a scripted reply, not a real
model. I haven't seen transcripts of real models failing at it, so the following are likely reasons why it doesn't
work "in practice", drawn from the code, not observed failures:

1. **The two forms can't be mixed.** A model that wants to say "here is the markdown, and I dropped an attribute
   markdown can't express" must choose between explaining and acting. Models often choose to explain, and paste the
   markdown as text, which then isn't applied. Only an `assistant` entry carries text to the user, and the summary of
   a change isn't written by the model.
2. **The selection rule is one stanza among many**, all about widgets. The introduction, the response rules and the
   example documents are entirely about layers and components. A `selection` part is a lone exception, described only
   in prose, with no example document.
3. **The kinds aren't listed in one place.** The response rules say a document's top-level parts "may be" `layer`,
   `component` or `delete`. `planChanges`'s message for an unknown kind says "expected layer, component or delete",
   even where the host accepts `selection` too. The model is told one taxonomy and the host accepts another.
4. **The selection is applied as it stands at application time, not as it was sent.** If the user moves the selection
   while the model is thinking, the reply replaces the wrong text. Nothing records what was sent to check against.
5. **Only one target is addressable, the main selection,** and nothing can edit text elsewhere: in the page beyond the
   selection, in another file of the site, or in a widget's element other than by rewriting the whole widget. Edits
   elsewhere are pushed back to the user in text, as the placing rules say.

## 3. "Native tool calls give you schema validation for free": what that meant, and correcting it

**Where is the schema, and who calls the tool?** With native tool calling, as in OpenAI's chat completions `tools`
parameter, which these endpoints imitate, or Anthropic's Messages API:

- **We write the schema.** Each request carries a `tools` array: for each tool a name, a description and a JSON Schema
  of its arguments, e.g. `replace_selection(selectionId: string, text: string)`. It lives in our request, beside the
  system prompt, and would be generated from the same taxonomy as the PTF part kinds.
- **The model doesn't call anything.** It replies with a message whose `tool_calls` each name a tool and carry a
  JSON string of arguments. Its `content` may hold text alongside, so text and actions can be mixed natively.
- **We execute the call.** Our client does, in the panel. We then send each result back as a `role: "tool"` message
  tied to the call's id, and the model continues. Nothing runs on the provider's side. This is the loop that
  `fluid.ai.converse` already runs, with typed messages instead of a repair prompt.

**"For free" overstated it.** What the provider gives depends on how the model is served:

- At best, the serving stack constrains decoding to the schema. OpenAI's `strict` mode, and vLLM's or SGLang's guided
  decoding when enabled, do this, so the arguments always parse and conform.
- Often it's only that the model was trained to emit tool calls and a parser on the server extracts them. A malformed
  call may then come back as plain text, or as arguments that fail the schema.

Either way we still validate everything semantically ourselves: that the layer compiles, that the target exists, that
the selection is unchanged. What native calls do give reliably is **framing**. The provider separates text from calls
and each call from the next, and ties results to calls by id. That removes the class of problems the arena spends most
effort repairing: missing headers, wrong boundaries, unclosed documents, and commentary outside the document.

**Is this about the models registered here? Yes, and it can't be settled from the code.** Two things must hold for
each service:

1. **The model was trained for tool calls.** The families registered are GLM, DeepSeek, Gemma, Mistral and K2. They're
   all published with function-calling support, but I haven't checked the particular versions served.
2. **The service passes them through.** The endpoint must accept `tools` and return `tool_calls`. For a self-hosted
   OpenAI-compatible server such as vLLM, that means being started with a tool-call parser for the model, and the
   Cloudflare relays must forward the fields unchanged. The Co-op relay filters by model; whether it also filters the
   request body, I can't tell without reading `workers/inference-proxy/proxy.mjs` in imerss-cloudflare.

A probe would settle it: one request per model, carrying a single trivial tool, checking whether `tool_calls` comes
back. That calls outside services, so it needs your go-ahead.

**A point in PTF's favour.** Our action bodies are mostly large source texts: SFCs, JavaScript layers, markdown. As a
tool call they must be escaped inside a JSON string. Models get noticeably worse at long code inside JSON strings:
escaping slips, and the code reads worse in logs. MIME bodies carry source verbatim, which is why PTF suits layers. So
the two approaches aren't simply better and worse. Native calls frame small structured actions better, and PTF carries
large verbatim payloads better.

## 4. Recommendation

1. **Make the taxonomy explicit, in one place.** Add a registry of response kinds. Each entry gives:
   - its name, its `Content-Description`;
   - where it may appear;
   - the headers it requires;
   - its prose rule and one example, for the prompt;
   - the function that plans it.

   Hosts would contribute entries instead of `planWorkspacePart` functions. The response rules, the unknown-kind
   message, and any tool definitions are then all generated from the registry, so the prompt can't disagree with the
   parser (finding 3).
2. **Drop the rule of exactly one form.** A response becomes one PTF document whose parts may include `text`: markdown
   for the user, shown in the conversation in order with the change entries. A reply of bare text, with no
   `MIME-Version:` line, is still accepted as a single `text` part, which grandfathers today's text form. The model can
   then explain and act in the same turn (finding 1).
3. **Address targets by ids the harness issues, and check them.** Send the selection as
   `<fluid-infusion-selection id="s1">`, and record the range and text sent under `s1`. A `replace` part names its
   target with a header, `Target: selection:s1`, and is refused if the text at that range has changed (finding 4).
   `selection` stays as an alias for `replace` targeting the only selection. Further targets come the same way: a
   widget's element (`island:<fluid-id>`) or a named file.
4. **Add `patch` only for files the model has been shown,** as search/replace pairs, each of which must match exactly
   once in the file as sent (finding 5). With no line numbers there's nothing for the model to miscount.
5. **Report successes as well as failures,** per part, in the follow-up message. Apply a turn's editor changes as one
   transaction, so one undo reverts the turn.
6. **Protect the framing.** Choose a fresh boundary for each request, and accept only that one, so a document quoted
   in the source the model was sent can't be taken as its reply.
7. **Keep native tool calling as a second rendering of the same registry,** behind a check of each service's support.
   It's worth it for the small structured kinds: `replace`, `delete`, `question`, and `live` updates. Large layer
   bodies stay as MIME parts either way.

The questions this leaves for you:

- whether `question`, a reply that waits on the user, belongs in the first set;
- whether a turn's changes to widgets and to text should be one transaction;
- whether to run the tool-calling probe against the registered services.

## 5. Probe results (2026-11-27)

These were run from the command line against the registered services, with `tools` added to an ordinary request. The
requests were sent with the Origin `https://ponder.org.uk`, and an honest generic client name in place of Python's
default, which Cloudflare blocks. The scripts are `probe.py` and `probe2.py`, in the session's scratchpad.

### Do the models and relays support tool calls?

Yes, all three tested: `IFM/K2-Horizon-375B-A23B`, `greenpt/glm-5.3-flash` and `greenpt/deepseek-v4.1-flash`. Both
relays pass `tools` and `tool_calls` through unchanged. Each model made a correct `replace_selection` call, converting
an HTML selection to markdown. Each made a correct `patch` call on four lines of JavaScript containing `\"`, `\\` and a
template literal: the arguments parsed, and the search text matched the file exactly once. Gemma, Mistral and CAVI's
models weren't tested.

### Is a tool call easier to write than PTF? Resending a whole layer

Each model was asked three times in each dialect for the same change to
`demo/tldraw/sfc/fluid-demos-storyImageGen.vue`, which is 157 lines. The change: add a member, and normalise the prompt
with `.replace(/\s+/g, " ")`, changing nothing else. In the tool dialect, the layer was sent as the `source` argument
of a `define_layer` call. In the PTF dialect, it was a document with one layer part, under the arena's rules for
framing in condensed form. Two of GLM's requests, one in each dialect, timed out at the gateway (HTTP 524), leaving 16
results.

| | Tool call | PTF |
|---|---|---|
| Framing correct | 8 of 8 | 7 of 8. One GLM reply's part had a filename other than the layer's name |
| Code intact: the regex's backslash, the template literal, the SFC's blocks | 8 of 8 | 8 of 8 |
| Minimal edit: 1 line changed and 2 added | 7 of 8. One GLM reply changed 3 lines | 7 of 8. One GLM reply changed 3 lines |
| Stray text, code fences or an unclosed document | none | none |
| Output tokens, including reasoning: median | about 2,000 | about 3,700 |
| Text to the user beside the action | 2 of 8, unprompted | not allowed by the rules |

DeepSeek and K2 were perfect in both dialects. All the variation came from GLM.

What this does and doesn't show:

- **No difference in accuracy.** On this task both dialects were written almost faultlessly. The escaping of long code
  inside a JSON string, the reason for keeping layers in PTF, did no harm in any reply. So the case for keeping layers
  in PTF on grounds of fidelity isn't supported by this evidence.
- **Tool calls were cheaper.** PTF replies used 1.3 to 3 times as many output tokens for the same layer. The figures
  include reasoning, which wasn't separated, so the difference is plausibly spent on getting the framing right, but
  that's an inference.
- **Tool calls allow text alongside an action,** and models sometimes give it unprompted, as K2 and GLM each did once.
- **The sample is small and the task easy:** one layer, one part, and one request with no follow-up. The PTF failures
  the arena's repair loop actually deals with are mostly in nested `component` documents, with their inner boundaries,
  `live` and `potentia` parts. Those weren't tested here, and they're where a schema with separate typed arguments would
  be expected to help most. A fair next test would be a creation needing a layer, a component, and live state, written
  in both dialects.

## 6. The composite test (2026-11-27)

The task: in one direction, create a fresh widget from a fresh layer (a temperature display starting at 21 degrees,
with a button adding a degree), set `counter-1`'s count to 5, and delete `note-1`, in a workspace holding those two
widgets. Each model was asked three times in each dialect.

- **The PTF dialect** was given the arena's own response rules, `fluid.ai.arena.responseRules`, verbatim: nested
  `component` documents with their own boundaries, and `potentia` and `live` parts.
- **The tool dialect** was given four tools: `define_layer`, `create_widget` (with id, layers, potentia and live),
  `update_widget` and `delete_widget`. Its rules were the same in substance, with the same section on template syntax.

PTF replies were read with Python's MIME parser. Both dialects were scored on 8 checks:
- exactly one layer, naming `fluid.topLevelWidget` first, and defining the name it's sent under;
- exactly one widget created, from that layer, starting at 21;
- the counter set to 5;
- only `note-1` deleted;
- no other action.

| | PTF, one request | Tools, one request | Tools, with the tool loop |
|---|---|---|---|
| All 8 checks passed | **9 of 9** | 3 of 9 | **9 of 9** |
| Framing problems: decoding, MIME defects, unparseable arguments | none | none | none |
| Requests per task | 1 | 1 | 2 or 3 |
| Output tokens, per task: GLM | 2488, 1884, 1838 | | 4802, 5679, 2187 |
| Output tokens, per task: DeepSeek | 822, 726, 1079 | | 3363, 1187, 1212 |
| Output tokens, per task: K2 | 1471, 1908, 1278 | | 2187, 1278, 1439 |

In the one-request runs that fell short, every model called `define_layer`, `update_widget` and `delete_widget`, and
deferred `create_widget`. In their own words, they would "build the new widget once its layer exists". They had been
trained to expect a tool loop, in which each call's result comes back before they go on. With the loop, every task was
completed: in the second request, or in the third, which was a closing reply with no calls.

What this shows:

- **No difference in accuracy.** PTF in one request and tools with a loop were both faultless. Even the nested
  documents and boundaries of PTF's hardest case caused no framing problems in any of the 9 replies. All three models
  write the arena's PTF reliably.
- **Here, tool calls cost more.** They took two or three requests instead of one, and each request resends the whole
  system prompt, though some of it may be cached. In 7 of 9 tasks they also took more output tokens. This reverses
  section 5's finding, where a single call resending a layer was cheaper than the PTF document.
- **Tool calls bring sequencing.** Models naturally put a dependency first, and wait for its result before acting on
  it. A failed `define_layer` would be reported before a widget was built on it. PTF applies everything in one go, and
  repairs afterwards.
- **Text with actions came only with tools,** and only because PTF's rules forbid it. Most tool replies opened with a
  sentence to the user. PTF could allow the same with a `text` part.

### Conclusion

The case for changing the transport to tool calls hasn't held up. On the evidence, the registered models write PTF as
reliably as tool calls, in fewer requests. Tool calling's real advantages are:
- a natural loop with a result for each action;
- text alongside actions;
- each action's arguments checked separately.

The first two can be had within PTF: a `text` part, and per-part results in the follow-up message. What the evidence
supports doing first is the part of section 4's recommendation that's independent of the transport:
- the registry of kinds;
- mixed replies;
- targets with checked ids;
- `patch`;
- per-part results;
- a fresh boundary per request.

The registry can render tool definitions later, if a reason to switch emerges, such as a model that writes PTF badly.

## 7. Implemented, within PTF

- **A registry of kinds**, `fluid.ai.arena.partKinds`: `layer`, `patch`, `replace`, `component`, `delete` and
  `text`, with `problems` refused. A host adds kinds through `kinds` (the editor refuses `markdown` and `source`,
  tldraw refuses `canvas`). The unknown-kind message and a prompt stanza listing the kinds and target schemes are
  generated from it. The prose rules for `layer` and `component` are still hand-written.
- **Targets**: `patch` and `replace` carry a `Target: <scheme>:<id>` header, which `fluid.ptf` now encodes and
  decodes as `part.target`. Schemes come from `fluid.ai.arena.targetSchemes` plus a host's `targets`, each listing
  the operations it admits:
  - `layer:<name>` - patch a layer shown in the workspace;
  - `selection:<id>` (editor) - replace the user's selection, sent as `<fluid-infusion-selection id="s1">`;
  - `file:<path>` (editor) - patch the page source sent.
  The editor applies all of a reply's source changes, in order, to a copy of the source as sent, with its markers
  held as private-use sentinels: a SEARCH text copied from the marked source matches, and the selection is still
  found after a patch. The result is written as one change, and refused if the source changed since it was sent.
- **`text` parts**, shown beside the change entry. A document of only text applies nothing.
- **Per-part results** in the repair message.
- **A fresh boundary per direction**, refused if not used.

## 8. Boundary probe

The composite task, with the current rules and a preamble issuing a `reply-xxxxxxxx` boundary, 4 runs per model,
both with the examples' `outer-1` and with a `REPLY-BOUNDARY` placeholder in its place:

| Model | Issued boundary used, first try | Composite checks passed |
|---|---|---|
| K2 | 8/8 | 8/8 in 7 runs, 7/8 in 1 |
| GLM-5.3 flash | 8/8 | 8/8 in all |
| DeepSeek-v4.1 flash | 8/8 | 8/8 in all |

No repair was needed, and the placeholder made no difference, so the strict check stays and the examples are
unchanged. Unprompted, 20 of the 24 replies added a `text` part explaining the change.

Not done: applying a turn's source and widget changes as a single undo (the source edits are one change, the widget
edits that follow are others); tool definitions rendered from the registry.
