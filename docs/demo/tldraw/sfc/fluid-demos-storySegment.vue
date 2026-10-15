<script>
// DRAFT - one run of text within the story's highlight layer, created by $for over {storyTime}.segments
fluid.def("fluid.demos.storySegment", {
    // Variable injected by $for
    segment: null
});
</script>

<template>
    <span class="story-segment" @class="story-too-long:@{segment.isTooLong}" title="@{segment.title}">@{segment.text}</span>
</template>

<style>
.story-segment.story-too-long {
    background-color: #FFB6C1;
    border-radius: 3px;
    padding: 0 2px;
}
</style>
