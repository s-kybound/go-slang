import * as es from "estree";
import { GoNode } from "./go-slang-parser/src/parser_mapper/ast_types";
import { Environment } from "./runner/env";


export interface Frame {
    [name: string]: any
}

export type Value = any;

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
    debugger: {
        /** External observers watching this context */
        status: boolean
        state: {
            it: IterableIterator<T>
            scheduler: Scheduler
        }
    }
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