// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MSCampaignVault
 * @dev Marketing campaign vault for managing USDT payments between advertisers and CAs
 */
contract MSCampaignVault is Ownable, ReentrancyGuard {
    
    enum CampaignStatus {
        Draft,      // 0 - Initial state
        Pending,    // 1 - Created but not paid
        Active,     // 2 - Paid and active
        Completed,  // 3 - Campaign finished
        Cancelled   // 4 - Cancelled by advertiser or platform
    }
    
    struct Campaign {
        address advertiser;
        uint256 totalAmount;    // Total USDT amount
        uint256 platformFee;    // 30% platform fee
        uint256 caReward;       // 70% CA rewards
        CampaignStatus status;
        address[] caWallets;    // CA wallet addresses
        uint256[] caAmounts;    // Amount each CA receives
        uint256 createdAt;
        uint256 completedAt;
    }
    
    // Campaign ID => Campaign details
    mapping(string => Campaign) public campaigns;
    
    // USDT token contract
    IERC20 public usdtToken;
    
    // Platform wallet for fee collection
    address public platformWallet;
    
    // Platform fee percentage (30% = 3000 basis points)
    uint256 public constant PLATFORM_FEE_BPS = 3000;
    uint256 public constant BPS_DENOMINATOR = 10000;
    
    // Events
    event CampaignCreated(
        string indexed campaignId,
        address indexed advertiser,
        uint256 totalAmount,
        uint256 platformFee,
        uint256 caReward,
        address[] caWallets,
        uint256[] caAmounts
    );
    
    event CampaignPaid(
        string indexed campaignId,
        uint256 amount
    );
    
    event CampaignCompleted(
        string indexed campaignId,
        uint256 platformFee,
        uint256 caReward
    );
    
    event CampaignCancelled(
        string indexed campaignId,
        uint256 refundAmount
    );
    
    event FundsDistributed(
        string indexed campaignId,
        address indexed ca,
        uint256 amount
    );
    
    constructor(address _usdtToken, address _platformWallet) Ownable(msg.sender) {
        require(_usdtToken != address(0), "Invalid USDT address");
        require(_platformWallet != address(0), "Invalid platform wallet");
        usdtToken = IERC20(_usdtToken);
        platformWallet = _platformWallet;
    }
    
    /**
     * @dev Create a new campaign
     * @param campaignId Unique identifier for the campaign
     * @param advertiser Advertiser's wallet address
     * @param totalAmount Total USDT amount for the campaign
     * @param caWallets Array of CA wallet addresses
     * @param caAmounts Array of amounts for each CA
     */
    function createCampaign(
        string calldata campaignId,
        address advertiser,
        uint256 totalAmount,
        address[] calldata caWallets,
        uint256[] calldata caAmounts
    ) external onlyOwner {
        require(bytes(campaignId).length > 0, "Invalid campaign ID");
        require(advertiser != address(0), "Invalid advertiser");
        require(totalAmount > 0, "Invalid amount");
        require(caWallets.length > 0, "No CA wallets");
        require(caWallets.length == caAmounts.length, "Array length mismatch");
        require(campaigns[campaignId].advertiser == address(0), "Campaign exists");
        
        // Calculate fees
        uint256 platformFee = (totalAmount * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        uint256 caReward = totalAmount - platformFee;
        
        // Validate CA amounts sum equals caReward
        uint256 totalCaAmount = 0;
        for (uint256 i = 0; i < caAmounts.length; i++) {
            totalCaAmount += caAmounts[i];
        }
        require(totalCaAmount == caReward, "CA amounts don't match reward");
        
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
        
        emit CampaignCreated(
            campaignId,
            advertiser,
            totalAmount,
            platformFee,
            caReward,
            caWallets,
            caAmounts
        );
    }
    
    /**
     * @dev Pay for a campaign (advertiser calls this)
     * @param campaignId Campaign identifier
     */
    function payCampaign(string calldata campaignId) external nonReentrant {
        Campaign storage campaign = campaigns[campaignId];
        require(campaign.advertiser != address(0), "Campaign not found");
        require(campaign.status == CampaignStatus.Pending, "Invalid status");
        require(msg.sender == campaign.advertiser || msg.sender == owner(), "Not authorized");
        
        // Transfer USDT from advertiser to this contract
        require(
            usdtToken.transferFrom(msg.sender, address(this), campaign.totalAmount),
            "USDT transfer failed"
        );
        
        campaign.status = CampaignStatus.Active;
        
        emit CampaignPaid(campaignId, campaign.totalAmount);
    }
    
    /**
     * @dev Complete a campaign and distribute funds
     * @param campaignId Campaign identifier
     */
    function completeCampaign(string calldata campaignId) external onlyOwner nonReentrant {
        Campaign storage campaign = campaigns[campaignId];
        require(campaign.advertiser != address(0), "Campaign not found");
        require(campaign.status == CampaignStatus.Active, "Campaign not active");
        
        // Transfer platform fee
        require(
            usdtToken.transfer(platformWallet, campaign.platformFee),
            "Platform fee transfer failed"
        );
        
        // Transfer rewards to CAs
        for (uint256 i = 0; i < campaign.caWallets.length; i++) {
            require(
                usdtToken.transfer(campaign.caWallets[i], campaign.caAmounts[i]),
                "CA reward transfer failed"
            );
            emit FundsDistributed(campaignId, campaign.caWallets[i], campaign.caAmounts[i]);
        }
        
        campaign.status = CampaignStatus.Completed;
        campaign.completedAt = block.timestamp;
        
        emit CampaignCompleted(campaignId, campaign.platformFee, campaign.caReward);
    }
    
    /**
     * @dev Cancel a campaign and refund advertiser
     * @param campaignId Campaign identifier
     */
    function cancelCampaign(string calldata campaignId) external onlyOwner nonReentrant {
        Campaign storage campaign = campaigns[campaignId];
        require(campaign.advertiser != address(0), "Campaign not found");
        require(
            campaign.status == CampaignStatus.Pending || campaign.status == CampaignStatus.Active,
            "Cannot cancel"
        );
        
        uint256 refundAmount = 0;
        
        // If already paid, refund the advertiser
        if (campaign.status == CampaignStatus.Active) {
            refundAmount = campaign.totalAmount;
            require(
                usdtToken.transfer(campaign.advertiser, refundAmount),
                "Refund transfer failed"
            );
        }
        
        campaign.status = CampaignStatus.Cancelled;
        
        emit CampaignCancelled(campaignId, refundAmount);
    }
    
    /**
     * @dev Get campaign details
     * @param campaignId Campaign identifier
     */
    function getCampaign(string calldata campaignId) external view returns (Campaign memory) {
        return campaigns[campaignId];
    }
    
    /**
     * @dev Update platform wallet
     * @param newWallet New platform wallet address
     */
    function setPlatformWallet(address newWallet) external onlyOwner {
        require(newWallet != address(0), "Invalid address");
        platformWallet = newWallet;
    }
    
    /**
     * @dev Emergency withdraw stuck tokens
     * @param token Token address
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        require(token != address(usdtToken), "Cannot withdraw USDT");
        require(IERC20(token).transfer(owner(), amount), "Withdraw failed");
    }
}
