<script>
fluid.def("fluid.fullPageEditor", {
    $layers: "fluid.sfcTemplateViewComponent",
    $importMap: {
        "fluid.editorRoot": "%fluid-edit/sfc/fluid-editorRoot.vue",
        "fluid.editor": "%fluid-edit/sfc/fluid-editor.vue",
        "fluid.editor.layerList": "%fluid-edit/sfc/fluid-editor-layerList.vue",
        "fluid.editor.menu": "%fluid-edit/sfc/fluid-editor-menu.vue",
        "fluid.editor.editorsPane": "%fluid-edit/sfc/fluid-editor-editorsPane.vue",
        "fluid.editor.historyPane": "%fluid-edit/sfc/fluid-editor-historyPane.vue",
        "fluid.editor.substratePane": "%fluid-edit/sfc/fluid-editor-substratePane.vue",
        "fluid.codemirror": "%fluid-edit/sfc/fluid-codemirror.vue"
    },
    // Expects: html from creator, and body as container
    editorVisible: false,
    editButton: {
        $component: {
            $layers: "fluid.templateViewComponent",
            elideParent: true,
            template: `<button class="fl-editor-edit" @onclick="{fullPageEditor}.editorVisible = true">Edit</button>`,
            container: "$compute:fluid.insertChildContainer(last, editButton, {self}.templateTree, {fullPageEditor}.container)"
        }
    },
    inspectOverlay: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div id="fl-inspect-overlay" class="fl-inspect-overlay" @onclick="{editorRoot}.overlayClick()"><div class="fl-inspect-layer"></div></div>`,
            container: "$compute:fluid.insertChildContainer(last, inspectOverlay, {self}.templateTree, {fullPageEditor}.container)"
        }
    },
    resizeBar: {
        $component: {
            $layers: "fluid.templateViewComponent",
            elideParent: true,
            template: `<div class="fl-resizer"></div>`,
            container: "$compute:fluid.insertChildContainer(after, resizeBar, {self}.templateTree, {fullPageEditor}.html, {fullPageEditor}.container)"
        }
    },
    editorRoot: {
        $component: {
            $layers: "fluid.editorRoot",
            container: "$compute:fluid.insertChildContainer(last, editorRoot, {self}.templateTree, {fullPageEditor}.html)",
            elideParent: true,
            editorVisible: "{fullPageEditor}.editorVisible"
        }
    },
    toggleEditorVisible: {
        $method: {
            func: self => self.editorVisible = !self.editorVisible,
            args: "{self}"
        }
    },
    rootEffect: {
        $effect: {
            func: (body, editorVisible) => body.parentElement.setAttribute("fl-docking-area-mode", editorVisible ? "right edge" : "minimized"),
            args: ["{self}.container", "{self}.editorVisible"]
        }
    },
    // Override this definition from viewComponent so we don't obliterate the document
    renderView: "$effect:fluid.identity({self}.vTree)",
    $variety: "frameworkAux"

});
</script>

<style src="%fluid-edit/css/FluidEdit.css"></style>
<template>
</template>
