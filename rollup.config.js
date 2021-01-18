import babel from '@rollup/plugin-babel';
import resolve from '@rollup/plugin-node-resolve';

const extensions = ['.js', '.ts'];

const externals = ['express', 'webpack', 'node-fetch'];

export default [
  {
    input: './src/index.ts',
    output: {
      file: './dist/index.esm.js',
      format: 'es',
      sourcemap: true,
    },
    plugins: [
      resolve({ extensions, modulesOnly: true }),
      babel({
        babelrc: false,
        configFile: false,
        presets: [
          ['@babel/preset-env', { targets: 'node 10 and not IE 11' }],
          '@babel/preset-typescript',
        ],
        plugins: [
          '@babel/plugin-transform-runtime',
          [
            '@babel/plugin-proposal-object-rest-spread',
            { loose: true, useBuiltIns: true },
          ],
        ],
        babelHelpers: 'runtime',
        extensions,
      }),
    ],
    external: [/^@babel\/runtime/, ...externals],
  },
  {
    input: './src/index.ts',
    output: {
      file: './dist/index.cjs.js',
      format: 'cjs',
      sourcemap: true,
    },
    plugins: [
      resolve({ extensions, modulesOnly: true }),
      babel({
        babelrc: false,
        configFile: false,
        presets: ['@babel/preset-env', '@babel/preset-typescript'],
        babelHelpers: 'bundled',
        extensions,
      }),
    ],
    external: ['regenerator-runtime/runtime', ...externals],
  },
  {
    input: './src/config.ts',
    output: {
      file: './dist/config.cjs.js',
      format: 'cjs',
      sourcemap: true,
    },
    plugins: [
      resolve({ extensions, modulesOnly: true }),
      babel({
        babelrc: false,
        configFile: false,
        presets: ['@babel/preset-env', '@babel/preset-typescript'],
        babelHelpers: 'bundled',
        extensions,
      }),
    ],
    external: ['regenerator-runtime/runtime', ...externals],
  },
];
