<script>
// One entry in the conversation of the "Ask me anything" panel, created by $for over {askAnything}.state.entries
fluid.def("fluid.demos.askAnythingEntry", {
    // Variable injected by $for, a ChatEntry as described in ai-protocol.js
    entry: null,
    kinds: "$compute:fluid.demos.askAnythingEntry.kinds({self}.entry.kind)",
    // The AI tends to write its responses in markdown, which is rendered - other entries are rendered as plain text
    body: {
        $component: {
            $layers: "fluid.demos.markdownBlock",
            text: "{askAnythingEntry}.entry.text",
            asMarkdown: "{askAnythingEntry}.kinds.assistant"
        }
    },
    // The elapsed time and token counts of a request to the AI, for a metrics entry added by
    // fluid.demos.askAnything.measureCall
    metrics: {
        $component: {
            $layers: "fluid.component",
            $if: "{askAnythingEntry}.kinds.metrics",
            // The current time, ticking whilst the request is pending
            now: {
                $bindable: {
                    bind: "fluid.demos.askAnythingEntry.bindClock({askAnythingEntry}.entry.finishedAt)",
                    unbind: "fluid.demos.askAnythingEntry.stopClock({boundValue})"
                }
            },
            summary: "$compute:fluid.demos.askAnythingEntry.metricsSummary({askAnythingEntry}.entry, {self}.now)",
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    template: `<div class="ask-anything-metrics">@{summary}</div>`
                }
            }
        }
    }
});

fluid.demos.askAnythingEntry.allKinds = ["user", "assistant", "change", "problem", "error", "metrics"];

/**
 * Expand the kind of an entry into a flag for each kind, from which the entry's classes are chosen
 * @param {String} kind - The entry's kind
 * @return {Object<String, Boolean>} `true` at the entry's kind, and `false` at every other
 */
fluid.demos.askAnythingEntry.kinds = kind => Object.fromEntries(fluid.demos.askAnythingEntry.allKinds.map(oneKind => [oneKind, oneKind === kind]));

// How often the elapsed time of a pending request is updated
fluid.demos.askAnythingEntry.clockInterval = 100;

/**
 * Bind a cell holding the current time, which ticks until a request has finished
 * @param {Number|null} finishedAt - When the request finished, or `null` if it is pending
 * @return {fluid.cell<Number>} A cell holding the current time in milliseconds since the epoch, with a member `timer`
 * holding the interval which updates it whilst the request is pending
 */
fluid.demos.askAnythingEntry.bindClock = function (finishedAt) {
    const clock = fluid.cell(Date.now(), {name: "askAnythingEntry clock"});
    if (finishedAt === null) {
        clock.timer = setInterval(() => clock.set(Date.now()), fluid.demos.askAnythingEntry.clockInterval);
    }
    return clock;
};

/**
 * Stop a clock bound by `fluid.demos.askAnythingEntry.bindClock`
 * @param {fluid.cell<Number>} clock - The clock
 */
fluid.demos.askAnythingEntry.stopClock = function (clock) {
    clearInterval(clock.timer);
};

/**
 * Format a number of tokens for display
 * @param {Number} tokens - The number of tokens
 * @param {Boolean} estimated - `true` if the number is an estimate
 * @return {String} The formatted number
 */
fluid.demos.askAnythingEntry.formatTokens = (tokens, estimated) => (estimated ? "~" : "") + tokens.toLocaleString("en-US") + " tokens";

/**
 * Format the number of tokens sent in a request - the headline figure is those which are not cached, followed by
 * those assumed to be cached since they lie in the prefix of the prompt common to every request
 * @param {MetricsEntry} entry - The metrics entry
 * @return {String} The formatted numbers, e.g. "2,345 tokens (8,012 cached)"
 */
fluid.demos.askAnythingEntry.formatSent = function (entry) {
    const uncached = Math.max(0, entry.inputTokens - entry.cachedTokens);
    const approx = entry.estimated ? "~" : "";
    return `${fluid.demos.askAnythingEntry.formatTokens(uncached, entry.estimated)} (${approx}${entry.cachedTokens.toLocaleString("en-US")} cached)`;
};

/**
 * Summarise the metrics of a request to the AI
 * @param {MetricsEntry} entry - The metrics entry, as described in fluid-demos-askAnything.vue
 * @param {Number} now - The current time in milliseconds since the epoch
 * @return {String} The summary
 */
fluid.demos.askAnythingEntry.metricsSummary = function (entry, now) {
    const elapsed = (((entry.finishedAt ?? now) - entry.startedAt) / 1000).toFixed(1) + " s";
    const format = tokens => fluid.demos.askAnythingEntry.formatTokens(tokens, entry.estimated);
    const sent = fluid.demos.askAnythingEntry.formatSent(entry);
    let togo;
    if (entry.outcome === "") {
        togo = `Waiting for the AI: ${elapsed} - sent ${sent}`;
    } else if (entry.outcome === "failed") {
        togo = `Request failed after ${elapsed} - sent ${sent}`;
    } else {
        const reasoning = entry.reasoningTokens === null ? "" : `, of which ${format(entry.reasoningTokens)} reasoning`;
        togo = `Received ${entry.outcome === "text" ? "text" : "a PTF document"} in ${elapsed} - sent ${sent}, `
            + `received ${format(entry.outputTokens)}${reasoning}` + (entry.estimated ? " (estimated)" : "");
    }
    return togo;
};
</script>

<template>
    <div class="ask-anything-entry" @class="ask-anything-user:@{kinds.user}, ask-anything-assistant:@{kinds.assistant},
            ask-anything-change:@{kinds.change}, ask-anything-problem:@{kinds.problem}, ask-anything-error:@{kinds.error},
            ask-anything-metrics-entry:@{kinds.metrics}">
        <div class="ask-anything-entry-text" @class="ask-anything-markdown:@{kinds.assistant}, ask-anything-hidden:@{kinds.metrics}"><div @id="body"></div></div>
        <div @id="metrics"></div>
        <details class="ask-anything-entry-detail" @class="ask-anything-hidden:!@{entry.detail}">
            <summary>Details</summary>
            <pre>@{entry.detail}</pre>
        </details>
    </div>
</template>

<style>
.ask-anything-entry {
    max-width: 85%;
    margin-top: 10px;
    padding: 10px 12px;
    border-radius: 12px;
    font-size: 14px;
    line-height: 1.35;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    word-break: break-word;
}

.ask-anything-entry-text {
    white-space: pre-wrap;
}

.ask-anything-markdown {
    white-space: normal;
}

/* snarkdown separates blocks with line breaks, so blocks need little margin of their own */
.ask-anything-markdown pre {
    margin: 0;
    overflow-x: auto;
    padding: 6px 8px;
    background-color: rgba(0, 0, 0, 0.05);
    border-radius: 6px;
    font-size: 12px;
}

.ask-anything-markdown code {
    font-size: 0.9em;
}

.ask-anything-markdown ul, .ask-anything-markdown ol {
    margin: 2px 0;
    padding-left: 20px;
}

.ask-anything-markdown h1, .ask-anything-markdown h2, .ask-anything-markdown h3,
.ask-anything-markdown h4, .ask-anything-markdown h5, .ask-anything-markdown h6 {
    margin: 0 0 4px 0;
    font-size: 1em;
}

.ask-anything-user {
    margin-left: auto;
    background-color: #E3F2FD;
}

.ask-anything-assistant {
    margin-right: auto;
    background-color: white;
}

.ask-anything-change {
    margin-right: auto;
    background-color: #E8F5E9;
    color: #1B5E20;
    font-size: 13px;
}

.ask-anything-problem {
    margin-right: auto;
    background-color: #FFF8E1;
    color: #E65100;
    font-size: 13px;
}

.ask-anything-metrics-entry {
    margin-right: auto;
    padding: 4px 10px;
    color: #546E7A;
    background-color: transparent;
    box-shadow: none;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
}

.ask-anything-error {
    margin-right: auto;
    background-color: #FFEBEE;
    color: #B71C1C;
    font-size: 13px;
}

.ask-anything-entry-detail {
    margin-top: 6px;
    font-size: 12px;
}

.ask-anything-entry-detail summary {
    cursor: pointer;
    opacity: 0.8;
}

.ask-anything-entry-detail pre {
    max-height: 240px;
    overflow: auto;
    margin: 6px 0 0 0;
    padding: 6px;
    background-color: rgba(0, 0, 0, 0.04);
    border-radius: 6px;
    white-space: pre-wrap;
    font-size: 11px;
}

.ask-anything-hidden {
    display: none;
}
</style>
