/**
 * MicroSQL - Lightweight SQL Query Engine for JavaScript
 *
 * A minimal SQL parser and executor for SELECT queries against in-memory arrays.
 * Supports basic SELECT, WHERE, ORDER BY, and LIMIT clauses.
 * No dependencies, plain JavaScript only.
 *
 * Portable SQL subset designed to work identically with R's sqldf.
 *
 * @module microsql
 */

"use strict";

/**
 * @typedef {Object} SQLCondition
 * @property {String} type - "condition"
 * @property {String} column - Column name
 * @property {String} operator - Comparison operator (=, <>, !=, <, >, <=, >=)
 * @property {Any} value - Comparison value
 */

/**
 * @typedef {Object} SQLLogicalCondition
 * @property {String} operator - "AND" or "OR"
 * @property {Array<SQLCondition|SQLLogicalCondition>} conditions - Child conditions
 * @property {Function} evaluate - Synthesized evaluator function (row) => Boolean (only at WHERE clause root)
 */

/**
 * @typedef {Object} SQLOrderBy
 * @property {String} column - Column name to sort by
 * @property {String} direction - "ASC" or "DESC"
 */

/**
 * @typedef {Object} SQLAST
 * @property {String} type - "SELECT"
 * @property {String[]} columns - Column names or ["*"]
 * @property {String} from - Table name
 * @property {SQLCondition|SQLLogicalCondition|null} where - WHERE clause condition tree
 * @property {SQLOrderBy[]} orderBy - ORDER BY specifications
 * @property {Number|null} limit - LIMIT value
 */

const $fluidMicroSQLScope = function(fluid) {

    if (!fluid.microsql) {
        fluid.microsql = {};
    }

    /**
     * Parse a SQL SELECT statement into an Abstract Syntax Tree (AST)
     *
     * Supported SQL syntax:
     * - SELECT col1, col2, ... | * FROM table
     * - WHERE col = value [AND|OR col = value ...]
     * - ORDER BY col [ASC|DESC] [, col [ASC|DESC] ...]
     * - LIMIT n
     *
     * Operators: =, <>, !=, <, >, <=, >=
     *
     * @param {String} sql - SQL query string
     * @return {SQLAST} Parsed query AST
     * @throws {Error} If SQL syntax is invalid
     *
     * @example
     * fluid.microsql.parse("SELECT name, age FROM users WHERE age > 25")
     * // Returns:
     * // {
     * //   type: "SELECT",
     * //   columns: ["name", "age"],
     * //   from: "users",
     * //   where: { type: "condition", column: "age", operator: ">", value: 25 },
     * //   orderBy: [],
     * //   limit: null
     * // }
     */
    fluid.microsql.parse = function(sql) {
        sql = sql.trim().replace(/\s+/g, " ");

        if (!sql.toUpperCase().startsWith("SELECT")) {
            throw new Error("Only SELECT queries are supported");
        }

        const ast = {
            type: "SELECT",
            columns: [],
            from: null,
            where: null,
            orderBy: [],
            limit: null
        };

        const selectMatch = sql.match(/SELECT\s+(.*?)\s+FROM/i);
        if (!selectMatch) {
            throw new Error("Invalid SELECT syntax: missing FROM clause");
        }

        const columnsStr = selectMatch[1].trim();
        if (columnsStr === "*") {
            ast.columns = ["*"];
        } else {
            ast.columns = columnsStr.split(",").map(col => col.trim());
        }

        const fromMatch = sql.match(/FROM\s+(\w+)/i);
        if (!fromMatch) {
            throw new Error("Invalid FROM syntax");
        }
        ast.from = fromMatch[1];

        const whereMatch = sql.match(/WHERE\s+(.*?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/i);
        if (whereMatch) {
            ast.where = parseWhereClause(whereMatch[1].trim());
        }

        const orderByMatch = sql.match(/ORDER\s+BY\s+(.*?)(?:\s+LIMIT|$)/i);
        if (orderByMatch) {
            ast.orderBy = parseOrderBy(orderByMatch[1].trim());
        }

        const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
        if (limitMatch) {
            ast.limit = parseInt(limitMatch[1], 10);
        }

        return ast;
    };

    /**
     * Parse a WHERE clause into a condition tree, compiled into a synthesized JS evaluator function
     *
     * @param {String} whereStr - WHERE clause string (without WHERE keyword)
     * @return {SQLCondition|SQLLogicalCondition} Condition tree with synthesized evaluator
     */
    function parseWhereClause(whereStr) {
        // Build the condition tree structure (for AST inspection/debugging)
        const tree = parseWhereClauseTree(whereStr);

        // Synthesize optimized evaluator function from the tree
        const code = synthesizeEvaluatorCode(tree);
        const evaluator = new Function("row", `return ${code};`);

        // Attach synthesized evaluator to tree
        tree.evaluate = evaluator;

        return tree;
    }

    /**
     * Build condition tree structure (without evaluators)
     *
     * @private
     * @param {String} whereStr - WHERE clause string
     * @return {SQLCondition|SQLLogicalCondition} Condition tree
     */
    function parseWhereClauseTree(whereStr) {
        const orParts = splitByOperator(whereStr, "OR");
        if (orParts.length > 1) {
            return {
                operator: "OR",
                conditions: orParts.map(part => parseWhereClauseTree(part))
            };
        }

        const andParts = splitByOperator(whereStr, "AND");
        if (andParts.length > 1) {
            return {
                operator: "AND",
                conditions: andParts.map(part => parseWhereClauseTree(part))
            };
        }

        return parseCondition(whereStr.trim());
    }

    /**
     * Synthesize JavaScript code for evaluating a condition tree
     *
     * @param {SQLCondition|SQLLogicalCondition} tree - Condition tree
     * @return {String} JavaScript expression code
     */
    function synthesizeEvaluatorCode(tree) {
        if (tree.type === "condition") {
            const column = tree.column;
            const value = tree.value;

            // Generate property access
            const leftSide = `row.${column}`;

            // Generate value literal (with proper escaping)
            let rightSide;
            if (typeof value === "string") {
                // Escape quotes and backslashes in string literals
                const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
                rightSide = `"${escaped}"`;
            } else if (value === null) {
                rightSide = "null";
            } else if (typeof value === "boolean") {
                rightSide = value ? "true" : "false";
            } else {
                rightSide = String(value);
            }

            // Generate comparison operator
            let jsOperator;
            switch (tree.operator) {
            case "=":
                jsOperator = "===";
                break;
            case "<>":
            case "!=":
                jsOperator = "!==";
                break;
            case "<":
                jsOperator = "<";
                break;
            case ">":
                jsOperator = ">";
                break;
            case "<=":
                jsOperator = "<=";
                break;
            case ">=":
                jsOperator = ">=";
                break;
            default:
                throw new Error(`Unknown operator: ${tree.operator}`);
            }

            return `${leftSide} ${jsOperator} ${rightSide}`;
        }

        if (tree.operator === "AND") {
            const conditions = tree.conditions.map(cond => synthesizeEvaluatorCode(cond));
            return `(${conditions.join(" && ")})`;
        }

        if (tree.operator === "OR") {
            const conditions = tree.conditions.map(cond => synthesizeEvaluatorCode(cond));
            return `(${conditions.join(" || ")})`;
        }

        throw new Error("Invalid condition tree structure");
    }

    /**
     * Split a string by a logical operator (AND/OR), respecting quoted strings
     *
     * @param {String} str - String to split
     * @param {String} operator - Operator to split by ("AND" or "OR")
     * @return {String[]} Split parts
     */
    function splitByOperator(str, operator) {
        const parts = [];
        let current = "";
        let inString = false;
        let stringChar = null;
        let i = 0;

        while (i < str.length) {
            const char = str[i];

            if ((char === "'" || char === "\"") && !inString) {
                inString = true;
                stringChar = char;
                current += char;
                i++;
                continue;
            }

            if (char === stringChar && inString) {
                inString = false;
                stringChar = null;
                current += char;
                i++;
                continue;
            }

            if (!inString) {
                const remaining = str.slice(i);
                const operatorRegex = new RegExp(`^\\s+${operator}\\s+`, "i");
                if (operatorRegex.test(remaining)) {
                    parts.push(current.trim());
                    current = "";
                    i += remaining.match(operatorRegex)[0].length;
                    continue;
                }
            }

            current += char;
            i++;
        }

        if (current.trim()) {
            parts.push(current.trim());
        }

        if (parts.length > 0) {
            return parts;
        } else {
            return [str];
        }
    }

    /**
     * Parse a single condition (e.g., "age > 25")
     *
     * Returns plain condition object without evaluator function.
     * Evaluators are now synthesized at the WHERE clause level.
     *
     * @param {String} condStr - Condition string
     * @return {SQLCondition} Condition object with column, operator, and value
     */
    function parseCondition(condStr) {
        const match = condStr.match(/^(\w+)\s*(=|<>|!=|<=|>=|<|>)\s*(.+)$/);
        if (!match) {
            throw new Error(`Invalid condition: ${condStr}`);
        }

        const [, column, operator, valueStr] = match;
        const value = parseValue(valueStr.trim());

        return {
            type: "condition",
            column,
            operator,
            value
        };
    }

    /**
     * Parse a value from SQL (string, number, boolean, or null)
     *
     * @param {String} valueStr - Value string from SQL
     * @return {Any} Parsed value
     */
    function parseValue(valueStr) {
        if ((valueStr.startsWith("'") && valueStr.endsWith("'")) ||
            (valueStr.startsWith("\"") && valueStr.endsWith("\""))) {
            return valueStr.slice(1, -1);
        }

        if (valueStr.toUpperCase() === "NULL") {
            return null;
        }

        if (valueStr.toUpperCase() === "TRUE") {
            return true;
        }
        if (valueStr.toUpperCase() === "FALSE") {
            return false;
        }

        const num = Number(valueStr);
        if (!isNaN(num)) {
            return num;
        }

        throw new Error(`Cannot parse value: ${valueStr}`);
    }

    /**
     * Parse ORDER BY clause
     *
     * @param {String} orderByStr - ORDER BY clause string
     * @return {SQLOrderBy[]} Array of order specifications
     */
    function parseOrderBy(orderByStr) {
        const parts = orderByStr.split(",").map(s => s.trim());
        return parts.map(part => {
            const match = part.match(/^(\w+)(?:\s+(ASC|DESC))?$/i);
            if (!match) {
                throw new Error(`Invalid ORDER BY: ${part}`);
            }
            return {
                column: match[1],
                direction: match[2] ? match[2].toUpperCase() : "ASC"
            };
        });
    }

    /**
     * Execute a parsed SQL query against an array of objects
     *
     * @param {SQLAST} ast - Parsed SQL AST from fluid.microsql.parse()
     * @param {Object[]} data - Array of objects to query
     * @return {Object[]} Query results
     *
     * @example
     * const data = [
     *   { name: "Alice", age: 30, city: "NYC" },
     *   { name: "Bob", age: 25, city: "LA" }
     * ];
     * const ast = fluid.microsql.parse("SELECT name, age FROM users WHERE age > 25");
     * const results = fluid.microsql.execute(ast, data);
     * // Returns: [{ name: "Alice", age: 30 }]
     */
    fluid.microsql.execute = function(ast, data) {
        if (!Array.isArray(data)) {
            throw new Error("Data must be an array");
        }

        let result = data;

        if (ast.where) {
            result = result.filter(row => evaluateCondition(ast.where, row));
        }

        if (ast.columns[0] !== "*") {
            result = result.map(row => {
                const projected = {};
                for (const col of ast.columns) {
                    if (row.hasOwnProperty(col)) {
                        projected[col] = row[col];
                    }
                }
                return projected;
            });
        }

        if (ast.orderBy.length > 0) {
            result = [...result].sort((a, b) => {
                for (const orderSpec of ast.orderBy) {
                    const aVal = a[orderSpec.column];
                    const bVal = b[orderSpec.column];

                    let cmp = 0;
                    if (aVal < bVal) {
                        cmp = -1;
                    } else if (aVal > bVal) {
                        cmp = 1;
                    }

                    if (cmp !== 0) {
                        if (orderSpec.direction === "DESC") {
                            return -cmp;
                        } else {
                            return cmp;
                        }
                    }
                }
                return 0;
            });
        }

        if (ast.limit !== null) {
            result = result.slice(0, ast.limit);
        }

        return result;
    };

    /**
     * Evaluate a WHERE condition against a row
     *
     * @param {SQLCondition|SQLLogicalCondition} condition - Condition tree with synthesized evaluator
     * @param {Object} row - Data row
     * @return {Boolean} True if condition matches
     */
    function evaluateCondition(condition, row) {
        return condition.evaluate(row);
    }

    /**
     * Execute a SQL query against data (convenience function)
     *
     * Combines parse and execute into a single call.
     *
     * @param {String} sql - SQL SELECT query
     * @param {Object[]} data - Array of objects to query
     * @return {Object[]} Query results
     *
     * @example
     * const users = [
     *   { id: 1, name: "Alice", age: 30, city: "NYC" },
     *   { id: 2, name: "Bob", age: 25, city: "LA" },
     *   { id: 3, name: "Charlie", age: 35, city: "NYC" }
     * ];
     *
     * const result = fluid.microsql.query(
     *   "SELECT name, age FROM users WHERE city = 'NYC' ORDER BY age DESC",
     *   users
     * );
     *
     * console.log(result);
     * // [
     * //   { name: "Charlie", age: 35 },
     * //   { name: "Alice", age: 30 }
     * // ]
     */
    fluid.microsql.query = function(sql, data) {
        const ast = fluid.microsql.parse(sql);
        return fluid.microsql.execute(ast, data);
    };
};

// If we are standalone and in a browserlike, define namespace
if (typeof(fluid) === "undefined" && typeof(window) !== "undefined") {
    window.fluid = {};
}

// If there is a namespace in the global, bind to it
if (typeof(fluid) !== "undefined") {
    $fluidMicroSQLScope(fluid);
}
