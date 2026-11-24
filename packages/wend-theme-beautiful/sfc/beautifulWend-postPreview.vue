<script>
// The summary of one page within a list - Hugo's partials/post_preview.html. Holds the listed page's record as `page`,
// distinct from the document's own `{document}.page`.
fluid.def("beautifulWend.postPreview", {
    postMeta: {
        $component: {
            $layers: "beautifulWend.postMeta",
            page: "{postPreview}.page"
        }
    },
    // {{ if or (.Truncated) (.Params.summary) }} {{ .Summary }} ... {{ else }} {{ .Content }} {{ end }}
    entry: {
        $component: {
            $layers: "wend.content",
            html: "$compute:beautifulWend.postPreview.entryHtml({postPreview}.page)"
        }
    },
    tags: {
        $component: {
            $layers: "beautifulWend.tags",
            tags: "{postPreview}.page.params.tags"
        }
    }
});

/**
 * Determine whether a page is listed by its summary rather than its full content
 * @param {Object} page - The page record
 * @return {Boolean} `true` if the page's summary is shown
 */
beautifulWend.postPreview.isSummarised = function (page) {
    return Boolean(page.truncated || page.params.summary);
};

/**
 * Select the HTML shown for a page in a list
 * @param {Object} page - The page record
 * @return {String} The page's summary if it is summarised, otherwise its full content
 */
beautifulWend.postPreview.entryHtml = function (page) {
    return beautifulWend.postPreview.isSummarised(page) ? page.summary : page.content;
};
</script>

<template>
    <article class="post-preview">
        <div class="post-preview-header">
            <a href="@{page.relPermalink}">
                <h2 class="post-title">@{page.title}</h2>
                <img @if="{postPreview}.page.params.image" src="@{page.params.image}" alt="@{page.title}" class="img-title" />
                <video @if="{postPreview}.page.params.video" loop autoplay muted playsinline class="img-title">
                    <source src="@{page.params.video}">
                </video>
            </a>
            <p class="post-meta">
                <span @id="postMeta"></span>
            </p>
        </div>
        <div class="post-entry">
            <div @id="entry"></div>
            <a @if="beautifulWend.postPreview.isSummarised({postPreview}.page)" href="@{page.relPermalink}" class="post-read-more">[@{{i18n}.strings.readMore}]</a>
        </div>
        <div @id="tags" @if="{postPreview}.page.params.tags"></div>
    </article>
</template>
