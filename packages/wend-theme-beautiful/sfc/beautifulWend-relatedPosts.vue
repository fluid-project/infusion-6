<script>
// "See also" - the showRelatedPosts block of Hugo's single.html: pages sharing a tag with this one, excluding itself.
// The theme's $.Scratch "has_related" dance becomes an @if on the length of the computed list.
fluid.def("beautifulWend.relatedPosts", {
    related: "$compute:beautifulWend.relatedPosts.find({site}.relatedIndex, {document}.page, {site}.config.params.related_content_limit)",
    items: {
        $component: {
            $layers: "fluid.component",
            $for: {
                source: "{relatedPosts}.related",
                valueAs: "relatedPage"
            },
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    template: "<li><a href=\"@{relatedPage.relPermalink}\">@{relatedPage.title}</a></li>"
                }
            }
        }
    }
});

/**
 * Find the pages which share a tag with a given page - Hugo's `where .Site.Pages ".Params.tags" "intersect" ...`
 * @param {Object[]} pages - All of the site's pages, as summarised by beautifulWend.site.relatedIndex
 * @param {Object} page - The page for which related pages are sought
 * @param {Number} [limit] - The maximum number of related pages, defaulting to 5
 * @return {Object[]} The related page records
 */
beautifulWend.relatedPosts.find = function (pages, page, limit) {
    const tags = page.params.tags ?? [];
    return pages.filter(other => other.relPermalink !== page.relPermalink && other.kind === "page" &&
        (other.params.tags ?? []).some(tag => tags.includes(tag))).slice(0, limit ?? 5);
};

/**
 * Determine whether a list is non-empty
 * @param {Array} list - The list
 * @return {Boolean} `true` if it has any members
 */
beautifulWend.relatedPosts.any = function (list) {
    return list.length > 0;
};
</script>

<template>
    <div>
        <h4 @if="beautifulWend.relatedPosts.any({relatedPosts}.related)" class="see-also">@{{i18n}.strings.seeAlso}</h4>
        <ul @id="items" @if="beautifulWend.relatedPosts.any({relatedPosts}.related)"></ul>
    </div>
</template>
