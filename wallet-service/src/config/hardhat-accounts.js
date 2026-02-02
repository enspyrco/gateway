/**
 * Hardhat test accounts for local development
 * These are the default Hardhat accounts with well-known private keys
 * DO NOT use these in production!
 */

const accounts = [
  {
    name: 'Account #0',
    nickname: 'Deployer',
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  },
  {
    name: 'Account #1',
    nickname: 'Platform',
    address: '0x70997970C51812dc3A010C7d01b50e44D9c4F5Ee',
    privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    isPlatform: true,
  },
  {
    name: 'Account #2',
    nickname: 'Alice',
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  },
  {
    name: 'Account #3',
    nickname: 'Bob',
    address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    privateKey: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  },
  {
    name: 'Account #4',
    nickname: 'Sam',
    address: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
    privateKey: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  },
  {
    name: 'Account #5',
    nickname: 'Joe',
    address: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
    privateKey: '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
  },
  {
    name: 'Account #6',
    nickname: 'Mary',
    address: '0x976EA74026E726554dB657fA54763abd0C3a0aa9',
    privateKey: '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e',
  },
];

// User accounts (excluding deployer and platform)
const userAccounts = accounts.filter(
  (a) => !a.isPlatform && a.nickname !== 'Deployer'
);

// Get account by address (case-insensitive)
function getAccountByAddress(address) {
  const lowerAddress = address.toLowerCase();
  return accounts.find((a) => a.address.toLowerCase() === lowerAddress);
}

// Get account by nickname
function getAccountByNickname(nickname) {
  const lowerNickname = nickname.toLowerCase();
  return accounts.find((a) => a.nickname.toLowerCase() === lowerNickname);
}

module.exports = {
  accounts,
  userAccounts,
  getAccountByAddress,
  getAccountByNickname,
};
