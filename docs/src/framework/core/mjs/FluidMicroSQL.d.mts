export default fluid;
declare namespace fluid {
    namespace microsql {
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
        function parse(sql: string): SQLAST;
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
        function execute(ast: SQLAST, data: any[]): any[];
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
        function query(sql: string, data: any[]): any[];
    }
}
//# sourceMappingURL=FluidMicroSQL.d.mts.map