<script>
// Appends the comment count to a post's date line, from the comments held in the site's data - Hugo's
// .Site.Data.comments, keyed by the post's permalink with slashes removed
fluid.def("beautifulWend.postMeta.staticman", {
    view: {
        $component: {
            $layers: ["fluid.sfcTemplateViewComponent", "fluid.partialViewComponent"],
            relativeContainer: "after: .ponder-date"
        }
    },
    commentText: "$compute:beautifulWend.postMeta.staticman.commentText({site}.data.comments, {self}.page.relPermalink, {i18n}.strings)"
});

/**
 * Format the comment count of a post
 * @param {Object<String, Object[]>} [comments] - The site's comments, keyed by slug
 * @param {String} relPermalink - The post's relative permalink
 * @param {Object<String, String>} strings - The i18n strings
 * @return {String} The count and its label, e.g. "2 comments"
 */
beautifulWend.postMeta.staticman.commentText = function (comments, relPermalink, strings) {
    const count = comments?.[relPermalink.replaceAll("/", "")]?.length ?? 0;
    return count + " " + (count > 1 ? strings.moreComment : strings.oneComment);
};
</script>

<template>
    <span class="ponder-comment-count">&nbsp;|&nbsp;<i class="fas fa-comment"></i>&nbsp;@{commentText}</span>
</template>
