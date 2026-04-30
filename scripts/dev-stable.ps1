param(
  [Parameter(Mandatory = $false)]
  [string]$TunnelUrl = $env:SHOPIFY_CUSTOM_TUNNEL_URL
)

if ([string]::IsNullOrWhiteSpace($TunnelUrl)) {
  Write-Host "Missing tunnel URL." -ForegroundColor Red
  Write-Host "Use one of the following:" -ForegroundColor Yellow
  Write-Host "1) `$env:SHOPIFY_CUSTOM_TUNNEL_URL='https://your-fixed-tunnel.example.com'" -ForegroundColor Yellow
  Write-Host "2) ./scripts/dev-stable.ps1 -TunnelUrl https://your-fixed-tunnel.example.com" -ForegroundColor Yellow
  exit 1
}

Write-Host "Starting Shopify dev with stable tunnel: $TunnelUrl" -ForegroundColor Green
shopify app dev --tunnel-url $TunnelUrl --no-update
