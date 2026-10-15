<script>
// DRAFT port of a-scratch/image-generator.js - untested, an aid to thought

fluid.def("fluid.demos.imageGenerator", {
    preferredSize: {
        w: 320,
        h: 240
    },
    // Supplied by InfusionHost
    shapeId: null,
    state: {
        $reactiveRoot: {
            prompt: "",
            isGenerating: false,
            error: ""
        }
    },
    isGenerating: "{self}.state.isGenerating",
    error: "{self}.state.error",
    // React computed `isGenerating || !prompt.trim()` inline in three places - here it must be a named member
    cannotGenerate: "$compute:fluid.demos.imageGenerator.cannotGenerate({self}.state.prompt, {self}.state.isGenerating)",
    buttonLabel: "$compute:fluid.demos.imageGenerator.buttonLabel({self}.isGenerating)",
    errorMessage: {
        $component: {
            $layers: "fluid.templateViewComponent",
            $if: "{imageGenerator}.error",
            template: `<p class="imagegen-error">@{{imageGenerator}.error}</p>`
        }
    },
    loadingMessage: {
        $component: {
            $layers: "fluid.templateViewComponent",
            $if: "{imageGenerator}.isGenerating",
            template: `<p class="imagegen-loading">Creating your image... This may take a moment.</p>`
        }
    },
    updatePrompt: {
        $method: {
            func: (state, e) => {
                state.prompt = e.target.value;
            },
            args: ["{self}.state", "{0}:event"]
        }
    },
    keyDown: {
        $method: {
            func: (self, e) => {
                if (e.key === "Enter" && !self.isGenerating) {
                    self.generate();
                }
            },
            args: ["{self}", "{0}:event"]
        }
    },
    generate: {
        $method: {
            func: "fluid.demos.imageGenerator.generate",
            args: ["{self}.state", "{tldrawHost}.editor", "{self}.shapeId"]
        }
    }
});

fluid.demos.imageGenerator.cannotGenerate = (prompt, isGenerating) => isGenerating || !prompt.trim();

fluid.demos.imageGenerator.buttonLabel = isGenerating => isGenerating ? "Generating..." : "Generate Image";

/**
 * Compute where a generated image should be placed - to the right of the widget, or centred in the viewport
 * @param {Editor} editor - The tldraw editor
 * @param {Object|undefined} widgetShape - The shape hosting the widget, if it could be found
 * @return {Object} The position as `{x, y}`
 */
fluid.demos.imageGenerator.imagePosition = function (editor, widgetShape) {
    let togo;
    if (widgetShape) {
        togo = {x: widgetShape.x + (widgetShape.props.w || 300) + 20, y: widgetShape.y};
    } else {
        const viewport = editor.getViewportPageBounds();
        togo = {x: viewport.x + viewport.w / 2 - 512, y: viewport.y + viewport.h / 2 - 512};
    }
    return togo;
};

/**
 * Generate an image from the current prompt and place it on the canvas
 * @param {Object} state - The component's reactive state
 * @param {Editor} editor - The tldraw editor, resolved from the root-scoped tldrawHost component
 * @param {String} shapeId - The id of the shape hosting the widget
 * @return {Promise} A promise which resolves when generation has finished, successfully or not
 */
fluid.demos.imageGenerator.generate = async function (state, editor, shapeId) {
    if (state.isGenerating) {
        console.log("Ignoring generate request while generation is in progress");
    } else if (!state.prompt.trim()) {
        state.error = "Please enter a prompt";
    } else {
        state.isGenerating = true;
        state.error = "";
        try {
            const assetId = await fluid.demos.agents.generateImageAsset(state.prompt, {width: 1024, height: 1024});
            const pos = fluid.demos.imageGenerator.imagePosition(editor, editor.getShape(shapeId));
            // The original creates the image shape directly - routed through the stub so the fake asset becomes a placeholder
            const {validatedShapes} = fluid.demos.agents.convertAndValidateShapes([{
                type: "image",
                x: pos.x,
                y: pos.y,
                props: {assetId, w: 1024, h: 1024}
            }]);
            editor.createShapes(validatedShapes);
            // GAP: clears the model but not the DOM <input> - no `value` property binding
            state.prompt = "";
        } catch (err) {
            state.error = "Failed to generate image. Please try again.";
            console.error("Image generation error:", err);
        } finally {
            state.isGenerating = false;
            // GAP: writes made after an await are not rendered until something stabilizes
            fluid.cell.stabilize();
        }
    }
};
</script>

<template>
    <div class="imagegen">
        <h3 class="imagegen-title">Image Generator</h3>
        <!-- GAP: original has disabled={isGenerating} - no boolean attribute/property binding -->
        <input type="text" class="imagegen-input" placeholder="Describe the image you want..."
               @class="imagegen-busy:@{isGenerating}"
               @oninput="{self}.updatePrompt({0})" @onkeydown="{self}.keyDown({0})">
        <!-- GAP: original has disabled={isGenerating || !prompt.trim()} - approximated by a class, the method guards -->
        <button class="imagegen-button" @class="imagegen-disabled:@{cannotGenerate}"
                @onclick="{self}.generate()">@{buttonLabel}</button>
        <div @id="errorMessage"></div>
        <div @id="loadingMessage"></div>
    </div>
</template>

<style>
.imagegen {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 16px;
    box-sizing: border-box;
    background-color: #f5f5f5;
    font-family: system-ui, -apple-system, sans-serif;
}

.imagegen-title {
    margin: 0 0 12px 0;
    font-size: 16px;
    font-weight: 600;
    color: #333;
}

.imagegen-input {
    width: 100%;
    padding: 10px 12px;
    font-size: 14px;
    border: 1px solid #ccc;
    box-sizing: border-box;
    margin-bottom: 12px;
    outline: none;
}

.imagegen-input.imagegen-busy {
    opacity: 0.6;
    pointer-events: none;
}

.imagegen-button {
    padding: 10px 16px;
    font-size: 14px;
    font-weight: 500;
    color: #fff;
    border: none;
    transition: background-color 0.2s;
    background-color: #4a90d9;
    cursor: pointer;
}

.imagegen-button.imagegen-disabled {
    background-color: #999;
    cursor: not-allowed;
}

.imagegen-error {
    margin-top: 12px;
    color: #d32f2f;
    font-size: 13px;
}

.imagegen-loading {
    margin-top: 12px;
    color: #666;
    font-size: 13px;
}
</style>
