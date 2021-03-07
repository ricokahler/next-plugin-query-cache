import readline from 'readline';
import fs from 'fs';
import path from 'path';

const acc: {
  [cacheKey: string]: {
    serverCacheHits: number;
    memoryCacheHits: {
      [processId: number]: number;
    };
  };
} = {};

const processIdSet = new Set<number>();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function tryParseLine(
  line: string
): {
  cacheKey: string;
  cacheType: 'server-cache' | 'memory-cache';
  processId: number;
} | null {
  try {
    if (!line) {
      return null;
    }

    const result = JSON.parse(line);

    if (
      'cacheKey' in result &&
      'cacheType' in result &&
      'processId' in result
    ) {
      return result;
    }

    return null;
  } catch (e) {
    return null;
  }
}

rl.on('line', (line) => {
  const result = tryParseLine(line);
  if (!result) {
    return;
  }

  const { cacheKey, cacheType, processId } = result;

  const current = acc[cacheKey] || {
    serverCacheHits: 0,
    memoryCacheHits: {},
  };

  if (cacheType === 'memory-cache') {
    processIdSet.add(processId);
  }

  switch (cacheType) {
    case 'server-cache': {
      current.serverCacheHits = current.serverCacheHits + 1;
      break;
    }
    case 'memory-cache': {
      const processHits = current.memoryCacheHits[processId] || 0;
      current.memoryCacheHits[processId] = processHits + 1;
      break;
    }
  }

  acc[cacheKey] = current;
});

async function main() {
  await new Promise((resolve) => {
    rl.on('close', resolve);
  });

  const filename = `${path.resolve(
    process.cwd(),
    `./next-plugin-query-cache-${new Date().toISOString()}.csv`
  )}`;

  const stream = fs.createWriteStream(filename);

  const processIds = Array.from(processIdSet).sort();

  stream.write(
    `Cache Key,Total Hits,Hits Server,Hits Memory,${processIds
      .map((id) => `Hits pid ${id}`)
      .join(',')}\n`
  );

  const rows = Object.entries(acc)
    .map(([cacheKey, { memoryCacheHits, serverCacheHits }]) => {
      const totalMemoryCacheHits = Object.values(memoryCacheHits).reduce(
        (sum, next) => sum + next,
        0
      );
      const totalHits = serverCacheHits + totalMemoryCacheHits;

      return {
        cacheKey,
        totalHits,
        serverCacheHits,
        totalMemoryCacheHits,
        processHits: processIds.map((pid) => memoryCacheHits[pid] || 0),
      };
    })
    .sort((a, b) => b.totalHits - a.totalHits);

  const totals = rows.reduce<{
    totalHits: number;
    serverHits: number;
    memoryHits: number;
  }>(
    (acc, next) => {
      acc.totalHits = acc.totalHits + next.totalHits;
      acc.serverHits = acc.serverHits + next.serverCacheHits;
      acc.memoryHits = acc.memoryHits + next.totalMemoryCacheHits;
      return acc;
    },
    {
      totalHits: 0,
      serverHits: 0,
      memoryHits: 0,
    }
  );

  for (const {
    cacheKey,
    totalHits,
    serverCacheHits,
    totalMemoryCacheHits,
    processHits,
  } of rows) {
    stream.write(
      `${cacheKey.replace(
        /"|'|,/g,
        ''
      )},${totalHits},${serverCacheHits},${totalMemoryCacheHits},${processHits.join(
        ','
      )}\n`
    );
  }

  stream.end();

  await new Promise((resolve) => stream.on('finish', resolve));

  console.log(
    `
=== Next Plugin Query Cache ===
${totals.totalHits.toString().padStart(7, ' ')} total cache hits.
${totals.memoryHits.toString().padStart(7, ' ')} hits in memory.
${totals.serverHits.toString().padStart(7, ' ')} hits in the proxy.
${processIds.length.toString().padStart(7, ' ')} build processes found.
===============================

Wrote out extended report out to ${filename}
`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
