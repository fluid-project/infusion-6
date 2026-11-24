<script>
// The {{< figure >}} shortcode - Beautiful Hugo's figure shortcode, from hugo-easy-gallery - rendered as an
// island within the verbatim content of a page. The shortcode's parameters arrive as the island
// element's data- attributes, held in `dataset`. Its gallery-only features (thumbnails, size, caption effects) are not
// used by this site and are not ported, nor is its link to hugo-easy-gallery.css, which the site does not hold.
fluid.def("wend.shortcode.figure", {
    $layers: "fluid.component",
    alt: "$compute:wend.shortcode.figure.alt({self}.dataset)",
    link: "$compute:wend.shortcode.figure.link({self}.dataset)",
    hasCaption: "$compute:wend.shortcode.figure.hasCaption({self}.dataset)"
});

/**
 * Compute the alternative text of the figure's image - its `alt`, else its `caption`, else its `src`
 * @param {Object<String, String>} dataset - The shortcode's parameters
 * @return {String} The alternative text
 */
wend.shortcode.figure.alt = function (dataset) {
    return dataset.alt || dataset.caption || dataset.src;
};

/**
 * Compute the link target of the figure - its `link`, else its image
 * @param {Object<String, String>} dataset - The shortcode's parameters
 * @return {String} The link target
 */
wend.shortcode.figure.link = function (dataset) {
    return dataset.link || dataset.src;
};

/**
 * Determine whether the figure has a caption
 * @param {Object<String, String>} dataset - The shortcode's parameters
 * @return {Boolean} `true` if it has a title or caption
 */
wend.shortcode.figure.hasCaption = function (dataset) {
    return !!(dataset.title || dataset.caption);
};

/**
 * Compute the style of the figure's box, which is constrained to its `width` if it has one
 * @param {String} [width] - The shortcode's `width` parameter
 * @return {String|null} The style, or `null` if the box is not constrained, so that the attribute is omitted
 */
wend.shortcode.figure.maxWidth = function (width) {
    return width ? "max-width:" + width : null;
};
</script>

<template>
    <div class="box" style="@{wend.shortcode.figure.maxWidth({self}.dataset.width)}">
        <figure itemprop="associatedMedia" itemscope itemtype="http://schema.org/ImageObject">
            <div class="img">
                <img itemprop="thumbnail" src="@{dataset.src}" alt="@{alt}"/>
            </div>
            <a href="@{link}" itemprop="contentUrl"></a>
            <figcaption @if="hasCaption">
                <h4 @if="{self}.dataset.title">@{dataset.title}</h4>
                <p @if="{self}.dataset.caption">@{dataset.caption}</p>
            </figcaption>
        </figure>
    </div>
</template>
