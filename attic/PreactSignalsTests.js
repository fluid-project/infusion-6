
// Ensure preact-signals itself passes early cutoff
QUnit.test("Early cutoff tests", assert => {

    let busyCount = 0;

    function busy() {
        busyCount++;
    }

    const headCell = signal(0);
    const c1Cell = computed( () => headCell.value);
    const c2Cell = computed( () => {
        c1Cell.value;
        return 0;
    });
    const c3Cell = computed( () => { busy(); return c2Cell.value + 1; });
    const c4Cell = computed( () => c3Cell.value + 2);
    const c5Cell = computed( () => c4Cell.value + 3);

    // Initial computation
    headCell.value = 1;
    assert.equal(c5Cell.value, 6, "Computed value 6");
    assert.equal(busyCount, 1, "One lot of busy on init");

    console.log("Test start");

    headCell.value = 0;
    assert.equal(c5Cell.value, 6, "No change in computed value");
    assert.equal(busyCount, 1, "Busy censored through early cutoff");

});

QUnit.test("Updates downstream pending computations", assert => {

    const s1 = signal(0);
    const s2 = signal(0);

    let order = "";

    const t1 = computed(() => {
        order += "t1";
        return s1.value === 0;
    });

    const t2 = computed(() => {
        order += "c1";
        return s1.value;
    });

    const t3 = computed(() => {
        order += "c2";

        // force dependency on t1
        t1.value;

        // nested computed
        return computed(() => {
            order += "c2_1";
            return s2.value;
        });
    });

    // cause update
    s1.value = 1;

    // trigger recomputation
    t2.value;
    t3.value.value;

    // Solid-signals order: "t1c1c2c2_1"
    assert.equal(order, "c1c2t1c2_1", "Downstream computations run in expected order");
});
