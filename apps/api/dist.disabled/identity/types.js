export class DuplicateError extends Error {
    field;
    constructor(field) {
        super(`Duplicate ${field}`);
        this.field = field;
        this.name = 'DuplicateError';
    }
}
//# sourceMappingURL=types.js.map