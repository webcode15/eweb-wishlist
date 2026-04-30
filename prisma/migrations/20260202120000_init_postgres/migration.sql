-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WishlistItem" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerEmail" TEXT,
    "productHandle" TEXT NOT NULL,
    "productNumericId" TEXT,
    "priceCents" INTEGER,
    "compareAtPriceCents" INTEGER,
    "currencyCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WishlistConversion" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerEmail" TEXT,
    "productHandle" TEXT,
    "productNumericId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT,
    "revenueCents" INTEGER NOT NULL,
    "convertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WishlistConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WishlistConfig" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "showOnProduct" BOOLEAN NOT NULL DEFAULT true,
    "showOnGrid" BOOLEAN NOT NULL DEFAULT true,
    "iconStyle" TEXT NOT NULL DEFAULT 'heart',
    "iconPosition" TEXT NOT NULL DEFAULT 'top-right',
    "buttonLabel" TEXT NOT NULL DEFAULT 'Add to Wishlist',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WishlistConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WishlistItem_shopDomain_visitorId_idx" ON "WishlistItem"("shopDomain", "visitorId");

-- CreateIndex
CREATE INDEX "WishlistItem_shopDomain_productNumericId_idx" ON "WishlistItem"("shopDomain", "productNumericId");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistItem_shopDomain_visitorId_productHandle_key" ON "WishlistItem"("shopDomain", "visitorId", "productHandle");

-- CreateIndex
CREATE INDEX "WishlistConversion_shopDomain_visitorId_idx" ON "WishlistConversion"("shopDomain", "visitorId");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistConversion_shopDomain_visitorId_orderId_productNume_key" ON "WishlistConversion"("shopDomain", "visitorId", "orderId", "productNumericId");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistConfig_shopDomain_key" ON "WishlistConfig"("shopDomain");
