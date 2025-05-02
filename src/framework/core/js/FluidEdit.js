"use strict";

// TODO: Make import system reactive so we don't need to register the import map before instantiating the component
fluid.devUrlBase = "../../../src/framework/core/";

fluid.importMap["fluid.fullPageEditor"] = {
    loadStyle: "code",
    urlBase: fluid.devUrlBase
};

fluid.importMap["fluid.fluidEditor"] = {
    loadStyle: "sfc",
    urlBase: fluid.devUrlBase,
    relPath: "sfc/FluidEditor.vue"
};

const fluidEditScope = function (fluid) {

    fluid.def("fluid.fullPageEditor", {
        $layers: "fluid.viewComponent",
        editorVisible: false,
        editButton: {
            $component: {
                $layers: "fluid.templateViewComponent",
                elideParent: true,
                template: `<button @onclick="{fullPageEditor}.toggleEditorVisible()" style="position: fixed; top: 1em; right: 1em;">Edit</button>`,
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
        editor: {
            $component: {
                $layers: "fluid.fluidEditor",
                container: "$compute:fluid.insertChildContainer(last, editor, {self}.template, {fullPageEditor}.html)",
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

fluid.loadSFC("fluid.fluidEditor", ("../../../src/framework/core/sfc/FluidEditor.vue"));
