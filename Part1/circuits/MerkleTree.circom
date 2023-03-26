pragma circom 2.0.0;
// Note: The code works with circom version 2.0.4 but breaks with the newer version

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/mux1.circom";

template CheckRoot(n) { // compute the root of a MerkleTree of n Levels 
    signal input leaves[2**n];
    signal output root;

    var totalLeaves = 2**n;
    var numHashers = totalLeaves - 1;

    // Initialize all the hashers
    component hashers[numHashers];
    var i;
    for (i=0; i<numHashers; i++) {
        hashers[i] = Poseidon(2);
    }

    // Hash all the leaves
    // We separate the leaves from other layers because they are already hashed
    var numLeafHashers = totalLeaves / 2;
    for (i=0; i<numLeafHashers; i++) {
        hashers[i].inputs[0] <== leaves[i*2];
        hashers[i].inputs[1] <== leaves[i*2+1];
    }

    // Hash other layers
    var numIntermediateHashers = numLeafHashers - 1;
    var k = 0;
    for (i=numLeafHashers; i<numLeafHashers+numIntermediateHashers; i++){
        hashers[i].inputs[0] <== hashers[k*2].out;
        hashers[i].inputs[1] <== hashers[k*2+1].out;
        k++;
    }

    root <== hashers[numHashers-1].out;
}

template MerkleTreeInclusionProof(n) {
    signal input leaf;
    signal input path_elements[n];
    signal input path_index[n]; // path index are 0's and 1's indicating whether the current element is on the left or right
    signal output root; // note that this is an OUTPUT signal

    //[assignment] insert your code here to compute the root from a leaf and elements along the path
    // We need n number of hashers
    component hashers[n];
    component mux[n];

    signal currentHash[n+1];
    currentHash[0] <== leaf;

    for (var i = 0; i < n; i++) {
        hashers[i] = Poseidon(2);
        mux[i] = MultiMux1(2);

        mux[i].c[0][0] <== currentHash[i];
        mux[i].c[0][1] <== path_elements[i];

        mux[i].c[1][0] <== path_elements[i];
        mux[i].c[1][1] <== currentHash[i];

        mux[i].s <== path_index[i];

        hashers[i].inputs[0] <== mux[i].out[0];
        hashers[i].inputs[1] <== mux[i].out[1];

        currentHash[i+1] <== hashers[i].out;
    }

    root <== currentHash[n];
}

// component main = CheckRoot(3);