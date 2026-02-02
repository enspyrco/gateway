require('dotenv').config();

const express = require('express');
const cors = require('cors');

const accountsRouter = require('./routes/accounts');
const signRouter = require('./routes/sign');
const authRouter = require('./routes/auth');
const transactionRouter = require('./routes/transaction');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: /^http:\/\/localhost(:\d+)?$/,
  credentials: true,
}));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/accounts', accountsRouter);
app.use('/api/sign', signRouter);
app.use('/api/auth', authRouter);
app.use('/api/transaction', transactionRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'wallet-service',
    timestamp: new Date().toISOString(),
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\nWallet Service running on port ${PORT}`);
  console.log(`  - Health: http://localhost:${PORT}/health`);
  console.log(`  - Accounts: http://localhost:${PORT}/api/accounts`);
  console.log(`  - Sign: http://localhost:${PORT}/api/sign/*`);
  console.log(`  - Auth: http://localhost:${PORT}/api/auth/*`);
  console.log(`  - Transactions: http://localhost:${PORT}/api/transaction/*`);
  console.log(`\nRPC URL: ${process.env.RPC_URL || 'http://localhost:8545'}`);
  console.log(`Chain ID: ${process.env.CHAIN_ID || '31337'}`);
});
