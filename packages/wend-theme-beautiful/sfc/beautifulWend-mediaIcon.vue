<script>
// One of the media icons on the home page header, rendered from a member of the site's `params.mediaIcons` as `icon` -
// see beautifulWend.mediaIcons
fluid.def("beautifulWend.mediaIcon", {
});
</script>

<template>
    <a title="@{icon.title}" href="@{icon.href}"><i class="@{icon.icon}"></i></a>
</template>
