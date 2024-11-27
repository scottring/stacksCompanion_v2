#!/bin/bash

# Test data that matches our expected format
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Test Company",
    "sheet_name": "Test Product Sheet",
    "email": "test@example.com"
  }' \
  "https://createformfromsheet-l2ner6gwia-ew.a.run.app"
