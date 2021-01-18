const exec = require('@ricokahler/exec');
const fs = require('fs');
const path = require('path');

const omit = (obj, keys) =>
  Object.fromEntries(
    Object.entries(obj).filter(([key]) => !keys.includes(key)),
  );

async function build() {
  console.log('Cleaning…');
  await exec('rm -rf dist');

  console.log('Installing…');
  await exec('npm i');

  console.log('Compiling types…');
  await exec(
    'npx tsc --noEmit false --declaration true --emitDeclarationOnly true --outDir ./dist',
  );

  console.log('Rolling…');
  await exec('npx rollup -c');

  console.log('Writing package.json…');
  const packageJson = require('../package.json');
  await fs.promises.writeFile(
    path.resolve(__dirname, '../dist/package.json'),
    JSON.stringify(
      {
        ...omit(packageJson, [
          // removes these
          'private',
          'scripts',
          'devDependencies',
        ]),
        main: './index.cjs.js',
        module: './index.esm.js',
        exports: {
          '.': {
            require: './index.cjs.js',
          },
          './config': {
            require: './config.cjs.js',
          },
        },
        types: './index.d.ts',
      },
      null,
      2,
    ),
  );

  console.log('Copying README…');
  const readme = await fs.promises.readFile(
    path.resolve(__dirname, '../README.md'),
  );
  await fs.promises.writeFile(
    path.resolve(__dirname, '../dist/README.md'),
    readme,
  );
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
