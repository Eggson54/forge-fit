module.exports = {
  root: true,
  extends: ['expo'],
  ignorePatterns: ['/dist/*', 'node_modules/*'],
  rules: {
    'react/no-unescaped-entities': 'off',

    // eslint-config-expo 57 turns on the React Compiler rule set. These flag
    // patterns the compiler cannot optimise — reading a ref during render,
    // setting state from an effect — which are correct React and behave
    // correctly without the compiler. It is not enabled here (see app.json
    // `experiments`), so they are warnings: visible, and worth fixing before
    // anybody switches the compiler on, but not a reason to fail a build that
    // works. There were 101 of them on the day of the SDK 57 upgrade.
    'react-hooks/refs': 'warn',
    'react-hooks/set-state-in-effect': 'warn',
    'react-hooks/preserve-manual-memoization': 'warn',
    'react-hooks/immutability': 'warn',
    'react-hooks/purity': 'warn',
  },
};
