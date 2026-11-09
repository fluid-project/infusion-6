<script src="../../lib/client-widget.js" fluid-client data-fl-scope="global"></script>
<style src="panel.css"></style>
<script>
"use strict";

fluid.def("fluid.tests.rt.panel", {
    widget: {
        $component: {
            $layers: "fluid.component",
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    template: "<div class=\"rt-widget\">Widget</div>"
                }
            },
            // Bound only in the browser, where the widget's library is loaded
            instance: {
                $bindable: {
                    bind: "fluid.tests.rt.panel.bindWidget({self}.view.renderedContainer, {global})",
                    onceOnly: true
                }
            }
        }
    }
});

fluid.tests.rt.panel.bindWidget = (container, global) => global.fluidTestsRtWidget ? global.fluidTestsRtWidget.bind(container) :
    fluid.unavailable({message: "Widget library not loaded", variety: "config"});
</script>
<template>
    <div class="rt-panel">
        <span class="rt-count">@{count} records</span>
        <div class="rt-widget-slot" @id="widget"></div>
    </div>
</template>
