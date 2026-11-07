export const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
export const nowIso = () => new Date().toISOString();
export const isDefined = (value) => value !== undefined && value !== null;
//# sourceMappingURL=index.js.map