"use strict";

const { datatype } = require('./tok')

function clone(ast) {
	if(ast === null || typeof(ast) !== 'object') {
		return ast;
	}

	if (Array.isArray(ast)) {
		return ast.map(n=>clone(n));
	}

	var temp = {}

	for(var key in ast) {
		if (key !== 'parent' && key !== 'sym' && ast.hasOwnProperty(key)) {
			temp[key] = clone(ast[key]);
		}
	}

	return temp;
}

function get_root(node, type) {
	while(node.parent) {
		node = node.parent
		if (node.type === type)
			break
	}
	return node
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

function infer_type(LHS, RHS) {
	if (LHS.datatype === RHS.datatype)
		return LHS.datatype
	else 
		return datatype.FLOAT
}

function error(node, msg) {
	console.error(msg)
	let pos = '?'
	if (node['pos'] !== undefined) {
		pos = node.pos
	}
	console.error(`\tat ${node['file_name']||'<unknown>'}:${node['line']||'?'}:${pos}`)
}

function common_visit(node, visit) {
	if(!node.hasOwnProperty('type')) {
		return node
	}
	for (var key in node) {
		if (key !== 'parent' && node.hasOwnProperty(key) && typeof node[key] === 'object') {
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

module.exports = {
	 clone,
	 get_root,
	 infer_type,
	 error,
	 common_visit,
	 add_parent_links,
	 make_visitor,
 }
