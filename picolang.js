'use strict';

const fs = require('fs');

let token = {
	LPAREN: '(',
	RPAREN: ')',
	LBRACE: '{',
	RBRACE: '}',
	ASSIGN: '=',
	ADD: '+',
	SUB: '-',
	MUL: '*',
	DIV: '/',
	EQL: '==',
	LSS: '<',	
	GTR: '>',
	LEQ: '<=',
	GEQ: '>=',
	NEQ: '!=',

	NOT: '!',

	COMMA: ',',

	IF: 'IF',
	ELSE: 'ELSE',

	FN: 'FN'
}

let keywords = {
	'if': token.IF,
	'else': token.ELSE, 
	'fn': token.FN, 
}

let datatypes = {
	FLOAT: 'float',
	INT: 'int',
	STRING: 'string',
	FUNCTION: 'fn',
}

let binop_precedence = {}
binop_precedence[token.ASSIGN] = 2;
binop_precedence[token.NEQ] = 10;
binop_precedence[token.EQL] = 10;
binop_precedence[token.LSS] = 10;
binop_precedence[token.GTR] = 10;
binop_precedence[token.LEQ] = 10;
binop_precedence[token.GEQ] = 10;
binop_precedence[token.ADD] = 20;
binop_precedence[token.SUB] = 20;
binop_precedence[token.MUL] = 40;
binop_precedence[token.DIV] = 40;

const WHITESPACE = /\s/;
const LETTERS = /[a-z]/i;
const NUMBERS_OR_DOT = /[\.0-9]/;

const NUMBER_INT = /^[0-9]+$/;
const NUMBER_FLOAT = /^(\d+)?(\.\d+)?$/;

function get_symbol(node, symbol_name, type) {
	if (!node)
		return null
	if (!node.st)
		return get_symbol(node.parent, symbol_name, type)
	if (node.st.symbols[symbol_name] === undefined) 
		return get_symbol(node.parent, symbol_name, type)

	return node.st.symbols[symbol_name]
}

let op_count = 0
function new_symbol(node, symbol_name, datatype, on_stack) {
	on_stack = on_stack || false
	if (!datatype) {
		throw TypeError('No type infered for ' + symbol_name)
	}
	let s = {
		name: symbol_name,
		exp_name: symbol_name,
		datatype,
		stack: 0
	}
	if (!node.st) {
		node.st = { 
			stack: 0,
			symbols: {}
		}
	}
	if (node.type !== 'comp_unit') {
		s.exp_name = 'op' + op_count
		op_count++
	}
	node.st.symbols[symbol_name] = s
	return s
}

function emit_global_symbols(symtable) {
	let res = ""
	for (let sym_name in symtable) {
		let sym = symtable[sym_name]
		switch(sym.datatype) {
			case datatypes.INT:
				res += `${sym.exp_name}: resd\n`
				break
			case datatypes.FLOAT:
				res += `${sym.exp_name}: resd\n`
				break
		}
		
	}
	return res
}

function type_to_id(type) {
	switch (type) {
		case datatypes.INT:
			return 'i32'
		case datatypes.FLOAT:
			return 'f32'
	}
}

function get_decorated_fn_name(name, types) {
	name = name + "@@"
	types.forEach(t=>{
		name += type_to_id(t)
	})
	return name
}

function tokenizer(input) {
	let current = 0;
	let value;
	let tokens = [];
  
	while (current < input.length) {
		let char = input[current];

		if (WHITESPACE.test(char)) {
			current++;
			continue;
		}

		if (char === '/' && input[current+1] === '/') {
			while(input[current] !== '\n' && current < input.length)
				current++
			continue
		}
		
		switch (char) {
			case token.LPAREN:
			case token.RPAREN:
			case token.LBRACE:
			case token.RBRACE:
			case token.COMMA:
			case token.ADD:
			case token.SUB:
			case token.MUL:
			case token.DIV:
				tokens.push({
					type: char,
				});
			
				current++;  
				continue;
			case token.ASSIGN:
				if (input[current+1] == '=') {
					tokens.push({type: token.EQL})
					current++
				} else {
					tokens.push({type: char})
				}
				current++;
				continue;
			case token.LSS:
				if (input[current+1] == '=') {
					tokens.push({type: token.LEQ})
					current++
				} else {
					tokens.push({type: char})
				}
				current++;
				continue;
			case token.GTR:
				if (input[current+1] == '=') {
					tokens.push({type: token.GEQ})
					current++
				} else {
					tokens.push({type: char})
				}
				current++;
				continue;
			case token.NOT:
				if (input[current+1] == '=') {
					tokens.push({type: token.NEQ})
					current++
				} else {
					tokens.push({type: char})
				}
				current++;
				continue;
			case '"':
				value = '';
  
				char = input[++current];
		  
				while (char !== '"' && current < input.length) {
				  value += char;
				  char = input[++current];
				}
		  
				char = input[++current];
		
				tokens.push({ type: 'string', value });  
				continue;
		}

		if (LETTERS.test(char)){ 
			value = '';
			while (LETTERS.test(char) && current < input.length) {
				value += char;
				char = input[++current];
			}
			
			if (keywords[value] !== undefined) {
				tokens.push({ type: keywords[value] });  
			} else {
				tokens.push({ type: 'ident', value });  
			}

			continue;
		} else if (NUMBERS_OR_DOT.test(char)) {
			value = '';
			while (NUMBERS_OR_DOT.test(char) && current < input.length) {
				value += char;
				char = input[++current];
			}

			if (NUMBER_INT.test(value)) {
				tokens.push({ type: 'number', value: parseInt(value), datatype: datatypes.INT });  
			} else if(NUMBER_FLOAT.test(value)) {
				tokens.push({ type: 'number', value: parseFloat(value), datatype: datatypes.FLOAT });  
			} else {
				throw new TypeError('Unexpected input:' + value);
			}
			continue;
		}
	
		throw new TypeError('Unexpected input:' + char);
	}
  
	tokens.push({ type: 'eof' })
	return tokens;
}

function make_parser(tokens) {
	let current = 0;
	let tok = tokens[current];
	
	function next() {
		current++
		tok = tokens[current];
		return tok
	}

	function consume(t) {
		if (tok.type !== t) {
			throw new TypeError('Extected ' + t + ' but got ' + tok.type);
		}
		next();
	}

	function get_token_prec() {
		return binop_precedence[tok.type] ? binop_precedence[tok.type] : -1
	}

	function parse_binop_RHS(prec, LHS) {
		while(true) {
			let tok_prec = get_token_prec();
			if (tok_prec < prec) {
				return LHS;
			}

			let bin_op = tok.type
			next();

			let RHS = parse_primary_expr()
			if(!RHS)
				return null

			let next_prec = get_token_prec()
			if (tok_prec < next_prec) {
				RHS = parse_binop_RHS(tok_prec + 1, RHS)
				if (!RHS)
					return null;
			}

			LHS = {
				type: 'binop_expr',
				bin_op,
				LHS,
				RHS,
			}
		}
	}

	function parse_ident() {
		let node = { type: 'ident', name: tok.value };
		consume('ident');
		return node;
	}

	function parse_paren_expr() {
		consume(token.LPAREN)

		let exp = parse_expr();
		if (!exp) {
			return null;
		}

		consume(token.RPAREN);
		return exp;
	}

	function parse_operant() {
		let op = null;
		switch(tok.type) {
			case 'ident':
				op = { type: 'ident_expr', value: parse_ident() }
				break;
			case token.LPAREN:
				op = parse_paren_expr();
				break;
			default:
				return null;
		}

		if (tok.type !== token.LPAREN) {
			return op;
		}

		// Call expression
		consume(token.LPAREN);
		let args = []
		while(true) {
			let expr = parse_expr()
			args.push(expr)
			if (tok.type !== token.COMMA) {
				break;
			}
			consume(token.COMMA);
		}
		consume(token.RPAREN);

		return {
			type: 'call_expr',
			name: op,
			value: args
		}
	}

	function parse_primary_expr() {
		let op = parse_operant();
		if (op) {
			return op;
		}

		switch(tok.type) {
			case 'number':
				let value = tok.value
				let datatype = tok.datatype
				next();		
				return { type: 'number_literal_expr', value, datatype };
		}


	}

	function parse_expr() {
		if (tok.type === token.LBRACE) {
			let expr = parse_comp_expr();
			consume(token.RBRACE)
			return expr
		} else if (tok.type === token.IF) {
			return parse_if_expr();
		}

		let LHS = parse_primary_expr();
		if (!LHS) {
			return null
		}

		return parse_binop_RHS(0, LHS);
	}

	function parse_expr_list() {
		let n = {
			type: 'expr_list',
			value: []
		}
		while(true)
		{
			let expr = parse_expr();
			if (!expr) {
				break
			}
			if (tok.type === 'eof')
				break; 
			n.value.push(expr)
		}
		return n
	}

	function parse_comp_expr() {
		consume(token.LBRACE)
		let n = {
			type: 'comp_expr',
			value: parse_expr_list()
		}
		return n
	}

	function parse_prototype() {
		let fn_name = parse_ident();
		consume(token.LPAREN);
		let args = []
		while(tok.type == 'ident') {
			args.push(tok.value)
			next()
			if (tok.type !== token.COMMA) {
				break;
			}
			consume(token.COMMA);
		}
		consume(token.RPAREN);
		return {
			type: 'prototype',
			name: fn_name,
			args
		}
	}

	function parse_def_expr() {
		consume(token.FN);
		let prototype = parse_prototype()

		let expr = parse_expr();

		return {
			type: 'def_expr',
			prototype,
			value: expr
		}
	}

	function parse_if_expr() {
		consume(token.IF)
		let cond = parse_expr();
		let th = parse_expr();
		let el
		if (tok.type === token.ELSE) {
			consume(token.ELSE)
			el = parse_expr()
		}

		return {
			type: 'if_expr',
			cond,
			th,
			el,
		}
	}

	return function() {
		let n = {
			type: 'comp_unit',
			value: []
		}
		while(true) {
			if (tok.type === token.FN) {
				n.value.push(parse_def_expr())
				continue
			}
			let expr = parse_expr()
			if (!expr) 
				break
			n.value.push(expr)
		}	
		return n
	}
}

let literals_optimization_pass = {
	binop_expr: (node, visit)=>{
		node.LHS = visit(node.LHS);
		node.RHS = visit(node.RHS);
		if (node.LHS !== undefined && 
			node.RHS !== undefined && 
			node.LHS.type == 'number_literal_expr' && 
			node.RHS.type == 'number_literal_expr') {
			let value = 0
			switch(node.bin_op) {
				case token.ADD:
					value = node.LHS.value + node.RHS.value
					break;
				case token.SUB:
					value = node.LHS.value - node.RHS.value
					break;
				case token.MUL:
					value = node.LHS.value * node.RHS.value
					break;
				case token.DIV:
					value = node.LHS.value / node.RHS.value
					break;
				default:
					return node
			}

			return {
				type: 'number_literal_expr',
				value
			}
		}
		return node
	},
	ident_expr: (node, visit)=>{
		return node.value
	},

	// common: (node, visit) => {
	// 	return node.value
	// },
}

function infer_type(LHS, RHS) {
	if (LHS.datatype === RHS.datatype)
		return LHS.datatype
	else 
		return datatypes.FLOAT
}

const byteToHex = [];

for (let n = 0; n <= 0xff; ++n)
{
    const hexOctet = n.toString(16).padStart(2, "0");
    byteToHex.push(hexOctet);
}

function hex(arrayBuffer)
{
    return Array.prototype.map.call(
        new Uint8Array(arrayBuffer),
        n => byteToHex[n]
    ).join("");
}

let codegen_pass = {
	comp_unit: (node, visit)=>{
		for(let i = 0 ; i < node.value.length ; i++) {
			node.value[i] = visit(node.value[i], node)
		}
		return node
	},
	binop_expr: (node, visit)=>{
		if (node.bin_op === token.ASSIGN) {
			node.RHS = visit(node.RHS, node);
			if (node.LHS.type !== 'ident_expr') {
				throw new TypeError('left hand side not an identifier')
			}

			node.datatype = node.RHS.datatype

			let sym = get_symbol(node, node.LHS.value.name)
			if (!sym) {
				sym = new_symbol(node.parent, node.LHS.value.name, node.RHS.datatype)
			}

			if (sym.stack) {
				node.code = `\tSTORE32 [SFP + ${sym.stack}]    ; store ${sym.name}` 
			} else {
				node.code = `\tSTORE32 [${sym.exp_name}]`
			}
			return node
		}

		node.LHS = visit(node.LHS, node);
		node.RHS = visit(node.RHS, node);
		node.datatype = infer_type(node.LHS, node.RHS)
		if(node.LHS.datatype === datatypes.FLOAT && node.RHS.datatype === datatypes.INT) {
			node.RHS.code += '\n\tCONVF'
		} else if(node.LHS.datatype === datatypes.INT && node.RHS.datatype === datatypes.FLOAT) {
			node.LHS.code += '\n\tCONVF'
		}
		let m = '32'
		if (node.datatype === datatypes.FLOAT) {
			m = "F"
		}
		switch(node.bin_op) {
			case token.ADD:
				node.code = '\tADD' + m
				break;
			case token.SUB:
				node.code = '\tSUB' + m
				break;
			case token.MUL:
				node.code = '\tMUL' + m
				break;
			case token.DIV:
				node.code = '\tDIV' + m
				break;
			case token.EQL:{
				let l = get_label('oper_')
				let e = get_label('oper_')
				node.code = `\tSUB${m}\n\tPOP32\n\tJEQ ${l}\n\tLOAD32 0\n\tJMP ${e}\n${l}:\n\tLOAD32 1\n${e}:`
				break;
			}
			case token.NEQ:{
				let l = get_label('oper_')
				let e = get_label('oper_')
				node.code = `\tSUB${m}\n\tPOP32\n\tJNE ${l}\n\tLOAD32 0\n\tJMP ${e}\n${l}:\n\tLOAD32 1\n${e}:`
				break;
			}
			case token.GTR:{
				let l = get_label('oper_')
				let e = get_label('oper_')
				node.code = `\tSUB${m}\n\tPOP32\n\tJGT ${l}\n\tLOAD32 0\n\tJMP ${e}\n${l}:\n\tLOAD32 1\n${e}:`
				break;
			}
			case token.GEQ:{
				let l = get_label('oper_')
				let e = get_label('oper_')
				node.code = `\tSUB${m}\n\tPOP32\n\tJGE ${l}\n\tLOAD32 0\n\tJMP ${e}\n${l}:\n\tLOAD32 1\n${e}:`
				break;
			}
			case token.LSS:{
				let l = get_label('oper_')
				let e = get_label('oper_')
				node.code = `\tSUB${m}\n\tPOP32\n\tJLT ${l}\n\tLOAD32 0\n\tJMP ${e}\n${l}:\n\tLOAD32 1\n${e}:`
				break;
			}
			case token.LEQ:{
				let l = get_label('oper_')
				let e = get_label('oper_')
				node.code = `\tSUB${m}\n\tPOP32\n\tJLE ${l}\n\tLOAD32 0\n\tJMP ${e}\n${l}:\n\tLOAD32 1\n${e}:`
				break;
			}
		}
		
		return node
	},
	ident: (node, visit)=>{
		let sym = get_symbol(node, node.name)
		if (!sym) {
			throw TypeError('Unknown undentifier:' + node.name)
		}
		node.datatype = sym.datatype
		if (sym.stack) {
			node.code = `\tLOAD32 [SFP + ${sym.stack}]    ; load ${sym.name}` 
		} else {
			node.code = `\tLOAD32 [${sym.exp_name}]`
		}
		return node
	},
	ident_expr: (node, visit)=>{
		return visit(node.value, node)
	},
	number_literal_expr: (node, visit) => {
		if(node.datatype == datatypes.FLOAT){
			let b = Buffer.alloc(4)
			b.writeFloatLE(node.value)
			let o = hex(b)
			node.code = `\tLOAD32 0x${o}     ; ${node.value}f` 
		} else {
			node.code = '\tLOAD32 ' + node.value	
		}
		return node
	},
	expr_list: (node, visit)=>{
		node.code = ''
		if (Array.isArray(node.value)) {
			for(let i = 0 ; i < node.value.length ; i++) {
				node.value[i] = visit(node.value[i], node)
			}
		}
		return node
	},
	prototype: (node, visit)=> {
		node.code = ''
		let spf_offset = 2

		node.args.reverse().forEach(arg=>{
			let sym = get_symbol(node.parent, arg)
			if (sym) 
				throw TypeError('defined '+ arg)
			sym = new_symbol(node.parent, arg, datatypes.FLOAT)
			sym.stack = spf_offset
			spf_offset += 4
			// node.code += `LOAD 0   ; ${sym.name}\n`
		})
		return node
	},
	def_expr: (node, visit)=> {
		let sym = get_symbol(node.parent, node.prototype.name.name)
		if (sym) 
			throw TypeError('Already defined: ' + node.prototype.fn_name)
		sym = new_symbol(node.parent, node.prototype.name.name, datatypes.FUNCTION)
		node.label = sym.exp_name
		node.prototype = visit(node.prototype, node);
		node.value = visit(node.value, node);
		node.code = `\tRET`
		return node
	},
	call_expr: (node, visit)=>{
		node.code = ''
		for(let i = 0 ; i < node.value.length ; i++) {
			let v = visit(node.value[i], node)
			if (v.datatype == datatypes.INT) {
				v.code += "\n\tCONVF"
			} else if (v.datatype == datatypes.FLOAT) {

			} else {
				throw TypeError('Not supported parameter type')
			}
			node.value[i] = v
		}
		let sym = get_symbol(node.parent, node.name.value.name)
		if (!sym) 
			throw TypeError('Undefined: ' + node.name.value.name)
		if (sym.datatype !== datatypes.FUNCTION)
			throw TypeError('Not callable: ' + sym.name)
		node.code = `\tCALL ${sym.exp_name}\n\tLOAD32 [SFP - 7]`
		node.datatype = datatypes.FLOAT
		return node
	},
	if_expr: (node, visit)=>{
		node.cond = visit(node.cond, node)
		node.th = visit(node.th, node)
		if (node.el)
			node.el = visit(node.el, node)
		node.datatype = datatypes.FLOAT
		node.code = ''
		return node
	},
	common: (node, visit)=>{
		return visit(node.value, node)
	}
}

let asm_code = ''
function emit_code(str) {
	asm_code += `${str}\n`
}

let label_count = 0
function get_label(prefix) {
	label_count++
	return prefix + label_count
}

let code_emitter = {
	comp_unit: (node, visit)=>{
		for(let i = 0 ; i < node.value.length ; i++) {
			if (node.value[i].type !== 'def_expr')
				visit(node.value[i])
		}
		emit_code('\tHLT')
		for(let i = 0 ; i < node.value.length ; i++) {
			if (node.value[i].type === 'def_expr')
				visit(node.value[i])
		}
	},
	binop_expr: (node, visit)=>{
		visit(node.LHS);
		visit(node.RHS);
		emit_code(node.code)
	},
	def_expr: (node, visit)=>{
		emit_code(`${node.label}:`)
		visit(node.prototype)
		visit(node.value)
		emit_code(node.code)
	},
	if_expr: (node, visit)=>{
		visit(node.cond)
		let exit_label =  get_label('exit_')
		let else_label =  get_label('else_')
		emit_code(`\tPOP32\n\tJEQ ${else_label}`);
		visit(node.th)
		emit_code(`\tJMP ${exit_label}`);
		emit_code(`${else_label}:`)
		if (node.el)
			visit(node.el)
		emit_code(`${exit_label}:`)
	},
	common: (node, visit) => {
		if (node.label) {
			emit_code(`${node.label}:`)
		}
		if (Array.isArray(node.value)) {
			for(let i = 0 ; i < node.value.length ; i++) {
				visit(node.value[i])
			}
		} else if(node.value) {
			visit(node.value)
		}
		if (node.code)
			emit_code(node.code)
	},
}

function make_visitor(visitor) {
	function ff(ast, parent) {
		let f = visitor[ast.type];
		if (f) {
			return f(ast, ff, parent);
		} else if (visitor['common']) {
			return visitor['common'](ast, ff, parent)
		} else {
			return ast
		}
	}
	return ff
}

function add_parent_links(node, parent) {
	if(!node.hasOwnProperty('type')) {
		return
	}
	for (var key in node) {
		if (node.hasOwnProperty(key) && typeof node[key] === 'object') {
			if (Array.isArray(node[key])) {
				node[key].forEach(n=>add_parent_links(n, node))	
			} else {
				add_parent_links(node[key], node)
			}
		}
	}
	node.parent = parent
}


let source_code = fs.readFileSync(process.argv[2], 'utf-8')
let outFile = process.argv[3]
if (!outFile)outFile = 'out.asm'
try {
	let tokens = tokenizer(source_code)
	let parser = make_parser(tokens)
	let ast = parser()
	add_parent_links(ast)

	ast = make_visitor(literals_optimization_pass)(ast)
	ast = make_visitor(codegen_pass)(ast)
	make_visitor(code_emitter)(ast)

	if (ast.st) {
		asm_code += emit_global_symbols(ast.st.symbols)
	}

    var buf = new Buffer.from(asm_code);
    fs.writeFileSync(outFile, buf);
} catch (err) {
    console.log(err)
}

