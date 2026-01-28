"use client";

import { getDefaultConfig, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { polygon, polygonAmoy, foundry } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@rainbow-me/rainbowkit/styles.css";
import { CHAIN_ID } from "@/lib/contracts";

// Select chain based on CHAIN_ID environment variable
const getChain = () => {
  switch (CHAIN_ID) {
    case 137:
      return polygon;
    case 80002:
      return polygonAmoy;
    case 31337:
    default:
      return {
        ...foundry,
        id: 31337,
        name: "Localhost",
        rpcUrls: {
          default: { http: ["http://127.0.0.1:8545"] },
        },
      };
  }
};

const config = getDefaultConfig({
  appName: "NFT Licensing Marketplace",
  projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || "demo",
  chains: [getChain()],
  ssr: true,
});

const queryClient = new QueryClient();

export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
