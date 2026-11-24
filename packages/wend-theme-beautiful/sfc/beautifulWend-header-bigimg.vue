<script>
// The rotating "big image" banner of Hugo's header.html, for a page or site with `bigimg` configured. Unused by this
// site's configuration, but retained as the theme supports it.
fluid.def("beautifulWend.header.bigimg", {
    images: "{header}.bigimg",
    firstImage: "$compute:beautifulWend.header.bigimg.first({self}.images)",
    // Hugo writes one data-img-src-N attribute per image - a variable set of attributes can't be expressed in a
    // template, so the images are passed to the client as JSON instead
    imagesJSON: "$compute:beautifulWend.header.bigimg.toJSON({self}.images)"
});

/**
 * Select the first big image, which is rendered statically
 * @param {Object[]} images - The `bigimg` records, each with `src` and optional `desc`
 * @return {Object} The first record, with `desc` defaulted to an empty string
 */
beautifulWend.header.bigimg.first = function (images) {
    return {desc: "", ...images[0]};
};

/**
 * Serialise the big image records for the client-side rotator
 * @param {Object[]} images - The `bigimg` records
 * @return {String} Their JSON form
 */
beautifulWend.header.bigimg.toJSON = function (images) {
    return JSON.stringify(images);
};
</script>

<template>
    <div id="header-big-imgs" data-imgs="@{imagesJSON}">
        <div class="intro-header big-img" style="background-image: url('@{firstImage.src}');">
            <div class="container">
                <div class="row">
                    <div class="col-lg-8 col-lg-offset-2 col-md-10 col-md-offset-1">
                        <div class="@{{document}.page.type}-heading">
                            <h1>@{{header}.title}</h1>
                        </div>
                    </div>
                </div>
            </div>
            <span class="img-desc" @class="ponder-hidden:!@{firstImage.desc}">@{firstImage.desc}</span>
        </div>
    </div>
</template>
