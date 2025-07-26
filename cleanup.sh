#!/bin/bash

echo "🧹 GTM Consent Inspector - Cleanup Script"
echo "=========================================="
echo ""
echo "This script will remove development and test files while preserving the working extension."
echo ""

# Create backup directory
echo "📦 Creating backup..."
mkdir -p backup_$(date +%Y%m%d_%H%M%S)

# Backup files before deletion
echo "💾 Backing up files..."
cp -r tests/ backup_$(date +%Y%m%d_%H%M%S)/tests/
cp -r dev/ backup_$(date +%Y%m%d_%H%M%S)/dev/
cp -r scripts/ backup_$(date +%Y%m%d_%H%M%S)/scripts/
cp -r node_modules/ backup_$(date +%Y%m%d_%H%M%S)/node_modules/ 2>/dev/null || true

echo ""
echo "🗑️ Removing development files..."

# Remove test directories and files
rm -rf tests/
rm -rf dev/
rm -rf scripts/
rm -rf node_modules/

# Remove test HTML files
rm -f test-events.html
rm -f test-technical-debt.html
rm -f test-triggers-vars.html
rm -f simple-test.html

# Remove development tools
rm -f dev-server.js
rm -f package.json
rm -f package-lock.json
rm -f .eslintrc.js

# Remove documentation (non-essential)
rm -f DEVELOPMENT_WORKFLOW.md
rm -f ARCHITECTURE_CHECKLIST.md
rm -f UI_VERIFICATION_GUIDE.md
rm -f .cursorrules

# Remove unused popup modules (not used in current simplified popup.js)
echo "🗑️ Removing unused popup modules..."
rm -f popup/consent-stimulator.js
rm -f popup/event-logger.js
rm -f popup/iab-tcf.js
rm -f popup/performance-monitor.js
rm -f popup/qa-panel.js
rm -f popup/tag-list.js
rm -f popup/triggers-vars.js
rm -f popup/tabs-manager.js
rm -f popup/ui-utils.js
rm -f popup/utils.js
rm -f popup/containers-panel.js

# Remove unused CSS
rm -f enhanced-monitoring.css

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "📁 Essential files remaining:"
echo "  - manifest.json"
echo "  - background.js"
echo "  - content.js"
echo "  - injected-script.js"
echo "  - popup/popup.html"
echo "  - popup/popup.js"
echo "  - popup/popup.css"
echo "  - progress.md"
echo "  - README.md"
echo "  - LICENSE"
echo ""
echo "📦 Backup created in: backup_$(date +%Y%m%d_%H%M%S)/"
echo ""
echo "🎯 Your extension is ready for production!" 