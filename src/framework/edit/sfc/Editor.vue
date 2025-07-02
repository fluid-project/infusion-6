<script>
fluid.def("fluid.editor", {
    editor: {
        $component: {
            $layers: "fluid.codemirror",
            text: "{fluid.editor}.text"
        }
    },
    inWrite: false, // Currently disused
    isActive: {
        // TODO: What on earth? Why does this reach upward into the editorRoot?
        $compute: {
            func: (layerName, selectedLayerTab) => layerName === selectedLayerTab,
            args: ["{self}.layerRec.layerName", "{fluid.editorRoot}.selectedLayerTab"]
        }
    },
    // Perhaps better implemented on editor subcomponent?
    goToRef: {
        $method: {
            func: (self, ref) => {
                const segs = [ref.context, ...fluid.parsePath(ref.path), fluid.metadataSymbol];
                const cm = self.editor.instance;
                const range = fluid.get(cm.defMaps, segs);
                if (range) {
                    const doc = cm.getDoc();
                    const pos = cm.posFromIndex(range.from);
                    doc.setCursor(pos);
                }
            },
            args: ["{self}", "{0}:ref"]
        }
    },
    $variety: "frameworkAux"
});

// An addon layer is supplied to fluid.editor in fluid.editor.editorsPane to determine the editor mode:

fluid.def("fluid.editor.sfc", {
    mode: "text/x-vue",
    text: "{fluid.editor}.layerRec.sfcDef",
    $variety: "frameworkAux",
    writeText: {
        $method: {
            func: (self, text, layerRec) => {
                self.inWrite = true;
                layerRec.sfcDef.value = text;
                self.inWrite = false;
            },
            args: ["{self}", "{0}:text", "{fluid.editor}.layerRec"]
        }
    },

    codemirrorOptions: {
        lint: {
            options: {
                jshint: {
                    esversion: 6
                }
            }
        },
        tooltips: true
    },
});


fluid.def("fluid.editor.javascript", {
    mode: "text/javascript",
    text: "{fluid.editor}.layerRec.layerDef",
    $variety: "frameworkAux"
});

fluid.def("fluid.editor.json", {
    mode: "application/json",
    readText: {
        $compute: {
            func: jsonValue => JSON.stringify(jsonValue, null, 4),
            args: "{fluid.editor}.layerRec.layerDef"
        }
    },
    writeText: {
        $method: {
            func: (self, text, layerRec) => {
                try {
                    const parsed = JSON.parse(text);
                    // TODO: & syntax in arguments
                    self.inWrite = true;
                    layerRec.layerDef.write(parsed);
                    self.inWrite = false;
                } catch (e) {
                    console.log("JSON parse failure ", e);
                }
            },
            args: ["{self}", "{0}:text", "{fluid.editor}.layerRec"]
        }
    },
    text: "{self}.readText",
    codemirrorOptions: {
        lint: true,
        tooltips: true
    },
    $variety: "frameworkAux"
});

</script>

<template>
    <div class="fl-editor" @class="active:@{isActive}">
        <div @id="editor"></div>
    </div>
</template>

<style>
.fl-editor {
    display: none;
    min-height: 0;
}

.fl-editor.active {
    display: flex;
}

</style>
