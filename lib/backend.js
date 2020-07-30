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

function make_backend() {
    let program = null
    let last_inst = null

    function append_inst(inst) {
        if (!program) {
            program = inst
            last_inst = inst
            return
        }
        last_inst.next = inst
        last_inst = inst
    }

    function append_load_immediate(value, type) {
        let i = make_instruction(type)
        let data = make_data()
        data.value = value
        i.data = data
        append_inst(i)
        return i
    }

    function emit_asm() {
        let i = program
        let asm = '; __ASM__\n'
        while(i) {
            asm += i.type + '\n'
            i = i.next
        }
        return asm
    }
	
	return {
        append_inst,
        append_load_immediate,
		emit_asm
	}
}

module.exports = {
	instruction_type,
	make_backend,
}