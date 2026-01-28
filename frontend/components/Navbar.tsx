"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export function Navbar() {
  return (
    <nav className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-8">
            <Link
              href="/"
              className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent"
            >
              NFT Licensing
            </Link>
            <div className="hidden md:flex gap-6">
              <Link
                href="/"
                className="text-gray-300 hover:text-white transition"
              >
                Browse
              </Link>
              <Link
                href="/gallery"
                className="text-gray-300 hover:text-white transition"
              >
                My Gallery
              </Link>
              <Link
                href="/mint"
                className="text-gray-300 hover:text-white transition"
              >
                Mint
              </Link>
              <Link
                href="/offers"
                className="text-gray-300 hover:text-white transition"
              >
                Offers
              </Link>
            </div>
          </div>
          <ConnectButton />
        </div>
      </div>
    </nav>
  );
}
