pragma solidity >=0.5.0 <0.6.0;

import "./utils/Initializable.sol";
import "./utils/SafeMath.sol";
import "./staking/XyStakingConsensus.sol";
import "./IXyRequester.sol";
import "./token/ERC20/SafeERC20.sol";


/**
 * @title A Payment on delivery contract
 * @dev Will escrow funds until an item is marked as delivered .
 */
contract XyPayOnDelivery is Initializable, IXyRequester {
    using SafeMath for uint;

    XyStakingConsensus public scsc;
    address public xyoToken;

    event IntersectResponse(bytes32 requestId, uint weiPayment, uint xyoPayment, address payable beneficiary, bool didIntersect);
    event NewPayOnDeliveryRequest(bytes32 requestId, address requester, uint weiPayment, uint xyoPayment, address payable beneficiary);

    // Check that 
    mapping (bytes32 => bool) public didIntersect;
    mapping (bytes32 => uint) public requestIndex;
    IPFSRequest[] public requests;

    /* 
        Construct a Pay Delivery contract
    */
    function initialize (
        address stakingConsensus, 
        address _xyoToken
    )
        initializer public 
    {
        scsc = XyStakingConsensus(stakingConsensus);
        xyoToken = _xyoToken;
    }

    /**
        @dev Called by PonD client.  API for client to request an intersection question
        @param requestId - the hash of the request (first 2 bytes stripped)
        @param xyoBounty - the xyo bounty for the request (approve scsc for this amount)
        @param xyoPayOnDelivery - the amount of XYO to pay on delivery
        @param weiPayOnDelivery - the amount of eth to pay on delivery
        @param beneficiary The destination address of the funds.
    */
    function requestPayOnDelivery(
        bytes32 requestId, 
        uint xyoBounty, 
        uint xyoPayOnDelivery, 
        uint weiPayOnDelivery, 
        address payable beneficiary
    ) 
        public 
        payable 
    {
        require (requestIndex[requestId] == 0, "Duplicate request submitted");
        require (msg.value >= weiPayOnDelivery, "Not enough payment provided");
        
        uint miningGas = msg.value.sub(weiPayOnDelivery);
        scsc.submitRequest.value(miningGas)(requestId, xyoBounty, msg.sender, uint8(IXyRequester.RequestType.BOOL_CALLBACK));
        
        if (xyoPayOnDelivery > 0) {
            SafeERC20.transferFrom(xyoToken, msg.sender, address(this), xyoPayOnDelivery);
        }

        IPFSRequest memory q = IPFSRequest(
            requestId, weiPayOnDelivery, xyoPayOnDelivery, block.number, 0, beneficiary, msg.sender
        );
        requestIndex[requestId] = requests.length;
        requests.push(q);
        emit NewPayOnDeliveryRequest(requestId, msg.sender, weiPayOnDelivery, xyoPayOnDelivery, beneficiary);
    }

    /**
        @dev Called by SCSC. If intersection, transfer pay on delivery to beneficiary, delete request
        @param requestId - the hash of the request (first 2 bytes stripped)
        @param responseData Response data from scsc
    */
    function submitResponse(bytes32 requestId, uint8, bytes memory responseData) public {
        require (msg.sender == address(scsc), "only scsc can complete requests");
        bool intersection = responseData.length > 0 && responseData[0] > 0;
        didIntersect[requestId] = intersection;
        IPFSRequest storage q = requests[requestIndex[requestId]];
        q.responseAt = block.number;

        if (intersection) {
            payOnDelivery(requestId, q.beneficiary);
        } else {
            payOnDelivery(requestId, q.asker);
        }
        emit IntersectResponse(q.requestId, q.weiPayment, q.xyoPayment, q.beneficiary, true);
    }

    /** 
        Will refund the asker prior to deleting the request
        @param requestId - the requestId hash to be deleted
        @param payee - who to pay
    */
    function payOnDelivery(bytes32 requestId, address payable payee) internal {
        IPFSRequest memory q = requests[requestIndex[requestId]];
        if (q.weiPayment > 0) {
            payee.transfer(q.weiPayment);
        }
        if (q.xyoPayment > 0) {
            SafeERC20.transfer(xyoToken, payee, q.xyoPayment);
        }
    }

    /** 
        Will refund the asker prior to deleting the request
        @param requestId - the requestId hash to be deleted
        @param refundee Who to pay the escrow balance too
    */
    function deleteRequestAndRefund(bytes32 requestId, address payable refundee) internal {
        payOnDelivery(requestId, refundee);
        _deleteRequest(requestId);
    }

    /** 
        Will delete the request and remove the request index
        @param requestId - the requestId hash to be deleted
    */
    function _deleteRequest(bytes32 requestId) private {
        uint qIndex = requestIndex[requestId];
        uint lastQIndex = requests.length.sub(1);
        IPFSRequest memory lastRequest = requests[lastQIndex];

        requests[qIndex] = lastRequest;
        delete requests[lastQIndex];

        requests.length--;
        requestIndex[requestId] = 0;
        requestIndex[lastRequest.requestId] = qIndex;
    }

    /** Public array length getters */
    function numRequests() public view returns (uint) {
        return requests.length;
    }
}