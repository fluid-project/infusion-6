<script>
fluid.def("fluid.demos.divergencePost", {
    $layers: "fluid.demos.post",
    name: "Divergence"
})
</script>
<template>
    <div role="main">
        <div class="row">
            <div class="col-lg-8 col-lg-offset-2 col-md-10 col-md-offset-1">

                <article role="main" class="blog-post">
                    <p>Defined in my <a href="https://www.ppig.org/files/2016-PPIG-27th-Basman1.pdf">2016 paper</a>, <strong>divergence</strong> represents
                        any discrepancy between the runtime state of a program, and the state through which it can be authored. Typical
                        sources of divergence include the program’s <a href="https://en.wikipedia.org/wiki/Call_stack"><em>call stack</em></a>,
                        uninterpreted addresses within the <a href="https://stackoverflow.com/questions/79923/what-and-where-are-the-stack-and-heap"><em>heap</em></a>,
                        <a href="https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Events">event listeners</a> and
                        typical sources of object representation such as <a href="https://en.wikipedia.org/wiki/Virtual_method_table">vtables</a> and the like.</p>
                    <p>In a tradition of materialised programming, divergence should be minimised, in order to reduce the mental burden on
                        those trying to visualise the effects of their edits.</p>
                    <p>Closely related notions are the <strong>Gulf of Execution</strong>, and <strong>Gulf of Evaluation</strong>, originally coined by Don Norman in
                        his 1988 <a href="https://en.wikipedia.org/wiki/The_Design_of_Everyday_Things">Design of Everyday Things</a>.</p>
                    <p>Jonathan Edwards centres bridging these gulfs in his 2005 paper
                        <a href="https://www.subtext-lang.org/OOPSLA05.pdf">Subtext: Uncovering the Simplicity of Programming</a>:</p>
                    <blockquote>
                        <p>The Gulf of Execution is the difficulty
                            of translating a desired goal into an action to be executed. The
                            Gulf of Evaluation is the difficulty of determining whether an
                            observable state meets the desired goals.</p>
                    </blockquote>
                    <p>and announces</p>
                    <blockquote>
                        <p>Subtext is a new medium in which the representation of a program
                            is the same thing as its execution.</p>
                    </blockquote>
                    <p>Subtext is thus a medium or <a href="../../term/substrate">substrate</a> in which divergence is minimised.</p>
                </article>
            </div>
        </div>
    </div>

</template>
