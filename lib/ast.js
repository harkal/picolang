"use strict";

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

 module.exports = {
	 clone,
	 get_root,
 }
