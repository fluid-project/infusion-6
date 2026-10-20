<script>
fluid.def("fluid.demos.counter", {
    $layers: "fluid.topLevelWidget",
    state: {
        $reactiveRoot: {
            count: 0
        }
    },
    count: "{self}.state.count",
    increment: {
        $method: {
            func: state => {
                state.count++;
            },
            args: ["{self}.state"]
        }
    }
});
</script>

<template>
    <div class="counter">
        <span>Clicked @{count} times</span>
        <button class="counter-button" @onclick="{self}.increment()">+1</button>
    </div>
</template>

<style>
.counter {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 18px;
    padding: 12px;
}

.counter-button {
    font: inherit;
    padding: 4px 12px;
    cursor: pointer;
}
</style>
