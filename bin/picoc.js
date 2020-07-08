#!/usr/bin/env node

const fs = require('fs');
const program = require('commander')
const { assemble } = require('../lib/picoasm')
const { compile_source } = require('../lib/picolang')

function compile(sources, cmd) {
	let source_code = ''
	
	sources.forEach(file=>{
		let sc = fs.readFileSync(file, 'utf-8')
		source_code += sc
	})

	let asm_code = ''
	try {
		asm_code = compile_source(source_code)

		let outFile = cmd.output
		if (!outFile)outFile = 'out.asm'
	
		if (cmd.asm === true) {
			if (cmd.stdout) {
				console.log(asm_code)
			} else {
				var buf = new Buffer.from(asm_code)
				fs.writeFileSync(outFile, buf)
			}
			return
		}

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
		.description('Compiler for the picolang')

	program
		.command('compile [sources...]', { isDefault: true })
		.option('-o, --output <output>', 'output file')
		.option('-a, --asm', 'output assembly')
		.option('-s, --stdout', 'emit code on stdout')
		.action(compile)

	program.parse(process.argv)    

    if (!program.args.length) program.help();
}

main()
