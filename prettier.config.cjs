module.exports = {
    arrowParens: 'always',
    singleQuote: true,
    trailingComma: 'all',
    tabWidth: 4,
    semi: true,
    printWidth: 100,
    bracketSpacing: true,
    bracketSameLine: false,
    endOfLine: 'lf',
    overrides: [
        {
            files: ['**/*.md', '**/*.mdx'],
            options: {
                // Match markdownlint MD007 expected 2-space list indentation
                tabWidth: 2,
                useTabs: false,
            },
        },
    ],
};
