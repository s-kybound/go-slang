import * as ast_type from "../go-slang-parser/src/parser_mapper/ast_types";

// return type
interface compileTypeFuncs {
    // generally, the array isnt used
    [key: string]: (comp: any) => (ast_type.Type | undefined)[]
}

// parameter type
interface compileParamTypeFuncs {
    [key: string]: (comp: any, operands: Array<ast_type.Type | undefined>) => ast_type.Type | undefined
}

export class GoTypeChecker {
    private ast: ast_type.Program;
    private typeChecked: boolean;

    constructor(ast: ast_type.Program) {
        this.ast = ast;
        this.typeChecked = false;
    }

    public typeCheck() {
        if (this.typeChecked) {
            return;
        }
        this.typeCheckProgram();
        this.typeChecked = true;
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
        identifier: (comp: ast_type.Identifier) => {
            return [comp.val_type];
        }, 
        literal: (comp: ast_type.Literal) => {
            return [comp.val_type];
        },
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
        declaration: (comp: ast_type.Declaration) => {
            let val_types, id_types: Array<ast_type.Type | undefined>;
            val_types = [];
            id_types = [];
            comp.vals.forEach((val) => {
                val_types.concat(this.compileTypeFuncs[val.type](val));
            });
            comp.ids.forEach((id) => {
                id_types.concat(this.compileTypeFuncs[id.type](id));
            });
            id_types.forEach((id_type, index) => {
                if (id_type == undefined) {
                    // id_type not defined, assume the type
                    id_types[index] = val_types[index];
                } else if (!id_type.isSameType(val_types[index])) {
                    throw new Error(`Invalid Value Type ${val_types[index]} for ID Type ${id_type}`);
                }
            });
            return [undefined];
        },
        unop: (comp: ast_type.UnOp) => {
            const val_types = this.compileTypeFuncs[comp.expr.type](comp.expr);
            // not really needed since array only applies to multivariable declaration?
            // if (val_types.length != 1) {
            //     throw new Error(`Incorrect Number of Parameters Supplied to Unary Operator! Expected 1, Received ${val_types.length}`);
            // }
            switch (comp.opcode) {
            case "!": 
                if (val_types[0] != undefined && val_types[0].isSameType(new ast_type.BasicTypeClass('bool'))) {
                    return [new ast_type.BasicTypeClass('bool')];
                }
                throw new Error(`Invalid Operand Type for ! unary operator. Expected boolean, received ${val_types[0]?.type_details}`);
            case "-":
                if (val_types[0] != undefined && val_types[0].isSameType(new ast_type.BasicTypeClass('number'))) {
                    return [new ast_type.BasicTypeClass('number')];
                }
                throw new Error(`Invalid Operand Type for - unary operator. Expected number, received ${val_types[0]?.type_details}`);
            default: // should not reach default case. would have been caught in compiler
                throw new Error(`Unrecognized opcode ${comp.opcode}`);
            }
        },
        binop: (comp: ast_type.BinOp) => {
            const left_types = this.compileTypeFuncs[comp.left.type](comp.left);
            const right_types = this.compileTypeFuncs[comp.right.type](comp.right);
            // not really needed since array only applies to multivariables declaration?
            // if (left_types.length != 1 || right_types.length != 1) {
            //     throw new Error(`Incorrect Number of Parameters Supplied to Binary Operator! Expected 2, Received ${left_types.length + right_types.length}`);
            // }
            switch (comp.opcode) {
            case "-":
            case "*":
            case "/":
            case "%":
            case "<":
            case "<=":
            case ">": 
            case ">=":
                if (left_types[0] != undefined
                    && right_types[0] != undefined 
                    && left_types[0].isSameType(new ast_type.BasicTypeClass('number'))
                    && right_types[0].isSameType(new ast_type.BasicTypeClass('number'))) {
                        return [new ast_type.BasicTypeClass('number')];
                }
                throw new Error(`Invalid Operand Types for ${comp.opcode} binary operator. Expected [number, number], received [${left_types[0]}, ${right_types[0]}]`);
            case "+":
                if (left_types[0] != undefined
                    && right_types[0] != undefined) {

                    if (left_types[0].isSameType(new ast_type.BasicTypeClass('number'))
                        && right_types[0].isSameType(new ast_type.BasicTypeClass('number'))) {
                            return [new ast_type.BasicTypeClass('number')];
                    } else if (left_types[0].isSameType(new ast_type.BasicTypeClass('string'))
                        && right_types[0].isSameType(new ast_type.BasicTypeClass('string'))) {
                            return [new ast_type.BasicTypeClass('string')];
                    }
                } 
                throw new Error(`Invalid Operand Types for + binary operator. Expected [number, number] or [string, string], received [${left_types[0]}, ${right_types[0]}]`);
            case "==":
            case "!=":
                return [new ast_type.BasicTypeClass('bool')];
            case "&&":
            case "||":
                if (left_types[0] != undefined
                    && right_types[0] != undefined 
                    && left_types[0].isSameType(new ast_type.BasicTypeClass('bool'))
                    && right_types[0].isSameType(new ast_type.BasicTypeClass('bool'))) {
                        return [new ast_type.BasicTypeClass('bool')];
                }
                throw new Error(`Invalid Operand Types for ${comp.opcode} binary operator. Expected [bool, bool], received [${left_types[0]}, ${right_types[0]}]`);
            default: // should not reach default case. would have been caught in compiler
                throw new Error(`Unrecognized opcode ${comp.opcode}`);

            }
        },
        expressionStatement: (comp: ast_type.ExpressionStatement) => {
            this.compileTypeFuncs[comp.expression.type](comp.expression);
            return [undefined];
        },
        returnStatement: (comp: ast_type.ReturnStatement) => {
            let expression_types: Array<ast_type.Type | undefined>
            expression_types = [];
            comp.expressions.forEach((expression) => {
                expression_types.concat(this.compileTypeFuncs[expression.type](expression));
            });

            return expression_types;
        },
        // array only applies to multivariable assignment
        assignmentStatement: (comp: ast_type.AssignmentStatement) => {
            let val_types, id_types: Array<ast_type.Type | undefined>;
            val_types = [];
            id_types = [];
            comp.vals.forEach((val) => {
                val_types.concat(this.compileTypeFuncs[val.type](val));
            });
            comp.ids.forEach((id) => {
                id_types.concat(this.compileTypeFuncs[id.type](id));
            });
            id_types.forEach((id_type, index) => {
                if (id_type == undefined) {
                    throw new Error(`Variable assigned before initialisation!`);
                } else if (!id_type.isSameType(val_types[index])) {
                    throw new Error(`Invalid Value Type ${val_types[index]} for ID Type ${id_type}`);
                }
            });
            return [undefined];
        },
        // TODO: think through this again
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
        function: (comp: ast_type.FunctionNode) => {
            let returnTypes: Array<Array<ast_type.Type | undefined>>;
            returnTypes = [];
            comp.body.forEach((stmt) => {
                returnTypes.push(this.compileTypeFuncs[stmt.type](stmt));
            });

            returnTypes.forEach((ret) => {
                let typeReturn: Array<ast_type.Type>;
                typeReturn = [];
                ret.forEach((r) => {
                    if (r != undefined) {
                        typeReturn.push(r);
                    } else {
                        // TODO: this is probably wrong 
                        throw new Error(`Undefined`);
                    }
                });

                new ast_type.TupleType(typeReturn);
            });
            if (comp.retType != undefined) {
                if comp.retType.isSameType(returnTypes[0]);
            }

            return comp.retType;
        } 

    }
}