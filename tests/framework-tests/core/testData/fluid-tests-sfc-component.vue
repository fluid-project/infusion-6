<script>
fluid.tests.sfc.executions++;
fluid.def("fluid.tests.sfc.component", {
    text: "Initial SFC text",
    count: 0,
    increment: {
        $method: {
            args: "{self}",
            func: self => self.count++
        }
    }
});
</script>
<template>
    <div class="fluid-tests-sfc">
        <span class="sfc-text">@{text}</span>
        <span class="sfc-count">@{count}</span>
        <button class="sfc-button" @onclick="{self}.increment()">Increment</button>
    </div>
</template>
<style>
.fluid-tests-sfc .sfc-text {
    color: rgb(255, 0, 0);
}
</style>
<symbols>
    <symbol id="fluid-tests-sfc-chevron" viewBox="0 0 16 16">
        <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8"/>
    </symbol>
</symbols>
