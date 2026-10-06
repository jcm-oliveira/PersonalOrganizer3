const js = require("@eslint/js");
const globals = require("globals");
const prettier = require("eslint-config-prettier");

module.exports = [
    { ignores: ["node_modules/", "public/uploads/"] },
    js.configs.recommended,
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: "commonjs",
            globals: globals.node,
        },
        rules: {
            "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
            "no-var": "error",
            "prefer-const": "error",
            eqeqeq: "error",
        },
    },
    {
        files: ["public/scripts/**/*.js"],
        languageOptions: { sourceType: "module", globals: globals.browser },
    },
    prettier,
];
