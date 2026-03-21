#!/bin/bash
# R2 설정 스크립트 — 아래 값들을 채운 뒤 실행하세요.
# 실행 방법: bash setup-r2.sh

R2_ACCOUNT_ID=""
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_BUCKET_NAME=""
R2_PUBLIC_URL=""

# ──────────────────────────────────────────────────
# 아래는 건드리지 마세요
# ──────────────────────────────────────────────────

SUPABASE=/opt/homebrew/bin/supabase

if [ -z "$R2_ACCOUNT_ID" ] || [ -z "$R2_ACCESS_KEY_ID" ] || [ -z "$R2_SECRET_ACCESS_KEY" ] || [ -z "$R2_BUCKET_NAME" ] || [ -z "$R2_PUBLIC_URL" ]; then
  echo "❌ 위 변수들을 모두 채워주세요."
  exit 1
fi

echo "📦 Supabase에 R2 비밀키 등록 중..."
$SUPABASE secrets set \
  R2_ACCOUNT_ID="$R2_ACCOUNT_ID" \
  R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  R2_BUCKET_NAME="$R2_BUCKET_NAME" \
  R2_PUBLIC_URL="$R2_PUBLIC_URL" \
  --project-ref lyuwvvfpwspjmjktslxt

echo "🚀 Edge Function 배포 중..."
$SUPABASE functions deploy r2-presign --project-ref lyuwvvfpwspjmjktslxt

echo "✅ 완료! 이제 새 도안 업로드는 Cloudflare R2에 저장됩니다."
