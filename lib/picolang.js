'use strict';

const { hex, zip } = require('./util')

const { token, tokenizer, datatype } = require('./tok')
const ast = require('./ast')
const { literals_optimization_pass } = require('./literal_pass')
 
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
	
	if (!node.st) {
		node.st = { 
			stack: -4,
			symbols: {}
		}
	}
	let s = {
		name: symbol_name,
		exp_name: symbol_name,
		datatype,
		stack: node.st.stack
	}
	if(on_stack === true)
		node.st.stack -= 4
	if (node.type !== 'comp_unit' && !on_stack) {
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
			case datatype.INT:
				res += `${sym.exp_name}: resd\n`
				break
			case datatype.FLOAT:
				res += `${sym.exp_name}: resd\n`
				break
			case datatype.FUNCTION:
				if (sym.exp_name.includes('@@')) {
					sym.node = make_visitor(codegen_pass)(sym.node)
					make_visitor(code_emitter)(sym.node)
				}
				break;
		}
		
	}
	return res
}

function type_to_id(type) {
	switch (type) {
		case datatype.INT:
			return 'i32'
		case datatype.FLOAT:
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
		} else if (tok.type === token.WHILE) {
			return parse_while_expr();
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
			switch(tok.type) {
			case token.BREAK:
				consume(token.BREAK)
				n.value.push({
					type: 'break_stmt'
				})
				continue
			case token.CONTINUE:
				consume(token.CONTINUE)
				n.value.push({
					type: 'continue_stmt'
				})
				continue
			case token.RETURN:
				n.value.push(parse_return_expr())
				continue;
			case token.ASM:
				n.value.push(parse_asm_expr())
				continue;
			}

			let expr = parse_expr()
			if (!expr) {
				break
			}

			if (tok.type === 'eof')
				break

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
		let arg_types = []
		while(tok.type == 'ident') {
			args.push(tok.value)
			arg_types.push(datatype.INT)
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
			args,
			arg_types
		}
	}

	function parse_def_expr() {
		consume(token.DEF);
		let prototype = parse_prototype()

		let expr = parse_expr();
		if(!expr) {
			throw TypeError('Failed to find primary expression. Found: ' + tok.type)
		}

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

	function parse_while_expr() {
		consume(token.WHILE)
		let cond = parse_expr();
		let body = parse_expr();
		return {
			type: 'while_expr',
			cond,
			body,
		}
	}

	function parse_return_expr() {
		consume(token.RETURN)
		let value = parse_expr();
		return {
			type: 'return_expr',
			value
		}
	}

	function parse_asm_expr() {
		consume(token.ASM)
		let value = tok.value
		consume(token.STRING)
		return {
			type: 'asm_expr',
			value
		}
	}

	return function() {
		let n = {
			type: 'comp_unit',
			value: []
		}
		while(true) {
			if (tok.type === token.DEF) {
				n.value.push(parse_def_expr())
				continue
			} else if (tok.type === token.ASM) {
				n.value.push(parse_asm_expr())
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

function instantiate_template(node, name, arg_types) {
	let sym = get_symbol(node.parent, name)
	if (!sym) {
		throw TypeError('Undefined: ' + name)
	}
	let fn_name = get_decorated_fn_name(name, arg_types)
	let inst_sym = new_symbol(ast.get_root(node), fn_name, datatype.FUNCTION, false)
	inst_sym.node = ast.clone(sym.node)
	inst_sym.node.prototype.name.name = fn_name
	inst_sym.node.prototype.arg_types = arg_types
	inst_sym.node.st.symbols = {}
	inst_sym.node.st.stack = -4
	add_parent_links(inst_sym.node, node.parent)
	// console.log(sym.node)
	return inst_sym
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
				sym = new_symbol(ast.get_root(node, 'def_expr'), node.LHS.value.name, node.RHS.datatype, true)
			}

			if (sym.stack !== undefined) {
				node.code = `\tSTORE32 [SFP ${(sym.stack<0?"":"+") + sym.stack}]    ; store ${sym.name}` 
			} else {
				node.code = `\tSTORE32 [${sym.exp_name}]`
			}
			if (sym.stack !== undefined) {
				node.load_in_stack_code = `\tLOAD32 [SFP ${(sym.stack<0?"":"+") + sym.stack}]    ; load ${sym.name}` 
			} else {
				node.load_in_stack_code = `\tLOAD32 [${sym.exp_name}]`
			}
			return node
		}

		node.LHS = visit(node.LHS, node);
		node.RHS = visit(node.RHS, node);
		node.datatype = ast.infer_type(node.LHS, node.RHS)
		if(node.LHS.datatype === datatype.FLOAT && node.RHS.datatype === datatype.INT) {
			node.RHS.code += '\n\tCONVF'
		} else if(node.LHS.datatype === datatype.INT && node.RHS.datatype === datatype.FLOAT) {
			node.LHS.code += '\n\tCONVF'
		}
		let m = '32'
		if (node.datatype === datatype.FLOAT) {
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
		if (sym.stack !== undefined) {
			node.code = `\tLOAD32 [SFP ${(sym.stack<=0?'':'+')+sym.stack}]    ; load ${sym.name}` 
		} else {
			node.code = `\tLOAD32 [${sym.exp_name}]`
		}
		return node
	},
	ident_expr: (node, visit)=>{
		return visit(node.value, node)
	},
	number_literal_expr: (node, visit) => {
		if(node.datatype == datatype.FLOAT){
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
				// only the last expression returns
				if(i < node.value.length-1) {
					if(!node.value[i].load_in_stack_code)
						node.value[i].code += `\n\tPOP32`
				} else {
					if(node.value[i].load_in_stack_code)
						node.value[i].code += node.value[i].load_in_stack_code
					node.datatype = node.value[i].datatype
				}
			}
		}
		return node
	},
	prototype: (node, visit)=> {
		node.code = ''
		let spf_offset = 4
		zip(node.args, node.arg_types).reverse().forEach((v)=>{
			// let sym = get_symbol(node.parent, v[0])
			// if (sym) 
			// 	throw TypeError('defined '+ v[0])
			let sym = new_symbol(node.parent, v[0], v[1])
			sym.stack = spf_offset
			spf_offset += 4
			// node.code += `LOAD 0   ; ${sym.name}\n`
		})
		return node
	},
	def_expr: (node, visit)=> {
		let sym = get_symbol(node.parent, node.prototype.name.name)
		if (!sym) 
			sym = new_symbol(node.parent, node.prototype.name.name, datatype.FUNCTION)
			
		sym.node = node
		node.label = sym.exp_name
		node.prototype = visit(node.prototype, node);
		node.value = visit(node.value, node);
		node.code = `\tSTORE32 [SFP + ${node.prototype.args.length * 4 + 4}]`
		node.local_var_stack = node.st.stack
		return node
	},
	call_expr: (node, visit)=>{
		node.code = ''
		let pops = ''
		let arg_types = []
		for(let i = 0 ; i < node.value.length ; i++) {
			let v = visit(node.value[i], node)
			node.value[i] = v
			pops += '\n\tPOP32'
			arg_types.push(v.datatype)
		}
		let name = get_decorated_fn_name(node.name.value.name, arg_types)
		let sym = get_symbol(node.parent, name)
		if (!sym) {
			sym = instantiate_template(node, node.name.value.name, arg_types)
			if (!sym) 
				throw TypeError('Undefined: ' + node.name.value.name)
			sym.node = make_visitor(codegen_pass)(sym.node)
		}
		if (sym.datatype !== datatype.FUNCTION)
			throw TypeError('Not callable: ' + sym.name)
		node.code = `\tCALL ${sym.exp_name}${pops}` // last 4 datatype size 
		if (sym.node)
			node.datatype = sym.node.value.datatype
		return node
	},
	if_expr: (node, visit)=>{
		node.cond = visit(node.cond, node)
		node.th = visit(node.th, node)
		if (node.el){
			node.el = visit(node.el, node)
			if (node.el.datatype !== undefined && node.th.datatype !== undefined && node.el.datatype !== node.th.datatype) {
				node.el.code += '\n\tCONVF'
			}
		}
		node.datatype = node.th.datatype
		node.code = ''
		return node
	},
	while_expr: (node, visit)=>{
		node.cond = visit(node.cond, node)
		node.body = visit(node.body, node)
		node.code = ''
		return node
	},
	break_stmt: (node, visit)=>{
		return node
	},
	return_expr: (node, visit)=>{
		node.value = visit(node.value)
		node.datatype = node.value.datatype
		return node
	},
	continue_stmt: (node, visit)=>{
		return node
	},
	common: (node, visit)=>{
		if (node.value.type)
			return visit(node.value, node)
		return node
	}
}

let asm_code = ''
function emit_code(str) {
	asm_code += `${str}\n`
}

let label_count = 0
function get_label(prefix) {
	label_count++
	return '.' + prefix + label_count
}

function get_key_up(n, key) {
	if(n.hasOwnProperty(key)) {
		return n[key]
	} else if (n.parent) {
		return get_key_up(n.parent, key)
	}
	return undefined
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
		if(!node.label.includes('@@')) {
			return
		}
		emit_code(`${node.label}:`)
		for(let i = 4 ; i < -node.local_var_stack ; i+=4) {
			emit_code(`\tLOAD32 0`)
		}
		visit(node.prototype)
		visit(node.value)
		emit_code(`.ret:`)
		emit_code(node.code)
		for(let i = 4 ; i < -node.local_var_stack ; i+=4) {
			emit_code(`\tPOP32`)
		}
		emit_code('\tRET')
	},
	call_expr: (node, visit)=>{
		emit_code(`\tLOAD32 0				; return value holder`)
		for(let i = 0 ; i < node.value.length ; i++) {
			visit(node.value[i])
		}
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
	while_expr: (node, visit)=>{
		let exit_label =  get_label('exit_')
		let loop_label =  get_label('loop_')

		node.exit_label = exit_label
		node.loop_label = loop_label
		
		emit_code(`${loop_label}:`)

		// Optimize the case we have an always true condition
		if (node.cond.type === 'number_literal_expr' && node.cond.value === 1) {

		} else {
			visit(node.cond)
			emit_code(`\tPOP32\n\tJEQ ${exit_label}`);
		}
		visit(node.body)

		emit_code(`\tJMP ${loop_label}`);
		emit_code(`${exit_label}:`)
	},
	break_stmt: (node, visit)=>{
		let exit_label = get_key_up(node, 'exit_label')
		if(exit_label)
			emit_code(`\tJMP ${exit_label}`);
	},
	continue_stmt: (node, visit)=>{
		let loop_label = get_key_up(node, 'loop_label')
		if(loop_label)
			emit_code(`\tJMP ${loop_label}`);
	},
	return_expr: (node, visit)=>{
		visit(node.value)
		emit_code(`\tJMP .ret`);
	},
	asm_expr: (node, visit)=> {
		emit_code(node.value)
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
	//console.log('----')
	//console.log(node.type, '  ', node.name)
	if(!node || !node.hasOwnProperty('type')) {
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

function replacer(k, v) {
	if (k === 'parent')
		return undefined
	else 
		return v
}

function compile_source(source_code) {
	let tokens = tokenizer(source_code)
	let parser = make_parser(tokens)
	let ast = parser()

	// console.log(JSON.stringify(ast, replacer, ' '))

	ast = make_visitor(literals_optimization_pass)(ast)
	// console.log('-----------------------opti')
	// console.log(JSON.stringify(ast, replacer, ' '))

	add_parent_links(ast)
	ast = make_visitor(codegen_pass)(ast)
	make_visitor(code_emitter)(ast)

	let symbol_code = ''
	if (ast.st) {
		symbol_code += emit_global_symbols(ast.st.symbols)
	}

	asm_code += symbol_code

	return asm_code
}

module.exports = {
	compile_source
};
