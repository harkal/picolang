'use strict';

const { hex } = require('./util')

const { token, tokenizer, datatype } = require('./tok')
const ast = require('./ast')
const { literals_optimization_pass } = require('./literal_pass')
const { type_infer_pass } = require('./type_infer_pass');
const mcode = require('./mcode')
const { infer_type } = require('./ast');
 
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
					sym.node = ast.make_visitor(type_infer_pass)(sym.node)
					ast.make_visitor(code_emitter)(sym.node)
				}
				break;
		}
		
	}
	return res
}

function make_parser(tokens, file_name) {
	let current = 0;
	let tok = tokens[current];
	
	function next() {
		if (current + 1 < tokens.length) {
			current++
			tok = tokens[current];	
		}
		return tok
	}

	function make_node(node) {
		return {
			...node,
			file_name,
			line:tok.line,
			pos:tok.pos,
		}
	}

	function consume(t) {
		if (tok.type !== t) {
			console.error(`Expected ${t} but got ${tok.type} (${tok.value})`)
			console.error(`\tat ${file_name}:${tok.line}:${tok.pos}`)
			// throw new TypeError('Extected ' + t + ' but got ' + tok.type);
		}
		next();
	}

	function get_token_prec() {
		return binop_precedence[tok.type] ? binop_precedence[tok.type] : -1
	}

	function parse_binop_RHS(prec, LHS) {
		while(true) {
			let op_tok = tok
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
				file_name,
				line: op_tok.line,
				pos: op_tok.pos,
			}
		}
	}

	function parse_ident() {
		let node = make_node({ type: 'ident', name: tok.value });
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

		return make_node({
			type: 'call_expr',
			name: op,
			value: args
		})
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
				return make_node({ type: 'number_literal_expr', value, datatype })
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
				n.value.push(make_node({
					type: 'break_stmt'
				}))
				continue
			case token.CONTINUE:
				consume(token.CONTINUE)
				n.value.push(make_node({
					type: 'continue_stmt'
				}))
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

			if (expr)
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
		return make_node({
			type: 'prototype',
			name: fn_name,
			args,
			arg_types
		})
	}

	function parse_def_expr() {
		consume(token.DEF);
		let prototype = parse_prototype()

		let expr = parse_expr();
		if(!expr) {
			ast.error({...tok, file_name}, 'Failed to find primary expression. Found: ' + tok.type)
			return null
		}

		return make_node({
			type: 'def_expr',
			prototype,
			value: expr
		})
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
		if (node.bin_op === token.ASSIGN) {
			visit(node.RHS, node);
			if (node.LHS.type !== 'ident_expr') {
				visit(node.LHS)
			}

			let sym = node.LHS.value.sym

			if (sym.stack !== undefined) {
				emit_code(`\tSTORE32 [SFP ${(sym.stack<0?"":"+") + sym.stack}]    ; store ${sym.name}` )
			} else {
				emit_code(`\tSTORE32 [${sym.exp_name}]`)
			}
			if (sym.stack !== undefined) {
				node.load_in_stack_code = `\tLOAD32 [SFP ${(sym.stack<0?"":"+") + sym.stack}]    ; load ${sym.name}` 
			} else {
				node.load_in_stack_code = `\tLOAD32 [${sym.exp_name}]`
			}
			return node
		}

		visit(node.LHS, node);
		if(node.LHS.datatype === datatype.INT && node.RHS.datatype === datatype.FLOAT) {
			emit_code('\tCONVF')
		}

		visit(node.RHS, node);
		if(node.LHS.datatype === datatype.FLOAT && node.RHS.datatype === datatype.INT) {
			emit_code('\tCONVF')
		}

		let m = '32'
		if (node.datatype === datatype.FLOAT) {
			m = "F"
		}
		let node_code = ''
		switch(node.bin_op) {
			case token.ADD:
				node_code = '\tADD' + m
				break;
			case token.SUB:
				node_code = '\tSUB' + m
				break;
			case token.MUL:
				node_code = '\tMUL' + m
				break;
			case token.DIV:
				node_code = '\tDIV' + m
				break;
			case token.EQL:{
				let l = get_label('oper_')
				let e = get_label('oper_')
				node_code = `\tSUB${m}\n\tPOP32\n\tJEQ ${l}\n\tLOAD32 0\n\tJMP ${e}\n${l}:\n\tLOAD32 1\n${e}:`
				break;
			}
			case token.NEQ:{
				let l = get_label('oper_')
				let e = get_label('oper_')
				node_code = `\tSUB${m}\n\tPOP32\n\tJNE ${l}\n\tLOAD32 0\n\tJMP ${e}\n${l}:\n\tLOAD32 1\n${e}:`
				break;
			}
			case token.GTR:{
				let l = get_label('oper_')
				let e = get_label('oper_')
				node_code = `\tSUB${m}\n\tPOP32\n\tJGT ${l}\n\tLOAD32 0\n\tJMP ${e}\n${l}:\n\tLOAD32 1\n${e}:`
				break;
			}
			case token.GEQ:{
				let l = get_label('oper_')
				let e = get_label('oper_')
				node_code = `\tSUB${m}\n\tPOP32\n\tJGE ${l}\n\tLOAD32 0\n\tJMP ${e}\n${l}:\n\tLOAD32 1\n${e}:`
				break;
			}
			case token.LSS:{
				let l = get_label('oper_')
				let e = get_label('oper_')
				node_code = `\tSUB${m}\n\tPOP32\n\tJLT ${l}\n\tLOAD32 0\n\tJMP ${e}\n${l}:\n\tLOAD32 1\n${e}:`
				break;
			}
			case token.LEQ:{
				let l = get_label('oper_')
				let e = get_label('oper_')
				node_code = `\tSUB${m}\n\tPOP32\n\tJLE ${l}\n\tLOAD32 0\n\tJMP ${e}\n${l}:\n\tLOAD32 1\n${e}:`
				break;
			}
		}

		emit_code(node_code)
	},
	ident: (node, visit)=>{
		let sym = node.sym
		if (sym.stack !== undefined) {
			emit_code(`\tLOAD32 [SFP ${(sym.stack<=0?'':'+')+sym.stack}]    ; load ${sym.name}`)
		} else {
			emit_code(`\tLOAD32 [${sym.exp_name}]`)
		}
	},
	number_literal_expr: (node, visit) => {
		if(node.datatype == datatype.FLOAT){
			let b = Buffer.alloc(4)
			b.writeFloatLE(node.value)
			let o = hex(b)
			emit_code(`\tLOAD32 0x${o}     ; ${node.value}f`)
		} else {
			emit_code('\tLOAD32 ' + node.value)
		}
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
		emit_code(`\tSTORE32 [SFP + ${node.prototype.args.length * 4 + 4}]`)
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
		emit_code(`\tCALL ${node.sym.exp_name}`)
		for(let i = 0 ; i < node.value.length ; i++) {
			emit_code('\tPOP32')
		}
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

function replacer(k, v) {
	if (k === 'parent')
		return undefined
	else 
		return v
}

function compile_source(source_code, file_name) {
	let tokens = tokenizer(source_code)
	// console.log(tokens)
	let parser = make_parser(tokens, file_name)
	let _ast = parser()

	// console.log(JSON.stringify(_ast, replacer, ' '))

	_ast = ast.make_visitor(literals_optimization_pass)(_ast)
	// console.log('-----------------------opti')
	// console.log(JSON.stringify(_ast, replacer, ' '))

	ast.add_parent_links(_ast)
	_ast = ast.make_visitor(type_infer_pass)(_ast)

	_ast = ast.make_visitor(type_infer_pass)(_ast)
	ast.make_visitor(code_emitter)(_ast)

	let symbol_code = ''
	if (_ast.st) {
		symbol_code += emit_global_symbols(_ast.st.symbols)
	}

	asm_code += symbol_code

	return asm_code
}

module.exports = {
	compile_source
};
