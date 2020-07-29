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

class data {
	constructor() {
		this.type = datatype.INT
		this.address = 0
	}
}

class instruction {
	constructor(type) {
		this.type = type

	}
}

function make_inst(inst) {

}

module.exports = {
	instruction
}