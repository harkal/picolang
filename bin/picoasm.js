#!/usr/bin/env node

const fs = require('fs');
const program = require('commander')
const { assemble } = require('../lib/picoasm')

function compile(sources, cmd) {
	let asm_code = ''
	
	sources.forEach(file=>{
		let sc = fs.readFileSync(file, 'utf-8')
		asm_code += sc
	})

	try {
		var asm = assemble(asm_code, 0)
		var buf = new Buffer.from(asm.code, 'binary')
		outFile = cmd.output
		if (!outFile)outFile = 'a.hex'
		if (cmd.stdout) {
			process.stdout.write(buf)
		} else {
			fs.writeFileSync(outFile, buf)
		}
	} catch (err) {
		console.log(err)
	}

}

function main() {
	program
		.version('0.0.1', '-v --version')
		.description('Assembler for the picovm')

	program
		.command('compile [sources...]', { isDefault: true })
		.option('-o, --output <output>', 'output file')
		.option('-s, --stdout', 'emit code on stdout')
		.action(compile)

	program.parse(process.argv)    

    if (!program.args.length) program.help();
}

main()
