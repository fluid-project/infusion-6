# Trial: converting selected markup to markdown in the wend editor

The question: if the user loads ponder's `projects.md` into the wend editor, selects the interior of one of its
`community-desc` blocks, and tells the AI to convert that markup to markdown, does the change get back into the
editor, and does the live view update? Whether the result renders as links depends on blank lines, which are left
to the author (see "What the live view shows").

This tests the revised protocol of `ai-response-protocol.md`, sections 7 and 8:
- `replace` parts with a `Target: selection:<id>` header;
- the editor's checked selection ids;
- a fresh boundary for each direction;
- `text` parts.

## Result

It works. All 12 trials (3 models × 4 blocks) replaced the selection correctly, each in one request with nothing to
correct, and the live view re-rendered the new source every time.

## Method

- **The site.** The extension's test site (`packages/wend-test-site`), built from this checkout, as the extension's
  scenarios build it (`extension/test/harness.js`). Ponder's `content/projects.md` was written into the scratch
  repository before the build.
- **The page.** The extension was activated on `/projects/`, and the editor held `content/projects.md`.
- **The selection.** For each `community-desc` block written in HTML, everything from the line after
  `<div class="community-desc">` to the end of the line before its `</div>`:
  - block 1, Melittoflora;
  - block 3, Math on a Sphere;
  - block 4, GPII;
  - block 6, RSF.

  Block 2, Infusion, is already in markdown, and block 5, Darwin Online, was left out. The source was restored
  before each trial.
- **The direction.** "Convert the selected markup to markdown".
- **The conversation.** It ran through the page's own `fluid.ai.converse`, using an assistant made with
  `fluid.ai.arena.makeAssistant` and the editor's own host and bridge (`fluid.staticEditing.ai.makeHost` and
  `makeBridge`). Node relayed each request to the real model, and gave the documentation from the ponder checkout's
  `content/docs` in place of fetching it.
- **What it bypassed.** The panel's send button, its model chooser and its token handling.
- **The models.**
  - K2-Horizon-375B-A23B, through the IFM proxy;
  - GLM-5.3 flash and DeepSeek-v4.1 flash, through the Inference Co-op relay.
- **Runs.** One per model and block.

## Checks and results

| Check | All 12 trials |
|---|---|
| Requests per trial | 1, with no repair needed |
| What was sent | One `replace` part, `Target: selection:sN`, with the id issued for that selection |
| Outermost boundary | The one issued with the direction |
| Text outside the selection | Unchanged |
| `<a>` tags left in the replacement | None |
| Links | Every href of the selection kept, as `[text](href)` |
| Wording | Unchanged, ignoring link syntax and whitespace |
| The editor's selection afterwards | The replacement |
| Live view | Re-rendered, its text matching the new source |

- **Text parts.** GLM added a `text` part once, for RSF: a one-line account of the conversion, which was shown
  beside the change entry. No other reply held anything but the replacement.
- **Latency.** Most replies took 4–17 s. GLM's RSF reply took 69 s.

An example, from K2 on the GPII block:

```markdown
From 2010 to 2020 I was core framework architect for the [GPII](https://gpii.net/)
(now [Morphic](https://morphic.org/)), an autopersonalization project aiming to automatically adapt technology to meet the
needs and preferences of users. A description of our architecture and goals appeared in a [HCI 2014 paper](https://link.springer.com/chapter/10.1007/978-3-319-07509-9_35).
```

The models kept the original line breaks.

## What the live view shows

The live view shows the markdown as literal text, e.g. `[GPII](https://gpii.net/)`, with no links. This is the
blank-lines issue, left to the author. Each `community-desc` div opens an HTML block, so markdown inside it isn't
parsed unless blank lines separate it from the tags, as they do in the Infusion block of the same file.

The edit arrived and rendered exactly as the source dictates. The author has to add the blank lines to get links.
No model added them, and the prompt doesn't ask them to.

## Not covered

- **No more than one run each.** Repeated runs would give a firmer rate.
- **`file:` patches.** No model chose to patch the source, so neither the `file:` patch path nor the refusal of a
  source that changed after it was sent was exercised by a model. Both are covered only by the scripted scenario,
  `extension/test/ai-scenario.js`, steps 7 and 8.
- **The panel's own UI and token handling.** These were bypassed, as described under "Method".

## Materials

The trial script and its full results are in the session's scratchpad, which is temporary:

- `projects-trial.js`
- `trial-results.json` - each reply, replacement and rendered block

Both are in `/tmp/claude-1000/-home-amb26-Source-gits-bagatelle/d052b978-01cc-45f8-b04f-3af7aae8918e/scratchpad/trial/`.
