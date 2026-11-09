"use strict";

// Payload for the browser alone, standing for a widget library such as a map - it is not run when rendering under node
window.fluidTestsRtWidgetRuns = (window.fluidTestsRtWidgetRuns || 0) + 1;
window.fluidTestsRtWidget = {
    // Marks its container as a widget would, with a class of its own alongside those of the templates
    bind: container => {
        container.classList.add("rt-widget-live");
        container.setAttribute("data-widget", "on");
        return container;
    }
};
