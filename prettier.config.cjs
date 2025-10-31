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
            files: ['*.vue'],
            options: {
                parser: 'vue',
            },
        },
    ],
};
