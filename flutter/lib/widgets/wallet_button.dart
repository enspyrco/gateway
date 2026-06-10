import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../providers/wallet_provider.dart';
import '../theme.dart';

class WalletButton extends StatelessWidget {
  const WalletButton({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<WalletProvider>(
      builder: (context, wallet, _) {
        if (wallet.isConnected) {
          return _ConnectedButton(wallet: wallet);
        }

        return _ConnectButton(wallet: wallet);
      },
    );
  }

}

class _ConnectButton extends StatefulWidget {
  final WalletProvider wallet;

  const _ConnectButton({required this.wallet});

  @override
  State<_ConnectButton> createState() => _ConnectButtonState();
}

class _ConnectButtonState extends State<_ConnectButton> {
  bool _isHovered = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => setState(() => _isHovered = true),
      onExit: (_) => setState(() => _isHovered = false),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [
              NFTmarketColors.surfaceLight,
              NFTmarketColors.surface,
            ],
          ),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: _isHovered
                ? NFTmarketColors.accent.withValues(alpha: 0.5)
                : NFTmarketColors.surfaceBorder,
            width: _isHovered ? 1.5 : 1,
          ),
          boxShadow: _isHovered
              ? [
                  BoxShadow(
                    color: NFTmarketColors.accent.withValues(alpha: 0.15),
                    blurRadius: 12,
                  ),
                ]
              : null,
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: widget.wallet.isConnecting
                ? null
                : () => _showConnectDialog(context, widget.wallet),
            borderRadius: BorderRadius.circular(20),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (widget.wallet.isConnecting)
                    const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: NFTmarketColors.accent,
                      ),
                    )
                  else
                    const Icon(
                      Icons.account_balance_wallet,
                      size: 18,
                      color: NFTmarketColors.accent,
                    ),
                  const SizedBox(width: 8),
                  Text(
                    widget.wallet.isConnecting ? 'Connecting...' : 'Connect',
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      color: NFTmarketColors.textPrimary,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _showConnectDialog(BuildContext context, WalletProvider wallet) {
    if (wallet.isLocalDevMode) {
      showDialog(
        context: context,
        builder: (context) => _TestAccountPickerDialog(wallet: wallet),
      );
    } else {
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
      backgroundColor: NFTmarketColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: NFTmarketColors.surfaceBorder),
      ),
      title: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: NFTmarketColors.warning.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(
              Icons.science,
              color: NFTmarketColors.warning,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          const Text(
            'Test Mode',
            style: TextStyle(color: NFTmarketColors.textPrimary),
          ),
        ],
      ),
      content: SizedBox(
        width: 400,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Select a Hardhat test account:',
              style: TextStyle(color: NFTmarketColors.textSecondary),
            ),
            const SizedBox(height: 16),
            ...wallet.availableAccounts.map((account) {
              final index = wallet.availableAccounts.indexOf(account);
              return _TestAccountCard(
                account: account,
                index: index,
                onTap: () {
                  Navigator.of(context).pop();
                  wallet.connectTestAccount(account);
                },
              );
            }),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          style: TextButton.styleFrom(
            foregroundColor: NFTmarketColors.textSecondary,
          ),
          child: const Text('Cancel'),
        ),
      ],
    );
  }
}

class _TestAccountCard extends StatefulWidget {
  final TestAccount account;
  final int index;
  final VoidCallback onTap;

  const _TestAccountCard({
    required this.account,
    required this.index,
    required this.onTap,
  });

  @override
  State<_TestAccountCard> createState() => _TestAccountCardState();
}

class _TestAccountCardState extends State<_TestAccountCard> {
  bool _isHovered = false;

  Color _getColorForIndex(int index) {
    final colors = [
      NFTmarketColors.displayBlue,
      NFTmarketColors.success,
      NFTmarketColors.transferPurple,
      NFTmarketColors.commercialOrange,
      NFTmarketColors.error,
    ];
    return colors[index % colors.length];
  }

  @override
  Widget build(BuildContext context) {
    final color = _getColorForIndex(widget.index);

    return MouseRegion(
      onEnter: (_) => setState(() => _isHovered = true),
      onExit: (_) => setState(() => _isHovered = false),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        margin: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [
              NFTmarketColors.cardGradientStart,
              NFTmarketColors.cardGradientEnd,
            ],
          ),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: _isHovered
                ? color.withValues(alpha: 0.5)
                : NFTmarketColors.surfaceBorder,
            width: _isHovered ? 1.5 : 1,
          ),
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: widget.onTap,
            borderRadius: BorderRadius.circular(12),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          color.withValues(alpha: 0.3),
                          color.withValues(alpha: 0.15),
                        ],
                      ),
                      shape: BoxShape.circle,
                      border: Border.all(color: color, width: 1.5),
                    ),
                    child: Center(
                      child: Text(
                        widget.account.nickname[0],
                        style: TextStyle(
                          color: color,
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.account.nickname,
                          style: const TextStyle(
                            color: NFTmarketColors.textPrimary,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${widget.account.address.substring(0, 10)}...${widget.account.address.substring(widget.account.address.length - 8)}',
                          style: const TextStyle(
                            fontFamily: 'monospace',
                            fontSize: 11,
                            color: NFTmarketColors.textMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Icon(
                    Icons.arrow_forward_ios,
                    size: 14,
                    color: _isHovered ? color : NFTmarketColors.textMuted,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ConnectedButton extends StatefulWidget {
  final WalletProvider wallet;

  const _ConnectedButton({required this.wallet});

  @override
  State<_ConnectedButton> createState() => _ConnectedButtonState();
}

class _ConnectedButtonState extends State<_ConnectedButton> {
  bool _isHovered = false;

  @override
  Widget build(BuildContext context) {
    final testAccount = widget.wallet.testAccount;

    return MouseRegion(
      onEnter: (_) => setState(() => _isHovered = true),
      onExit: (_) => setState(() => _isHovered = false),
      child: PopupMenuButton<String>(
        offset: const Offset(0, 48),
        color: NFTmarketColors.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: NFTmarketColors.surfaceBorder),
        ),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [
                NFTmarketColors.surfaceLight,
                NFTmarketColors.surface,
              ],
            ),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: testAccount != null
                  ? NFTmarketColors.warning.withValues(alpha: 0.5)
                  : _isHovered
                      ? NFTmarketColors.success.withValues(alpha: 0.5)
                      : NFTmarketColors.surfaceBorder,
              width: testAccount != null || _isHovered ? 1.5 : 1,
            ),
            boxShadow: _isHovered
                ? [
                    BoxShadow(
                      color: (testAccount != null
                              ? NFTmarketColors.warning
                              : NFTmarketColors.success)
                          .withValues(alpha: 0.15),
                      blurRadius: 12,
                    ),
                  ]
                : null,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (testAccount != null) ...[
                const Icon(
                  Icons.science,
                  size: 16,
                  color: NFTmarketColors.warning,
                ),
                const SizedBox(width: 8),
              ] else ...[
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: NFTmarketColors.success,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: NFTmarketColors.success.withValues(alpha: 0.5),
                        blurRadius: 4,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
              ],
              Text(
                testAccount != null
                    ? testAccount.nickname
                    : widget.wallet.shortAddress,
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  color: NFTmarketColors.textPrimary,
                ),
              ),
              const SizedBox(width: 6),
              Icon(
                Icons.keyboard_arrow_down,
                size: 18,
                color: _isHovered
                    ? NFTmarketColors.accent
                    : NFTmarketColors.textMuted,
              ),
            ],
          ),
        ),
        onSelected: (value) {
          if (value == 'disconnect') {
            widget.wallet.disconnect();
          } else if (value == 'switch') {
            showDialog(
              context: context,
              builder: (context) =>
                  _TestAccountPickerDialog(wallet: widget.wallet),
            );
          } else if (value == 'copy') {
            Clipboard.setData(ClipboardData(text: widget.wallet.address ?? ''));
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Address copied to clipboard'),
                backgroundColor: NFTmarketColors.surfaceLight,
                duration: Duration(seconds: 2),
              ),
            );
          }
        },
        itemBuilder: (context) => [
          PopupMenuItem(
            value: 'copy',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    if (testAccount != null) ...[
                      const Icon(Icons.science,
                          size: 14, color: NFTmarketColors.warning),
                      const SizedBox(width: 6),
                    ],
                    Text(
                      testAccount != null ? 'Test Account' : 'Connected',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        color: NFTmarketColors.textPrimary,
                      ),
                    ),
                  ],
                ),
                if (testAccount != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    testAccount.nickname,
                    style: const TextStyle(
                      fontSize: 14,
                      color: NFTmarketColors.textPrimary,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
                const SizedBox(height: 4),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        widget.wallet.address ?? '',
                        style: const TextStyle(
                          fontSize: 11,
                          color: NFTmarketColors.textMuted,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ),
                    const Icon(Icons.copy,
                        size: 14, color: NFTmarketColors.textMuted),
                  ],
                ),
                const SizedBox(height: 2),
                const Text(
                  'Tap to copy address',
                  style: TextStyle(
                    fontSize: 10,
                    color: NFTmarketColors.accent,
                  ),
                ),
              ],
            ),
          ),
          const PopupMenuDivider(),
          if (widget.wallet.isLocalDevMode)
            const PopupMenuItem(
              value: 'switch',
              child: Row(
                children: [
                  Icon(
                    Icons.swap_horiz,
                    size: 18,
                    color: NFTmarketColors.textSecondary,
                  ),
                  SizedBox(width: 10),
                  Text(
                    'Switch Account',
                    style: TextStyle(color: NFTmarketColors.textPrimary),
                  ),
                ],
              ),
            ),
          PopupMenuItem(
            value: 'disconnect',
            child: Row(
              children: [
                Icon(
                  Icons.logout,
                  size: 18,
                  color: NFTmarketColors.error.withValues(alpha: 0.8),
                ),
                const SizedBox(width: 10),
                Text(
                  'Disconnect',
                  style: TextStyle(
                    color: NFTmarketColors.error.withValues(alpha: 0.8),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
