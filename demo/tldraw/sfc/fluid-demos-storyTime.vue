<script>
// Port of a-scratch/react-originals/my-story-time.js

fluid.def("fluid.demos.storyTime", {
    $layers: "fluid.topLevelWidget",
    preferredSize: {
        w: 720,
        h: 640
    },
    state: {
        $reactiveRoot: {
            text: "",
            imagePrompt: "",
            isGenerating: false,
            imageError: ""
        }
    },
    text: "{self}.state.text",
    analysis: "$compute:fluid.demos.storyTime.analyse({self}.text)",
    smiley: "$compute:fluid.demos.storyTime.smiley({self}.analysis)",
    totalCount: "{self}.analysis.totalCount",
    longCount: "{self}.analysis.longCount",
    // No expressions within @{} so derived numbers become computed members
    goodCount: "$compute:fluid.demos.storyTime.subtract({self}.totalCount, {self}.longCount)",
    hasLong: "$compute:fluid.demos.storyTime.isPositive({self}.longCount)",
    allShort: "{self}.analysis.allShort",
    segments: "$compute:fluid.demos.storyTime.segment({self}.text, {self}.analysis)",
    segmentList: {
        $component: {
            $layers: "fluid.demos.storySegment",
            $for: {
                source: "{storyTime}.segments",
                valueAs: "segment"
            }
        }
    },
    // JSX's `cond && (...)` becomes a conditionally existing subcomponent
    imageGen: {
        $component: {
            $layers: "fluid.demos.storyImageGen",
            $if: "{storyTime}.allShort"
        }
    }
});

/**
 * @typedef {Object} SentenceRec
 * @property {String} text - The trimmed sentence text
 * @property {Number} wordCount - The number of words in the sentence
 * @property {Boolean} isTooLong - Whether the sentence exceeds the word limit
 */

/**
 * @typedef {Object} StoryAnalysis
 * @property {SentenceRec[]} sentences - The sentences found in the text
 * @property {Number} longCount - The number of sentences which are too long
 * @property {Number} totalCount - The total number of sentences
 * @property {Boolean} allShort - `true` if there is at least one sentence and none are too long
 */

/**
 * Split story text into sentences and count those which are too long
 * @param {String} text - The story text
 * @return {StoryAnalysis} The analysis of the text
 */
fluid.demos.storyTime.analyse = function (text) {
    const matches = text.trim() ? text.match(/[^.!?]*[.!?]+/g) || [] : [];
    const sentences = matches.map(sentence => {
        const trimmed = sentence.trim();
        const wordCount = trimmed.split(/\s+/).filter(w => w.length > 0).length;
        return {text: trimmed, wordCount, isTooLong: wordCount > 10};
    });
    const longCount = sentences.filter(s => s.isTooLong).length;
    const totalCount = sentences.length;
    return {sentences, longCount, totalCount, allShort: totalCount > 0 && longCount === 0};
};

/**
 * Choose a smiley reflecting the proportion of long sentences
 * @param {StoryAnalysis} analysis - The analysis of the story text
 * @return {Object} The smiley's `emoji`, `color` and `label`
 */
fluid.demos.storyTime.smiley = function (analysis) {
    const longRatio = analysis.totalCount === 0 ? 0 : analysis.longCount / analysis.totalCount;
    let togo;
    if (analysis.totalCount === 0) {
        togo = {emoji: "😊", color: "#4CAF50", label: "Start writing!"};
    } else if (longRatio <= 0.2) {
        togo = {emoji: "😊", color: "#4CAF50", label: "Great job!"};
    } else if (longRatio <= 0.5) {
        togo = {emoji: "😐", color: "#FFC107", label: "Some sentences are long"};
    } else {
        togo = {emoji: "😟", color: "#FF5722", label: "Try shorter sentences"};
    }
    return togo;
};

fluid.demos.storyTime.subtract = (a, b) => a - b;

fluid.demos.storyTime.isPositive = a => a > 0;

/**
 * @typedef {Object} StorySegment
 * @property {String} text - The text of this segment, exactly as it appears in the story
 * @property {Boolean} isTooLong - Whether this segment is a sentence which is too long
 * @property {String} title - Tooltip text for the segment
 */

/**
 * Cut the story text into a sequence of segments which, concatenated, reproduce it exactly - sentences interleaved
 * with whatever whitespace or unterminated text lies between them - for rendering in the highlight layer.
 * @param {String} text - The story text
 * @param {StoryAnalysis} analysis - The analysis of the text
 * @return {StorySegment[]} The segments
 */
fluid.demos.storyTime.segment = function (text, analysis) {
    const segments = [];
    let remaining = text;
    analysis.sentences.forEach(sentence => {
        const idx = remaining.indexOf(sentence.text);
        if (idx > 0) {
            segments.push({text: remaining.substring(0, idx), isTooLong: false, title: ""});
        }
        segments.push({
            text: sentence.text,
            isTooLong: sentence.isTooLong,
            title: sentence.isTooLong ? `${sentence.wordCount} words - try making it shorter!` : `${sentence.wordCount} words - good length!`
        });
        remaining = remaining.substring(idx + sentence.text.length);
    });
    if (remaining) {
        segments.push({text: remaining, isTooLong: false, title: ""});
    }
    return segments;
};
</script>

<template>
    <div class="story-time">
        <div class="story-header">
            <h1 class="story-title">📝 My Story Time! 📝</h1>
            <div class="story-smiley" style="border-color: @{smiley.color}">
                <span class="story-smiley-emoji">@{smiley.emoji}</span>
                <span class="story-smiley-label" style="color: @{smiley.color}">@{smiley.label}</span>
            </div>
        </div>

        <div class="story-editor">
            <div class="story-highlight" @id="segmentList"></div>
            <!-- The bound value is written back to state.text as the user types -->
            <textarea class="story-textarea" placeholder="Start writing your story here... 🌟"
                      value="@{state.text}"></textarea>
        </div>

        <div class="story-stats">
            <span>📖 Sentences: @{totalCount}</span>
            <span>✨ Good sentences: @{goodCount}</span>
            <span class="story-long-count" @class="story-has-long:@{hasLong}">📏 Long sentences: @{longCount}</span>
        </div>

        <div @id="imageGen"></div>

        <div class="story-tip">
            💡 <strong>Tip:</strong> Try to keep your sentences short and sweet!
            Sentences with more than 10 words will turn pink.
            Can you make them shorter?
        </div>
    </div>
</template>

<style>
/* SFC styles are injected globally, hence the story- prefix throughout */
.story-time {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    font-family: "Comic Sans MS", "Chalkboard", cursive, sans-serif;
    background-color: #E8F5E9;
    padding: 16px;
    box-sizing: border-box;
    overflow: hidden;
}

.story-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    flex-shrink: 0;
}

.story-title {
    font-size: 28px;
    font-weight: bold;
    color: #2E7D32;
    margin: 0;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.1);
}

.story-smiley {
    display: flex;
    flex-direction: column;
    align-items: center;
    background-color: white;
    padding: 8px 16px;
    border: 3px solid #4CAF50;
    min-width: 120px;
}

.story-smiley-emoji {
    font-size: 40px;
    line-height: 1;
}

.story-smiley-label {
    font-size: 12px;
    font-weight: bold;
    margin-top: 4px;
    text-align: center;
}

.story-editor {
    flex: 1;
    display: flex;
    flex-direction: column;
    background-color: white;
    border: 3px solid #81C784;
    overflow: hidden;
    position: relative;
    min-height: 0;
}

/* The highlight layer and the transparent textarea above it must share identical text metrics */
.story-highlight, .story-textarea {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    padding: 16px;
    font-size: 20px;
    line-height: 1.8;
    font-family: inherit;
    box-sizing: border-box;
}

.story-highlight {
    white-space: pre-wrap;
    word-wrap: break-word;
    color: #333;
    overflow: auto;
    z-index: 1;
}

.story-textarea {
    border: none;
    outline: none;
    resize: none;
    background-color: transparent;
    color: transparent;
    caret-color: #333;
    z-index: 2;
}

.story-stats {
    display: flex;
    justify-content: space-between;
    padding: 8px 16px;
    background-color: #C8E6C9;
    font-size: 14px;
    color: #2E7D32;
    font-weight: bold;
    flex-shrink: 0;
}

.story-long-count.story-has-long {
    color: #E53935;
}

.story-tip {
    margin-top: 8px;
    padding: 8px 12px;
    background-color: #FFF9C4;
    border: 2px dashed #FBC02D;
    font-size: 14px;
    color: #F57F17;
    text-align: center;
    flex-shrink: 0;
}
</style>
