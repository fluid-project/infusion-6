<script>
fluid.def("fluid.demos.substratePost", {
    $layers: "fluid.demos.post",
    name: "Substrate"
})
</script>
<template>
    <div role="main">
        <div class="row">
            <div class="col-lg-8 col-lg-offset-2 col-md-10 col-md-offset-1">

                <article role="main" class="blog-post">
                    <p>A substrate is a kind of self-sufficient model or material for the construction of software. Jonathan Edwards&rsquo; definition
                        is a great starting point comprising the following points:</p>
                    <ul>
                        <li>A complete and self-sufficient programming system</li>
                        <li>Persistent code &amp; data store</li>
                        <li>Direct-manipulation UI on that state</li>
                        <li>Live programming</li>
                        <li>Programming &amp; using are on a spectrum, not distinct</li>
                        <li>Conceptually unified — not a “stack”</li>
                    </ul>
                    <p>Summarized as a slogan: “A PL, DB, &amp; WYSIWYG document unified together.”</p>
                    <p>Whilst I subscribe to all of these points, in my vision many of them are not essential definitional aspects, but
                        instead essential <em>possibilities</em> – that is, that the substrate should be designed in such a way that they can be
                        brought into view or &ldquo;disclosed&rdquo; idiomatically in any context. For example, direct-manipulation and live programming
                        may not be appropriate or necessary for many users of a particular substrate&rsquo;s deployment – they may prefer to view
                        it as a regular application, indistinguishable from one not built on a substrate, or even as a static document.
                        But the path to bringing
                        these capabilities into view should be reasonably direct and not involve a fundamental change in the structure of
                        the application. This rules out pieces of obligately unidirectional machinery such as traditional kinds of &ldquo;compilers&rdquo;
                        or build tools from the infrastructure of a substrate unless they can be civilised or incrementalised somehow.</p>
                </article>
            </div>
        </div>
        <div id="code">

        </div>
    </div>

</template>
