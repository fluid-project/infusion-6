<script>
"use strict";

fluid.def("fluid.tests.rt.item", {
    odd: "$compute:fluid.tests.rt.item.odd({self}.index)"
});

fluid.tests.rt.item.odd = index => index % 2 === 1;
</script>
<template>
    <li class="rt-item" @class="rt-odd:@{odd}"><svg width="10" height="10"><use href="#rt-star"/></svg>@{record.name}</li>
</template>
