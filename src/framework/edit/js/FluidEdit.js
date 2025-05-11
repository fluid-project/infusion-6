"use strict";

// Old-style driver now replaced by FluidEdit.vue, still exercised in old todo-list app

// TODO: Make import system reactive so we don't need to register the import map before instantiating the component
fluid.editUrlBase = "../../../src/framework/edit/";
fluid.libUrlBase = "../../../src/lib/";

fluid.importMap["fluid.fullPageEditor"] = {
    loadStyle: "code",
    urlBase: fluid.editUrlBase
};

fluid.importMap["fluid.editor"] = {
    loadStyle: "sfc",
    urlBase: fluid.editUrlBase,
    relPath: "sfc/FluidEditor.vue"
};

fluid.importMap["fluid.codemirror"] = {
    loadStyle: "code",
    urlBase: fluid.libUrlBase,
    relPath: "codemirror/"
};

const fluidEditScope = function (fluid) {

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
        resizeBar: {
            $component: {
                $layers: "fluid.templateViewComponent",
                elideParent: true,
                template: `<div class="fl-docking-area-resizer"></div>`,
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
        cssRelPath: "css/FluidEdit.css",
        // TODO: Syntax for determining "own" layer name so we don't have to repeat it here
        css: "$compute:fluid.importUrlResource(fluid.fullPageEditor, {self}.cssRelPath)"
    });

    fluid.injectEditor = function (dokkument = document) {
        const html = dokkument.documentElement;
        return fluid.fullPageEditor({container: fluid.liveQueryOne("body", html), html});
    };
};

if (typeof(fluid) !== "undefined") {
    fluidEditScope(fluid);
}


// TODO: This will be declaratively encoded in the document
fluid.injectEditor(document);


fluid.loadSFC("fluid.editorRoot", ("../../../src/framework/edit/sfc/EditorRoot.vue"));
fluid.loadSFC("fluid.editor.layerList", ("../../../src/framework/edit/sfc/EditorLayerList.vue"));
fluid.loadSFC("fluid.editor.menu", ("../../../src/framework/edit/sfc/EditorMenu.vue"));
fluid.loadSFC("fluid.editor.editorsPane", ("../../../src/framework/edit/sfc/EditorsPane.vue"));
fluid.loadSFC("fluid.editor.viewEditor", ("../../../src/framework/edit/sfc/ViewEditor.vue"));
fluid.loadSFC("fluid.codemirror", ("../../../src/framework/edit/sfc/Codemirror.vue"));
