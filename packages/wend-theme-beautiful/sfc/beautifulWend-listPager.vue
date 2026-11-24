<script>
// Newer/older links between pages of a paginated list - the pager blocks of Hugo's list.html and index.html
fluid.def("beautifulWend.listPager", {
    paginator: "{document}.page.paginator"
});
</script>

<template>
    <ul class="pager main-pager">
        <li @if="{listPager}.paginator.prev" class="previous">
            <a href="@{paginator.prev}">&larr; @{{i18n}.strings.newerPosts}</a>
        </li>
        <li @if="{listPager}.paginator.next" class="next">
            <a href="@{paginator.next}">@{{i18n}.strings.olderPosts} &rarr;</a>
        </li>
    </ul>
</template>
