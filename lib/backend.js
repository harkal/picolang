'use strict';

const { hex } = require('./util')
const { datatype } = require('./tok')

let inst_type = {
    NOP: 'NOP',
	CALL: 'CALL',
	LOAD: 'LOAD',
	STORE: 'STORE',
    POP: 'POP',
    ADD: 'ADD',
    SUB: 'SUB',
    MUL: 'MUL',
    DIV: 'DIV',
    
    CONVF: 'CONVF',

    DUP: 'DUP',

    JMP: 'JMP',
    JEQ: 'JEQ',
    JNE: 'JNE',
    JGT: 'JGT',
    JGE: 'JGE',
    JLT: 'JLT',
    JLE: 'JLE',

    CALL: 'CALL',
    RET: 'RET',
    HLT: 'HTL',
    BLACKBOX: 'BLACKBOX',
}

let storage = {
	IMMEDIATE: 1,
	MEMORY: 2,
	STACK: 3,
}

function make_data(type) {
	return {
		type: type || datatype.INT,
		storage: storage.IMMEDIATE,
        address: null,
        stack: null,
        value: null,
        label: null
	}
}

function make_inst(type) {
	return {
		type,
		data: null,
		next: null,
	}
}

function match_insts(inst, pattern) {
    let i = 0
    while(inst) {
        if (inst.type.slice(0,pattern[i].length) !== pattern[i])
            return false
        i++
        if (i == pattern.length) 
            return true
        inst = inst.next
    }
    return false
}

function clean_nops(program) {
    let i = 0
    let inst = program
    while(inst) {
        if (inst.target && inst.target.type === inst_type.NOP)
        {
            inst.target = inst.target.next
            continue
        }
        inst = inst.next
    }

    inst = program
    while(inst.next) {
        if (inst.next.type === inst_type.NOP)
        {
            inst.next = inst.next.next
            continue
        }
        inst = inst.next
    }
}

function make_target_labels(program) {
    let i = 0
    let inst = program
    while(inst) {
        if (inst.target && typeof(inst.target) === 'object')
        {
            inst.target.label = `t${i}`
            i++
        }
        inst = inst.next
    }
}

function piphole_pass(program) {
    let ch_count = 0
    let i = program
    while(i.next) {
        let n_i = i.next

        if (match_insts(i, ['LOAD', 'LOAD']) &&
            i.data.stack === n_i.data.stack &&
            i.data.value === n_i.data.value &&
            i.data.address === n_i.data.address )
        {
            n_i.type = inst_type.DUP
            n_i.data = null
            ch_count++
        }

        if (match_insts(i, ['LOAD', 'POP']) || 
            match_insts(i, ['DUP', 'POP']) )
        {
            if (!n_i.label) {
                i.type = n_i.type = inst_type.NOP
                i.next = n_i
                ch_count++
                continue
            }
        }

        if (match_insts(i, ['LOAD', 'CONVF']) &&
            i.data.type === datatype.INT &&
            i.data.value !== null) 
        {
            let b = Buffer.alloc(4)
            b.writeFloatLE(i.data.value)
            let o = hex(b)

            i.data.value = `0x${o}`
            i.next = n_i.next 
            ch_count++
        }

        if (match_insts(i, ['J', 'LOAD', 'JMP', 'LOAD', 'POP', 'JEQ'])) {
            let jmp_inst = i.next.next
            let pop_inst = jmp_inst.next.next
            let jeq_inst = pop_inst.next
            let then_inst = jeq_inst.next

            i.target = jeq_inst.target
            i.next = then_inst
            ch_count++
        }

        if (i.type[0] === 'J') {
            if (i.target === n_i) {
                i.type = inst_type.NOP
                ch_count++
            }
        }

        i = i.next
    }
    // console.log(`Optimized: ${ch_count}`)
    return ch_count
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
        return inst
    }

    function append_inst_type(type) {
        return append_inst(make_inst(type))
    }

    function append_load_immediate(value, type) {
        let i = make_inst(inst_type.LOAD)
        let data = make_data(type)
        data.value = value
        i.data = data
        append_inst(i)
        return i
    }

    function append_load_addr(addr, type) {
        let i = make_inst(inst_type.LOAD)
        let data = make_data(type)
        data.address = addr
        i.data = data
        append_inst(i)
        return i
    }

    function append_load_stack(stack, type) {
        let i = make_inst(inst_type.LOAD)
        let data = make_data(type)
        data.stack = stack
        i.data = data
        append_inst(i)
        return i
    }

    function append_store_addr(addr, type) {
        let i = make_inst(inst_type.STORE)
        let data = make_data(type)
        data.address = addr
        i.data = data
        append_inst(i)
        return i
    }

    function append_store_stack(stack, type) {
        let i = make_inst(inst_type.STORE)
        let data = make_data(type)
        data.stack = stack
        i.data = data
        append_inst(i)
        return i
    }

    function append_op(op_type, type) {
        let i = make_inst(op_type)
        i.a = make_data(type)
        i.b = make_data(type)
        append_inst(i)
        return i
    }

    function append_pop() {
        let i = make_inst(inst_type.POP)
        append_inst(i)
    }

    function append_call(addr) {
        let i = make_inst(inst_type.CALL)
        i.target = addr
        append_inst(i)
        return i
    }

    function append_jump(target) {
        let i = make_inst(inst_type.JMP)
        if (target)
            i.target = target
        append_inst(i)
        return i
    }

    function get_last_inst() {
        return last_inst
    }

    function emit_asm_inst(i) {
        let str = ''
        if (i.label) {
            str += `${i.label}:`
        }
        str += '\t'
        switch (i.type) {
            case inst_type.LOAD:
                if (i.data.value !== null)
                    str += `LOAD32 ${i.data.value}`
                else if (i.data.address !== null)
                    str += `LOAD32 [${i.data.address}]`
                else if (i.data.stack !== null)
                    str += `LOAD32 [SFP ${i.data.stack}]`
                else
                    throw 'Unknown LOAD type'
                break
            case inst_type.STORE:
                if (i.data.value !== null)
                    str += `STORE32 ${i.data.value}`
                else if (i.data.address !== null)
                    str += `STORE32 [${i.data.address}]`
                else if (i.data.stack !== null)
                    str += `STORE32 [SFP ${i.data.stack}]`
                else
                    throw 'Unknown STORE type'
                break
            case inst_type.ADD:
            case inst_type.SUB:
            case inst_type.MUL:
            case inst_type.DIV:
                str += `${i.type}`
                if (i.a.type === datatype.FLOAT) 
                    str += 'F'
                else 
                    str += '32'
                break 
            case inst_type.CONVF:
                str += 'CONVF'
                break
            case inst_type.BLACKBOX:
                str += i.value
                break
            case inst_type.DUP:
                str += 'DUP32'
                break
            case inst_type.POP:
                str += 'POP32'
                break
            case inst_type.CALL:
                str += `CALL ${i.target}`
                break
            case inst_type.RET:
                str += 'RET'
                break
            case inst_type.NOP:
                str += 'NOP'
                break
            case inst_type.HLT:
                str += 'HLT'
                break
        }
        if (i.type.slice(0,1) === 'J') {
            str += `${i.type} ${i.target.label}`
        }
        if (str.slice(str.length-1,str.length) !== '\n')
            str += '\n'
        return str
    }

    function emit_asm() {
        let i = program
        let asm = ''
        clean_nops(program)
        make_target_labels(program)
        while(i) {
            asm += emit_asm_inst(i)
            i = i.next
        }
        return asm
    }

    function optimize() {
        clean_nops(program)
        make_target_labels(program)
        while(piphole_pass(program)){
            clean_nops(program)
            make_target_labels(program)
        }
    }
	
	return {
        append_inst,
        append_inst_type,
        append_load_immediate,
        append_load_addr,
        append_load_stack,
        append_store_addr,
        append_store_stack,
        append_op,
        append_pop,
        append_call,
        append_jump,
        get_last_inst,
        emit_asm,
        optimize,
	}
}

module.exports = {
    inst_type,
    make_inst,
	make_backend,
}