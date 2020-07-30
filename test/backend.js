'use strict'

const assert = require('chai').assert
const should = require('chai').should()
const backend = require('../lib/backend')
const { datatype } = require('../lib/tok')

describe('backend', function () {
	describe('#make_backend', function () {
        it('should return a new backend', function () {
			let be = backend.make_backend()
			be.should.have.property('append_inst')
			be.should.have.property('append_load_immediate')
			be.should.have.property('emit_asm')
        });
	});
	
	it('should work', ()=>{
		let be = backend.make_backend()
		be.append_load_immediate(20, datatype.INT)
		be.append_load_addr('label', datatype.FLOAT)
		be.append_load_stack(-2, datatype.FLOAT)
		be.append_pop()
		console.log(be.emit_asm())
	})
})
