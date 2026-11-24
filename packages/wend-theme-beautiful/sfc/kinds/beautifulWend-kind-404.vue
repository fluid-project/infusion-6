<script>
// Hugo's 404.html, whose {{ define "header" }} block is empty. The header subcomponent is removed with `null`, which
// also leaves its @id element out of the document. Hugo's head.html adds a <base> for the 404 kind, since the page is
// served at whatever URL was missing, against which its relative URLs would not resolve.
fluid.def("beautifulWend.kind.404", {
    header: null,
    head: {
        $component: {
            // Not beautifulWend.kind.404.baseHref, since a definition written as beautifulWend.kind.404.baseHref = ... is not valid JavaScript
            baseHref: "$compute:beautifulWend.kind.notFoundBaseHref({site}.config.baseURL)"
        }
    },
    main: {
        $component: {
            $layers: "beautifulWend.main.notFound"
        }
    }
});

/**
 * Compute the href of the 404 page's <base> element - the root of the site, as Hugo's .Site.BaseURL renders it
 * @param {String} baseURL - The site's base URL, without a trailing slash
 * @return {String} The site's root URL, with a trailing slash
 */
beautifulWend.kind.notFoundBaseHref = function (baseURL) {
    return baseURL + "/";
};
</script>
