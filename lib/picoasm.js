const fs = require('fs');

const JMP_BASE = 0xc0
const OP_BASE = 0x80

var opcodes = {
    HLT: 0xff,
    YIELD: 0xfe,

    LOAD:  0x00 + 0,
    LOAD16: 0x00 + 1,
    LOAD32: 0x00 + 2,

    STORE:  0x10 + 0,
    STORE16: 0x10 + 1,
    STORE32: 0x10 + 2,

    POP: 0x1c + 0,
    POP16: 0x1c + 1,
    POP32: 0x1c + 2,

    DUP: 0x20 + 0,
    DUP16: 0x20 + 1,
    DUP32: 0x20 + 2,

    DIG: 0x30 + 0,
    DIG16: 0x30 + 1,
    DIG32: 0x30 + 2,

    LOADSFP : 0x5c,
    STORESFP : 0x5d,

    ADD: OP_BASE + (0x0 << 2),
    SUB: OP_BASE + (0x1 << 2),
    MUL: OP_BASE + (0x2 << 2),
    DIV: OP_BASE + (0x3 << 2),
    MOD: OP_BASE + (0x4 << 2),
    SHL: OP_BASE + (0x5 << 2),
    SHR: OP_BASE + (0x6 << 2),
    AND: OP_BASE + (0x7 << 2),
    OR:  OP_BASE + (0x8 << 2),
    XOR: OP_BASE + (0x9 << 2),
    NOT: OP_BASE + (0xA << 2),

    ADDF: OP_BASE + (0xB << 2),
    SUBF: OP_BASE + (0xC << 2),
    MULF: OP_BASE + (0xD << 2),
    DIVF: OP_BASE + (0xE << 2),

    CONV: 0xBC,

    CALL: 0x40,
    RET: 0x42,
    CALLUSER: 0x43,

    JMP_REL_BYTE : JMP_BASE,
    JMP_REL_SHORT: JMP_BASE + 1,

    JEQ_REL_BYTE  : JMP_BASE + 0x1 * 2 + 0x0,
    JEQ_REL_SHORT : JMP_BASE + 0x1 * 2 + 0x1,

    JNE_REL_BYTE  : JMP_BASE + 0x2 * 2 + 0x0,
    JNE_REL_SHORT : JMP_BASE + 0x2 * 2 + 0x1,

    JLE_REL_BYTE  : JMP_BASE + 0x3 * 2 + 0x0,
    JLE_REL_SHORT : JMP_BASE + 0x3 * 2 + 0x1,

    JGE_REL_BYTE  : JMP_BASE + 0x4 * 2 + 0x0,
    JGE_REL_SHORT : JMP_BASE + 0x4 * 2 + 0x1,

    JLT_REL_BYTE  : JMP_BASE + 0x5 * 2 + 0x0,
    JLT_REL_SHORT : JMP_BASE + 0x5 * 2 + 0x1,

    JGT_REL_BYTE  : JMP_BASE + 0x6 * 2 + 0x0,
    JGT_REL_SHORT : JMP_BASE + 0x6 * 2 + 0x1,

    INT: 198
};

function isNumber(s) {
    if (typeof(s) === 'number') {
        return true
    }
    var x = +s;
    return x.toString() === s;
}

function assemble(input, code_offset) {
    var regex = /^[\t ]*(?:([_.a-z0-9@]*)[:])?(?:[\t ]*([a-z0-9]{2,8}))?(?:[\t ]*((\[)?((?:".*")?(?:[_.a-z0-9@]*))?[\t ]*([-+])?[\t ]*([0-9]*)?[\t ]*\]?))?(?:[\t ]*(?:;[\t ]*.*)?)?$/i
    // Regex group indexes for operands
    var label_group = 1
    var bracket_group = 4
    var op1_group = 5
    var operator_group = 6
    var offset_group = 7

    var regexNum = /^[-+]?[0-9]+$/;
    var regexLabel = /^[_.A-Za-z][@\w]*$/;

    // Contains the program code & data generated by the assembler
    var code = [];
    // Contains the mapping from instructions to assembler line
    var mapping = {};
    // Hash map of label used to replace the labels after the assembler
    // generated the code
    var labels = {};
    // Hash of uppercase labels used to detect duplicates
    var normalizedLabels = {};

    var lines = input.split('\n');

    var codePush = function(inst, pos) {
        if(typeof(inst) === 'object')
            throw 'codePush object'
        code.push(inst)
    }

    var parseNumber = function (input) {
        if (input.slice(0, 2) === '0x')
            return parseInt(input.slice(2), 16);
        else if (input.slice(0, 2) === '0o')
            return parseInt(input.slice(2), 8);
        else if (input.slice(input.length - 1) === 'b')
            return parseInt(input.slice(0, input.length - 1), 2);
        else if (input.slice(input.length - 1) === 'd')
            return parseInt(input.slice(0, input.length - 1), 10);
        else if (regexNum.exec(input))
            return parseInt(input, 10);
        else
            throw 'Invalid number format';
    }

    var parseLabelOrNumber = function (input) {
        var label = parseLabel(input);

        if (label !== undefined) {
            if (label.toUpperCase() == 'SFP') {
                return {type: 'register', value: label.toUpperCase()};
            } else {
                return {type: 'label', value: label};
            }
        } else if (input.slice(0,2) === '0x') {
            var v = []
            for(let i = input.length - 2 ; i >= 2 ; i-=2) {
                v.push(parseInt(input.slice(i,i+2), 16))
            }
            return {type: 'number', value: v}
        } else {
            var value = parseNumber(input);

            if (isNaN(value))
                throw 'Not a ' + typeNumber + ': ' + value;
            else if (value < 0 || value > 65535)
                throw 'number must have a value between 0 and 65535';

            return {type: 'number', value: value}
        }
    }

    var parseLabel = function (input) {
        return regexLabel.exec(input) ? input : undefined;
    }

    var getValue = function (input) {
        switch (input.slice(0, 1)) {
            case '[': 
                var address = input.slice(1, input.length - 1);
                return parseLabelOrNumber(address);
            case '"': // "String"
                var text = input.slice(1, input.length - 1);
                var chars = [];

                for (var i = 0, l = text.length; i < l; i++)
                    chars.push(text.charCodeAt(i));

                return {type: 'numbers', value: chars};
            case '\'': // 'C'
                var character = input.slice(1, input.length - 1);

                if (character.length > 1)
                    throw 'Only one character is allowed. Use String instead';

                return {type: 'number', value: character.charCodeAt(0)};
            default: // REGISTER, NUMBER or LABEL
                return parseLabelOrNumber(input);
        }
    }

    var lastLabel = ''
    function decorateLabel(label, definition) {
        if (labels[label]) {
            return label
        }
        if (label.slice(0,1) === '.') {
            return lastLabel + '___' + label.slice(1)
        }
        if (definition) {
            lastLabel = label
        }
        return label
    }

    var addLabel = function (label) {
        var upperLabel = label.toUpperCase();

        if (upperLabel in normalizedLabels)
            throw 'Duplicate label: ' + label;

        labels[label] = code.length + code_offset;
        

        return label
    };

    var updateLabels = function(after, offset) {
        for (let i in labels) {
            if(labels[i]>after) {
                labels[i]+=offset
            }
        }
    }

    var checkNoExtraArg = function (instr, arg) {
        if (arg !== undefined)
            throw instr + ': too many arguments';
    };

    var codePushOperands = function () {
        for (var i = 0; i < arguments.length; i++) {
            if (isNumber(arguments[i])) {
                v = arguments[i]
                codePush(arguments[i] & 0xff)
                codePush(arguments[i] >> 8)
            } else if (typeof(arguments[i]) === 'object') {
                v = arguments[i]
                for(let i in v) {
                    codePush(v[i])  
                }
                // if (v.length == 1) {
                //     //codePush(0)
                // }
            } else {
                codePush(arguments[i])
                codePush(arguments[i])
            }
        }
    }

    for (var i = 0, l = lines.length; i < l; i++) {
        try {
            var match = regex.exec(lines[i]);
            // console.log(lines[i], match)
            if (match[1] !== undefined || match[2] !== undefined) {
                if (match[1] !== undefined)
                    addLabel(decorateLabel(match[1]), true);

                if (match[2] !== undefined) {
                    var instr = match[2].toUpperCase();
                    var p1, p2, opCode;

                    if (instr !== 'DB')
                        mapping[(code.length + code_offset)] = i;

                    switch (instr) {
                        case 'ABSOLUTE':

                        break;
                        case 'RESB':
                        case 'RESW':
                        case 'RESD':
                            var count = 1
                            if (match[op1_group]) {
                                p1 = getValue(match[op1_group]);
                                if (p1.type === 'number')
                                    count = p1.value
                                else
                                    throw 'DB does not support this operand';
                            }

                            switch(instr) {
                                case 'RESW': count *= 2; break;
                                case 'RESD': count *= 4; break;
                            }

                            for(let i=0;i<count;i++)
                                codePush(';RESB')
                            
                            break;
                        case 'DB':
                            p1 = getValue(match[op1_group]);

                            if (p1.type === 'number' || p1.type === 'numbers')
                                codePushOperands(p1.value)
                            else
                                throw 'DB does not support this operand';

                            break;
                        case 'HLT':
                        case 'YIELD':
                        case 'ADDF':
                        case 'SUBF':
                        case 'MULF':
                        case 'DIVF':
                        case 'POP':
                        case 'POP16':
                        case 'POP32':
                        case 'RET':
                        case 'CALLUSER':
                            checkNoExtraArg(instr, match[op1_group]);
                            codePush(opcodes[instr]);
                            break;
                        case 'DUP':
                        case 'DUP16':
                        case 'DUP32':
                        case 'DIG':
                        case 'DIG16':
                        case 'DIG32':
                            var K
                            if(match[op1_group] == undefined) {
                                K = { type: 'number', value: 0 }
                            } else {
                                K = getValue(match[op1_group]);
                            }
                            if (K.type !== 'number') {
                                throw `${instr} does not support this operands`;
                            }
                            if (K.value < 0 || K.value > 255) {
                                throw `${instr} depth can range from 0 - 255`;
                            }
                            if (K.value < 3) {
                                codePush(opcodes[instr] | ((K.value) << 2));
                            } else {
                                codePush(opcodes[instr] | (0x3 << 2) )
                                codePush(K.value)
                            }
                            break;
                        case 'LOAD':
                        case 'LOAD16':
                        case 'LOAD32':
                        case 'STORE':
                        case 'STORE16':
                        case 'STORE32':
                            var size = instr.slice(instr.length-2, instr.length)
                            if(match[op1_group] != undefined) {
                                addr = getValue(match[op1_group]);
                                if (addr.type == 'label') {
                                    if (size != '16' && match[bracket_group] == undefined)
                                        throw 'Imediate label loading only with 16bit load'
                                    var offset = 0
                                    if (match[offset_group] != undefined) {
                                        offset = parseNumber(match[offset_group])
                                    }
                                    
                                    if (match[bracket_group] == undefined)
                                        codePush(opcodes[instr] | (0x3 << 2))
                                    else
                                        codePush(opcodes[instr])
                                    codePush(offset)
                                    codePush(addr.value)
                                } else if (addr.type == 'register') {
                                    if (instr.slice(0,4) === 'LOAD')
                                        codePush(opcodes[instr] + 0x5c - opcodes.LOAD)
                                    else
                                        codePush(opcodes[instr] + 0x6c - opcodes.STORE)
                                    var offset = 0
                                    if (match[offset_group] != undefined) {
                                        offset = parseNumber(match[offset_group])
                                        if (match[operator_group] === '-') {
                                            offset = -offset
                                        }
                                    }
                                    codePush(offset)
                                } else if (addr.type == 'number') {
                                    if(match[bracket_group] != undefined) {
                                        codePush(opcodes[instr] | 0x4)
                                        codePush(addr.value)
                                    } else {
                                        codePush(opcodes[instr] | 0xC)
                                        if (size == '32') {
                                            if(Array.isArray(addr.value)) {
                                                addr.value.reverse().forEach(a=>codePush(a))
                                            } else {
                                                var v = addr.value
                                                codePush(v & 0xff)
                                                v >>= 8
                                                codePush(v & 0xff)
                                                v >>= 8
                                                codePush(v & 0xff)
                                                v >>= 8
                                                codePush(v & 0xff)
                                            }
                                        } else if (size == '16') {
                                            codePush(addr.value & 0xff)
                                            codePush(addr.value >> 8)
                                        } else {
                                            codePush(addr.value & 0xff)
                                        }
                                    }
                                } else {
                                    throw `${instr} does not support this operands`;
                                }
                            } else {
                                codePush(opcodes[instr] | 0x8)
                            }
                            break;
                        case 'ADD':
                        case 'SUB':
                        case 'MUL':
                        case 'DIV':
                        case 'MOD':
                        case 'SHL':
                        case 'SHR':
                        case 'AND':
                        case 'OR':
                        case 'XOR':
                        case 'NOT':
                        case 'ADD16':
                        case 'SUB16':
                        case 'MUL16':
                        case 'DIV16':
                        case 'MOD16':
                        case 'SHL16':
                        case 'SHR16':
                        case 'AND16':
                        case 'OR16':
                        case 'XOR16':
                        case 'NOT16':
                        case 'ADD32':
                        case 'SUB32':
                        case 'MUL32':
                        case 'DIV32':
                        case 'MOD32':
                        case 'SHL32':
                        case 'SHR32':
                        case 'AND32':
                        case 'OR32':
                        case 'XOR32':
                        case 'NOT32':
                            var size = instr.slice(instr.length-2, instr.length)
                            var cmd = instr
                            var mod = 0
                            if (size == '16') {
                                mod = 1
                                cmd = instr.slice(0, instr.length-2)
                            } else if (size == '32') {
                                mod = 2
                                cmd = instr.slice(0, instr.length-2)
                            }
                            checkNoExtraArg(instr, match[op1_group]);
                            codePush(opcodes[cmd] + mod);
                            break;
                        case 'CONVI':
                        case 'CONVF':
                            checkNoExtraArg(instr, match[op1_group]);
                            var modifier = 0
                            if (instr === 'CONVF')
                                modifier = 1
                            codePush(opcodes.CONV + modifier)
                            break
                        case 'JMP':
                        case 'JEQ':
                        case 'JNE':
                        case 'JGT':
                        case 'JLT':
                        case 'JGE':
                        case 'JLE':
                                p1 = getValue(decorateLabel(match[op1_group]));
                                
                                if (p1.type !== 'label')
                                    throw `${instr} does not support this operands`;
                                
                                codePush(opcodes[`${instr}_REL_SHORT`]);
                                codePushOperands('^' + p1.value);
                                break;
                        case 'CALL':
                            if(match[op1_group] != undefined) {
                                p1 = getValue(decorateLabel(match[op1_group]));
                                    
                                if (p1.type !== 'label')
                                    throw `${instr} does not support this operands`;
                                
                                codePush(opcodes[instr]);
                                codePushOperands(p1.value);
                            } else {
                                codePush(opcodes[instr] | 0x1);
                            }
                            break;
                        case 'INT':
                            p1 = getValue(match[op1_group]);
                            checkNoExtraArg('INT', match[op2_group]);

                            if (p1.type === 'number')
                                opCode = opcodes.INT;
                            else
                                throw 'INT does not support this operand';

                            codePush(opCode);
                            codePushOperands(p1.value);
                            break;
                        case 'IRET':
                            checkNoExtraArg(instr, match[op1_group]);
                            opCode = opcodes.IRET;
                            codePush(opCode);
                            break;
                        default:
                            throw 'Invalid instruction: ' + match[2];
                    }
                }
            } else {
                // Check if line starts with a comment otherwise the
                // line contains an error and can not be parsed.
                var line = lines[i].trim();

                if (line !== '' && line.slice(0, 1) !== ';')
                    throw 'Syntax error';
            }
        } catch (e) {
            throw {error: e, line: i};
        }
    }

    for (i = 0; i < code.length; i++) {
        if (isNumber(code[i])) {
            continue
        }

        if (code[i] === ';RESB') {
            continue
        }

        var label = code[i]
        if (label[0] === '^') {
            label = label.slice(1)
        }
        if (label in labels) {
            if (code[i][0] === '^') {
                var rel = labels[label] - i + code_offset
                if (rel >= -128 && rel <= 127 ) {
                    code[i-1] &= 0xfe 
                    code.splice(i+1,1)
                    updateLabels(i,-1)
                }
            }
        } else {
            throw {error: 'Undefined label: ' + code[i]};
        }
    
    }

    // Replace label
    for (i = code.length - 1; i >= 0; i--) {
        if (code[i] === ';RESB') {
            if (i == code.length - 1) {
                code = code.splice(0,i)
            } else {
                code[i] = 0x00
            }
            continue
        }

        if (isNumber(code[i])) {
            continue;
        }

        var label = code[i]
        if (label[0] === '^') {
            label = label.slice(1)
        }

        if (label in labels) {
            if (code[i][0] === '^') {
                let rel = labels[label] - i + code_offset + 1
                if (code[i-1][0] !== '^') {
                    code[i] = rel
                } else {
                    var addr = labels[label]
                    code[i-1] = addr & 0xff;
                    code[i] = addr >> 8;    
                }
            } else {
                var ofs = code[i-1]
                if (typeof(ofs) == 'string') ofs = 0
                var addr = labels[label] + ofs
                code[i-1] = addr & 0xff;
                code[i] = addr >> 8;
            }
        } else {
            throw {error: 'Undefined label final: ' + code[i]};
        }
        
    }

    return {code: code, mapping: mapping, labels: labels};
}

module.exports = {
	assemble
};
