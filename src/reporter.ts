function reporter(
  cacheKey: string,
  cacheType: 'server-cache' | 'memory-cache'
) {
  console.log(
    `\n${JSON.stringify({ cacheKey, cacheType, processId: process.pid })}\n`
  );
}

export default reporter;
