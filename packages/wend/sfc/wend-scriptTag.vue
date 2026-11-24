<script>
// One <script> destined for the *output* document, rendered from a member of one of the document's script records
// as `script`. An attribute bound to an undefined member is omitted, and `defer` is a boolean attribute.
// It is marked fluid-client as payload for the browser, which the server never evaluates, and which a writer can tell
// apart from the scripts which boot Infusion itself. A static build strips the marker.
fluid.def("wend.scriptTag", {
});
</script>

<template>
    <script src="@{script.src}" defer="@{script.defer}" onload="@{script.onload}" fluid-client>@{script.text}</script>
</template>
