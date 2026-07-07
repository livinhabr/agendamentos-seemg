export const logger = {
  info: (obj: unknown, msg?: string) => console.log(msg ? `${msg}: ${JSON.stringify(obj)}` : obj),
  warn: (obj: unknown, msg?: string) => console.warn(msg ? `${msg}: ${JSON.stringify(obj)}` : obj),
  error: (obj: unknown, msg?: string) => console.error(msg ? `${msg}: ${JSON.stringify(obj)}` : obj),
};
