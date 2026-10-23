<script>
// The illustration panel of the story time widget, which exists only while {storyTime}.allShort is true

fluid.def("fluid.demos.storyImageGen", {
    // Sited references into the parent's reactive state, so that writes through them reach it
    state: "{storyTime}.state",
    isGenerating: "{storyTime}.state.isGenerating",
    imageError: "{storyTime}.state.imageError",
    buttonLabel: "$compute:fluid.demos.storyImageGen.buttonLabel({self}.isGenerating)",
    error: {
        $component: {
            $layers: "fluid.component",
            $if: "{storyImageGen}.imageError",
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    template: `<div class="story-imagegen-error">⚠️ @{{storyImageGen}.imageError}</div>`
                }
            }
        }
    },
    keyDown: {
        $method: {
            func: (self, e) => {
                if (e.key === "Enter") {
                    self.generate();
                }
            },
            args: ["{self}", "{0}:event"]
        }
    },
    generate: {
        $method: {
            func: "fluid.demos.storyImageGen.generate",
            args: ["{storyTime}.state", "{tldrawHost}.editor", "{storyTime}.hostBounds"]
        }
    }
});

fluid.demos.storyImageGen.buttonLabel = isGenerating => isGenerating ? "Generating..." : "Generate Image";

/**
 * Generate an illustration from the current prompt and place it on the canvas to the right of the widget.
 * @param {Object} state - The storyTime component's reactive state
 * @param {Editor} editor - The tldraw editor, resolved from the tldrawHost component within which the widget is hosted
 * @param {ShapeBounds|null} bounds - The bounds of the storyTime widget as hosted, as received from its tldraw view
 * @return {Promise} A promise which resolves when generation has finished, successfully or not
 */
fluid.demos.storyImageGen.generate = async function (state, editor, bounds) {
    const prompt = state.imagePrompt.trim();
    // The button is disabled while generating, but Enter in the input still arrives here
    if (prompt && !state.isGenerating) {
        state.isGenerating = true;
        state.imageError = "";
        try {
            const assetId = await fluid.demos.agents.generateImageAsset(prompt, {width: 1024, height: 1024});
            const pos = bounds ? {
                x: bounds.x + bounds.w + 50,
                y: bounds.y
            } : editor.getViewportPageBounds().center;
            const {validatedShapes, errors} = fluid.demos.agents.convertAndValidateShapes([{
                type: "image",
                x: pos.x,
                y: pos.y,
                props: {assetId, w: 512, h: 512}
            }]);
            if (errors.length > 0) {
                throw new Error(errors.join("; "));
            }
            editor.createShapes(validatedShapes);
            // Clears the DOM <input> too, through its bound `value`
            state.imagePrompt = "";
        } catch (err) {
            state.imageError = err.message || "Failed to generate image.";
        } finally {
            state.isGenerating = false;
        }
    }
};
</script>

<template>
    <div class="story-imagegen">
        <div class="story-imagegen-header">🎨 Great writing! Generate an illustration:</div>
        <div class="story-imagegen-row">
            <!-- Bound directly to the parent's reactive state so that the user's typing is written back there -->
            <input type="text" class="story-imagegen-input" placeholder="Describe your illustration... 🖌️"
                   value="@{{storyTime}.state.imagePrompt}" disabled="@{isGenerating}" @onkeydown="{self}.keyDown({0})">
            <button class="story-imagegen-button" disabled="@{isGenerating}"
                    @onclick="{self}.generate()">@{buttonLabel}</button>
        </div>
        <div @id="error"></div>
    </div>
</template>

<style>
.story-imagegen {
    margin-top: 10px;
    padding: 12px 16px;
    background-color: #E3F2FD;
    border: 2px solid #90CAF9;
    border-radius: 12px;
    flex-shrink: 0;
}

.story-imagegen-header {
    font-size: 16px;
    font-weight: bold;
    color: #1565C0;
    margin-bottom: 8px;
    text-align: center;
}

.story-imagegen-row {
    display: flex;
    gap: 8px;
    align-items: center;
}

.story-imagegen-input {
    flex: 1;
    padding: 8px 12px;
    font-size: 15px;
    font-family: inherit;
    border: 2px solid #90CAF9;
    border-radius: 8px;
    outline: none;
    background-color: white;
    box-sizing: border-box;
}

.story-imagegen-button {
    padding: 8px 16px;
    font-size: 15px;
    font-family: inherit;
    font-weight: bold;
    color: white;
    background-color: #42A5F5;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
}

.story-imagegen-button:disabled {
    background-color: #90CAF9;
    cursor: not-allowed;
}

.story-imagegen-error {
    margin-top: 6px;
    font-size: 13px;
    color: #D32F2F;
    text-align: center;
}
</style>
