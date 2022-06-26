import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import React from "react";
import { SolanaHodl } from "./components";
import { Wallet } from "./Wallet";

function App() {
  return (
    <Wallet>
      <div className="app">
        <header className="app__header">
          <WalletMultiButton />
        </header>

        <div className="app__content">
          <SolanaHodl />
        </div>
      </div>
    </Wallet>
  );
}

export default App;
