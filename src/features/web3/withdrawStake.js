import { iceQueenABI } from '../configure';
import { iceQueenAddress } from '../configure';
import BigNumber from 'bignumber.js';
import { enqueueSnackbar } from '../common/redux/actions';

export const withdrawStake = ({ web3, address, amount, poolId, dispatch }) => {

  return new Promise((resolve, reject) => {

    const contract = new web3.eth.Contract(iceQueenABI, iceQueenAddress);

    contract.methods
      .withdraw(poolId, amount)
      .send({ from: address })
      .on('transactionHash', function (hash) {
        dispatch(
          enqueueSnackbar({
            message: hash,
            options: {
              key: new Date().getTime() + Math.random(),
              variant: 'success',
            },
            hash,
          })
        );
      })
      .on('receipt', function (receipt) {
        resolve(new BigNumber(80000000000).toNumber());
      })
      .on('error', function (error) {
        reject(error);
      })
      .catch(error => {
        reject(error);
      });
  });
};
