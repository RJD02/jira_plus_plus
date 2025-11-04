export function createLogger(namespace) {
  const prefix = `[llm:${namespace}]`;
  return {
    info(message, meta) {
      meta ? console.info(prefix, message, meta) : console.info(prefix, message);
    },
    warn(message, meta) {
      meta ? console.warn(prefix, message, meta) : console.warn(prefix, message);
    },
    error(message, meta) {
      meta ? console.error(prefix, message, meta) : console.error(prefix, message);
    },
    debug(message, meta) {
      if (process.env.NODE_ENV !== "production") {
        meta ? console.debug(prefix, message, meta) : console.debug(prefix, message);
      }
    },
  };
}
