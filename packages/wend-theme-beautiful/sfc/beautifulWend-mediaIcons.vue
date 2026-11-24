<script>
// Social media icons on the home page header - Hugo's links to the author's profiles. Each is a member of the site's
// `params.mediaIcons`, e.g. {"title": "GitHub profile", "href": "https://github.com/x", "icon": "fab fa-github-alt"},
// `icon` being the classes of a Font Awesome icon. A site lists none by default.
// Iterating a list drawn from the site's configuration needs Infusion 6.6.0 - see fluid.mutatingArrayMethods
fluid.def("beautifulWend.mediaIcons", {
    icons: "$compute:beautifulWend.mediaIcons.icons({site}.config.params.mediaIcons)",
    iconTags: {
        $component: {
            $layers: "beautifulWend.mediaIcon",
            $for: {
                source: "{mediaIcons}.icons",
                valueAs: "icon"
            }
        }
    }
});

/**
 * The media icons a site lists, if any
 * @param {Object[]} [icons] - The site's `params.mediaIcons` - a proxy onto the configuration, which Array.isArray
 * does not recognise
 * @return {Object[]} The icons, an empty array if the site lists none
 */
beautifulWend.mediaIcons.icons = function (icons) {
    return icons || [];
};
</script>

<template>
    <div class="media-icons"><fluid-fragment @id="iconTags"></fluid-fragment></div>
</template>
