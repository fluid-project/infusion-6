<script>
// Adds the Piwik tracker script, and its <noscript> image tracker after the footer
fluid.def("beautifulWend.document.piwik", {
    view: {
        $component: {
            $layers: ["fluid.sfcTemplateViewComponent", "fluid.partialViewComponent"],
            relativeContainer: "after: @footer"
        }
    },
    piwik: "{site}.config.params.piwik",
    piwikScriptText: "$compute:beautifulWend.document.piwik.scriptText({self}.piwik.server, {self}.piwik.id)",
    footerScripts: {
        piwik: {
            priority: 890,
            text: "{document}.piwikScriptText"
        }
    }
});

/**
 * Compose the inline Piwik tracker script
 * @param {String} server - The Piwik server's host name
 * @param {String} id - The site's Piwik id
 * @return {String} The text of the script
 */
beautifulWend.document.piwik.scriptText = function (server, id) {
    return `var _paq = _paq || [];
_paq.push(["trackPageView"]);
_paq.push(["enableLinkTracking"]);
(function() {
    var u = (("https:" == document.location.protocol) ? "https" : "http") + "://" + ${JSON.stringify(server)} + "/";
    _paq.push(["setTrackerUrl", u + "piwik.php"]);
    _paq.push(["setSiteId", ${JSON.stringify(id)}]);
    var d = document, g = d.createElement("script"), s = d.getElementsByTagName("script")[0]; g.type = "text/javascript";
    g.defer = true; g.async = true; g.src = u + "piwik.js"; s.parentNode.insertBefore(g, s);
})();`;
};
</script>

<template>
    <noscript>
        <img src="http://@{piwik.server}/piwik.php?idsite=@{piwik.id}&amp;rec=1" style="border:0" alt="" />
    </noscript>
</template>
