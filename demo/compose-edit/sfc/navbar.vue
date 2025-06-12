<script>
fluid.def("fluid.demos.navbar", {
})
</script>
<template>
<nav class="navbar navbar-default navbar-fixed-top navbar-custom">
<div class="container-fluid">
    <div class="navbar-ponder">
        <a class="navbar-ponder-brand" href="../../">Antranig Basman</a>
        <button type="button" class="navbar-toggle" data-toggle="collapse" data-target="#main-navbar">
            <span class="sr-only">Toggle navigation</span>
            <svg width="36" height="36" viewBox="0 0 24 24" stroke="#888" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 7L4 7" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M20 12L4 12" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M20 17L4 17" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
        </button>
        <div class="collapse navbar-collapse" id="main-navbar">
            <ul class="nav navbar-nav navbar-right">
                <li>
                    <a title="Posts" href="../../post">Posts</a>
                </li>
                <li>
                    <a title="WiP" href="../../wip">WiP</a>
                </li>
                <li>
                    <a title="About" href="../../page/about/">About</a>
                </li>
                <li>
                    <a title="Communities" href="../../communities">Communities</a>
                </li>
                <li>
                    <a title="Projects" href="../../projects">Projects</a>
                </li>
                <li>
                    <a title="Terms" href="../../term">Terms</a>
                </li>
            </ul>
        </div>
    </div>

</div>
</nav>
</template>
