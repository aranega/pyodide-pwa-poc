from ast import *
from pyodideffi import log


def evaluate(s):
    log(f"* Evaluating string {s} (because)")
    log(f"Result is {eval(s)}")
    log(f"* Parsing string {s}")


def modify_ast(s):
    tree = parse(s)
    node = Expr(value=Call(func=Name(id='print', ctx=Load()), args=[Constant(value='Pyodide was there')], keywords=[]))
    tree.body.append(node)
    log(f"* Inserting node {node.__class__.__name__} in {tree.__class__.__name__}")
    return unparse(tree)