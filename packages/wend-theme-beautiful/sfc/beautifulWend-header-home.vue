<script>
// The home page header - the {{ if .IsHome }} branches of Hugo's header.html. A partial template adds the avatar and
// media icons before the heading, and the title and subtitle come from site parameters rather than the page.
fluid.def("beautifulWend.header.home", {
    title: "{site}.config.params.homeTitle",
    subtitle: "{site}.config.params.subtitle",
    bigimg: "{site}.config.params.bigimg",
    // The avatar - the site's `bio` image, as ponder's copy of the theme had it, or else its `logo`, as Beautiful Hugo
    // has it - shown only if the site has either
    avatar: "$compute:beautifulWend.header.home.avatar({site}.config.params.bio, {site}.config.params.logo)",
    view: {
        $component: {
            $layers: ["fluid.sfcTemplateViewComponent", "fluid.partialViewComponent"],
            relativeContainer: "before: .ponder-heading"
        }
    },
    mediaIcons: {
        $component: {
            $layers: "beautifulWend.mediaIcons"
        }
    }
});

/**
 * The image of the home page's avatar, if any
 * @param {String} [bio] - The site's `bio` image
 * @param {String} [logo] - The site's `logo` image
 * @return {String|Boolean} The image's path within the site, or `false` if it has neither
 */
beautifulWend.header.home.avatar = function (bio, logo) {
    return bio || logo || false;
};
</script>

<!-- The theme fits the bio image to 300x300 webp via Hugo's resources.Get - here the image is shown as it is -->
<template>
    <div class="avatar-container">
        <div class="avatar-img-border" @if="avatar">
            <a title="@{{site}.config.title}" href="/">
                <img class="avatar-img" src="/@{avatar}" alt="@{{site}.config.title}" />
            </a>
        </div>
        <div @id="mediaIcons"></div>
    </div>
</template>
