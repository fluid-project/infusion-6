<script>
fluid.def("fluid.fullPageEditor", {
    $layers: "fluid.sfcTemplateViewComponent",
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

fluid.injectEditor = function (dokkument = document) {
    const html = dokkument.documentElement;
    return fluid.fullPageEditor({container: fluid.liveQueryOne("body", html), html});
};

// Perhaps could be parameterised somehow but hard to see how
fluid.injectEditor(document);

</script>

<template>
    <!-- Upstream loader needs to define %infusion-6 and %fluid-edit -->
    <!-- <fluid-module id="infusion-6" src="../../../src/lib"></fluid-module> -->
    <div>
        <fluid-import layer="fluid.editorRoot" src="%fluid-edit/sfc/EditorRoot.vue"></fluid-import>
        <fluid-import layer="fluid.editor.layerList" src="%fluid-edit/sfc/EditorLayerList.vue"></fluid-import>
        <fluid-import layer="fluid.editor.menu" src="%fluid-edit/sfc/EditorMenu.vue"></fluid-import>
        <fluid-import layer="fluid.editor.editorsPane" src="%fluid-edit/sfc/EditorsPane.vue"></fluid-import>
        <fluid-import layer="fluid.editor" src="%fluid-edit/sfc/Editor.vue"></fluid-import>
        <fluid-import layer="fluid.editor.historyPane" src="%fluid-edit/sfc/HistoryPane.vue"></fluid-import>
        <fluid-import layer="fluid.editor.substratePane" src="%fluid-edit/sfc/SubstratePane.vue"></fluid-import>

        <fluid-import layer="fluid.codemirror" src="%fluid-edit/sfc/Codemirror.vue"></fluid-import>
    </div>

</template>

<style src="%fluid-edit/css/FluidEdit.css"></style>
