export const logger = {
  info: (obj: any, msg?: string) => console.log(msg ? `${msg}: ${JSON.stringify(obj)}` : obj),
  warn: (obj: any, msg?: string) => console.warn(msg ? `${msg}: ${JSON.stringify(obj)}` : obj),
  error: (obj: any, msg?: string) => console.error(msg ? `${msg}: ${JSON.stringify(obj)}` : obj),
};
