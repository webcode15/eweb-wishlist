-- CreateTable
CREATE TABLE "WishlistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerEmail" TEXT,
    "productHandle" TEXT NOT NULL,
    "productNumericId" TEXT,
    "priceCents" INTEGER,
    "currencyCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WishlistConversion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerEmail" TEXT,
    "productHandle" TEXT,
    "productNumericId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT,
    "revenueCents" INTEGER NOT NULL,
    "convertedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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
CREATE UNIQUE INDEX "WishlistConversion_shopDomain_visitorId_orderId_productNumericId_key" ON "WishlistConversion"("shopDomain", "visitorId", "orderId", "productNumericId");
