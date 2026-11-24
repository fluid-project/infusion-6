<script>
// Previous/next links between pages of a section - the {{ if ne .Type "page" }} block of Hugo's single.html.
// The site model supplies `prevInSection` and `nextInSection` as page summaries.
fluid.def("beautifulWend.pager", {
    prev: "{document}.page.prevInSection",
    next: "{document}.page.nextInSection"
});
</script>

<template>
    <ul class="pager blog-pager">
        <li @if="{pager}.prev" class="previous">
            <a href="@{prev.relPermalink}" data-toggle="tooltip" data-placement="top" title="@{prev.title}">&larr; @{{i18n}.strings.previousPost}</a>
        </li>
        <li @if="{pager}.next" class="next">
            <a href="@{next.relPermalink}" data-toggle="tooltip" data-placement="top" title="@{next.title}">@{{i18n}.strings.nextPost} &rarr;</a>
        </li>
    </ul>
</template>
