pragma solidity >=0.5.0 <0.6.0;
import "../XyStakableToken.sol";

contract XyStakableMock is XyStakableToken {
  uint[] public stakeeMocks; // simulated stakable tokens
  
  constructor(uint numToMint, address beneficiary) 
    public
    XyStakableToken()
  {
    for (uint160 i = 1; i <= numToMint; i++) {
      uint stakee = uint(address(i));
      stakeeMocks.push(stakee);
      _mint(beneficiary, stakee);
    }
  }
}