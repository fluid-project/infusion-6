<script>
// Adds the search modal after the navigation bar, and the search engine's loader to the document's footer scripts.
// The two contributions go by different routes - a partial template, and data - since a partial view composites at
// a single cutpoint.
fluid.def("beautifulWend.document.gcse", {
    view: {
        $component: {
            $layers: ["fluid.sfcTemplateViewComponent", "fluid.partialViewComponent"],
            relativeContainer: "after: @navbar"
        }
    },
    gcseLabelLong: "$compute:beautifulWend.document.gcse.label({i18n}.strings.gcseLabelLong, {site}.config.title)",
    // Hugo's html/template escapes {{ .Site.Params.gcse }} for the JavaScript string context it appears in - here
    // the escaping must be done by hand
    gcseScriptText: "$compute:beautifulWend.document.gcse.scriptText({site}.config.params.gcse)",
    footerScripts: {
        gcse: {
            priority: 900,
            text: "{document}.gcseScriptText"
        }
    }
});

/**
 * Format the long label of the search modal
 * @param {String} template - The i18n template, with `{0}` standing for the site title
 * @param {String} siteTitle - The site's title
 * @return {String} The label
 */
beautifulWend.document.gcse.label = function (template, siteTitle) {
    return template.replace("{0}", siteTitle);
};

/**
 * Compose the inline script which loads Google Custom Search
 * @param {String} cx - The search engine id
 * @return {String} The text of the script
 */
beautifulWend.document.gcse.scriptText = function (cx) {
    return `(function() {
    var cx = ${JSON.stringify(cx)};
    var gcse = document.createElement("script");
    gcse.type = "text/javascript";
    gcse.async = true;
    gcse.src = "https://cse.google.com/cse.js?cx=" + cx;
    var s = document.getElementsByTagName("script")[0];
    s.parentNode.insertBefore(gcse, s);
})();`;
};
</script>

<template>
    <div id="modalSearch" class="modal fade" role="dialog">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <button type="button" class="close" data-dismiss="modal">&times;</button>
                    <h4 class="modal-title">@{gcseLabelLong}</h4>
                </div>
                <div class="modal-body">
                    <gcse:search></gcse:search>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-default" data-dismiss="modal">@{{i18n}.strings.gcseClose}</button>
                </div>
            </div>
        </div>
    </div>
</template>
