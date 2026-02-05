const { ethers } = require('ethers');

// Calculate function selector
const sig = 'list(uint256,uint256,uint8,bytes32,uint256,bytes)';
const selector = ethers.id(sig).slice(0, 10);
console.log('Function signature:', sig);
console.log('Calculated selector:', selector);
console.log('Used in test:', '0x2d296bf1');
console.log('Match:', selector === '0x2d296bf1');

// Also calculate delist and buy
const delistSig = 'delist(uint256)';
const buySig = 'buy(uint256,bytes)';
console.log('\nDelist selector:', ethers.id(delistSig).slice(0, 10));
console.log('Buy selector:', ethers.id(buySig).slice(0, 10));
