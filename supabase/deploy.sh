#!/bin/bash
# ============================================================================
# EduZone Supabase Schema Deployment Script (Node.js)
# Handles sequential schema setup, seed data, and validation
# ============================================================================

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Checking Node.js dependencies..."
if [ ! -d "node_modules/pg" ]; then
  echo "Installing pg library locally in supabase/ directory..."
  npm install pg --no-audit --no-fund
fi

echo "Starting deployment..."
node deploy.js
