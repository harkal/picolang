const ast = require('./ast')
const { token } = require('./tok')

let literals_optimization_pass = {
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
			if (node.cond.value === 0 && node.el !== undefined) {
				return node.el
			} else {
				return node.th
			}
		}
		return node
	},
	expr_list: (node, visit)=>{
		for(let i = 0 ; i < node.value.length ; i++) {
			node.value[i] = visit(node.value[i])
		}
		let last_node = node.value[node.value.length-1]
		if (last_node.type === 'return_expr') {
			node.value[node.value.length-1] = last_node.value
		}
		return node
	},
	common: (node, visit)=>{
		if(!node.hasOwnProperty('type')) {
			return node
		}
		for (var key in node) {
			if (node.hasOwnProperty(key) && typeof node[key] === 'object') {
				if (Array.isArray(node[key])) {
					for(let i = 0 ; i < node[key].length ; i++) {
						node[key][i] = visit(node[key][i])
					}
				} else {
					node[key] = visit(node[key])
				}
			}
		}
		return node
	},
}

module.exports = {
	literals_optimization_pass
}
