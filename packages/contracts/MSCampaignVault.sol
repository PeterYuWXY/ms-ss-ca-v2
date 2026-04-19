// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title MSCampaignVault
 * @notice Campaign fund escrow and distribution contract
 * @dev Manages campaign payments with 70/30 split between CAs and platform
 */
contract MSCampaignVault is Ownable, ReentrancyGuard {
    
    // Campaign status
    enum CampaignStatus {
        Pending,    // Waiting for payment
        Active,     // Payment received, campaign active
        Completed,  // Campaign finished
        Cancelled   // Campaign cancelled
    }
    
    struct Campaign {
        address advertiser;      // Advertiser wallet
        uint256 totalAmount;     // Total payment amount
        uint256 platformFee;     // 30% platform fee
        uint256 caReward;        // 70% CA reward pool
        CampaignStatus status;
        address[] caWallets;     // CA wallet addresses
        uint256[] caAmounts;     // Amount each CA receives
        uint256 createdAt;
        uint256 completedAt;
    }
    
    // State
    mapping(string => Campaign) public campaigns;
    mapping(address => bool) public authorizedSigners;
    
    IERC20 public usdt;
    address public platformVault;
    
    uint256 public constant PLATFORM_FEE_PERCENT = 30;
    uint256 public constant CA_REWARD_PERCENT = 70;
    
    // Events
    event CampaignCreated(string campaignId, address advertiser, uint256 amount);
    event CampaignPaid(string campaignId, uint256 amount);
    event CampaignCompleted(string campaignId, uint256 platformFee, uint256 caReward);
    event FundsDistributed(string campaignId);
    
    modifier onlyAuthorized() {
        require(authorizedSigners[msg.sender] || msg.sender == owner(), "Not authorized");
        _;
    }
    
    constructor(address _usdt, address _platformVault) {
        usdt = IERC20(_usdt);
        platformVault = _platformVault;
        authorizedSigners[msg.sender] = true;
    }
    
    /**
     * @notice Create a new campaign
     */
    function createCampaign(
        string calldata campaignId,
        address advertiser,
        uint256 totalAmount,
        address[] calldata caWallets,
        uint256[] calldata caAmounts
    ) external {
        require(
            msg.sender == advertiser || authorizedSigners[msg.sender] || msg.sender == owner(),
            "Not authorized"
        );
        require(campaigns[campaignId].advertiser == address(0), "Campaign exists");
        require(caWallets.length == caAmounts.length, "Invalid CA data");
        require(totalAmount > 0, "Invalid amount");
        
        uint256 platformFee = (totalAmount * PLATFORM_FEE_PERCENT) / 100;
        uint256 caReward = (totalAmount * CA_REWARD_PERCENT) / 100;
        
        // Verify CA amounts sum to caReward (allow up to 1 wei rounding difference)
        uint256 caTotal = 0;
        for (uint i = 0; i < caAmounts.length; i++) {
            caTotal += caAmounts[i];
        }
        require(caTotal <= caReward && caReward - caTotal <= 1, "Invalid CA amounts");
        
        campaigns[campaignId] = Campaign({
            advertiser: advertiser,
            totalAmount: totalAmount,
            platformFee: platformFee,
            caReward: caReward,
            status: CampaignStatus.Pending,
            caWallets: caWallets,
            caAmounts: caAmounts,
            createdAt: block.timestamp,
            completedAt: 0
        });
        
        emit CampaignCreated(campaignId, advertiser, totalAmount);
    }
    
    /**
     * @notice Pay for a campaign (advertiser calls this)
     */
    function payCampaign(string calldata campaignId) external nonReentrant {
        Campaign storage campaign = campaigns[campaignId];
        require(campaign.advertiser != address(0), "Campaign not found");
        require(campaign.status == CampaignStatus.Pending, "Invalid status");
        require(msg.sender == campaign.advertiser, "Not advertiser");
        
        // Transfer USDT from advertiser to this contract
        require(
            usdt.transferFrom(msg.sender, address(this), campaign.totalAmount),
            "Transfer failed"
        );
        
        campaign.status = CampaignStatus.Active;
        
        emit CampaignPaid(campaignId, campaign.totalAmount);
    }
    
    /**
     * @notice Complete campaign and distribute funds
     */
    function completeCampaign(string calldata campaignId) external onlyAuthorized nonReentrant {
        Campaign storage campaign = campaigns[campaignId];
        require(campaign.status == CampaignStatus.Active, "Invalid status");
        
        // Transfer platform fee
        require(
            usdt.transfer(platformVault, campaign.platformFee),
            "Platform fee transfer failed"
        );
        
        // Transfer CA rewards
        for (uint i = 0; i < campaign.caWallets.length; i++) {
            require(
                usdt.transfer(campaign.caWallets[i], campaign.caAmounts[i]),
                "CA transfer failed"
            );
        }
        
        campaign.status = CampaignStatus.Completed;
        campaign.completedAt = block.timestamp;
        
        emit CampaignCompleted(campaignId, campaign.platformFee, campaign.caReward);
        emit FundsDistributed(campaignId);
    }
    
    /**
     * @notice Cancel campaign and refund advertiser
     */
    function cancelCampaign(string calldata campaignId) external onlyAuthorized nonReentrant {
        Campaign storage campaign = campaigns[campaignId];
        require(campaign.status == CampaignStatus.Pending || campaign.status == CampaignStatus.Active, "Invalid status");
        
        if (campaign.status == CampaignStatus.Active) {
            // Refund advertiser
            require(
                usdt.transfer(campaign.advertiser, campaign.totalAmount),
                "Refund failed"
            );
        }
        
        campaign.status = CampaignStatus.Cancelled;
    }
    
    /**
     * @notice Add authorized signer
     */
    function addAuthorizedSigner(address signer) external onlyOwner {
        authorizedSigners[signer] = true;
    }
    
    /**
     * @notice Remove authorized signer
     */
    function removeAuthorizedSigner(address signer) external onlyOwner {
        authorizedSigners[signer] = false;
    }
    
    /**
     * @notice Update platform vault address
     */
    function setPlatformVault(address _platformVault) external onlyOwner {
        platformVault = _platformVault;
    }
    
    /**
     * @notice Get campaign details
     */
    function getCampaign(string calldata campaignId) external view returns (Campaign memory) {
        return campaigns[campaignId];
    }
}
