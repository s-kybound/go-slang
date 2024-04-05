import { Value } from "../types";

// TODO: update to match js-slang implementation
export const stringify = (
    value: Value,
    indent: number = 2,
    splitLineThreshold = 80
) => {
    let indentN: number = indent;
    if (indent > 10) {
        indentN = 10
    }
    return value
}
