'use strict';

const ast = require('./ast')
const { token } = require('./tok')

let literals_optimization_pass = {
	unaop_expr:  (node, visit)=>{
		node.value = visit(node.value)
		if (node.value !== undefined && 
			node.value.type == 'number_literal_expr') {
			let value = 0
			switch(node.una_op) {
				case token.ADD:
					value = node.value.value
					break
				case token.SUB:
					value = -node.value.value
					break
			}

			return {
				type: 'number_literal_expr',
				value,
				datatype: node.value.datatype,
			}
		}
		return node
	},
	binop_expr: (node, visit)=>{
		node.LHS = visit(node.LHS);
		node.RHS = visit(node.RHS);
		if (node.LHS !== undefined && 
			node.RHS !== undefined && 
			node.LHS.type == 'number_literal_expr' && 
			node.RHS.type == 'number_literal_expr') {

			let datatype = ast.infer_type(node.LHS, node.RHS)
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
				case token.GTR:
					value = node.LHS.value > node.RHS.value ? 1:0
					break;
				default:
					return node
			}

			return {
				type: 'number_literal_expr',
				value,
				datatype,
			}
		}
		return node
	},
	if_expr: (node, visit)=>{
		node.cond = visit(node.cond);
		if (node.cond !== undefined && node.cond.type == 'number_literal_expr') {
			if (node.cond.value === 0) {
				if (node.el !== undefined) 
					return node.el
				else {
					return { type: 'nop_expr' }
				}
			} else {
				return node.th
			}
		}
		return node
	},
	expr_list: (node, visit)=>{
		if (node.value.length === 0) {
			return node
		}
		for(let i = 0 ; i < node.value.length ; i++) {
			node.value[i] = visit(node.value[i])
		}
		let last_node = node.value[node.value.length-1]
		if (last_node.type === 'return_expr') {
			node.value[node.value.length-1] = last_node.value
		}
		return node
	},
	common: ast.common_visit,
}

module.exports = {
	literals_optimization_pass
}
