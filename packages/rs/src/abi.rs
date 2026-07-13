//! `sol!`-generated typed contract interfaces for the three ERC-8004 registries.
//!
//! Hand-transcribed (not code-generated from the JSON) from the minimal read-surface
//! ABI fragments in `../registry/abi/{identity,reputation,validation}.json` — see
//! `../registry/abi/SOURCE.md` for their provenance. Only the functions this crate's
//! facts layer actually calls are declared; each fragment below is annotated with the
//! JSON entry it was transcribed from, so a future audit can diff them directly.

use alloy::sol;

sol! {
    #[sol(rpc)]
    interface IIdentityRegistry {
        // identity.json: "ownerOf"
        function ownerOf(uint256 tokenId) external view returns (address);
        // identity.json: "tokenURI"
        function tokenURI(uint256 tokenId) external view returns (string);
        // identity.json: "ERC721NonexistentToken" (error) — used to classify a
        // nonexistent-agentId revert into Erc8004Error::AgentNotFound.
        error ERC721NonexistentToken(uint256 tokenId);
    }

    #[sol(rpc)]
    interface IReputationRegistry {
        // reputation.json: "readAllFeedback". Full per-entry array read; the contract
        // has no native offset/limit, so paging is applied client-side after decoding
        // (mirrors packages/ts/src/actions/getAgentFeedback.ts).
        function readAllFeedback(
            uint256 agentId,
            address[] memory clientAddresses,
            string memory tag1,
            string memory tag2,
            bool includeRevoked
        ) external view returns (
            address[] memory clients,
            uint64[] memory feedbackIndexes,
            int128[] memory values,
            uint8[] memory valueDecimals,
            string[] memory tag1s,
            string[] memory tag2s,
            bool[] memory revokedStatuses
        );
    }

    #[sol(rpc)]
    interface IValidationRegistry {
        // validation.json: "getAgentValidations"
        function getAgentValidations(uint256 agentId) external view returns (bytes32[] memory);
        // validation.json: "getValidationStatus"
        function getValidationStatus(bytes32 requestHash) external view returns (
            address validatorAddress,
            uint256 agentId,
            uint8 response,
            bytes32 responseHash,
            string memory tag,
            uint256 lastUpdate
        );
    }
}
