#!/bin/bash

# Test script for Backend API and Push Notifications
# Usage: ./test-notifications.sh

echo "🧪 Testing Trading Dashboard Backend API and Notifications"
echo "============================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running locally or on Vercel
if [ -z "$1" ]; then
    BASE_URL="http://localhost:5173"
    echo "📍 Testing LOCAL environment: $BASE_URL"
else
    BASE_URL="$1"
    echo "📍 Testing PRODUCTION environment: $BASE_URL"
fi

echo ""
echo "1️⃣ Testing Backend API Endpoint..."
echo "-----------------------------------"

# Test the API endpoint
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/positions")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" -eq 200 ]; then
    echo -e "${GREEN}✅ API endpoint returned 200 OK${NC}"
    
    # Check if response is valid JSON
    if echo "$BODY" | jq empty 2>/dev/null; then
        echo -e "${GREEN}✅ Response is valid JSON${NC}"
        
        # Count positions
        POSITION_COUNT=$(echo "$BODY" | jq 'length')
        echo -e "${GREEN}✅ Found $POSITION_COUNT position(s)${NC}"
        
        if [ "$POSITION_COUNT" -gt 0 ]; then
            echo ""
            echo "📊 Sample Position:"
            echo "$BODY" | jq '.[0] | {symbol, qty, avg_entry_price, market_value, unrealized_pl}'
        fi
    else
        echo -e "${RED}❌ Response is not valid JSON${NC}"
        echo "Response body: $BODY"
    fi
else
    echo -e "${RED}❌ API endpoint returned $HTTP_CODE${NC}"
    echo "Response body: $BODY"
fi

echo ""
echo "2️⃣ Checking Service Worker..."
echo "-------------------------------"

# Check if service worker file exists
if [ -f "public/sw.js" ]; then
    echo -e "${GREEN}✅ Service worker file exists (public/sw.js)${NC}"
    
    # Check if it uses the correct API endpoint
    if grep -q "API_ENDPOINT = '/api/positions'" public/sw.js; then
        echo -e "${GREEN}✅ Service worker configured for backend API${NC}"
    else
        echo -e "${YELLOW}⚠️  Service worker may not be configured correctly${NC}"
    fi
    
    # Check notification function
    if grep -q "sendNotification" public/sw.js; then
        echo -e "${GREEN}✅ Notification function found${NC}"
    else
        echo -e "${RED}❌ Notification function missing${NC}"
    fi
else
    echo -e "${RED}❌ Service worker file not found${NC}"
fi

echo ""
echo "3️⃣ Checking Icon Files..."
echo "--------------------------"

# Check for icon files
if [ -f "public/icon-192.png" ]; then
    echo -e "${GREEN}✅ icon-192.png exists${NC}"
else
    echo -e "${YELLOW}⚠️  icon-192.png not found (notifications will use fallback)${NC}"
fi

if [ -f "public/icon-512.png" ]; then
    echo -e "${GREEN}✅ icon-512.png exists${NC}"
else
    echo -e "${YELLOW}⚠️  icon-512.png not found${NC}"
fi

if [ -f "public/apple-touch-icon.png" ]; then
    echo -e "${GREEN}✅ apple-touch-icon.png exists${NC}"
else
    echo -e "${YELLOW}⚠️  apple-touch-icon.png not found (iOS will use fallback)${NC}"
fi

echo ""
echo "4️⃣ Checking Manifest..."
echo "------------------------"

if [ -f "public/manifest.json" ]; then
    echo -e "${GREEN}✅ manifest.json exists${NC}"
    
    # Validate JSON
    if jq empty public/manifest.json 2>/dev/null; then
        echo -e "${GREEN}✅ manifest.json is valid JSON${NC}"
    else
        echo -e "${RED}❌ manifest.json is not valid JSON${NC}"
    fi
else
    echo -e "${RED}❌ manifest.json not found${NC}"
fi

echo ""
echo "5️⃣ Environment Variables Check..."
echo "-----------------------------------"

if [ -f ".env" ] || [ -f ".env.local" ]; then
    echo -e "${GREEN}✅ Environment file found${NC}"
    
    if grep -q "ALPACA_API_KEY" .env .env.local 2>/dev/null; then
        echo -e "${GREEN}✅ ALPACA_API_KEY configured${NC}"
    else
        echo -e "${RED}❌ ALPACA_API_KEY not found in .env${NC}"
    fi
    
    if grep -q "ALPACA_SECRET_KEY" .env .env.local 2>/dev/null; then
        echo -e "${GREEN}✅ ALPACA_SECRET_KEY configured${NC}"
    else
        echo -e "${RED}❌ ALPACA_SECRET_KEY not found in .env${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  No .env file found (make sure variables are set in Vercel)${NC}"
fi

echo ""
echo "============================================================"
echo "📋 Summary"
echo "============================================================"
echo ""
echo "Next Steps:"
echo "1. If testing locally, make sure dev server is running: npm run dev"
echo "2. Open dashboard in browser: $BASE_URL/dashboard"
echo "3. Open DevTools → Application → Service Workers"
echo "4. Click 'Update' to reload service worker"
echo "5. Grant notification permission when prompted"
echo "6. In Console, run: navigator.serviceWorker.controller.postMessage({ type: 'CHECK_NOW' })"
echo "7. Check Console for service worker logs"
echo ""
echo "For production testing:"
echo "./test-notifications.sh https://your-domain.vercel.app"
echo ""
echo "✨ Done!"
