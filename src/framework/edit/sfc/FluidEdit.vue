<script>
fluid.def("fluid.fullPageEditor", {
    $layers: "fluid.viewComponent",
    editorVisible: false,
    editButton: {
        $component: {
            $layers: "fluid.templateViewComponent",
            elideParent: true,
            template: `<button @onclick="{fullPageEditor}.editorVisible = true" style="position: fixed; top: 1em; right: 1em;">Edit</button>`,
            container: "$compute:fluid.insertChildContainer(last, editButton, {self}.template, {fullPageEditor}.container)"
        }
    },
    inspectOverlay: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div id="fl-inspect-overlay" class="fl-inspect-overlay" @onclick="{editorRoot}.overlayClick()"><div class="fl-inspect-layer"></div></div>`,
            container: "$compute:fluid.insertChildContainer(last, inspectOverlay, {self}.template, {fullPageEditor}.container)"
        }
    },
    resizeBar: {
        $component: {
            $layers: "fluid.templateViewComponent",
            elideParent: true,
            template: `<div class="fl-resizer"></div>`,
            container: "$compute:fluid.insertChildContainer(after, resizeBar, {self}.template, {fullPageEditor}.html, {fullPageEditor}.container)"
        }
    },
    editorRoot: {
        $component: {
            $layers: "fluid.editorRoot",
            container: "$compute:fluid.insertChildContainer(last, editorRoot, {self}.template, {fullPageEditor}.html)",
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
    <!-- Upstream loader needs to define libUrlBase and editUrlbase -->
    <!-- <fluid-url-base id="libUrlBase" src="../../../src/lib"></fluid-url-base> -->
    <div>
        <fluid-import layer="fluid.editorRoot" src="@{editUrlBase}/sfc/EditorRoot.vue"></fluid-import>
        <fluid-import layer="fluid.editor.layerList" src="@{editUrlBase}/sfc/EditorLayerList.vue"></fluid-import>
        <fluid-import layer="fluid.editor.menu" src="@{editUrlBase}/sfc/EditorMenu.vue"></fluid-import>
        <fluid-import layer="fluid.editor.editorsPane" src="@{editUrlBase}/sfc/EditorsPane.vue"></fluid-import>
        <fluid-import layer="fluid.editor" src="@{editUrlBase}/sfc/Editor.vue"></fluid-import>
        <fluid-import layer="fluid.editor.historyPane" src="@{editUrlBase}/sfc/HistoryPane.vue"></fluid-import>
        <fluid-import layer="fluid.editor.substratePane" src="@{editUrlBase}/sfc/SubstratePane.vue"></fluid-import>

        <fluid-import layer="fluid.codemirror" src="@{editUrlBase}/sfc/Codemirror.vue"></fluid-import>
    </div>

</template>

<style src="@{editUrlBase}/css/FluidEdit.css"></style>
