/* global QUnit */

"use strict";

/**
 * MicroSQL Tests - QUnit
 *
 * Test suite for the lightweight SQL query engine
 */

const testUsers = [
    { id: 1, name: "Alice", age: 30, city: "NYC", active: true, salary: 75000 },
    { id: 2, name: "Bob", age: 25, city: "LA", active: true, salary: 65000 },
    { id: 3, name: "Charlie", age: 35, city: "NYC", active: false, salary: 85000 },
    { id: 4, name: "Diana", age: 28, city: "SF", active: true, salary: 90000 },
    { id: 5, name: "Eve", age: 32, city: "NYC", active: true, salary: 80000 }
];

QUnit.module("Basic SELECT", function () {

    QUnit.test("SELECT specific columns", function (assert) {
        const result = fluid.microsql.query("SELECT name, age FROM users", testUsers);
        const expected = [
            { name: "Alice", age: 30 },
            { name: "Bob", age: 25 },
            { name: "Charlie", age: 35 },
            { name: "Diana", age: 28 },
            { name: "Eve", age: 32 }
        ];
        assert.deepEqual(result, expected, "Should select only name and age columns");
    });

    QUnit.test("SELECT * (all columns)", function (assert) {
        const result = fluid.microsql.query("SELECT * FROM users", testUsers);
        assert.deepEqual(result, testUsers, "Should select all columns");
    });

    QUnit.test("SELECT single column", function (assert) {
        const result = fluid.microsql.query("SELECT name FROM users", testUsers);
        const expected = [
            { name: "Alice" },
            { name: "Bob" },
            { name: "Charlie" },
            { name: "Diana" },
            { name: "Eve" }
        ];
        assert.deepEqual(result, expected, "Should select only name column");
    });

});

QUnit.module("WHERE Clause", function () {

    QUnit.test("WHERE with single condition (>)", function (assert) {
        const result = fluid.microsql.query("SELECT name, age FROM users WHERE age > 30", testUsers);
        const expected = [
            { name: "Charlie", age: 35 },
            { name: "Eve", age: 32 }
        ];
        assert.deepEqual(result, expected, "Should filter rows where age > 30");
    });

    QUnit.test("WHERE with equality", function (assert) {
        const result = fluid.microsql.query("SELECT name FROM users WHERE city = 'NYC'", testUsers);
        const expected = [
            { name: "Alice" },
            { name: "Charlie" },
            { name: "Eve" }
        ];
        assert.deepEqual(result, expected, "Should filter rows where city equals NYC");
    });

    QUnit.test("WHERE with AND operator", function (assert) {
        const result = fluid.microsql.query("SELECT name, age FROM users WHERE age > 25 AND city = 'NYC'", testUsers);
        const expected = [
            { name: "Alice", age: 30 },
            { name: "Charlie", age: 35 },
            { name: "Eve", age: 32 }
        ];
        assert.deepEqual(result, expected, "Should filter with AND condition");
    });

    QUnit.test("WHERE with OR operator", function (assert) {
        const result = fluid.microsql.query("SELECT name, city FROM users WHERE city = 'NYC' OR city = 'SF'", testUsers);
        const expected = [
            { name: "Alice", city: "NYC" },
            { name: "Charlie", city: "NYC" },
            { name: "Diana", city: "SF" },
            { name: "Eve", city: "NYC" }
        ];
        assert.deepEqual(result, expected, "Should filter with OR condition");
    });

    QUnit.test("WHERE with complex AND conditions", function (assert) {
        const result = fluid.microsql.query("SELECT name FROM users WHERE age >= 28 AND salary > 70000 AND active = true", testUsers);
        const expected = [
            { name: "Alice" },
            { name: "Diana" },
            { name: "Eve" }
        ];
        assert.deepEqual(result, expected, "Should filter with multiple AND conditions");
    });

    QUnit.test("WHERE with boolean value", function (assert) {
        const result = fluid.microsql.query("SELECT name FROM users WHERE active = false", testUsers);
        const expected = [
            { name: "Charlie" }
        ];
        assert.deepEqual(result, expected, "Should filter by boolean value");
    });

});

QUnit.module("Comparison Operators", function () {

    QUnit.test("WHERE with < operator", function (assert) {
        const result = fluid.microsql.query("SELECT name FROM users WHERE age < 30", testUsers);
        const expected = [
            { name: "Bob" },
            { name: "Diana" }
        ];
        assert.deepEqual(result, expected, "Should filter with < operator");
    });

    QUnit.test("WHERE with >= operator", function (assert) {
        const result = fluid.microsql.query("SELECT name FROM users WHERE age >= 30", testUsers);
        const expected = [
            { name: "Alice" },
            { name: "Charlie" },
            { name: "Eve" }
        ];
        assert.deepEqual(result, expected, "Should filter with >= operator");
    });

    QUnit.test("WHERE with <= operator", function (assert) {
        const result = fluid.microsql.query("SELECT name FROM users WHERE age <= 30", testUsers);
        const expected = [
            { name: "Alice" },
            { name: "Bob" },
            { name: "Diana" }
        ];
        assert.deepEqual(result, expected, "Should filter with <= operator");
    });

    QUnit.test("WHERE with <> (not equal) operator", function (assert) {
        const result = fluid.microsql.query("SELECT name FROM users WHERE city <> 'NYC'", testUsers);
        const expected = [
            { name: "Bob" },
            { name: "Diana" }
        ];
        assert.deepEqual(result, expected, "Should filter with <> operator");
    });

    QUnit.test("WHERE with != (not equal) operator", function (assert) {
        const result = fluid.microsql.query("SELECT name FROM users WHERE city != 'NYC'", testUsers);
        const expected = [
            { name: "Bob" },
            { name: "Diana" }
        ];
        assert.deepEqual(result, expected, "Should filter with != operator");
    });

});

QUnit.module("ORDER BY", function () {

    QUnit.test("ORDER BY ascending (default)", function (assert) {
        const result = fluid.microsql.query("SELECT name, age FROM users ORDER BY age", testUsers);
        const expected = [
            { name: "Bob", age: 25 },
            { name: "Diana", age: 28 },
            { name: "Alice", age: 30 },
            { name: "Eve", age: 32 },
            { name: "Charlie", age: 35 }
        ];
        assert.deepEqual(result, expected, "Should sort by age ascending");
    });

    QUnit.test("ORDER BY descending", function (assert) {
        const result = fluid.microsql.query("SELECT name, age FROM users ORDER BY age DESC", testUsers);
        const expected = [
            { name: "Charlie", age: 35 },
            { name: "Eve", age: 32 },
            { name: "Alice", age: 30 },
            { name: "Diana", age: 28 },
            { name: "Bob", age: 25 }
        ];
        assert.deepEqual(result, expected, "Should sort by age descending");
    });

    QUnit.test("ORDER BY multiple columns", function (assert) {
        const result = fluid.microsql.query("SELECT name, city, age FROM users ORDER BY city, age DESC", testUsers);
        const expected = [
            { name: "Bob", city: "LA", age: 25 },
            { name: "Charlie", city: "NYC", age: 35 },
            { name: "Eve", city: "NYC", age: 32 },
            { name: "Alice", city: "NYC", age: 30 },
            { name: "Diana", city: "SF", age: 28 }
        ];
        assert.deepEqual(result, expected, "Should sort by city then age descending");
    });

    QUnit.test("ORDER BY with explicit ASC", function (assert) {
        const result = fluid.microsql.query("SELECT name, age FROM users ORDER BY age ASC", testUsers);
        const expected = [
            { name: "Bob", age: 25 },
            { name: "Diana", age: 28 },
            { name: "Alice", age: 30 },
            { name: "Eve", age: 32 },
            { name: "Charlie", age: 35 }
        ];
        assert.deepEqual(result, expected, "Should sort by age ascending with explicit ASC");
    });

});

QUnit.module("LIMIT", function () {

    QUnit.test("LIMIT clause", function (assert) {
        const result = fluid.microsql.query("SELECT name FROM users LIMIT 3", testUsers);
        const expected = [
            { name: "Alice" },
            { name: "Bob" },
            { name: "Charlie" }
        ];
        assert.deepEqual(result, expected, "Should limit to 3 rows");
    });

    QUnit.test("LIMIT with ORDER BY", function (assert) {
        const result = fluid.microsql.query("SELECT name, age FROM users ORDER BY age DESC LIMIT 2", testUsers);
        const expected = [
            { name: "Charlie", age: 35 },
            { name: "Eve", age: 32 }
        ];
        assert.deepEqual(result, expected, "Should sort then limit to 2 rows");
    });

});

QUnit.module("Combined Features", function () {

    QUnit.test("All features combined (WHERE + ORDER BY + LIMIT)", function (assert) {
        const result = fluid.microsql.query(
            "SELECT name, age, salary FROM users WHERE city = 'NYC' AND age > 25 ORDER BY salary DESC LIMIT 2",
            testUsers
        );
        const expected = [
            { name: "Charlie", age: 35, salary: 85000 },
            { name: "Eve", age: 32, salary: 80000 }
        ];
        assert.deepEqual(result, expected, "Should apply WHERE, ORDER BY, and LIMIT");
    });

    QUnit.test("Complex query with OR and AND (AND has higher precedence)", function (assert) {
        const result = fluid.microsql.query(
            "SELECT name, city FROM users WHERE city = 'NYC' OR city = 'SF' AND age >= 30 ORDER BY name",
            testUsers
        );
        const expected = [
            { name: "Alice", city: "NYC" },
            { name: "Charlie", city: "NYC" },
            { name: "Eve", city: "NYC" }
        ];
        assert.deepEqual(result, expected, "Should handle OR/AND precedence correctly");
    });

});

QUnit.module("Parse and Execute Separately", function () {

    QUnit.test("Parse then execute", function (assert) {
        const ast = fluid.microsql.parse("SELECT name, age FROM users WHERE age > 30");
        const result = fluid.microsql.execute(ast, testUsers);
        const expected = [
            { name: "Charlie", age: 35 },
            { name: "Eve", age: 32 }
        ];
        assert.deepEqual(result, expected, "Should allow parsing and executing separately");
    });

});

QUnit.module("Error Handling", function () {

    QUnit.test("Error on missing FROM clause", function (assert) {
        assert.throws(
            function () {
                fluid.microsql.parse("SELECT name WHERE age > 25");
            },
            /missing FROM clause/,
            "Should throw error when FROM clause is missing"
        );
    });

    QUnit.test("Error on non-SELECT statement", function (assert) {
        assert.throws(
            function () {
                fluid.microsql.parse("INSERT INTO users VALUES (1, 'test')");
            },
            /Only SELECT queries are supported/,
            "Should throw error for non-SELECT statements"
        );
    });

    QUnit.test("Error on incomplete WHERE condition", function (assert) {
        assert.throws(
            function () {
                fluid.microsql.parse("SELECT * FROM users WHERE age");
            },
            /Invalid condition/,
            "Should throw error for incomplete WHERE condition"
        );
    });

    QUnit.test("Error on non-array data", function (assert) {
        assert.throws(
            function () {
                fluid.microsql.execute({ type: "SELECT", columns: ["*"], from: "users" }, "not an array");
            },
            /Data must be an array/,
            "Should throw error when data is not an array"
        );
    });

});
