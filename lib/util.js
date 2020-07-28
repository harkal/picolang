"use strict";

const byteToHex = [];

for (let n = 0; n <= 0xff; ++n)
{
    const hexOctet = n.toString(16).padStart(2, "0");
    byteToHex.push(hexOctet);
}

function hex(arrayBuffer)
{
    return Array.prototype.map.call(
        new Uint8Array(arrayBuffer),
        n => byteToHex[n]
    ).join("");
}

function zip(arr1, arr2) { 
	return arr1.map((k, i) => [k, arr2[i]])
}


module.exports = {
	hex,
	zip,
}