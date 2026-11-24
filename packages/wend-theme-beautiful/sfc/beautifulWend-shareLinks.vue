<script>
// Social share links - Hugo's partials/share-links.html. Hugo's `urlquery` filter becomes a computed member; Hugo's
// templates also escape {{ .Title }} contextually within the URL, which Infusion's interpolation does not.
fluid.def("beautifulWend.shareLinks", {
    title: "{document}.page.title",
    permalink: "{document}.page.permalink",
    blueText: "$compute:beautifulWend.shareLinks.blueText({self}.title, {self}.permalink)",
    encodedTitle: "$compute:encodeURIComponent({self}.title)",
    encodedPermalink: "$compute:encodeURIComponent({self}.permalink)"
});

/**
 * Compose the URL-encoded text of a BlueSky share
 * @param {String} title - The page's title
 * @param {String} permalink - The page's absolute URL
 * @return {String} The encoded share text
 */
beautifulWend.shareLinks.blueText = function (title, permalink) {
    return encodeURIComponent("Just reading a post called " + title + " on Antranig Basman's blog: " + permalink);
};
</script>

<template>
    <div>
        <hr/>
        <section id="social-share">
            <div class="list-inline footer-links">
                <div class="share-box" aria-hidden="true">
                    <ul class="share">
                        <li>
                            <a href="https://bsky.app/intent/compose?text=@{blueText}" target="_blank" title="Share on BlueSky">
                                <i class="fab fa-fw fa-bluesky"></i>
                            </a>
                        </li>
                        <li>
                            <a href="https://twitter.com/share?url=@{encodedPermalink}&amp;text=@{encodedTitle}&amp;via=@{{site}.config.author.twitter}" target="_blank" title="Share on Twitter">
                                <i class="fab fa-twitter"></i>
                            </a>
                        </li>
                        <li>
                            <a href="https://www.facebook.com/sharer/sharer.php?u=@{encodedPermalink}" target="_blank" title="Share on Facebook">
                                <i class="fab fa-facebook"></i>
                            </a>
                        </li>
                        <li>
                            <a href="https://reddit.com/submit?url=@{encodedPermalink}&amp;title=@{encodedTitle}" target="_blank" title="Share on Reddit">
                                <i class="fab fa-reddit"></i>
                            </a>
                        </li>
                        <li>
                            <a href="https://www.linkedin.com/shareArticle?url=@{encodedPermalink}&amp;title=@{encodedTitle}" target="_blank" title="Share on LinkedIn">
                                <i class="fab fa-linkedin"></i>
                            </a>
                        </li>
                    </ul>
                </div>
            </div>
        </section>
    </div>
</template>
