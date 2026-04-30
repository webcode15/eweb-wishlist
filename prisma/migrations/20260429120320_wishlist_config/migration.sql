-- CreateTable
CREATE TABLE "WishlistConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "showOnProduct" BOOLEAN NOT NULL DEFAULT true,
    "showOnGrid" BOOLEAN NOT NULL DEFAULT true,
    "iconStyle" TEXT NOT NULL DEFAULT 'heart',
    "iconPosition" TEXT NOT NULL DEFAULT 'top-right',
    "buttonLabel" TEXT NOT NULL DEFAULT 'Add to Wishlist',
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "WishlistConfig_shopDomain_key" ON "WishlistConfig"("shopDomain");
