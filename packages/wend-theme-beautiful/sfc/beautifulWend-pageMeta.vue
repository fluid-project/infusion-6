<script>
// The "last modified" line of a standalone page - Hugo's partials/page_meta.html
fluid.def("beautifulWend.pageMeta", {
    lastModText: "$compute:beautifulWend.pageMeta.lastModText({document}.page, {site}.config.params.dateFormat, {site}.lang, {i18n}.strings.lastModified)"
});

/**
 * Format the "last modified" text of a page, which is shown only if it differs from the page's date
 * @param {Object} page - The page record, with `date` and `lastmod`
 * @param {String} layout - The site's Go date layout
 * @param {String} lang - The site's language
 * @param {String} template - The i18n template for the text, with `{0}` standing for the date
 * @return {String} The formatted text, or an empty string
 */
beautifulWend.pageMeta.lastModText = function (page, layout, lang, template) {
    const dateStr = page.date ? beautifulWend.formatDate(page.date, layout, lang) : "";
    const lastModStr = page.lastmod ? beautifulWend.formatDate(page.lastmod, layout, lang) : "";
    return dateStr === lastModStr ? "" : template.replace("{0}", lastModStr);
};
</script>

<template>
    <div class="page-meta">@{lastModText}</div>
</template>
