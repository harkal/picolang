'use strict';

const { datatype } = require('./tok')

let instruction_type = {
	CALL: 1,
	LOAD: 2,
	STORE: 3,
	POP: 4,
	MUL: 5,
	JMP: 6,
}

let storage = {
	IMMEDIATE: 1,
	MEMORY: 2,
	STACK: 3,
}

function make_data() {
	return {
		type: datatype.INT,
		storage: storage.IMMEDIATE,
		address: 0,
		value: 0,
	}
}

function make_instruction(type) {
	return {
		type,
		data: null,
		next: null,
	}
}

let program = null


function make_load_immediate(value, type) {
	let i = make_instruction(type)
	let data = make_data()
	data.value = value
	i.data = data
	return i
}

module.exports = {
	instruction_type,
	make_load_immediate,
}