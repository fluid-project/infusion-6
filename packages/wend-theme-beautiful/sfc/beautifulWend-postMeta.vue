<script>
// The date line of a post - Hugo's partials/post_meta.html. The staticman comment count and the translations list are
// contributed by beautifulWend.postMeta.staticman and beautifulWend.postMeta.translations, broadcast by their features' linkages.
fluid.def("beautifulWend.postMeta", {
    page: "{document}.page",
    dateText: "$compute:beautifulWend.postMeta.dateText({self}.page.date, {site}.config.params.dateFormat, {site}.lang, {i18n}.strings.postedOnDate)"
});

/**
 * Format the "posted on" text of a post
 * @param {String} [date] - The post's date in ISO 8601 form, if any
 * @param {String} layout - The site's Go date layout
 * @param {String} lang - The site's language
 * @param {String} template - The i18n template for the text, with `{0}` standing for the date
 * @return {String} The formatted text, empty if the post has no date
 */
beautifulWend.postMeta.dateText = function (date, layout, lang, template) {
    return date ? template.replace("{0}", beautifulWend.formatDate(date, layout, lang)) : "";
};
</script>

<template>
    <span class="post-meta"><span class="ponder-date">@{dateText}</span></span>
</template>
