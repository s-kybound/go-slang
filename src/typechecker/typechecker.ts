import * as ast_type from "../go-slang-parser/src/parser_mapper/ast_types";

// return type
interface compileTypeFuncs {
    // generally, the array isnt used
    [key: string]: (comp: any) => (ast_type.Type | undefined)[]
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

    set(names: string[], types: Array<ast_type.Type | undefined>) {
        for (let i = 0; i < names.length; i++) {
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
    ["display"], [new ast_type.FunctionType([new ast_type.BasicTypeClass('string')], new ast_type.BasicTypeClass('string'))]);

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
        this.typeCheckProgram();
        this.typeChecked = true;
    }

    private checkReturnType(comp: ast_type.GoNode) : ast_type.Type | undefined {
        if (comp instanceof ast_type.Program) {
            comp.top_declarations.forEach(decl => {
                this.checkReturnType(decl);
            });
            return undefined;
        } else if (comp instanceof ast_type.Identifier) {
            return this.env.get(comp.name);

        } else if (comp instanceof ast_type.Literal) {
            return comp.val_type;

        } else if (comp instanceof ast_type.Application) {
            if (comp.operator instanceof ast_type.FunctionNode) {
                if (this.checkReturnType(comp.operator.name) instanceof ast_type.FunctionType) {
                    const function_name = comp.operator.name;
                    // look up the function in the environment by function name
                    const func_type = this.env.get(comp.operator.name.name) as ast_type.FunctionType;

                    const expected_operand_types = func_type.formal_values;
                    let actual_operand_types: Array<ast_type.Type>;
                    actual_operand_types = [];
                    comp.operands.forEach(operand => {
                        const operand_type = this.checkReturnType(operand);
                        // TODO: update parser and FunctionType to allow expected_operand_types to include undefined
                        if (operand_type == undefined) {
                            throw new Error(`specifying undefined as operand for function application is bad practice`);
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
        } else if (comp instanceof ast_type.Declaration) { // x := 1 OR x, y, z := 1, 2, 3 
            // comp.declaration_type = 'constant' | 'variable'
            
            let val_types: Array<ast_type.Type | undefined>;
            val_types = [];

            let id_names: string[];
            id_names = [];
            
            comp.vals.forEach((val) => {
                val_types.concat(this.checkReturnType(val));
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
        } else if (comp instanceof ast_type.UnOp) {
            const val_type = this.checkReturnType(comp.expr);
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
            
        } else if (comp instanceof ast_type.BinOp) {
            const left_type = this.checkReturnType(comp.left);
            const right_type = this.checkReturnType(comp.right);
            
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
        } else if (comp instanceof ast_type.ExpressionStatement) {
            this.checkReturnType(comp.expression);
            return undefined;
        } else if (comp instanceof ast_type.ReturnStatement) {
            let expression_types: Array<ast_type.Type>
            expression_types = [];
            comp.expressions.forEach((expression) => {
                const ret_type = this.checkReturnType(expression)
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
        } else if (comp instanceof ast_type.AssignmentStatement) {
            if (comp.ids.length != comp.vals.length) {
                throw new Error((comp.ids.length > comp.vals.length ? `Insufficient` : `Too many`)
                    + ` values supplied to Assignment Statement. Expected ${comp.ids.length}, Received ${comp.vals.length}.`);
            }
            comp.ids.forEach((id, index) => {
                const id_type = this.env.get(id.name);
                const val_type = this.checkReturnType(comp.vals[index]);
                if (id_type) {
                    if (val_type == undefined || !id_type.isSameType(val_type)) {
                        throw new Error(`Mistmatching Type in Assignment between variable and value! Expected ${id_type}, Received ${val_type}`);
                    }
                } else {
                    throw new Error(`Variable ${id.name} not declared!`);
                }
                    
            });
            return undefined;
        } else if (comp instanceof ast_type.IfStatement) {
            let cond_type = this.checkReturnType(comp.cond);
            if (cond_type == undefined) {
                throw new Error(`Invalid Predicate Type undefined, expected boolean`);

            } else if (!cond_type.isSameType(new ast_type.BasicTypeClass('bool'))) {
                throw new Error(`Invalid Predicate Type ${cond_type.getTypeName()}, expected boolean`);
            }
            let cons_type, alt_type: ast_type.Type | undefined;
            let encounteredReturn = false;
            comp.cons.forEach((cons) => {
                let cons_ret = this.checkReturnType(cons);
                if (cons_ret != undefined && !encounteredReturn) {
                    cons_type = cons_ret;
                    encounteredReturn = true;
                };
            });

            encounteredReturn = false;
            if (comp.alt != null) {
                comp.alt.forEach((alt) => {
                    let alt_ret = this.checkReturnType(alt);
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
        }
    }

    private typeCheckProgram() {
        this.compileTypeFuncs[this.ast.type](this.ast);
    }

    compileTypeFuncs: compileTypeFuncs = {
        program: (comp: ast_type.Program) => {
            comp.top_declarations.forEach((dec1) => {
                this.compileTypeFuncs[dec1.type](dec1);
            });
            return [undefined];
        },
        // // identifier: (comp: ast_type.Identifier) => {
        // //     return [comp.val_type];
        // // }, 
        // literal: (comp: ast_type.Literal) => {
        //     return [comp.val_type];
        // },
        // TODO: update this type check
        // TODO: update to check number of ids and vals are the same
        application: (comp: ast_type.Application) => {
            let operand_types: Array<ast_type.Type | undefined>
            operand_types = [];
            comp.operands.forEach((operand) => {
                operand_types.concat(this.compileTypeFuncs[operand.type](operand));
            });
            // TODO: look up comp.operator to find out what the required operand types are
            return [undefined];
            // [comp.operator.type](comp.operator, operand_types);
        },
        // x := 1 OR x, y, z := 5, 6, 7
        // array only applies to multivariable declaration
        // declaration: (comp: ast_type.Declaration) => {
        //     let val_types, id_types: Array<ast_type.Type | undefined>;
        //     val_types = [];
        //     id_types = [];
        //     comp.vals.forEach((val) => {
        //         val_types.concat(this.compileTypeFuncs[val.type](val));
        //     });
        //     comp.ids.forEach((id) => {
        //         id_types.concat(this.compileTypeFuncs[id.type](id));
        //     });
        //     id_types.forEach((id_type, index) => {
        //         if (id_type == undefined) {
        //             // id_type not defined, assume the type
        //             id_types[index] = val_types[index];
        //         } else if (!id_type.isSameType(val_types[index])) {
        //             throw new Error(`Invalid Value Type ${val_types[index]} for ID Type ${id_type}`);
        //         }
        //     });
        //     return [undefined];
        // },
        // unop: (comp: ast_type.UnOp) => {
        //     const val_types = this.compileTypeFuncs[comp.expr.type](comp.expr);
        //     // not really needed since array only applies to multivariable declaration?
        //     // if (val_types.length != 1) {
        //     //     throw new Error(`Incorrect Number of Parameters Supplied to Unary Operator! Expected 1, Received ${val_types.length}`);
        //     // }
        //     switch (comp.opcode) {
        //     case "!": 
        //         if (val_types[0] != undefined && val_types[0].isSameType(new ast_type.BasicTypeClass('bool'))) {
        //             return [new ast_type.BasicTypeClass('bool')];
        //         }
        //         // throw new Error(`Invalid Operand Type for ! unary operator. Expected boolean, received ${val_types[0]?.type_details}`);
        //     case "-":
        //         if (val_types[0] != undefined && val_types[0].isSameType(new ast_type.BasicTypeClass('number'))) {
        //             return [new ast_type.BasicTypeClass('number')];
        //         }
        //         // throw new Error(`Invalid Operand Type for - unary operator. Expected number, received ${val_types[0]?.type_details}`);
        //     default: // should not reach default case. would have been caught in compiler
        //         throw new Error(`Unrecognized opcode ${comp.opcode}`);
        //     }
        // },
        // binop: (comp: ast_type.BinOp) => {
        //     const left_types = this.compileTypeFuncs[comp.left.type](comp.left);
        //     const right_types = this.compileTypeFuncs[comp.right.type](comp.right);
        //     // not really needed since array only applies to multivariables declaration?
        //     // if (left_types.length != 1 || right_types.length != 1) {
        //     //     throw new Error(`Incorrect Number of Parameters Supplied to Binary Operator! Expected 2, Received ${left_types.length + right_types.length}`);
        //     // }
        //     switch (comp.opcode) {
        //     case "-":
        //     case "*":
        //     case "/":
        //     case "%":
        //     case "<":
        //     case "<=":
        //     case ">": 
        //     case ">=":
        //         if (left_types[0] != undefined
        //             && right_types[0] != undefined 
        //             && left_types[0].isSameType(new ast_type.BasicTypeClass('number'))
        //             && right_types[0].isSameType(new ast_type.BasicTypeClass('number'))) {
        //                 return [new ast_type.BasicTypeClass('number')];
        //         }
        //         throw new Error(`Invalid Operand Types for ${comp.opcode} binary operator. Expected [number, number], received [${left_types[0]}, ${right_types[0]}]`);
        //     case "+":
        //         if (left_types[0] != undefined
        //             && right_types[0] != undefined) {

        //             if (left_types[0].isSameType(new ast_type.BasicTypeClass('number'))
        //                 && right_types[0].isSameType(new ast_type.BasicTypeClass('number'))) {
        //                     return [new ast_type.BasicTypeClass('number')];
        //             } else if (left_types[0].isSameType(new ast_type.BasicTypeClass('string'))
        //                 && right_types[0].isSameType(new ast_type.BasicTypeClass('string'))) {
        //                     return [new ast_type.BasicTypeClass('string')];
        //             }
        //         } 
        //         throw new Error(`Invalid Operand Types for + binary operator. Expected [number, number] or [string, string], received [${left_types[0]}, ${right_types[0]}]`);
        //     case "==":
        //     case "!=":
        //         return [new ast_type.BasicTypeClass('bool')];
        //     case "&&":
        //     case "||":
        //         if (left_types[0] != undefined
        //             && right_types[0] != undefined 
        //             && left_types[0].isSameType(new ast_type.BasicTypeClass('bool'))
        //             && right_types[0].isSameType(new ast_type.BasicTypeClass('bool'))) {
        //                 return [new ast_type.BasicTypeClass('bool')];
        //         }
        //         throw new Error(`Invalid Operand Types for ${comp.opcode} binary operator. Expected [bool, bool], received [${left_types[0]}, ${right_types[0]}]`);
        //     default: // should not reach default case. would have been caught in compiler
        //         throw new Error(`Unrecognized opcode ${comp.opcode}`);

        //     }
        // },
        // expressionStatement: (comp: ast_type.ExpressionStatement) => {
        //     this.compileTypeFuncs[comp.expression.type](comp.expression);
        //     return [undefined];
        // },
        // returnStatement: (comp: ast_type.ReturnStatement) => {
        //     let expression_types: Array<ast_type.Type | undefined>
        //     expression_types = [];
        //     comp.expressions.forEach((expression) => {
        //         expression_types.concat(this.compileTypeFuncs[expression.type](expression));
        //     });

        //     return expression_types;
        // },
        // // array only applies to multivariable assignment
        // assignmentStatement: (comp: ast_type.AssignmentStatement) => {
        //     let val_types, id_types: Array<ast_type.Type | undefined>;
        //     val_types = [];
        //     id_types = [];
        //     comp.vals.forEach((val) => {
        //         val_types.concat(this.compileTypeFuncs[val.type](val));
        //     });
        //     comp.ids.forEach((id) => {
        //         id_types.concat(this.compileTypeFuncs[id.type](id));
        //     });
        //     id_types.forEach((id_type, index) => {
        //         if (id_type == undefined) {
        //             throw new Error(`Variable assigned before initialisation!`);
        //         } else if (!id_type.isSameType(val_types[index])) {
        //             throw new Error(`Invalid Value Type ${val_types[index]} for ID Type ${id_type}`);
        //         }
        //     });
        //     return [undefined];
        // },
        // // TODO: think through this again
        ifStatement: (comp: ast_type.IfStatement) => {
            let cond_type = this.compileTypeFuncs[comp.cond.type](comp.cond);
            if (cond_type[0] == undefined || !cond_type[0].isSameType(new ast_type.BasicTypeClass('bool'))) {
                throw new Error(`Invalid Predicate Type ${cond_type[0]}, expected boolean`);
            }
            let cons_type, alt_type: Array<ast_type.Type | undefined>;
            cons_type = [undefined];
            alt_type = [undefined];
            comp.cons.forEach((cons) => {
                if (cons.type == 'returnStatement') {
                    cons_type = this.compileTypeFuncs[cons.type](cons);
                } else {
                    this.compileTypeFuncs[cons.type](cons);
                }
            });

            if (comp.alt != null) {
                comp.alt.forEach((alt) => {
                    if (alt.type == 'returnStatement') {
                        alt_type = this.compileTypeFuncs[alt.type](alt);
                    } else {
                        this.compileTypeFuncs[alt.type](alt);
                    }
                });

                if (cons_type.length != alt_type.length) {
                    throw new Error(`Consequence and Alternate of If-Else return different number of values! Cons: ${cons_type.length}, Alt: ${alt_type.length}`);
                }
                let isMatched = true;
                cons_type.forEach((element, index) => {
                    isMatched = isMatched && 
                        ((element == undefined && alt_type[index] == undefined) 
                            || element.isSameType(alt_type[index]));
                });

                if (!isMatched) {
                    throw new Error(`Types of If-Else branch not matching! Cons: ${cons_type}, Alt: ${alt_type}`);
                }
            }

            return cons_type;
        },
        forStatement: (comp: ast_type.ForStatement) => {
            let cond_type = this.compileTypeFuncs[comp.cond.type](comp.cond);
            if (cond_type[0] == undefined || !cond_type[0].isSameType(new ast_type.BasicTypeClass('bool'))) {
                throw new Error(`Invalid Condition Type ${cond_type[0]}, expected boolean`);
            }
            
            comp.body.forEach((stmt) => {
                this.compileTypeFuncs[stmt.type](stmt);
            });
            
            return [undefined];
        },
        goStatement: (comp: ast_type.GoStatement) => {
            this.compileTypeFuncs[comp.app.type](comp.app);
            return [undefined];
        },
        // function: (comp: ast_type.FunctionNode) => {
        //     let returnTypes: Array<Array<ast_type.Type | undefined>>;
        //     returnTypes = [];
        //     // check the body for type errors
        //     comp.body.forEach((stmt) => {
        //         returnTypes.push(this.compileTypeFuncs[stmt.type](stmt));
        //     });

        //     returnTypes.forEach((ret) => {
        //         let typeReturn: Array<ast_type.Type>;
        //         typeReturn = [];
        //         ret.forEach((r) => {
        //             if (r != undefined) {
        //                 typeReturn.push(r);
        //             } else {
        //                 // TODO: this is probably wrong 
        //                 throw new Error(`Undefined`);
        //             }
        //         });

        //         if (comp.retType == undefined) {
        //             let isUndefined = true;
        //             ret.forEach((r) => {
        //                 isUndefined = isUndefined && (r == undefined);
        //             });
        //             if (isUndefined) {
        //                 return [undefined]
        //             }
        //         }
        //         new ast_type.TupleType(typeReturn);
        //     });
        //     if (comp.retType != undefined) {
        //         if comp.retType.isSameType(returnTypes[0]);
        //     }

        //     return comp.retType;
        // } 

    }
}