import * as ast_type from "../go-slang-parser/src/parser_mapper/ast_types";

// return type
interface compileTypeFuncs {
    // generally, the array isnt used
    [key: string]: (comp: any) => ast_type.Type | undefined
}

class TypeEnv {
    private parent: TypeEnv | null;
    private bindings: Map<string, ast_type.Type | undefined> = new Map();

    constructor(parent: TypeEnv | null = null, names: string[] = [], types: Array<ast_type.Type | undefined> = []) {
        this.parent = parent;
        for (let i = 0; i < names.length; i++) {
            this.bindings.set(names[i], types[i]);
        }
    }

    getParent(): TypeEnv {
        if (this.parent == null) {
            throw new Error("No parent environment");
        }
        return this.parent;
    }

    // get type of variable
    get(name: string): ast_type.Type | undefined {
        let e: TypeEnv | null = this;
        while (e != null) {
            if (e.bindings.has(name)) {
                return e.bindings.get(name);
            }
            e = e.parent;
        }

        // should not reach here. should be caught
        throw new Error(`Variable ${name} used before it is assigned`);
    }

    checkCurrentScope(name: string) {
        if (this.bindings.has(name)) { 
            throw new Error(`Variable ${name} redeclared in same scope`);
        }
    }

    set(names: string[], types: Array<ast_type.Type | undefined>) {
        for (let i = 0; i < names.length; i++) {
            this.checkCurrentScope(names[i]);
            this.bindings.set(names[i], types[i]);
        }
    }

    extend(names: string[] = [], types: Array<ast_type.Type | undefined> = []): TypeEnv {
        return new TypeEnv(this, names, types);
    }

}

// add globally defined types
const globalTypeEnv = new TypeEnv(null, 
    // TODO: should parameter be 'any' instead?
    ["display"],    [new ast_type.FunctionType([new ast_type.BasicTypeClass('string')], new ast_type.BasicTypeClass('string'))]);

export class GoTypeChecker {
    private ast: ast_type.Program;
    private typeChecked: boolean;
    private env: TypeEnv;

    constructor(ast: ast_type.Program) {
        this.ast = ast;
        this.typeChecked = false;
        this.env = globalTypeEnv;
    }

    public typeCheck() {
        if (this.typeChecked) {
            return;
        }
        this.checkReturnType[this.ast.type](this.ast);
        this.typeChecked = true;
    }

    private checkReturnType: compileTypeFuncs = {
        program: (comp: ast_type.Program) => {
            comp.top_declarations.forEach(decl => {
                console.log(decl.type);
                this.checkReturnType[decl.type](decl);
            });
            return undefined;
        }, 
        identifier: (comp: ast_type.Identifier) => {
            return this.env.get(comp.name);

        },
        literal: (comp: ast_type.Literal) => {
            return comp.val_type;

        },
        application: (comp: ast_type.Application) => {
            this.checkReturnType[comp.operator.type](comp.operator);

            if (comp.operator instanceof ast_type.FunctionNode) {
                if (this.checkReturnType[comp.operator.name.type](comp.operator.name) instanceof ast_type.FunctionType) {
                    const function_name = comp.operator.name;
                    // look up the function in the environment by function name
                    const func_type = this.env.get(comp.operator.name.name) as ast_type.FunctionType;

                    const expected_operand_types = func_type.formal_values;
                    let actual_operand_types: Array<ast_type.Type>;
                    actual_operand_types = [];
                    comp.operands.forEach(operand => {
                        const operand_type = this.checkReturnType[operand.type](operand);
                        // TODO: update parser and FunctionType to allow expected_operand_types to include undefined
                        if (operand_type == undefined) {
                            throw new Error(`specifying undefined as operand for function application is bad practice! Not allowed in this implementation`);
                        } else {
                            actual_operand_types.push(operand_type);
                        }
                    });

                    if (expected_operand_types.length != actual_operand_types.length) {
                        throw new Error((expected_operand_types.length > actual_operand_types.length ? `Insufficient` : `Too many`)
                            + `arguments supplied to ${function_name}! Expected ${expected_operand_types.length}, Received ${actual_operand_types.length}.`);
                    } else { // correct number of arguments supplied
                        expected_operand_types.forEach((expected_type, index) => {
                            if (!expected_type.isSameType(actual_operand_types[index])) {
                                throw new Error(`Incorrect argument type supplied to ${function_name}! Expected ${expected_type.getTypeName()}, Received ${actual_operand_types[index].getTypeName()}`);
                            }
                        });

                        return func_type.return_value;
                    }

                } else {
                    // should not reach here. should have accounted for this in compiler
                    throw new Error(`${comp.operator.name} is not a function (should not reach here)`);
                }
            } else {
                throw new Error(`should not reach here`)
            }  
        },
        declaration: (comp: ast_type.Declaration) => { // x := 1 OR x, y, z := 1, 2, 3 
            // comp.declaration_type = 'constant' | 'variable'
            
            let val_types: Array<ast_type.Type | undefined>;
            val_types = [];

            let id_names: string[];
            id_names = [];
            
            comp.vals.forEach((val) => {
                val_types.push(this.checkReturnType[val.type](val));
            });
            comp.ids.forEach((id) => {
                id_names.push(id.name);
            });
            
            // check length of id matches
            if (val_types.length != id_names.length) {
                throw new Error((val_types.length > id_names.length ? `Too many` : `Insufficient`)
                            + ` values supplied to delcaration! Expected ${id_names.length}, Received ${val_types.length}.`);
            }

            // check that only variable types are undefined
            val_types.forEach((val_type, index) => {
                if (val_type == undefined && comp.declaration_type != 'variable') {
                    throw new Error(`Non variable declaration ${id_names[index]} must have value assigned!`);
                }
            });

            this.env.set(id_names, val_types);
            return undefined; // Declaration does not return anything
        },
        unop: (comp: ast_type.UnOp) => {
            const val_type = this.checkReturnType[comp.expr.type](comp.expr);
            switch (comp.opcode) {
            case "!": 
                if (val_type != undefined && val_type.isSameType(new ast_type.BasicTypeClass('bool'))) {
                    return new ast_type.BasicTypeClass('bool');
                }
                throw new Error(`Invalid Operand Type for ! unary operator. Expected boolean, received ${val_type}`);
            case "-":
                if (val_type != undefined && val_type.isSameType(new ast_type.BasicTypeClass('number'))) {
                    return new ast_type.BasicTypeClass('number');
                }
                throw new Error(`Invalid Operand Type for - unary operator. Expected number, received ${val_type}`);
            default: // should not reach default case. would have been caught in compiler
                throw new Error(`Unrecognized opcode ${comp.opcode}`);
            }
            
        },
        binop: (comp: ast_type.BinOp) => {
            const left_type = this.checkReturnType[comp.left.type](comp.left);
            const right_type = this.checkReturnType[comp.right.type](comp.right);
            
            switch (comp.opcode) {
            case "-":
            case "*":
            case "/":
            case "%":
            case "<":
            case "<=":
            case ">": 
            case ">=":
                if (left_type != undefined
                    && right_type != undefined 
                    && left_type.isSameType(new ast_type.BasicTypeClass('number'))
                    && right_type.isSameType(new ast_type.BasicTypeClass('number'))) {
                        return new ast_type.BasicTypeClass('number');
                }
                throw new Error(`Invalid Operand Types for ${comp.opcode} binary operator. Expected [number, number], received [${left_type}, ${right_type}]`);
            case "+":
                if (left_type != undefined
                    && right_type != undefined) {
                    if (left_type.isSameType(new ast_type.BasicTypeClass('number'))
                        && right_type.isSameType(new ast_type.BasicTypeClass('number'))) {
                            return new ast_type.BasicTypeClass('number');
                    } else if (left_type.isSameType(new ast_type.BasicTypeClass('string'))
                        && right_type.isSameType(new ast_type.BasicTypeClass('string'))) {
                            return new ast_type.BasicTypeClass('string');
                    }
                } 
                throw new Error(`Invalid Operand Types for + binary operator. Expected [number, number] or [string, string], received [${left_type}, ${right_type}]`);
            case "==":
            case "!=":
                return new ast_type.BasicTypeClass('bool');
            case "&&":
            case "||":
                if (left_type != undefined
                    && right_type != undefined 
                    && left_type.isSameType(new ast_type.BasicTypeClass('bool'))
                    && right_type.isSameType(new ast_type.BasicTypeClass('bool'))) {
                        return new ast_type.BasicTypeClass('bool');
                }
                throw new Error(`Invalid Operand Types for ${comp.opcode} binary operator. Expected [bool, bool], received [${left_type}, ${right_type}]`);
            default: // should not reach default case. would have been caught in compiler
                throw new Error(`Unrecognized opcode ${comp.opcode}`);

            }
        }, 
        expressionStatement: (comp: ast_type.ExpressionStatement) => {
            this.checkReturnType[comp.expression.type](comp.expression);
            return undefined;
        },
        returnStatement: (comp: ast_type.ReturnStatement) => {
            let expression_types: Array<ast_type.Type>
            expression_types = [];
            comp.expressions.forEach((expression) => {
                const ret_type = this.checkReturnType[expression.type](expression)
                if (ret_type == undefined) {
                    if (comp.expressions.length > 1) {
                        throw new Error(`Unable to Return Undefined Type`)
                    } else {
                        return undefined;
                    }
                } else {
                    expression_types.concat(ret_type);
                }
            });

            return new ast_type.TupleType(expression_types);
        },
        assignmentStatement: (comp: ast_type.AssignmentStatement) => {
            if (comp.ids.length != comp.vals.length) {
                throw new Error((comp.ids.length > comp.vals.length ? `Insufficient` : `Too many`)
                    + ` values supplied to Assignment Statement. Expected ${comp.ids.length}, Received ${comp.vals.length}.`);
            }
            comp.ids.forEach((id, index) => {
                const id_type = this.env.get(id.name);
                const val_type = this.checkReturnType[comp.vals[index].type](comp.vals[index]);
                if (id_type) {
                    if (val_type == undefined || !id_type.isSameType(val_type)) {
                        throw new Error(`Mistmatching Type in Assignment between variable and value! Expected ${id_type}, Received ${val_type}`);
                    }
                } else {
                    throw new Error(`Variable ${id.name} not declared!`);
                }
                    
            });
            return undefined;
        },
        ifStatement: (comp: ast_type.IfStatement) => {
            let cond_type = this.checkReturnType[comp.cond.type](comp.cond);
            if (cond_type == undefined) {
                throw new Error(`Invalid Predicate Type undefined, expected boolean`);

            } else if (!cond_type.isSameType(new ast_type.BasicTypeClass('bool'))) {
                throw new Error(`Invalid Predicate Type ${cond_type.getTypeName()}, expected boolean`);
            }
            let cons_type = undefined as ast_type.Type | undefined;
            let alt_type = undefined as ast_type.Type | undefined;
            let encounteredReturn = false;
            comp.cons.forEach((cons) => {
                let cons_ret = this.checkReturnType[cons.type](cons);
                if (cons_ret != undefined && !encounteredReturn) {
                    cons_type = cons_ret;
                    encounteredReturn = true;
                };
            });

            encounteredReturn = false;
            if (comp.alt != null) {
                comp.alt.forEach((alt) => {
                    let alt_ret = this.checkReturnType[alt.type](alt);
                    if (alt_ret != undefined && !encounteredReturn) {
                        alt_type = alt_ret;
                        encounteredReturn = true;
                    }
                });

                if (cons_type == undefined && alt_type != undefined) {
                    throw new Error(`Types of If-Else branch not matching! Cons: undefined, Alt: ${alt_type.getTypeName()}`);
                }

                if (cons_type != undefined) {
                    if (alt_type == undefined) {
                        throw new Error(`Types of If-Else branch not matching! Cons: ${cons_type.getTypeName()}, Alt: undefined`);
                    } else if (!cons_type.isSameType(alt_type)) {
                        throw new Error(`Types of If-Else branch not matching! Cons: ${cons_type.getTypeName()}, Alt: ${alt_type.getTypeName()}`);
                    }
                }
            }

            return cons_type;   
        },
        forStatement: (comp: ast_type.ForStatement) => {
            this.checkReturnType[comp.init.type](comp.init); // declaration of variable for looping
            this.checkReturnType[comp.post.type](comp.post); // iteration step for variable

            const cond_type = this.checkReturnType[comp.cond.type](comp.cond);
            if (cond_type == undefined) {
                throw new Error(`Invalid Predicate Type undefined, expected boolean`);
            } else if (!cond_type.isSameType(new ast_type.BasicTypeClass('bool'))) {
                throw new Error(`Invalid Predicate Type ${cond_type.getTypeName()}, expected boolean`);
            }

            let return_type: ast_type.Type | undefined = undefined;
            let returnEncountered = false;
            comp.body.forEach(stmt => {
                const ret_type = this.checkReturnType[stmt.type](stmt);
                if (ret_type != undefined && !returnEncountered) {
                    return_type = ret_type;
                    returnEncountered = true;
                }
            });

            return return_type;
        },
        goStatement: (comp: ast_type.GoStatement) => {
            this.checkReturnType[comp.app.type](comp.app);
            return undefined;
        },
        function: (comp: ast_type.FunctionNode) => {
            let param_types: Array<ast_type.Type>;
            param_types = [];
            this.env = this.env.extend();
            comp.formals.forEach(param => {
                // const p_type = this.checkReturnType[param.type](param);
                const p_type = param.val_type;
                if (p_type != undefined) {
                    param_types.push(p_type);
                    this.env.set([param.name], [p_type]);
                } else {
                    throw new Error(`Parameter cannot be undefined!`);
                }
            });
            comp.body.forEach(stmt => {
                const stmt_type = this.checkReturnType[stmt.type](stmt);
                if(stmt_type != undefined) {
                    if (!(stmt_type.isSameType(comp.retType))) {
                        throw new Error(`Return Type Mismatch in Function ${comp.name}!`)
                    }
                }
            });
            this.env.set([comp.name.name], [new ast_type.FunctionType(param_types, comp.retType)]);
            return undefined;
        }
    }

}