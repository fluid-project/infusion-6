<script>
// Base layer for the {{ block "main" . }} slot of the document. Each kind layer substitutes a derived layer.
fluid.def("beautifulWend.main", {
});

/**
 * Defined here, with the layers whose templates decide by it whether to render a beautifulWend.listPager - since the SFC of
 * that layer is loaded only once a page demands it, after the decision has been made
 * Determine whether a paginated list has more than one page
 * @param {Object} [paginator] - The page's paginator record, with optional `prev` and `next` permalinks
 * @return {Boolean} `true` if a pager is to be shown
 */
beautifulWend.main.hasPager = function (paginator) {
    return Boolean(paginator?.prev || paginator?.next);
};
</script>

<template>
    <div role="main"></div>
</template>
