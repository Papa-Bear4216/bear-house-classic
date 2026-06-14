Set-Location $PSScriptRoot

Write-Host "Clearing broken .git folder..." -ForegroundColor Yellow
if (Test-Path ".git") { Remove-Item -Recurse -Force ".git" }

Write-Host "Initializing git..." -ForegroundColor Cyan
git init
git branch -M main
git remote remove origin 2>$null
git remote add origin https://github.com/Papa-Bear4216/bear-house-classic.git

Write-Host "Staging files..." -ForegroundColor Cyan
git add .
git commit -m "Website redesign: 3-panel dashboard, collapsible sidebar, shared Firebase"

Write-Host "Pushing to GitHub (this triggers Vercel auto-deploy)..." -ForegroundColor Cyan
git push --force origin main

Write-Host ""
Write-Host "Done! Vercel will deploy automatically." -ForegroundColor Green
Write-Host "Live at: https://bear-house-classic.vercel.app" -ForegroundColor Green
