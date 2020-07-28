'use strict';

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
	WHILE: 'WHILE',
	CONTINUE: 'CONTINUE',
	BREAK: 'BREAK',
	RETURN: 'RETURN',
	ASM: 'ASM',
	STRING: 'STRING',

	DEF: 'DEF'
}

let keyword = {
	'if': token.IF,
	'else': token.ELSE, 
	'def': token.DEF, 
	'while': token.WHILE,
	'continue': token.CONTINUE,
	'break': token.BREAK,
	'return': token.RETURN,
	'__asm__': token.ASM,
}

let datatype = {
	FLOAT: 'float',
	INT: 'int',
	STRING: 'string',
	FUNCTION: 'fn',
}

const WHITESPACE = /\s/;
const LETTERS = /[a-z_]/i;
const NUMBERS_OR_DOT = /[\.0-9]/;

const NUMBER_INT = /^[0-9]+$/;
const NUMBER_FLOAT = /^(\d+)?(\.\d+)?$/;

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
		
				tokens.push({ type: token.STRING, value });  
				continue;
		}

		if (LETTERS.test(char)){ 
			value = '';
			while (LETTERS.test(char) && current < input.length) {
				value += char;
				char = input[++current];
			}
			
			if (keyword[value] !== undefined) {
				tokens.push({ type: keyword[value] });  
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
				tokens.push({ type: 'number', value: parseInt(value), datatype: datatype.INT });  
			} else if(NUMBER_FLOAT.test(value)) {
				tokens.push({ type: 'number', value: parseFloat(value), datatype: datatype.FLOAT });  
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

module.exports = {
	token,
	tokenizer,
	datatype
}