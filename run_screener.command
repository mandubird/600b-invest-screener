#!/bin/bash
cd "$(dirname "$0")"

# 가상환경 없으면 생성 후 의존성 설치 (시스템 Python 보호용)
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt -q
fi
.venv/bin/pip install -r requirements.txt -q
.venv/bin/python screener_upload.py

echo ""
read -p "엔터 키를 누르면 종료합니다..."
