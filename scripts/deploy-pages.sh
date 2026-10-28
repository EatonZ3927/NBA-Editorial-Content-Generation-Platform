#!/usr/bin/env bash
# 一键构建并部署到 GitHub Pages（gh-pages 分支方案）
# 适用于 PAT 无 workflow 权限、无法使用 Actions 自动部署的场景。
# 用法：bash scripts/deploy-pages.sh [--prepare-only]
set -euo pipefail
PREPARE_ONLY=false
if [[ "${1:-}" == "--prepare-only" ]]; then
  PREPARE_ONLY=true
elif [[ $# -gt 0 ]]; then
  echo "用法：bash scripts/deploy-pages.sh [--prepare-only]" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_URL="$(git -C "$REPO_ROOT" remote get-url origin)"
REPO_NAME="$(basename "$REMOTE_URL" .git)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "==> 1/3 安装依赖并构建静态站点（basePath=/${REPO_NAME}）"
cd "$REPO_ROOT"
PAGES_BASE_PATH="/$REPO_NAME" npm run build

echo "==> 2/3 组装 gh-pages 分支内容"
cp -R out "$TMP_DIR/dist"
touch "$TMP_DIR/dist/.nojekyll"   # 关闭 Jekyll，保证 _next/ 目录可被访问

echo "==> 3/3 仅使用静态构建文件组装 gh-pages 发布提交"
# 继承主仓库的提交身份（兼容未配置全局 user.name/email 的环境）
export GIT_AUTHOR_NAME="$(git -C "$REPO_ROOT" config user.name || echo pages-deploy)"
export GIT_AUTHOR_EMAIL="$(git -C "$REPO_ROOT" config user.email || echo pages-deploy@localhost)"
export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME"
export GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"

# 在独立临时仓库中准备发布，避免 orphan checkout 将 main 源码一起带入页面分支。
PAGES_REF="$(git ls-remote --heads "$REMOTE_URL" refs/heads/gh-pages)"
if [[ -n "$PAGES_REF" ]]; then
  git clone --quiet --depth 1 --single-branch --branch gh-pages "$REMOTE_URL" "$TMP_DIR/repo"
  git -C "$TMP_DIR/repo" rm -r --quiet --ignore-unmatch .
else
  git init --quiet --initial-branch=gh-pages "$TMP_DIR/repo"
fi
cd "$TMP_DIR/repo"
cp -R "$TMP_DIR/dist"/. .
git add -A
if git diff --cached --quiet; then
  echo "静态发布文件没有变化，无需推送。"
  exit 0
fi
git commit --quiet -m "deploy: GitHub Pages $(date '+%Y-%m-%d %H:%M:%S')"
if [[ "$PREPARE_ONLY" == true ]]; then
  echo "发布提交已成功组装并检查，未执行推送。"
  exit 0
fi
git push "$REMOTE_URL" HEAD:gh-pages

echo ""
echo "✅ 部署完成。若是首次使用，请到仓库 Settings → Pages → Source 选择"
echo "   \"Deploy from a branch\"，Branch 选 gh-pages / (root)，保存后访问："
echo "   https://<你的用户名>.github.io/$REPO_NAME/"
