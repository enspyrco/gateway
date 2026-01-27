import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/wallet_provider.dart';

class WalletButton extends StatelessWidget {
  const WalletButton({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<WalletProvider>(
      builder: (context, wallet, _) {
        if (wallet.isConnected) {
          return _ConnectedButton(wallet: wallet);
        }

        return OutlinedButton.icon(
          onPressed: wallet.isConnecting
              ? null
              : () => _showConnectDialog(context, wallet),
          icon: wallet.isConnecting
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.account_balance_wallet, size: 18),
          label: Text(wallet.isConnecting ? 'Connecting...' : 'Connect'),
        );
      },
    );
  }

  void _showConnectDialog(BuildContext context, WalletProvider wallet) {
    if (wallet.isLocalDevMode) {
      // Show test account picker in dev mode
      showDialog(
        context: context,
        builder: (context) => _TestAccountPickerDialog(wallet: wallet),
      );
    } else {
      // Regular wallet connect in production
      wallet.connect();
    }
  }
}

class _TestAccountPickerDialog extends StatelessWidget {
  final WalletProvider wallet;

  const _TestAccountPickerDialog({required this.wallet});

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Row(
        children: [
          Icon(Icons.science, color: Colors.orange),
          SizedBox(width: 8),
          Text('Test Mode'),
        ],
      ),
      content: SizedBox(
        width: 400,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Select a Hardhat test account:',
              style: TextStyle(color: Colors.grey.shade600),
            ),
            const SizedBox(height: 16),
            ...hardhatAccounts.map((account) => Card(
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: _getColorForAccount(account),
                      child: Text(
                        account.name.split(' ')[1].replaceAll('#', ''),
                        style: const TextStyle(
                            color: Colors.white, fontWeight: FontWeight.bold),
                      ),
                    ),
                    title: Text(account.name),
                    subtitle: Text(
                      '${account.address.substring(0, 10)}...${account.address.substring(account.address.length - 8)}',
                      style: const TextStyle(
                          fontFamily: 'monospace', fontSize: 12),
                    ),
                    trailing: const Icon(Icons.arrow_forward_ios, size: 16),
                    onTap: () {
                      Navigator.of(context).pop();
                      wallet.connectTestAccount(account);
                    },
                  ),
                )),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
      ],
    );
  }

  Color _getColorForAccount(TestAccount account) {
    final colors = [Colors.blue, Colors.green, Colors.purple, Colors.orange];
    final index = hardhatAccounts.indexOf(account);
    return colors[index % colors.length];
  }
}

class _ConnectedButton extends StatelessWidget {
  final WalletProvider wallet;

  const _ConnectedButton({required this.wallet});

  @override
  Widget build(BuildContext context) {
    final testAccount = wallet.testAccount;
    final displayName = testAccount?.name ?? wallet.shortAddress;

    return PopupMenuButton<String>(
      offset: const Offset(0, 48),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(20),
          border: testAccount != null
              ? Border.all(color: Colors.orange.shade300, width: 2)
              : null,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (testAccount != null) ...[
              const Icon(Icons.science, size: 16, color: Colors.orange),
              const SizedBox(width: 6),
            ] else ...[
              Container(
                width: 8,
                height: 8,
                decoration: const BoxDecoration(
                  color: Colors.green,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
            ],
            Text(
              testAccount != null
                  ? testAccount.name.replaceAll('Account ', '#')
                  : wallet.shortAddress,
              style: TextStyle(
                fontWeight: FontWeight.w500,
                color: Theme.of(context).colorScheme.primary,
              ),
            ),
            const SizedBox(width: 4),
            Icon(
              Icons.keyboard_arrow_down,
              size: 18,
              color: Theme.of(context).colorScheme.primary,
            ),
          ],
        ),
      ),
      onSelected: (value) {
        if (value == 'disconnect') {
          wallet.disconnect();
        } else if (value == 'switch') {
          showDialog(
            context: context,
            builder: (context) => _TestAccountPickerDialog(wallet: wallet),
          );
        }
      },
      itemBuilder: (context) => [
        PopupMenuItem(
          enabled: false,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  if (testAccount != null) ...[
                    const Icon(Icons.science, size: 14, color: Colors.orange),
                    const SizedBox(width: 4),
                  ],
                  Text(
                    testAccount != null ? 'Test Account' : 'Connected',
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      color: Colors.black,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                testAccount?.name ?? '',
                style: const TextStyle(fontSize: 12, color: Colors.black87),
              ),
              Text(
                wallet.address ?? '',
                style: TextStyle(
                  fontSize: 11,
                  color: Colors.grey.shade600,
                  fontFamily: 'monospace',
                ),
              ),
            ],
          ),
        ),
        const PopupMenuDivider(),
        if (wallet.isLocalDevMode)
          const PopupMenuItem(
            value: 'switch',
            child: Row(
              children: [
                Icon(Icons.swap_horiz, size: 18),
                SizedBox(width: 8),
                Text('Switch Account'),
              ],
            ),
          ),
        const PopupMenuItem(
          value: 'disconnect',
          child: Row(
            children: [
              Icon(Icons.logout, size: 18),
              SizedBox(width: 8),
              Text('Disconnect'),
            ],
          ),
        ),
      ],
    );
  }
}
