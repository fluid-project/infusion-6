<script>
// The body of the 404 page - Hugo's 404.html. Its emoji picker is a client-side script, which is retained verbatim.
fluid.def("beautifulWend.main.notFound", {
    $layers: "beautifulWend.main"
});
</script>

<template>
    <div role="main" class="container main-content">
        <div class="text-center">
            <h1 class="error-emoji"></h1>
            <p class="error-text">@{{i18n}.strings.pageNotFound}</p>
        </div>
        <script>
            var errorEmojiContainer = document.getElementsByClassName('error-emoji')[0];
            var emojiArray = [
                '\\(o_o)/', '(o^^)o', '(˚Δ˚)b', '(^-^*)', '(≥o≤)', '(^_^)b', '(·_·)',
                '(=\'X\'=)', '(>_<)', '(;-;)', '\\(^Д^)/',
            ];
            var errorEmoji = emojiArray[Math.floor(Math.random() * emojiArray.length)];
            errorEmojiContainer.appendChild(document.createTextNode(errorEmoji));
        </script>
    </div>
</template>
