'use strict';

const { hex } = require('./util')

const { token, tokenizer, datatype } = require('./tok')
const ast = require('./ast')
const { literals_optimization_pass } = require('./literal_pass')
const { type_infer_pass } = require('./type_infer_pass');
const backend = require('./backend')
const { inst_type, make_backend, make_inst } = require('./backend');
const tok = require('./tok');
 
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
	let inst
	for (let sym_name in symtable) {
		let sym = symtable[sym_name]
		if (sym.emited) 
			continue
		switch(sym.datatype) {
			case datatype.INT:
				inst = be.append_inst_type(backend.inst_type.BLACKBOX)
				inst.label = sym.exp_name
				inst.value = 'resd'
				sym.emited = true
				break
			case datatype.FLOAT:
				inst = be.append_inst_type(backend.inst_type.BLACKBOX)
				inst.label = sym.exp_name
				inst.value = 'resd'
				sym.emited = true
				break
			case datatype.FUNCTION:
				if (sym.used && sym.exp_name.includes('@@')) {
					sym.node = ast.make_visitor(type_infer_pass)(sym.node)
					ast.make_visitor(code_emitter)(sym.node)
					sym.emited = true
				}
				break;
		}
	}
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

	function parse_unaop() {
		let una_op = tok.type
		next()
		let value = parse_primary_expr()

		return make_node({ 
			type: 'unaop_expr', 
			una_op,
			value
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
			case token.ADD:
			case token.SUB:
				return parse_unaop()
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

function get_key_up(n, key) {
	if(n.hasOwnProperty(key)) {
		return n[key]
	} else if (n.parent) {
		return get_key_up(n.parent, key)
	}
	return undefined
}

let be = null
let code_emitter = {
	comp_unit: (node, visit)=>{
		for(let i = 0 ; i < node.value.length ; i++) {
			if (node.value[i].type !== 'def_expr'){
				visit(node.value[i])
				be.append_pop()
			}
		}
		be.append_inst_type(backend.inst_type.HLT)
		for(let i = 0 ; i < node.value.length ; i++) {
			if (node.value[i].type === 'def_expr')
				visit(node.value[i])
		}
	},
	unaop_expr: (node, visit)=>{
		switch(node.una_op) {
			case token.ADD:
				visit(node.value)
				break
			case token.SUB:
				be.append_load_immediate(0, node.value.datatype)
				visit(node.value)
				be.append_op(backend.inst_type.SUB, node.datatype)
				break
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
				be.append_store_stack((sym.stack<=0?'':'+')+sym.stack, sym.datatype)
				be.append_load_stack((sym.stack<=0?'':'+')+sym.stack, sym.datatype)
			} else {
				be.append_store_addr(sym.exp_name, sym.datatype)
				be.append_load_addr(sym.exp_name, sym.datatype)
			}
			return node
		}

		visit(node.LHS, node);
		if(node.LHS.datatype === datatype.INT && node.RHS.datatype === datatype.FLOAT) {
			be.append_inst_type(backend.inst_type.CONVF)
		}

		visit(node.RHS, node);
		if(node.LHS.datatype === datatype.FLOAT && node.RHS.datatype === datatype.INT) {
			be.append_inst_type(backend.inst_type.CONVF)
		}

		function append_logic_op(type) {
			be.append_op(backend.inst_type.SUB, node.datatype)
			be.append_pop()
			let j_inst = be.append_inst_type(type)
			be.append_load_immediate(1, datatype.INT)
			let jmp_inst = be.append_jump()
			j_inst.target = be.append_load_immediate(0, datatype.INT)
			jmp_inst.target = be.append_inst_type(backend.inst_type.NOP)
		}

		switch(node.bin_op) {
			case token.ADD:
				be.append_op(backend.inst_type.ADD, node.datatype)
				break
			case token.SUB:
				be.append_op(backend.inst_type.SUB, node.datatype)
				break
			case token.MUL:
				be.append_op(backend.inst_type.MUL, node.datatype)
				break
			case token.DIV:
				be.append_op(backend.inst_type.DIV, node.datatype)
				break
			case token.EQL:
				append_logic_op(backend.inst_type.JNE)
				break
			case token.NEQ:
				append_logic_op(backend.inst_type.JEQ)
				break
			case token.GTR:
				append_logic_op(backend.inst_type.JLE)
				break
			case token.GEQ:
				append_logic_op(backend.inst_type.JLT)
				break
			case token.LSS:
				append_logic_op(backend.inst_type.JGE)
				break
			case token.LEQ:
				append_logic_op(backend.inst_type.JGT)
				break
		}
	},
	ident: (node, visit)=>{
		let sym = node.sym
		if (sym.stack !== undefined) {
			be.append_load_stack((sym.stack<=0?'':'+')+sym.stack, sym.datatype)
		} else {
			be.append_load_addr(sym.exp_name, sym.datatype)
		}
	},
	expr_list: (node, visit) => {
		if (Array.isArray(node.value)) {
			for(let i = 0 ; i < node.value.length ; i++) {
				visit(node.value[i])
				// only the last expression returns
				if(i < node.value.length-1 || node.value[i].type === 'asm_expr') {
					be.append_pop()
				}
			}
		}
	},
	number_literal_expr: (node, visit) => {
		if(node.datatype == datatype.FLOAT){
			let b = Buffer.alloc(4)
			b.writeFloatLE(node.value)
			let o = hex(b)
			be.append_load_immediate(`0x${o}`, datatype.INT)
		} else {
			be.append_load_immediate(node.value, datatype.INT)
		}
	},
	def_expr: (node, visit)=>{
		if(!node.label.includes('@@')) {
			return
		}
		let start = be.get_last_inst()
		for(let i = 4 ; i < -node.local_var_stack ; i+=4) {
			be.append_load_immediate(0, datatype.INT)
		}
		visit(node.prototype)
		visit(node.value)
		be.append_store_stack(`+ ${node.prototype.args.length * 4 + 4}`, node.datatype).label = `.ret`
		for(let i = 4 ; i < -node.local_var_stack ; i+=4) {
			be.append_pop()
		}
		be.append_inst_type(backend.inst_type.RET)
		start.next.label = node.label
	},
	call_expr: (node, visit)=>{
		be.append_load_immediate(0, datatype.INT)
		for(let i = 0 ; i < node.value.length ; i++) {
			visit(node.value[i])
		}
		be.append_call(node.sym.exp_name)
		node.sym.used = true
		for(let i = 0 ; i < node.value.length ; i++) {
			be.append_pop()
		}
	},
	if_expr: (node, visit)=>{
		visit(node.cond)
		be.append_pop()
		let jeq_inst = be.append_inst_type(inst_type.JEQ)
		visit(node.th)
		
		let jmp_inst = be.append_jump()
		jeq_inst.target = be.append_inst_type(inst_type.NOP) // else target
		if (node.el) {
			visit(node.el)
			if (node.el.datatype !== undefined && node.th.datatype !== undefined && node.el.datatype !== node.th.datatype) {
				be.append_inst_type(inst_type.CONVF)
			}
		}

		jmp_inst.target = be.append_inst_type(inst_type.NOP) // exit target
	},
	while_expr: (node, visit)=>{
		be.append_inst_type(inst_type.DUP)
		let loop_target = be.append_inst_type(inst_type.NOP)
		let exit_target = make_inst(inst_type.NOP)

		node.exit_target = exit_target
		node.loop_target = loop_target

		// Optimize the case we have an always true condition
		if (node.cond.type === 'number_literal_expr' && node.cond.value === 1) {

		} else {
			visit(node.cond)
			be.append_pop()
			be.append_inst_type(inst_type.JEQ).target = exit_target
			be.append_pop()
		}
		visit(node.body)

		be.append_jump().target = loop_target
		be.append_inst(exit_target)

	},
	break_stmt: (node, visit)=>{
		let exit_target = get_key_up(node, 'exit_target')
		if(exit_target) {
			be.append_jump(exit_target)
		}
	},
	continue_stmt: (node, visit)=>{
		let loop_target = get_key_up(node, 'loop_target')
		if(loop_target) {
			be.append_jump(loop_target)
		}
	},
	return_expr: (node, visit)=>{
		visit(node.value)
		be.append_jump('.ret')
	},
	asm_expr: (node, visit)=> {
		be.append_inst_type(backend.inst_type.BLACKBOX).value = node.value
		be.append_load_immediate(0, datatype.INT)
	},
	common: (node, visit) => {
		// if (node.label) {
		// 	be.append_inst_type(backend.inst_type.LABEL).label = node.label
		// }
		if (Array.isArray(node.value)) {
			for(let i = 0 ; i < node.value.length ; i++) {
				visit(node.value[i])
			}
		} else if(node.value) {
			visit(node.value)
		}
	},
}

function replacer(k, v) {
	if (k === 'parent')
		return undefined
	else 
		return v
}

function compile_source(source_code, file_name, opts) {
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

	be = backend.make_backend()
	ast.make_visitor(code_emitter)(_ast)

	if (_ast.st) {
		emit_global_symbols(_ast.st.symbols)
		emit_global_symbols(_ast.st.symbols)
	}

	opts.opt = opts.opt || 1
	if (opts.opt > 0) {
		be.optimize()
	}

	return be.emit_asm()
}

module.exports = {
	compile_source
};
