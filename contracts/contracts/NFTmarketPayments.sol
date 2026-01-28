// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title NFTmarketPayments
 * @notice Handles USDC payments for AI image generation and NFT minting on NFTmarket
 * @dev Accepts USDC via approve+transferFrom pattern with replay protection
 */
contract NFTmarketPayments is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ State Variables ============

    IERC20 public immutable usdc;

    // Fees in USDC (6 decimals)
    uint256 public generationFee1USDC = 500000;      // $0.50 for 1 image
    uint256 public generationFee4USDC = 1500000;     // $1.50 for 4 images
    uint256 public mintFeeUSDC = 1000000;            // $1.00 for minting

    // Payment tracking for replay protection
    mapping(bytes32 => bool) public paymentProcessed;

    // Accumulated fees (can be withdrawn by owner)
    uint256 public accumulatedFees;

    // ============ Events ============

    event GenerationPaid(
        address indexed user,
        bytes32 indexed paymentId,
        uint256 amount,
        uint8 imageCount
    );

    event MintPaid(
        address indexed user,
        bytes32 indexed paymentId,
        uint256 amount
    );

    event FeesUpdated(
        uint256 generationFee1,
        uint256 generationFee4,
        uint256 mintFee
    );

    event FeesWithdrawn(
        address indexed recipient,
        uint256 amount
    );

    // ============ Errors ============

    error InvalidUSDCAddress();
    error PaymentAlreadyProcessed();
    error InvalidPaymentId();
    error InvalidImageCount();
    error InsufficientAllowance();
    error NoFeesToWithdraw();

    // ============ Constructor ============

    /**
     * @notice Initialize the payments contract
     * @param _usdc Address of USDC token (0x3c499c542cef5e3811e1192ce70d8cc03d5c3359 on Polygon)
     */
    constructor(address _usdc) Ownable(msg.sender) {
        if (_usdc == address(0)) revert InvalidUSDCAddress();
        usdc = IERC20(_usdc);
    }

    // ============ Payment Functions ============

    /**
     * @notice Pay for AI image generation
     * @param paymentId Unique identifier for this payment (prevents replay)
     * @param imageCount Number of images to generate (1 or 4)
     * @dev User must approve USDC spending before calling this
     */
    function payForGeneration(bytes32 paymentId, uint8 imageCount) external nonReentrant {
        if (paymentId == bytes32(0)) revert InvalidPaymentId();
        if (paymentProcessed[paymentId]) revert PaymentAlreadyProcessed();
        if (imageCount != 1 && imageCount != 4) revert InvalidImageCount();

        uint256 fee = imageCount == 1 ? generationFee1USDC : generationFee4USDC;

        // Check allowance
        if (usdc.allowance(msg.sender, address(this)) < fee) {
            revert InsufficientAllowance();
        }

        // Mark as processed before transfer (CEI pattern)
        paymentProcessed[paymentId] = true;
        accumulatedFees += fee;

        // Transfer USDC from user
        usdc.safeTransferFrom(msg.sender, address(this), fee);

        emit GenerationPaid(msg.sender, paymentId, fee, imageCount);
    }

    /**
     * @notice Pay for NFT minting
     * @param paymentId Unique identifier for this payment (prevents replay)
     * @dev User must approve USDC spending before calling this
     */
    function payForMint(bytes32 paymentId) external nonReentrant {
        if (paymentId == bytes32(0)) revert InvalidPaymentId();
        if (paymentProcessed[paymentId]) revert PaymentAlreadyProcessed();

        uint256 fee = mintFeeUSDC;

        // Check allowance
        if (usdc.allowance(msg.sender, address(this)) < fee) {
            revert InsufficientAllowance();
        }

        // Mark as processed before transfer (CEI pattern)
        paymentProcessed[paymentId] = true;
        accumulatedFees += fee;

        // Transfer USDC from user
        usdc.safeTransferFrom(msg.sender, address(this), fee);

        emit MintPaid(msg.sender, paymentId, fee);
    }

    // ============ View Functions ============

    /**
     * @notice Check if a payment has been processed
     * @param paymentId The payment ID to check
     * @return True if payment has been processed
     */
    function verifyPayment(bytes32 paymentId) external view returns (bool) {
        return paymentProcessed[paymentId];
    }

    /**
     * @notice Get current fee structure
     * @return generation1 Fee for generating 1 image
     * @return generation4 Fee for generating 4 images
     * @return mint Fee for minting
     */
    function getFees() external view returns (
        uint256 generation1,
        uint256 generation4,
        uint256 mint
    ) {
        return (generationFee1USDC, generationFee4USDC, mintFeeUSDC);
    }

    /**
     * @notice Get fee for specific operation
     * @param imageCount Number of images (1 or 4 for generation, 0 for mint)
     * @return fee The fee amount in USDC (6 decimals)
     */
    function getFeeFor(uint8 imageCount) external view returns (uint256 fee) {
        if (imageCount == 0) return mintFeeUSDC;
        if (imageCount == 1) return generationFee1USDC;
        if (imageCount == 4) return generationFee4USDC;
        revert InvalidImageCount();
    }

    // ============ Admin Functions ============

    /**
     * @notice Update fee structure
     * @param _generationFee1 New fee for 1 image generation (6 decimals)
     * @param _generationFee4 New fee for 4 image generation (6 decimals)
     * @param _mintFee New fee for minting (6 decimals)
     */
    function setFees(
        uint256 _generationFee1,
        uint256 _generationFee4,
        uint256 _mintFee
    ) external onlyOwner {
        generationFee1USDC = _generationFee1;
        generationFee4USDC = _generationFee4;
        mintFeeUSDC = _mintFee;

        emit FeesUpdated(_generationFee1, _generationFee4, _mintFee);
    }

    /**
     * @notice Withdraw accumulated fees to owner
     */
    function withdrawFees() external onlyOwner {
        uint256 amount = accumulatedFees;
        if (amount == 0) revert NoFeesToWithdraw();

        accumulatedFees = 0;
        usdc.safeTransfer(owner(), amount);

        emit FeesWithdrawn(owner(), amount);
    }

    /**
     * @notice Withdraw fees to specific address
     * @param recipient Address to receive fees
     */
    function withdrawFeesTo(address recipient) external onlyOwner {
        uint256 amount = accumulatedFees;
        if (amount == 0) revert NoFeesToWithdraw();

        accumulatedFees = 0;
        usdc.safeTransfer(recipient, amount);

        emit FeesWithdrawn(recipient, amount);
    }
}
