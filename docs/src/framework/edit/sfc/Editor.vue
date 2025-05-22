<script>
fluid.def("fluid.editor", {
    editor: {
        $component: {
            $layers: ["fluid.codemirror", "{fluid.editor}.layerRec.editorModeLayer"]
        }
    },
    isActive: {
        $compute: {
            func: (layerName, selectedLayerTab) => layerName === selectedLayerTab,
            args: ["{self}.layerRec.layerName", "{fluid.editorRoot}.selectedLayerTab"]
        }
    },
    $variety: "frameworkAux"
});

// An addon layer must be supplied to determine the editor mode:

fluid.def("fluid.editor.sfc", {
    mode: "text/x-vue",
    text: "{fluid.editor}.layerRec.sfcDef",
    $variety: "frameworkAux",
    writeText: {
        $method: {
            func: (self, text, layerRec) => {
                self.instance.inWrite = true;
                layerRec.sfcDef.value = text;
                self.instance.inWrite = false;
            },
            args: ["{self}", "{0}:text", "{fluid.editor}.layerRec"]
        }
    }
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
                    self.instance.inWrite = true;
                    layerRec.layerDef.write(parsed);
                    self.instance.inWrite = false;
                } catch (e) {
                    console.log("JSON parse failure ", e);
                }
            },
            args: ["{self}", "{0}:text", "{fluid.editor}.layerRec"]
        }
    },
    text: "{self}.readText",
    codemirrorOptions: {
        lint: true
    },
    $variety: "frameworkAux"
});

</script>

<template>
    <div class="fl-editor" @id="editor" @class="active:@{isActive}">
    </div>
</template>

<style>
.fl-editor {
    display: none
}

.fl-editor.active {
    display: block
}
</style>
