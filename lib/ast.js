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
		if (key !== 'parent' && ast.hasOwnProperty(key)) {
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

module.exports = {
	 clone,
	 get_root,
	 infer_type,
	 error,
	 common_visit,
 }