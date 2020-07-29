'use strict';

const { zip } = require('./util')
const ast = require('./ast')
const { token, datatype } = require('./tok')

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
function new_symbol(node, symbol_name, datatype, param) {
	param = param || false
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
	if (node.type === 'comp_unit') {
		delete s.stack
		// s.exp_name = 'op' + op_count
		op_count++
	} else if (!param) {
		node.st.stack -= 4
	}
	node.st.symbols[symbol_name] = s
	return s
}

function instantiate_template(node, name, arg_types) {
	let sym = get_symbol(node.parent, name)
	if (!sym) {
		ast.error(node, 'Undefined: ' + name)
		return null
	}
	if (sym.datatype !== datatype.FUNCTION) {
		ast.error(node, 'Not callable: ' + sym.name)
		return null
	}
	let fn_name = get_decorated_fn_name(name, arg_types)
	let inst_sym = new_symbol(ast.get_root(node), fn_name, datatype.FUNCTION)
	inst_sym.node = ast.clone(sym.node)
	inst_sym.node.prototype.name.name = fn_name
	inst_sym.node.prototype.arg_types = arg_types
	inst_sym.node.st.symbols = {}
	inst_sym.node.st.stack = -4
	ast.add_parent_links(inst_sym.node, node.parent)
	
	return inst_sym
}

let type_infer_pass = {
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
				ast.error(node.LHS, 'left hand side not an identifier')
				return
			}

			node.datatype = node.RHS.datatype

			let sym = get_symbol(node, node.LHS.value.name)
			if (!sym) {
				sym = new_symbol(ast.get_root(node, 'def_expr'), node.LHS.value.name, node.RHS.datatype)
			}

			node.LHS.value.sym = sym

			return node
		}

		node.LHS = visit(node.LHS, node);
		node.RHS = visit(node.RHS, node);
		node.datatype = ast.infer_type(node.LHS, node.RHS)
		
		return node
	},
	ident: (node, visit)=>{
		let sym = get_symbol(node, node.name)
		if (!sym) {
			ast.error(node, 'Unknown undentifier: ' + node.name)
			return node
		}
		node.datatype = sym.datatype
		node.sym = sym
		return node
	},
	ident_expr: (node, visit)=>{
		return visit(node.value, node)
	},
	expr_list: (node, visit) => {
		if (Array.isArray(node.value)) {
			for(let i = 0 ; i < node.value.length ; i++) {
				node.value[i] = visit(node.value[i], node)
				// only the last expression returns
				if(i === node.value.length-1) {
					node.datatype = node.value[i].datatype
				}
			}
		}
		return node
	},
	prototype: (node, visit)=> {
		let spf_offset = 4
		zip(node.args, node.arg_types).reverse().forEach((v)=>{
			let sym = new_symbol(node.parent, v[0], v[1], true)
			sym.stack = spf_offset
			spf_offset += 4
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
		node.local_var_stack = node.st.stack
		return node
	},
	call_expr: (node, visit)=>{
		let arg_types = []
		for(let i = 0 ; i < node.value.length ; i++) {
			let v = visit(node.value[i], node)
			node.value[i] = v
			arg_types.push(v.datatype)
		}
		let name = get_decorated_fn_name(node.name.value.name, arg_types)
		let sym = get_symbol(node.parent, name)
		if (!sym) {
			sym = instantiate_template(node, node.name.value.name, arg_types)
			if (!sym) {
				ast.error('Undefined: ' + node.name.value.name)
				return node
			}
			sym.node = ast.make_visitor(type_infer_pass)(sym.node)
		}
		node.sym = sym
		if (sym.node)
			node.datatype = sym.node.value.datatype
		return node
	},
	if_expr: (node, visit)=>{
		node.cond = visit(node.cond, node)
		node.th = visit(node.th, node)
		if (node.el){
			node.el = visit(node.el, node)
		}
		node.datatype = node.th.datatype
		return node
	},
	while_expr: (node, visit)=>{
		node.cond = visit(node.cond, node)
		node.body = visit(node.body, node)
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

module.exports = {
	type_infer_pass,
}
