pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";

template CheckRoot(n) { // compute the root of a MerkleTree of n Levels 
    signal input leaves[2**n];
    signal output root;

    component hash = Poseidon(2);
    hash.inputs[0] <== a;
    hash.inputs[1] <== b;

    // say n = 3
    // when n==0
    // 


    //[assignment] insert your code here to calculate the Merkle root from 2^n leaves
    //for (var i=0; i<n; i+=2){
        // hash (leaves[i], leaves[i+1])
    //}
// let n = 2;

// let leaves = [1,2,3,4]; //2**n
// let root;

// let i;

// let nHashes = 0;
// for (i = 0; i < n; i++) {
//   nHashes += 2 ** i;
// }
// let hashes = []; // nHashes
// console.log(nHashes);

// for (i = 0; i < nHashes; i++) {
//   hashes[i] = {};
// }

// for (i = 0; i < 2 ** n; i+=2) {
//   console.log(i, i+1);
//   hashes[i].leaf1 = leaves[i];
//   hashes[i].leaf2 = leaves[i + 1];
// }

// console.log(hashes);

// var k = 0;
// for (i = 2 ** (n - 1); i < nHashes; i++) {
//   hashes[i].leaf1 = hashes[k * 2].hash;
//   hashes[i].leaf2 = hashes[k * 2 + 1].hash;

//   k++;
// }

// root = hashes[nHashes - 1].hash;

}

template MerkleTreeInclusionProof(n) {
    signal input leaf;
    signal input path_elements[n];
    signal input path_index[n]; // path index are 0's and 1's indicating whether the current element is on the left or right
    signal output root; // note that this is an OUTPUT signal

    //[assignment] insert your code here to compute the root from a leaf and elements along the path
}