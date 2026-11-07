#!/usr/bin/env node
import { Command } from 'commander';
import { Application } from '@irp/core';
export declare class CliError extends Error {
    readonly exitCode: number;
    constructor(message: string, exitCode?: number);
}
export declare const createRuntime: () => Application;
export declare const printJson: (value: unknown) => void;
export declare const createProgram: () => Command;
//# sourceMappingURL=index.d.ts.map