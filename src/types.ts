import * as es from "estree";
import { GoNode } from "./go-slang-parser/src/parser_mapper/ast_types";
import { Environment } from "./runner/env";

export type Value = any;

export interface CustomBuiltIns {
    rawDisplay: (value: Value, str: string, externalContext: any) => Value;
    prompt: (value: Value, str: string, externalContext: any) => string | null;
    alert: (value: Value, str: string, externalContext: any) => void;
    visualiseList: (list: any, externalContext: any) => void;
}

export enum ErrorType {
    IMPORT = 'Import',
    RUNTIME = 'Runtime',
    SYNTAX = 'Syntax',
    TYPE = 'Type'
}
  
export enum ErrorSeverity {
    WARNING = 'Warning',
    ERROR = 'Error'
}

export interface GoError {
    type: ErrorType
    severity: ErrorSeverity
    location: es.SourceLocation
    explain(): string
    elaborate(): string
}

export interface Context<T = any> {
    externalSymbols: string[]
    errors: GoError[]
    runtime: {
        break: boolean
        debuggerOn: boolean
        isRunning: boolean
        // environmentTree: EnvTree
        environments: Environment[]
        nodes: GoNode[]
        // control: Control | null
        // stash: Stash | null
        objectCount: number
        envStepsTotal: number
        breakpointSteps: number[]
        changepointSteps: number[]
    }
    numberOfOuterEnvironments: number

    prelude: string | null

    /** the state of the debugger */
    // debugger: {
    //     /** External observers watching this context */
    //     status: boolean
    //     state: {
    //         it: IterableIterator<T>
    //         scheduler: Scheduler
    //     }
    // }
    
    /**
     * Used for storing external properties.
     * For e.g, this can be used to store some application-related
     * context for use in your own built-in functions (like `display(a)`)
     */
    externalContext?: T
}

export interface Error {
    status: 'error'
}
  
export interface Finished {
    status: 'finished'
    context: Context
    value: Value
}
  
export interface Suspended {
    status: 'suspended'
    it: IterableIterator<Value>
    scheduler: Scheduler
    context: Context
}
  
export type SuspendedNonDet = Omit<Suspended, 'status'> & { status: 'suspended-non-det' } & {
    value: Value
}
  
export interface SuspendedCseEval {
    status: 'suspended-cse-eval'
    context: Context
}

export type Result = Suspended | SuspendedNonDet | Finished | Error | SuspendedCseEval

export interface Scheduler {
    run(it: IterableIterator<Value>, context: Context): Promise<Result>
  }