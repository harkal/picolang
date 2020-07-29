const ast = require('./ast')
const { token } = require('./tok')

let type_infer_pass = {
	common: ast.common_visit
}

module.exports = {
	type_infer_pass,
}
