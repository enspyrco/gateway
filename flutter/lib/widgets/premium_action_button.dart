import 'package:flutter/material.dart';

/// Animated gradient/outlined action button used on the token detail page.
///
/// Extracted from token_detail_page.dart to keep that file under the 400-line
/// ceiling and allow reuse across pages.
class PremiumActionButton extends StatefulWidget {
  final VoidCallback? onPressed;
  final IconData? icon;
  final String label;
  final bool isOutlined;
  final bool isLoading;
  final Color color;

  const PremiumActionButton({
    super.key,
    required this.onPressed,
    this.icon,
    required this.label,
    this.isOutlined = false,
    this.isLoading = false,
    required this.color,
  });

  @override
  State<PremiumActionButton> createState() => _PremiumActionButtonState();
}

class _PremiumActionButtonState extends State<PremiumActionButton> {
  bool _isHovered = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => setState(() => _isHovered = true),
      onExit: (_) => setState(() => _isHovered = false),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        decoration: BoxDecoration(
          gradient: widget.isOutlined
              ? null
              : LinearGradient(
                  colors: [
                    widget.color,
                    widget.color.withValues(alpha: 0.8),
                  ],
                ),
          color: widget.isOutlined ? Colors.transparent : null,
          borderRadius: BorderRadius.circular(12),
          border: widget.isOutlined
              ? Border.all(
                  color: _isHovered
                      ? widget.color
                      : widget.color.withValues(alpha: 0.5),
                  width: _isHovered ? 1.5 : 1,
                )
              : null,
          boxShadow: _isHovered && !widget.isOutlined
              ? [
                  BoxShadow(
                    color: widget.color.withValues(alpha: 0.3),
                    blurRadius: 12,
                  ),
                ]
              : null,
        ),
        child: Semantics(
          button: true,
          label: widget.label,
          enabled: widget.onPressed != null,
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: widget.onPressed,
              borderRadius: BorderRadius.circular(12),
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (widget.isLoading)
                      SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color:
                              widget.isOutlined ? widget.color : Colors.white,
                        ),
                      )
                    else if (widget.icon != null)
                      Icon(
                        widget.icon,
                        size: 18,
                        color: widget.isOutlined ? widget.color : Colors.white,
                      ),
                    if ((widget.icon != null || widget.isLoading))
                      const SizedBox(width: 10),
                    // Flexible + ellipsis: long labels (e.g. "Connect Wallet
                    // to Buy (1.0 ETH)") must truncate, not overflow, in the
                    // fixed-width detail column.
                    Flexible(
                      child: Text(
                        widget.label,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color:
                              widget.isOutlined ? widget.color : Colors.white,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
