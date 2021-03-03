import babel from '@rollup/plugin-babel';
import resolve from '@rollup/plugin-node-resolve';

const extensions = ['.js', '.ts'];

const external = [/^@babel\/runtime/, 'express', 'webpack', 'node-fetch'];

const plugins = [
  resolve({ extensions, modulesOnly: true }),
  babel({
    babelrc: false,
    configFile: false,
    presets: [
      // assumes node 10+ because that's the minimum version next.js supports
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
];

export default [
  {
    input: './src/index.ts',
    output: {
      file: './dist/index.esm.js',
      format: 'es',
      sourcemap: true,
    },
    plugins,
    external,
  },
  {
    input: './src/index.ts',
    output: {
      file: './dist/index.cjs.js',
      format: 'cjs',
      sourcemap: true,
    },
    plugins,
    external,
  },
  {
    input: './src/config.ts',
    output: {
      file: './dist/config.cjs.js',
      format: 'cjs',
      sourcemap: true,
      exports: 'auto',
    },
    plugins,
    external,
  },
];
