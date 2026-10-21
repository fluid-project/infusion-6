<script>
// Originally a port of a-scratch/react-originals/image-generator.js, which generated an image from its prompt. Images
// are now sourced from Pixabay by searching for the prompt, and are shown within the widget together with their credit,
// since Pixabay's image URLs expire and may not be stored permanently, e.g. in the canvas's own document.
// The search itself is in js/pixabay.js

fluid.def("fluid.demos.imageGenerator", {
    $layers: "fluid.topLevelWidget",
    preferredSize: {
        w: 360,
        h: 460
    },
    state: {
        $reactiveRoot: {
            prompt: "",
            isGenerating: false,
            error: "",
            // The images found for the most recent search, and the index of the one shown
            images: [],
            index: 0,
            // The id of the image whose expired URL was most recently refreshed, so that it is refreshed only once
            refreshedId: null
        }
    },
    isGenerating: "{self}.state.isGenerating",
    error: "{self}.state.error",
    image: "$compute:fluid.demos.imageGenerator.currentImage({self}.state.images, {self}.state.index)",
    cannotGenerate: "$compute:fluid.demos.imageGenerator.cannotGenerate({self}.state.prompt, {self}.state.isGenerating)",
    cannotShowAnother: "$compute:fluid.demos.imageGenerator.cannotShowAnother({self}.state.images, {self}.state.isGenerating)",
    buttonLabel: "$compute:fluid.demos.imageGenerator.buttonLabel({self}.isGenerating)",
    errorMessage: {
        $component: {
            $layers: "fluid.component",
            $if: "{imageGenerator}.error",
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    template: `<p class="imagegen-error">@{{imageGenerator}.error}</p>`
                }
            }
        }
    },
    loadingMessage: {
        $component: {
            $layers: "fluid.component",
            $if: "{imageGenerator}.isGenerating",
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    template: `<p class="imagegen-loading">Finding your image...</p>`
                }
            }
        }
    },
    // The image found, credited to its contributor and to Pixabay as its terms ask
    result: {
        $component: {
            $layers: "fluid.component",
            $if: "{imageGenerator}.image",
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    template: `<figure class="imagegen-result">
                        <img class="imagegen-image" src="@{{imageGenerator}.image.url}" alt="@{{imageGenerator}.image.tags}"
                             @onerror="{imageGenerator}.refresh()">
                        <figcaption class="imagegen-credit">Image by <a href="@{{imageGenerator}.image.userURL}"
                            target="_blank" rel="noopener noreferrer">@{{imageGenerator}.image.user}</a> from <a
                            href="@{{imageGenerator}.image.pageURL}" target="_blank" rel="noopener noreferrer">Pixabay</a></figcaption>
                    </figure>`
                }
            }
        }
    },
    keyDown: {
        $method: {
            // The search's promise is returned so that everything it causes is a single undoable step
            func: (self, e) => e.key === "Enter" && !self.isGenerating ? self.generate() : undefined,
            args: ["{self}", "{0}:event"]
        }
    },
    generate: {
        $method: {
            func: "fluid.demos.imageGenerator.generate",
            args: ["{self}.state"]
        }
    },
    showAnother: {
        $method: {
            func: "fluid.demos.imageGenerator.showAnother",
            args: ["{self}.state"]
        }
    },
    refresh: {
        $method: {
            func: "fluid.demos.imageGenerator.refresh",
            args: ["{self}.state"]
        }
    }
});

fluid.demos.imageGenerator.currentImage = (images, index) => images[index] || null;

fluid.demos.imageGenerator.cannotGenerate = (prompt, isGenerating) => isGenerating || !prompt.trim();

fluid.demos.imageGenerator.cannotShowAnother = (images, isGenerating) => isGenerating || images.length < 2;

fluid.demos.imageGenerator.buttonLabel = isGenerating => isGenerating ? "Finding..." : "Find Image";

/**
 * Search Pixabay for images matching the current prompt, and show the first found
 * @param {Object} state - The component's reactive state
 * @return {Promise} A promise which resolves when the search has finished, successfully or not
 */
fluid.demos.imageGenerator.generate = async function (state) {
    const prompt = state.prompt.trim();
    if (state.isGenerating) {
        console.log("Ignoring generate request while generation is in progress");
    } else if (!prompt) {
        state.error = "Please enter a prompt";
    } else {
        state.isGenerating = true;
        state.error = "";
        try {
            const images = await fluid.demos.pixabay.search(prompt);
            if (images.length > 0) {
                state.images = images;
                state.index = 0;
            } else {
                state.error = `No images on Pixabay match "${prompt}" - try describing it differently`;
            }
        } catch (err) {
            state.error = "Failed to find an image: " + err.message;
            console.error("Image search error:", err);
        } finally {
            state.isGenerating = false;
        }
    }
};

/**
 * Show the next of the images found by the most recent search, returning to the first after the last
 * @param {Object} state - The component's reactive state
 */
fluid.demos.imageGenerator.showAnother = function (state) {
    state.index = (state.index + 1) % state.images.length;
};

/**
 * Refresh the URL of the image shown, once it has failed to load - Pixabay's URLs expire after 24 hours, e.g. for a
 * widget which was pasted from an old PTF document. Each image is refreshed only once, so that an image which cannot
 * be loaded at all does not cause repeated requests.
 * @param {Object} state - The component's reactive state
 * @return {Promise} A promise which resolves once the image has been refreshed, or found to be unavailable
 */
fluid.demos.imageGenerator.refresh = async function (state) {
    const image = state.images[state.index];
    if (image && image.id !== state.refreshedId) {
        state.refreshedId = image.id;
        try {
            const fresh = await fluid.demos.pixabay.lookup(image.id);
            if (fresh) {
                state.images[state.index] = fresh;
            } else {
                state.error = "This image is no longer available on Pixabay";
            }
        } catch (err) {
            state.error = "Failed to reload the image: " + err.message;
        }
    }
};
</script>

<template>
    <div class="imagegen">
        <h3 class="imagegen-title">Image Generator</h3>
        <!-- The bound value is written back to state.prompt as the user types -->
        <input type="text" class="imagegen-input" placeholder="Describe the image you want..."
               value="@{state.prompt}" disabled="@{isGenerating}" @onkeydown="{self}.keyDown({0})">
        <div class="imagegen-buttons">
            <button class="imagegen-button" disabled="@{cannotGenerate}"
                    @onclick="{self}.generate()">@{buttonLabel}</button>
            <button class="imagegen-button imagegen-another" disabled="@{cannotShowAnother}"
                    @onclick="{self}.showAnother()">Another</button>
        </div>
        <div @id="errorMessage"></div>
        <div @id="loadingMessage"></div>
        <div @id="result"></div>
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

.imagegen-input:disabled {
    opacity: 0.6;
    pointer-events: none;
}

.imagegen-buttons {
    display: flex;
    gap: 8px;
}

.imagegen-button {
    flex: 1;
    padding: 10px 16px;
    font-size: 14px;
    font-weight: 500;
    color: #fff;
    border: none;
    transition: background-color 0.2s;
    background-color: #4a90d9;
    cursor: pointer;
}

.imagegen-another {
    flex: 0 0 auto;
    background-color: #607d8b;
}

.imagegen-button:disabled {
    background-color: #999;
    cursor: not-allowed;
}

.imagegen-error {
    margin: 12px 0 0 0;
    color: #d32f2f;
    font-size: 13px;
}

.imagegen-loading {
    margin: 12px 0 0 0;
    color: #666;
    font-size: 13px;
}

.imagegen-result {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    margin: 12px 0 0 0;
}

/* The image shrinks to fit the widget, but does not grow, so that its credit stays directly beneath it */
.imagegen-image {
    flex: 0 1 auto;
    min-height: 0;
    max-width: 100%;
    object-fit: contain;
}

.imagegen-credit {
    margin-top: 6px;
    font-size: 12px;
    color: #555;
    text-align: center;
}

.imagegen-credit a {
    color: #2e7d32;
}
</style>
