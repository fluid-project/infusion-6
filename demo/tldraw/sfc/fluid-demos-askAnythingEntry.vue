<script>
// One entry in the conversation of the "Ask me anything" panel, created by $for over {askAnything}.entries
fluid.def("fluid.demos.askAnythingEntry", {
    // Variable injected by $for, a ChatEntry as described in ai-protocol.js
    entry: null,
    kinds: "$compute:fluid.demos.askAnythingEntry.kinds({self}.entry.kind)"
});

fluid.demos.askAnythingEntry.allKinds = ["user", "assistant", "change", "problem", "error"];

/**
 * Expand the kind of an entry into a flag for each kind, from which the entry's classes are chosen
 * @param {String} kind - The entry's kind
 * @return {Object<String, Boolean>} `true` at the entry's kind, and `false` at every other
 */
fluid.demos.askAnythingEntry.kinds = kind => Object.fromEntries(fluid.demos.askAnythingEntry.allKinds.map(oneKind => [oneKind, oneKind === kind]));
</script>

<template>
    <div class="ask-anything-entry" @class="ask-anything-user:@{kinds.user}, ask-anything-assistant:@{kinds.assistant},
            ask-anything-change:@{kinds.change}, ask-anything-problem:@{kinds.problem}, ask-anything-error:@{kinds.error}">
        <div class="ask-anything-entry-text">@{entry.text}</div>
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
