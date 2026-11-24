<script>
// Comments via giscus. Selected by the site parameter `commentsLayer` so that another provider (Disqus, staticman) is a
// matter of configuration. The discussions it shows are those of the site's `params.giscus`, as giscus.app gives them
// for a repository, e.g. {"repo": "owner/name", "repoId": "R_...", "category": "Announcements", "categoryId": "DIC_..."}
fluid.def("beautifulWend.comments.giscus", {
    repo: "{site}.config.params.giscus.repo",
    repoId: "{site}.config.params.giscus.repoId",
    category: "{site}.config.params.giscus.category",
    categoryId: "{site}.config.params.giscus.categoryId"
});
</script>

<template>
    <script src="https://giscus.app/client.js"
            data-repo="@{repo}"
            data-repo-id="@{repoId}"
            data-category="@{category}"
            data-category-id="@{categoryId}"
            data-mapping="pathname"
            data-strict="0"
            data-reactions-enabled="0"
            data-emit-metadata="0"
            data-input-position="bottom"
            data-theme="light"
            data-lang="@{{site}.lang}"
            crossorigin="anonymous"
            async>
    </script>
</template>
