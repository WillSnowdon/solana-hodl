import { TOKEN_LIST_URL } from "@jup-ag/core";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  AccountInfo,
  ParsedAccountData,
  PublicKey,
  RpcResponseAndContext,
} from "@solana/web3.js";
import React, { FunctionComponent, useEffect, useState } from "react";

export interface Token {
  chainId: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI: string;
  tags: string[];
}

export type AccountTokenInfo = {
  parsed: {
    info: { mint: string; tokenAmount: { uiAmount: number } };
  };
};

type TokenAccountResponseData = {
  pubkey: PublicKey;
  account: AccountInfo<Omit<ParsedAccountData, "parsed"> & AccountTokenInfo>;
};

type ParsedTokenResponse = RpcResponseAndContext<
  Array<TokenAccountResponseData>
>;

type UserTokenData = {
  accountInfo: TokenAccountResponseData;
  tokenMetadata: Token;
  tokenInfo: AccountTokenInfo["parsed"]["info"];
};

export const SolanaHodl: FunctionComponent = () => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [userTokenData, setUserTokenData] = useState<UserTokenData[]>();

  useEffect(() => {
    if (!publicKey) return;

    (async function () {
      const accounts = (await connection.getParsedTokenAccountsByOwner(
        publicKey,
        {
          programId: TOKEN_PROGRAM_ID,
        }
      )) as ParsedTokenResponse;

      try {
        const response = await fetch(TOKEN_LIST_URL["mainnet-beta"]);
        const tokens = (await response.json()) as Token[];

        const userTokenData: UserTokenData[] = accounts.value
          .map((accountInfo) => {
            const { info } = accountInfo.account.data.parsed;
            const tokenMetadata = tokens.find(
              (token) =>
                token.address === info.mint && info.tokenAmount.uiAmount
            ) as Token;
            return {
              accountInfo,
              tokenMetadata,
              tokenInfo: info,
            };
          })
          .filter((data) => data.tokenMetadata);

        setUserTokenData(userTokenData);
        console.log(userTokenData);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [publicKey]);

  return <div />;
};
