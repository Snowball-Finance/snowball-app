import { useCallback } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import BigNumber from 'bignumber.js';
import async from 'async';
import { MultiCall } from 'eth-multicall';
import {
  VAULT_FETCH_VAULTS_DATA_BEGIN,
  VAULT_FETCH_VAULTS_DATA_SUCCESS,
  VAULT_FETCH_VAULTS_DATA_FAILURE,
} from './constants';
import { fetchPrice } from '../../web3';
import { erc20ABI, vaultABI , iceQueenABI, iceQueenAddress} from '../../configure';
import { byDecimals } from 'features/helpers/bignumber';

export function fetchVaultsData({ address, web3, pools }) {
  return dispatch => {
    dispatch({
      type: VAULT_FETCH_VAULTS_DATA_BEGIN,
    });

    const promise = new Promise((resolve, reject) => {
      const multicall = new MultiCall(web3, '0xfca8Cd986b0Db175dec97C6A0A02dd7e4299eC68');

      const tokenCalls = pools.map(pool => {
        const bnbShimAddress = '0xC72E5edaE5D7bA628A2Acb39C8Aa0dbbD06daacF';
        const token = new web3.eth.Contract(erc20ABI, pool.tokenAddress || bnbShimAddress);
        return {
          allowance: token.methods.allowance(address, pool.earnContractAddress),
        };
      });

      const stakeAllowanceCalls = pools.map(pool => {
        const bnbShimAddress = '0xC72E5edaE5D7bA628A2Acb39C8Aa0dbbD06daacF';
        const snobContract = new web3.eth.Contract(erc20ABI, pool.earnContractAddress || bnbShimAddress);
        return {
          stakeAllowance: snobContract.methods.allowance(address, iceQueenAddress),
        };
      });

      const pendingSnowballsCalls = pools.map(pool => {
        const icequeenContract = new web3.eth.Contract(iceQueenABI, iceQueenAddress);
        return {
          pendingSnowballs: icequeenContract.methods.pendingSnowball(pool.poolId,address),
        };
      });

      const currentStakeCalls = pools.map(pool => {
        const icequeenContract = new web3.eth.Contract(iceQueenABI, iceQueenAddress);
        return {
          userInfo: icequeenContract.methods.userInfo(pool.poolId,address),
        };
      });


      const vaultCalls = pools.map(pool => {
        const vault = new web3.eth.Contract(vaultABI, pool.earnedTokenAddress);
        return {
          pricePerFullShare: vault.methods.getPricePerFullShare(),
          tvl: pool.id === "snob-snob-avax" ? vault.methods.balanceOf(iceQueenAddress) : vault.methods.balance(),
        };
      });

      async.parallel(
        [
          callbackInner => {
            multicall
              .all([tokenCalls])
              .then(([data]) => callbackInner(null, data))
              .catch(error => {
                return callbackInner(error.message || error);
              });
          },
          callbackInner => {
            multicall
              .all([vaultCalls])
              .then(([data]) => callbackInner(null, data))
              .catch(error => {
                return callbackInner(error.message || error);
              });
          },
          callbackInner => {
            multicall
              .all([stakeAllowanceCalls])
              .then(([data]) => callbackInner(null, data))
              .catch(error => {
                return callbackInner(error.message || error);
              });
          },
          callbackInner => {
            multicall
              .all([currentStakeCalls])
              .then(([data]) => callbackInner(null, data))
              .catch(error => {
                return callbackInner(error.message || error);
              });
          },
          callbackInner => {
            multicall
              .all([pendingSnowballsCalls])
              .then(([data]) => callbackInner(null, data))
              .catch(error => {
                return callbackInner(error.message || error);
              });
          },
          callbackInner => {
            async.map(
              pools,
              (pool, callbackInnerInner) => {
                fetchPrice({
                  id: pool.oracleId,
                })
                  .then(data => {
                    return callbackInnerInner(null, data);
                  })
                  .catch(error => {
                    return callbackInnerInner(error, 0);
                  });
              },
              (error, data) => {
                if (error) {
                  return callbackInner(error.message || error);
                }
                callbackInner(null, data);
              }
            );
          },
        ],
        (error, data) => {
          if (error) {
            dispatch({
              type: VAULT_FETCH_VAULTS_DATA_FAILURE,
            });
            return reject(error.message || error);
          }

          const newPools = pools.map((pool, i) => {
            const allowance = web3.utils.fromWei(data[0][i].allowance, 'ether');
            const pricePerFullShare = byDecimals(data[1][i].pricePerFullShare, 18).toNumber();
            const stakeAllowance = byDecimals(data[2][i].stakeAllowance, 18).toNumber();
            const userInfo = data[3][i].userInfo
            const pendingSnowballs = byDecimals(data[4][i].pendingSnowballs, 18).toNumber();


            return {
              ...pool,
              allowance: new BigNumber(allowance).toNumber() || 0,
              stakeAllowance: new BigNumber(stakeAllowance).toNumber() || 0,
              pricePerFullShare: new BigNumber(pricePerFullShare).toNumber() || 1,
              tvl: byDecimals(data[1][i].tvl, 18).toNumber(),
              pendingSnowballs,
              userInfo,
              oraclePrice: data[5][i] || 0,
            };
          });

          dispatch({
            type: VAULT_FETCH_VAULTS_DATA_SUCCESS,
            data: newPools,
          });
          resolve();
        }
      );
    });

    return promise;
  };
}

export function useFetchVaultsData() {
  const dispatch = useDispatch();

  const { pools, fetchVaultsDataDone } = useSelector(
    state => ({
      pools: state.vault.pools,
      fetchVaultsData: state.vault.fetchVaultsData,
      fetchVaultsDataDone: state.vault.fetchVaultsDataDone,
    }),
    shallowEqual
  );

  const boundAction = useCallback(
    data => {
      return dispatch(fetchVaultsData(data));
    },
    [dispatch]
  );

  return {
    pools,
    fetchVaultsData: boundAction,
    fetchVaultsDataDone,
  };
}

export function reducer(state, action) {
  switch (action.type) {
    case VAULT_FETCH_VAULTS_DATA_BEGIN:
      return {
        ...state,
        fetchVaultsDataPending: true,
      };

    case VAULT_FETCH_VAULTS_DATA_SUCCESS:
      return {
        ...state,
        pools: action.data,
        fetchVaultsDataPending: false,
        fetchVaultsDataDone: true,
      };

    case VAULT_FETCH_VAULTS_DATA_FAILURE:
      return {
        ...state,
        fetchVaultsDataPending: false,
      };

    default:
      return state;
  }
}
